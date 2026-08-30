import { IPOMasterRecord } from './types';
import { analyzeRadarTrajectory, TrajectoryAnalysisResult } from './radarTrajectoryEngine';
import { evaluatePredictiveDecision, PredictiveDecisionBreakdown } from './radarDecisionEngine';
import { RadarSnapshotRecord } from './radarSnapshotService';

export type RadarCategory =
  | 'HIGH_CONVICTION'
  | 'WATCH'
  | 'MOMENTUM_CANDIDATE'
  | 'NEUTRAL'
  | 'LOW_PRIORITY'
  | 'AVOID';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
export type FreshnessStatus = 'FRESH' | 'AGING' | 'STALE' | 'VERY_STALE';
export type ConvictionTrend = 'IMPROVING' | 'STABLE' | 'WEAKENING' | 'NEW';

export type RadarChangeEventTypes =
  | 'GMP_INCREASED'
  | 'GMP_DECREASED'
  | 'GMP_TURNED_NEGATIVE'
  | 'GMP_BECAME_STALE'
  | 'SUBSCRIPTION_IMPROVED'
  | 'SUBSCRIPTION_WEAKENED'
  | 'QUALITY_DATA_ADDED'
  | 'RISK_SIGNAL_ADDED'
  | 'CONFIDENCE_IMPROVED'
  | 'CONFIDENCE_WEAKENED'
  | 'CATEGORY_UPGRADED'
  | 'CATEGORY_DOWNGRADED';

export interface RadarChangeEvent {
  type: RadarChangeEventTypes;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  message: string;
}

export interface RadarSignalItem {
  name: string;
  points: number;
  maxPoints: number;
  status: 'STRONG' | 'MODERATE' | 'WEAK' | 'NEUTRAL' | 'MISSING';
  explanation: string;
}

export interface RadarStateEvolution {
  currentCategory: RadarCategory;
  previousCategory: RadarCategory | null;
  currentScore: number;
  previousScore: number | null;
  scoreChange: number;
  confidenceChange: number;
  convictionTrend: ConvictionTrend;
}

export interface DecisionTriggers {
  upgradeTriggers: string[];
  downgradeTriggers: string[];
  missingEvidence: string[];
}

export interface RadarV3Explanation {
  whyOnRadar: string[];
  positiveDrivers: string[];
  missingEvidence: string[];
  risks: string[];
  recentChanges: RadarChangeEvent[];
  upgradeTriggers: string[];
  downgradeTriggers: string[];
  recommendedAction: string;
}

export interface RadarScoreBreakdown {
  score: number; // Final score (0 to 100)
  rawScore: number;
  confidence: number; // 0.0 to 1.0 multiplier
  confidenceLevel: ConfidenceLevel;
  category: RadarCategory;
  categoryLabel: string;
  badgeColor: string;
  badgeBg: string;
  isStaleGmp: boolean;
  isVeryStaleGmp: boolean;
  freshnessStatus: FreshnessStatus;
  gmpFreshnessText: string;
  signals: {
    marketMomentum: number; // max 35
    gmpScore: number; // max 35
    subscriptionScore: number; // max 25
    businessOpportunity: number; // max 15
    opportunityScore: number; // max 15
    qualityScore: number; // max 25
    riskPenalty: number; // subtracted
  };
  signalItems: RadarSignalItem[];
  reasons: string[];
  risks: string[];
  missingData: string[];
  recommendedAction?: string;
  // Radar V3 Additions
  stateEvolution: RadarStateEvolution;
  recentChanges: RadarChangeEvent[];
  upgradeTriggers: string[];
  downgradeTriggers: string[];
  explanation: RadarV3Explanation;
  // Radar V4 Predictive Additions
  trajectoryAnalysis: TrajectoryAnalysisResult;
  v4Predictive: PredictiveDecisionBreakdown;
}

export const CATEGORY_RANK: Record<RadarCategory, number> = {
  HIGH_CONVICTION: 5,
  WATCH: 4,
  MOMENTUM_CANDIDATE: 3,
  NEUTRAL: 2,
  LOW_PRIORITY: 1,
  AVOID: 0,
};

/**
 * Calculates human-readable relative time or freshness string for gmp_updated_at
 * Tiered: FRESH (<24h), AGING (24-48h), STALE (48-96h), VERY_STALE (>=96h / 4+ days)
 */
export function getGmpFreshnessInfo(gmpUpdatedAt?: string | null): {
  text: string;
  isStale: boolean;
  isVeryStale: boolean;
  freshnessStatus: FreshnessStatus;
  diffHours: number | null;
} {
  if (!gmpUpdatedAt) {
    return { text: 'GMP —', isStale: false, isVeryStale: false, freshnessStatus: 'FRESH', diffHours: null };
  }

  const updatedDate = new Date(gmpUpdatedAt);
  if (isNaN(updatedDate.getTime())) {
    return { text: 'GMP —', isStale: false, isVeryStale: false, freshnessStatus: 'FRESH', diffHours: null };
  }

  const diffMs = Date.now() - updatedDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  let text = '';
  let isStale = false;
  let isVeryStale = false;
  let freshnessStatus: FreshnessStatus = 'FRESH';

  if (diffMins < 1) {
    text = 'Updated just now';
    freshnessStatus = 'FRESH';
  } else if (diffMins < 60) {
    text = `Updated ${diffMins}m ago`;
    freshnessStatus = 'FRESH';
  } else if (diffHours < 24) {
    text = `Updated ${diffHours}h ago`;
    freshnessStatus = 'FRESH';
  } else if (diffHours < 48) {
    text = `Updated 1d ago`;
    freshnessStatus = 'AGING';
  } else if (diffHours < 96) {
    text = `GMP data is stale (${Math.floor(diffHours / 24)}d ago)`;
    isStale = true;
    freshnessStatus = 'STALE';
  } else {
    text = `GMP data is very stale (${Math.floor(diffHours / 24)}d ago)`;
    isStale = true;
    isVeryStale = true;
    freshnessStatus = 'VERY_STALE';
  }

  return { text, isStale, isVeryStale, freshnessStatus, diffHours };
}

/**
 * Pure change detection comparing previous and current Radar states.
 */
export function compareRadarSnapshots(
  prev: {
    category: RadarCategory;
    score: number;
    confidence: number;
    gmp_percent?: number | null;
    total_subscription?: number | null;
    quality_score?: number | null;
    isStaleGmp?: boolean;
  } | null,
  curr: {
    category: RadarCategory;
    score: number;
    confidence: number;
    gmp_percent?: number | null;
    total_subscription?: number | null;
    quality_score?: number | null;
    isStaleGmp?: boolean;
  }
): RadarChangeEvent[] {
  if (!prev) return [];

  const changes: RadarChangeEvent[] = [];

  // Category changes
  const prevRank = CATEGORY_RANK[prev.category];
  const currRank = CATEGORY_RANK[curr.category];
  if (currRank > prevRank) {
    changes.push({
      type: 'CATEGORY_UPGRADED',
      impact: 'POSITIVE',
      message: `Upgraded from ${prev.category.replace('_', ' ')} to ${curr.category.replace('_', ' ')}`,
    });
  } else if (currRank < prevRank) {
    changes.push({
      type: 'CATEGORY_DOWNGRADED',
      impact: 'NEGATIVE',
      message: `Downgraded from ${prev.category.replace('_', ' ')} to ${curr.category.replace('_', ' ')}`,
    });
  }

  // GMP changes
  const prevGmp = prev.gmp_percent;
  const currGmp = curr.gmp_percent;
  if (currGmp != null && currGmp <= -15 && (prevGmp == null || prevGmp > -15)) {
    changes.push({
      type: 'GMP_TURNED_NEGATIVE',
      impact: 'NEGATIVE',
      message: `GMP dropped into severe negative territory (${currGmp.toFixed(1)}%)`,
    });
  } else if (prevGmp != null && currGmp != null) {
    const diff = currGmp - prevGmp;
    if (diff >= 5.0) {
      changes.push({
        type: 'GMP_INCREASED',
        impact: 'POSITIVE',
        message: `GMP increased from +${prevGmp.toFixed(1)}% to +${currGmp.toFixed(1)}%`,
      });
    } else if (diff <= -5.0) {
      changes.push({
        type: 'GMP_DECREASED',
        impact: 'NEGATIVE',
        message: `GMP decreased from +${prevGmp.toFixed(1)}% to +${currGmp.toFixed(1)}%`,
      });
    }
  }

  // GMP staleness
  if (curr.isStaleGmp && !prev.isStaleGmp) {
    changes.push({
      type: 'GMP_BECAME_STALE',
      impact: 'NEGATIVE',
      message: 'GMP market pricing data is now stale (>48h old)',
    });
  }

  // Subscription demand changes
  const prevSub = prev.total_subscription;
  const currSub = curr.total_subscription;
  if (prevSub == null && currSub != null) {
    changes.push({
      type: 'SUBSCRIPTION_IMPROVED',
      impact: 'POSITIVE',
      message: `Subscription demand reported at ${currSub.toFixed(1)}x`,
    });
  } else if (prevSub != null && currSub != null) {
    const diffSub = currSub - prevSub;
    if (diffSub >= 2.0) {
      changes.push({
        type: 'SUBSCRIPTION_IMPROVED',
        impact: 'POSITIVE',
        message: `Subscription demand improved from ${prevSub.toFixed(1)}x to ${currSub.toFixed(1)}x`,
      });
    } else if (diffSub <= -3.0) {
      changes.push({
        type: 'SUBSCRIPTION_WEAKENED',
        impact: 'NEGATIVE',
        message: `Subscription demand dropped from ${prevSub.toFixed(1)}x to ${currSub.toFixed(1)}x`,
      });
    }
  }

  // Quality data added
  if (prev.quality_score == null && curr.quality_score != null) {
    changes.push({
      type: 'QUALITY_DATA_ADDED',
      impact: 'POSITIVE',
      message: `AI Fundamental Quality analysis added (${curr.quality_score}/100)`,
    });
  }

  // Confidence changes
  const confDiff = curr.confidence - prev.confidence;
  if (confDiff >= 0.2) {
    changes.push({
      type: 'CONFIDENCE_IMPROVED',
      impact: 'POSITIVE',
      message: 'Data confidence improved with new evidence',
    });
  } else if (confDiff <= -0.2) {
    changes.push({
      type: 'CONFIDENCE_WEAKENED',
      impact: 'NEGATIVE',
      message: 'Data confidence weakened',
    });
  }

  return changes;
}

/**
 * Dynamically derives upgrade triggers, downgrade triggers, and missing evidence.
 */
export function deriveDecisionTriggers(ipo: IPOMasterRecord, radar: RadarScoreBreakdown): DecisionTriggers {
  const upgradeTriggers: string[] = [];
  const downgradeTriggers: string[] = [];
  const missingEvidence: string[] = [];

  const gmpPct = ipo.gmp_percent != null ? Number(ipo.gmp_percent) : null;
  const totalSub = ipo.total_sub != null ? Number(ipo.total_sub) : null;
  const qibSub = ipo.qib_sub != null ? Number(ipo.qib_sub) : null;
  const hasQuality = ipo.score?.total_score != null;

  // Missing Evidence
  if (gmpPct == null) missingEvidence.push('Fresh GMP pricing data unavailable');
  if (totalSub == null) missingEvidence.push('Subscription demand data unavailable');
  if (!hasQuality) missingEvidence.push('Fundamental quality analysis unavailable');

  // Upgrade Triggers
  if (radar.category !== 'HIGH_CONVICTION') {
    if (totalSub == null || totalSub < 10) upgradeTriggers.push('Subscription demand > 10x total could upgrade conviction');
    if (qibSub == null || qibSub < 20) upgradeTriggers.push('QIB institutional demand > 20x could upgrade conviction');
    if (!hasQuality) upgradeTriggers.push('Positive AI fundamental analysis could upgrade conviction');
    if (gmpPct != null && gmpPct < 40 && gmpPct >= 0) upgradeTriggers.push('GMP premium expansion above +40% could upgrade score');
  } else {
    upgradeTriggers.push('Maintain high institutional demand and fresh GMP pricing to preserve High Conviction');
  }

  // Downgrade Triggers
  if (radar.category !== 'AVOID') {
    if (gmpPct != null && gmpPct > 0) downgradeTriggers.push('GMP falling below +10% would downgrade category');
    downgradeTriggers.push('GMP dropping into negative territory would trigger AVOID risk alert');
    const normStatus = (ipo.status || '').toUpperCase();
    if (normStatus === 'OPEN' || normStatus === 'CLOSED') downgradeTriggers.push('Undersubscription (<1.0x demand) would trigger AVOID risk alert');
    if (radar.isStaleGmp) downgradeTriggers.push('GMP stale >48h reduces confidence multiplier');
  }

  return { upgradeTriggers, downgradeTriggers, missingEvidence };
}

/**
 * Centralized Radar Scoring & Predictive Intelligence Engine V4
 */
export function evaluateIPORadarScore(
  ipo: IPOMasterRecord,
  previousSnapshot?: {
    category: RadarCategory;
    score: number;
    confidence: number;
    gmp_percent?: number | null;
    total_subscription?: number | null;
    quality_score?: number | null;
    isStaleGmp?: boolean;
  } | null,
  historySnapshots?: RadarSnapshotRecord[]
): RadarScoreBreakdown {
  let gmpScore = 0;
  let subscriptionScore = 0;
  let opportunityScore = 0;
  let qualityScore = 0;
  let riskPenalty = 0;

  const reasons: string[] = [];
  const risks: string[] = [];
  const missingData: string[] = [];
  const signalItems: RadarSignalItem[] = [];

  // ── 1. GMP SIGNAL (Max 35 pts) ──
  const gmpPct = ipo.gmp_percent;
  const hasGmp = gmpPct != null && !isNaN(Number(gmpPct));

  if (hasGmp) {
    const p = Number(gmpPct);
    if (p >= 60) {
      gmpScore = 35;
      reasons.push(`Exceptional GMP premium (+${p.toFixed(1)}%)`);
      signalItems.push({ name: 'GMP Signal', points: 35, maxPoints: 35, status: 'STRONG', explanation: `Exceptional premium of +${p.toFixed(1)}%` });
    } else if (p >= 40) {
      gmpScore = Math.round(28 + (p - 40) * 0.35);
      reasons.push(`Strong GMP premium (+${p.toFixed(1)}%)`);
      signalItems.push({ name: 'GMP Signal', points: gmpScore, maxPoints: 35, status: 'STRONG', explanation: `Strong premium of +${p.toFixed(1)}%` });
    } else if (p >= 20) {
      gmpScore = Math.round(20 + (p - 20) * 0.4);
      reasons.push(`Healthy GMP premium (+${p.toFixed(1)}%)`);
      signalItems.push({ name: 'GMP Signal', points: gmpScore, maxPoints: 35, status: 'STRONG', explanation: `Healthy premium of +${p.toFixed(1)}%` });
    } else if (p >= 10) {
      gmpScore = Math.round(12 + (p - 10) * 0.8);
      reasons.push(`Moderate GMP premium (+${p.toFixed(1)}%)`);
      signalItems.push({ name: 'GMP Signal', points: gmpScore, maxPoints: 35, status: 'MODERATE', explanation: `Moderate premium of +${p.toFixed(1)}%` });
    } else if (p >= 3) {
      gmpScore = Math.round(5 + (p - 3) * 1.0);
      reasons.push(`Mild GMP (+${p.toFixed(1)}%)`);
      signalItems.push({ name: 'GMP Signal', points: gmpScore, maxPoints: 35, status: 'MODERATE', explanation: `Mild premium of +${p.toFixed(1)}%` });
    } else if (p >= -3) {
      gmpScore = 0;
      signalItems.push({ name: 'GMP Signal', points: 0, maxPoints: 35, status: 'NEUTRAL', explanation: `Flat/neutral GMP (+${p.toFixed(1)}%)` });
    } else if (p >= -15) {
      gmpScore = 0;
      riskPenalty += 12;
      risks.push(`Moderate negative GMP drag (${p.toFixed(1)}%)`);
      signalItems.push({ name: 'GMP Signal', points: 0, maxPoints: 35, status: 'WEAK', explanation: `Moderate negative GMP drag (${p.toFixed(1)}%)` });
    } else {
      gmpScore = 0;
      riskPenalty += 25;
      risks.push(`Severe negative GMP discount (${p.toFixed(1)}%)`);
      signalItems.push({ name: 'GMP Signal', points: 0, maxPoints: 35, status: 'WEAK', explanation: `Severe negative GMP discount (${p.toFixed(1)}%)` });
    }
  } else {
    missingData.push('GMP Premium');
    signalItems.push({ name: 'GMP Signal', points: 0, maxPoints: 35, status: 'MISSING', explanation: 'GMP data currently unavailable' });
  }

  // ── 2. SUBSCRIPTION DEMAND QUALITY (Max 25 pts) ──
  const qib = ipo.qib_sub != null && !isNaN(Number(ipo.qib_sub)) ? Number(ipo.qib_sub) : null;
  const nii = ipo.nii_sub != null && !isNaN(Number(ipo.nii_sub)) ? Number(ipo.nii_sub) : null;
  const retail = ipo.retail_sub != null && !isNaN(Number(ipo.retail_sub)) ? Number(ipo.retail_sub) : null;
  const totalSub = ipo.total_sub != null && !isNaN(Number(ipo.total_sub)) ? Number(ipo.total_sub) : null;

  const hasComponentSub = qib != null || nii != null || retail != null;
  const hasSub = hasComponentSub || totalSub != null;

  if (hasComponentSub) {
    let qibPts = 0;
    if (qib != null) {
      if (qib >= 50) { qibPts = 12; reasons.push(`Blockbuster QIB institutional demand (${qib.toFixed(1)}x)`); }
      else if (qib >= 20) { qibPts = 9; reasons.push(`Strong QIB institutional demand (${qib.toFixed(1)}x)`); }
      else if (qib >= 5) { qibPts = 6; reasons.push(`Good QIB interest (${qib.toFixed(1)}x)`); }
      else if (qib >= 1) { qibPts = 3; }
      else if (qib === 0) { risks.push('Zero QIB institutional bidding'); }
    }

    let niiPts = 0;
    if (nii != null) {
      if (nii >= 30) { niiPts = 7; reasons.push(`Heavy NII/HNI subscription (${nii.toFixed(1)}x)`); }
      else if (nii >= 10) { niiPts = 5; reasons.push(`Solid NII subscription (${nii.toFixed(1)}x)`); }
      else if (nii >= 2) { niiPts = 3; }
    }

    let retailPts = 0;
    if (retail != null) {
      if (retail >= 20) { retailPts = 6; reasons.push(`Widespread retail demand (${retail.toFixed(1)}x)`); }
      else if (retail >= 5) { retailPts = 4; reasons.push(`Healthy retail interest (${retail.toFixed(1)}x)`); }
      else if (retail >= 1) { retailPts = 2; }
    }

    subscriptionScore = Math.min(25, qibPts + niiPts + retailPts);
    signalItems.push({
      name: 'Subscription Demand',
      points: subscriptionScore,
      maxPoints: 25,
      status: subscriptionScore >= 15 ? 'STRONG' : subscriptionScore >= 7 ? 'MODERATE' : 'WEAK',
      explanation: `Component breakdown (QIB: ${qib != null ? qib + 'x' : '—'}, NII: ${nii != null ? nii + 'x' : '—'}, Retail: ${retail != null ? retail + 'x' : '—'})`,
    });
  } else if (totalSub != null) {
    const s = totalSub;
    if (s >= 50) { subscriptionScore = 25; reasons.push(`Blockbuster total subscription (${s.toFixed(1)}x)`); }
    else if (s >= 20) { subscriptionScore = 18; reasons.push(`Strong total subscription (${s.toFixed(1)}x)`); }
    else if (s >= 10) { subscriptionScore = 13; reasons.push(`Solid subscription demand (${s.toFixed(1)}x)`); }
    else if (s >= 3) { subscriptionScore = 7; reasons.push(`Good subscription demand (${s.toFixed(1)}x)`); }
    else if (s >= 1) { subscriptionScore = 3; }
    else if (s === 0) { subscriptionScore = 0; risks.push('Zero total subscription bids recorded'); }

    signalItems.push({
      name: 'Subscription Demand',
      points: subscriptionScore,
      maxPoints: 25,
      status: subscriptionScore >= 15 ? 'STRONG' : subscriptionScore >= 7 ? 'MODERATE' : 'WEAK',
      explanation: `Total subscription of ${s.toFixed(1)}x`,
    });
  } else {
    missingData.push('Subscription Demand');
    signalItems.push({ name: 'Subscription Demand', points: 0, maxPoints: 25, status: 'MISSING', explanation: 'Subscription data not yet reported' });
  }

  // Undersubscription penalty for live/closed IPOs
  const statusLower = (ipo.status || '').toLowerCase();
  if ((statusLower === 'open' || statusLower === 'closed') && totalSub != null && totalSub < 1.0) {
    riskPenalty += 15;
    risks.push(`Severe undersubscription risk (${totalSub.toFixed(2)}x total demand)`);
  }

  // ── 3. LOT ECONOMICS & OPPORTUNITY (Max 15 pts) ──
  let profitLot = ipo.profit_per_lot;
  if ((profitLot == null || isNaN(Number(profitLot))) && ipo.gmp_amount != null && ipo.lot_size != null) {
    profitLot = Math.round(Number(ipo.gmp_amount) * Number(ipo.lot_size));
  }

  const hasProfit = profitLot != null && !isNaN(Number(profitLot));
  if (hasProfit) {
    const pr = Number(profitLot);
    if (pr >= 15000) {
      opportunityScore = 15;
      reasons.push(`Exceptional listing profit potential (₹${pr.toLocaleString('en-IN')}/lot)`);
    } else if (pr >= 10000) {
      opportunityScore = 12;
      reasons.push(`High listing profit potential (₹${pr.toLocaleString('en-IN')}/lot)`);
    } else if (pr >= 5000) {
      opportunityScore = 8;
      reasons.push(`Attractive lot profit (₹${pr.toLocaleString('en-IN')}/lot)`);
    } else if (pr >= 2000) {
      opportunityScore = 5;
      reasons.push(`Moderate profit per lot (₹${pr.toLocaleString('en-IN')}/lot)`);
    } else if (pr > 0) {
      opportunityScore = 2;
    } else if (pr < 0) {
      opportunityScore = 0;
      riskPenalty += 10;
      risks.push(`Expected listing loss (-₹${Math.abs(pr).toLocaleString('en-IN')}/lot)`);
    }

    signalItems.push({
      name: 'Lot Profit Economics',
      points: opportunityScore,
      maxPoints: 15,
      status: opportunityScore >= 10 ? 'STRONG' : opportunityScore >= 5 ? 'MODERATE' : 'WEAK',
      explanation: pr >= 0 ? `Est. listing profit of ₹${pr.toLocaleString('en-IN')}/lot` : `Est. listing loss of ₹${Math.abs(pr).toLocaleString('en-IN')}/lot`,
    });
  } else {
    missingData.push('Lot Profit Economics');
    signalItems.push({ name: 'Lot Profit Economics', points: 0, maxPoints: 15, status: 'MISSING', explanation: 'Price band or lot size incomplete' });
  }

  // Issue Type Risk / SME liquidity penalty
  const issueType = (ipo.issue_type || 'Mainboard').toLowerCase();
  if (issueType === 'sme') {
    const p = gmpPct != null ? Number(gmpPct) : 0;
    const s = totalSub != null ? Number(totalSub) : 0;
    if (p < 30 || s < 20) {
      riskPenalty += 5;
      risks.push('SME segment illiquidity & lot-lock risk');
    }
  }

  // ── 4. QUALITY & FUNDAMENTALS (Max 25 pts) ──
  const hasQuality = ipo.score?.total_score != null && !isNaN(Number(ipo.score.total_score));
  if (hasQuality) {
    const totalScore = Number(ipo.score!.total_score);
    qualityScore = Math.min(25, Math.max(0, Math.round((totalScore / 100) * 25)));

    if (ipo.score?.recommendation) {
      reasons.push(`AI Analysis: ${ipo.score.recommendation} (${totalScore}/100)`);
      if (ipo.score.recommendation.toLowerCase().includes('avoid')) {
        riskPenalty += 15;
        risks.push('AI Fundamental Analysis recommends AVOID');
      }
    }

    signalItems.push({
      name: 'Quality & Fundamentals',
      points: qualityScore,
      maxPoints: 25,
      status: qualityScore >= 18 ? 'STRONG' : qualityScore >= 10 ? 'MODERATE' : 'WEAK',
      explanation: `Fundamental Score: ${totalScore}/100`,
    });
  } else {
    // Authoritative NULL semantics: 0 points assigned for un-analyzed records!
    qualityScore = 0;
    missingData.push('Fundamental Quality Analysis');
    signalItems.push({ name: 'Quality & Fundamentals', points: 0, maxPoints: 25, status: 'MISSING', explanation: 'Fundamental analysis not yet executed' });
  }

  // Raw Score
  const rawScore = Math.max(0, gmpScore + subscriptionScore + opportunityScore + qualityScore - riskPenalty);

  // ── 5. DATA CONFIDENCE & FRESHNESS ──
  const signalCount = (hasGmp ? 1 : 0) + (hasSub ? 1 : 0) + (hasQuality ? 1 : 0);
  const freshness = getGmpFreshnessInfo(ipo.gmp_updated_at);

  let confidenceLevel: ConfidenceLevel = 'INSUFFICIENT';
  let baseConfidence = 0.25;

  if (signalCount === 3) {
    confidenceLevel = 'HIGH';
    baseConfidence = 1.0;
  } else if (signalCount === 2) {
    confidenceLevel = 'MEDIUM';
    baseConfidence = 0.75;
  } else if (signalCount === 1) {
    confidenceLevel = 'LOW';
    baseConfidence = 0.50;
  } else {
    confidenceLevel = 'INSUFFICIENT';
    baseConfidence = 0.25;
    risks.push('Insufficient market signals to establish conviction');
  }

  let confidence = baseConfidence;

  // Stale & Very Stale GMP confidence penalty
  if (freshness.isVeryStale) {
    confidence *= 0.50;
    risks.push('GMP market data is very stale (>4d old)');
  } else if (freshness.isStale) {
    confidence *= 0.75;
    risks.push('GMP market data is stale (>48h old)');
  }

  confidence = Number(confidence.toFixed(2));

  // Final score & confidence gating
  let finalScore = Math.min(100, Math.max(0, Math.round(rawScore * confidence)));

  // Confidence Gating Rule: Insufficient/low data cannot enter WATCH or HIGH CONVICTION
  if (confidenceLevel === 'INSUFFICIENT') {
    finalScore = Math.min(finalScore, 34);
  } else if (confidenceLevel === 'LOW') {
    finalScore = Math.min(finalScore, 49);
  }

  // ── 6. CATEGORY SELECTION & PRECEDENCE ──
  // Precedence: AVOID -> HIGH_CONVICTION -> WATCH -> MOMENTUM_CANDIDATE -> NEUTRAL -> LOW_PRIORITY
  let category: RadarCategory = 'LOW_PRIORITY';
  let categoryLabel = '⚪ LOW PRIORITY';
  let badgeColor = '#9CA3AF';
  let badgeBg = '#F3F4F6';
  let recommendedAction = 'Awaiting further market or fundamental evidence.';

  const isAvoid =
    riskPenalty >= 25 ||
    (gmpPct != null && Number(gmpPct) <= -15) ||
    ((statusLower === 'open' || statusLower === 'closed') && totalSub != null && totalSub < 1.0) ||
    Boolean(ipo.score?.recommendation?.toLowerCase().includes('avoid'));

  const isVeryStaleGmp = freshness.isVeryStale || (freshness.diffHours != null && freshness.diffHours >= 96);

  if (isAvoid) {
    category = 'AVOID';
    categoryLabel = '🔴 AVOID';
    badgeColor = '#EF4444';
    badgeBg = '#FEF2F2';
    recommendedAction = 'Avoid applying due to high market or fundamental risks.';
  } else if (finalScore >= 75 && confidence >= 0.75) {
    category = 'HIGH_CONVICTION';
    categoryLabel = '🔥 HIGH CONVICTION';
    badgeColor = '#10B981';
    badgeBg = '#ECFDF5';
    recommendedAction = 'Strong opportunity supported by market & fundamental signals.';
  } else if (finalScore >= 50 && confidence >= 0.65) {
    category = 'WATCH';
    categoryLabel = '👀 WATCH';
    badgeColor = '#3B82F6';
    badgeBg = '#EFF6FF';
    recommendedAction = 'Good potential opportunity; monitor subscription and price trends.';
  } else if (
    hasGmp &&
    !isVeryStaleGmp &&
    (Number(gmpPct) >= 30 || (opportunityScore >= 12 && Number(gmpPct) >= 20))
  ) {
    category = 'MOMENTUM_CANDIDATE';
    categoryLabel = '🔵 MOMENTUM CANDIDATE';
    badgeColor = '#2563EB';
    badgeBg = '#E0F2FE';
    risks.push('Current conviction is limited because supporting demand and quality signals are incomplete');
    recommendedAction = 'Monitor subscription and fundamental analysis before upgrading conviction.';
  } else if (finalScore >= 35) {
    category = 'NEUTRAL';
    categoryLabel = '🟡 NEUTRAL';
    badgeColor = '#F59E0B';
    badgeBg = '#FEF3C7';
    recommendedAction = 'Average market signals; evaluate personal risk tolerance.';
  } else {
    category = 'LOW_PRIORITY';
    categoryLabel = '⚪ LOW PRIORITY';
    badgeColor = '#9CA3AF';
    badgeBg = '#F3F4F6';
    recommendedAction = 'Awaiting further market or fundamental evidence.';
  }

  // ── 7. RADAR V3 STATE EVOLUTION & CHANGE DETECTION ──
  const prevCategory = previousSnapshot?.category ?? null;
  const prevScore = previousSnapshot?.score ?? null;
  const prevConfidence = previousSnapshot?.confidence ?? null;

  const scoreChange = prevScore != null ? finalScore - prevScore : 0;
  const confidenceChange = prevConfidence != null ? Number((confidence - prevConfidence).toFixed(2)) : 0;

  let convictionTrend: ConvictionTrend = 'NEW';
  if (!prevCategory) {
    convictionTrend = 'NEW';
  } else {
    const currRank = CATEGORY_RANK[category];
    const pRank = CATEGORY_RANK[prevCategory];
    if (currRank > pRank) {
      convictionTrend = 'IMPROVING';
    } else if (currRank < pRank) {
      convictionTrend = 'WEAKENING';
    } else if (scoreChange >= 5) {
      convictionTrend = 'IMPROVING';
    } else if (scoreChange <= -5) {
      convictionTrend = 'WEAKENING';
    } else {
      convictionTrend = 'STABLE';
    }
  }

  const stateEvolution: RadarStateEvolution = {
    currentCategory: category,
    previousCategory: prevCategory,
    currentScore: finalScore,
    previousScore: prevScore,
    scoreChange,
    confidenceChange,
    convictionTrend,
  };

  const currSnapshot = {
    category,
    score: finalScore,
    confidence,
    gmp_percent: gmpPct != null ? Number(gmpPct) : null,
    total_subscription: totalSub != null ? Number(totalSub) : null,
    quality_score: ipo.score?.total_score != null ? Number(ipo.score.total_score) : null,
    isStaleGmp: freshness.isStale,
  };

  const recentChanges = compareRadarSnapshots(previousSnapshot || null, currSnapshot);

  // Partial evaluation object for trigger derivation
  const baseBreakdownPartial: any = { category, isStaleGmp: freshness.isStale };
  const triggers = deriveDecisionTriggers(ipo, baseBreakdownPartial);

  const explanation: RadarV3Explanation = {
    whyOnRadar: reasons,
    positiveDrivers: reasons,
    missingEvidence: missingData,
    risks,
    recentChanges,
    upgradeTriggers: triggers.upgradeTriggers,
    downgradeTriggers: triggers.downgradeTriggers,
    recommendedAction,
  };

  // ── 8. RADAR V4 PREDICTIVE DECISION INTELLIGENCE ──
  const snapshotsList: RadarSnapshotRecord[] = historySnapshots || (previousSnapshot ? [{
    id: 'prev_1',
    ipo_id: ipo.id,
    category: previousSnapshot.category,
    score: previousSnapshot.score,
    confidence: previousSnapshot.confidence,
    gmp_amount: null,
    gmp_percent: previousSnapshot.gmp_percent ?? null,
    total_subscription: previousSnapshot.total_subscription ?? null,
    retail_subscription: null,
    qib_subscription: null,
    nii_subscription: null,
    quality_score: previousSnapshot.quality_score ?? null,
    risk_score: null,
    is_final_pre_listing: 0,
    created_at: new Date().toISOString(),
  }] : []);

  const trajectoryAnalysis = analyzeRadarTrajectory(snapshotsList, finalScore, category);
  const tempBreakdown: any = {
    score: finalScore, rawScore, confidence, confidenceLevel, category, categoryLabel,
    badgeColor, badgeBg, isStaleGmp: freshness.isStale, isVeryStaleGmp: freshness.isVeryStale,
    freshnessStatus: freshness.freshnessStatus, gmpFreshnessText: freshness.text,
    signals: { marketMomentum: gmpScore, gmpScore, subscriptionScore, businessOpportunity: opportunityScore, opportunityScore, qualityScore, riskPenalty },
    signalItems, reasons, risks, missingData, recommendedAction, stateEvolution, recentChanges,
    upgradeTriggers: triggers.upgradeTriggers, downgradeTriggers: triggers.downgradeTriggers, explanation,
  };

  const v4Predictive = evaluatePredictiveDecision(ipo, tempBreakdown, trajectoryAnalysis);

  return {
    score: finalScore,
    rawScore,
    confidence,
    confidenceLevel,
    category,
    categoryLabel,
    badgeColor,
    badgeBg,
    isStaleGmp: freshness.isStale,
    isVeryStaleGmp: freshness.isVeryStale,
    freshnessStatus: freshness.freshnessStatus,
    gmpFreshnessText: freshness.text,
    signals: {
      marketMomentum: gmpScore,
      gmpScore,
      subscriptionScore,
      businessOpportunity: opportunityScore,
      opportunityScore,
      qualityScore,
      riskPenalty,
    },
    signalItems,
    reasons,
    risks,
    missingData,
    recommendedAction,
    stateEvolution,
    recentChanges,
    upgradeTriggers: triggers.upgradeTriggers,
    downgradeTriggers: triggers.downgradeTriggers,
    explanation,
    trajectoryAnalysis,
    v4Predictive,
  };
}

/**
 * Filter and Rank Radar recommendations:
 * Returns IPOs meeting Radar criteria (HIGH CONVICTION, WATCH, MOMENTUM CANDIDATE, or AVOID risk alerts).
 * Sorted strictly by: Category Rank DESC -> Score DESC -> Confidence DESC -> GMP Freshness -> GMP % DESC -> Profit DESC.
 */
export function getRadarRecommendations(
  records: IPOMasterRecord[],
  snapshotMap?: Record<string, any>
): { ipo: IPOMasterRecord; radar: RadarScoreBreakdown }[] {
  return records
    .map((ipo) => {
      const prevSnap = snapshotMap ? snapshotMap[ipo.id] : null;
      return { ipo, radar: evaluateIPORadarScore(ipo, prevSnap) };
    })
    .filter(
      (item) =>
        item.radar.category === 'HIGH_CONVICTION' ||
        item.radar.category === 'WATCH' ||
        item.radar.category === 'MOMENTUM_CANDIDATE' ||
        item.radar.category === 'AVOID'
    )
    .sort((a, b) => {
      // 1. Category Rank DESC
      const rankDiff = CATEGORY_RANK[b.radar.category] - CATEGORY_RANK[a.radar.category];
      if (rankDiff !== 0) return rankDiff;

      // 2. Final Score DESC
      const scoreDiff = b.radar.score - a.radar.score;
      if (scoreDiff !== 0) return scoreDiff;

      // 3. Confidence DESC
      const confDiff = b.radar.confidence - a.radar.confidence;
      if (confDiff !== 0) return confDiff;

      // 4. Stale GMP ASC (Non-stale first)
      if (a.radar.isStaleGmp !== b.radar.isStaleGmp) {
        return a.radar.isStaleGmp ? 1 : -1;
      }

      // 5. GMP % DESC
      const gmpA = a.ipo.gmp_percent ?? -999;
      const gmpB = b.ipo.gmp_percent ?? -999;
      if (gmpA !== gmpB) return gmpB - gmpA;

      // 6. Est. Profit/Lot DESC
      const profitA = a.ipo.profit_per_lot ?? 0;
      const profitB = b.ipo.profit_per_lot ?? 0;
      return profitB - profitA;
    });
}
