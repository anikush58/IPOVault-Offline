import { IPOMasterRecord } from './types';
import { RadarScoreBreakdown, RadarCategory, CATEGORY_RANK } from './radarScoringEngine';
import { TrajectoryAnalysisResult } from './radarTrajectoryEngine';

export type ReadinessLevel = 'DECISION_READY' | 'STRONG_EVIDENCE' | 'PARTIAL_EVIDENCE' | 'INSUFFICIENT_EVIDENCE';

export type ReversalRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type PrimaryInvestorAction =
  | 'APPLY'
  | 'CONSIDER_APPLYING'
  | 'WATCH_CLOSELY'
  | 'WAIT_FOR_EVIDENCE'
  | 'AVOID'
  | 'NO_ACTION';

export interface PredictiveDecisionBreakdown {
  decisionReadinessScore: number; // 0 to 100
  readinessLevel: ReadinessLevel;
  readinessLabel: string;
  nextEvidenceNeeded: string[];
  evidenceUpgradePotential: number; // 0 to 100%
  upgradeProbability: number; // Backward-compatible alias
  upgradePotentialReasons: string[];
  upgradeProbabilityReasons: string[]; // Backward-compatible alias
  reversalRisk: ReversalRiskLevel;
  reversalRiskReasons: string[];
  primaryAction: PrimaryInvestorAction;
  primaryActionLabel: string;
  actionReason: string;
}

/**
 * Calculates Decision Readiness, Next Evidence, Evidence Upgrade Potential, Reversal Risk, and Smart Investor Action.
 */
export function evaluatePredictiveDecision(
  ipo: IPOMasterRecord,
  radar: RadarScoreBreakdown,
  trajectoryResult: TrajectoryAnalysisResult
): PredictiveDecisionBreakdown {
  const gmpPct = ipo.gmp_percent != null ? Number(ipo.gmp_percent) : null;
  const totalSub = ipo.total_sub != null ? Number(ipo.total_sub) : null;
  const qibSub = ipo.qib_sub != null ? Number(ipo.qib_sub) : null;
  const hasQuality = ipo.score?.total_score != null;
  const qualityScore = hasQuality ? Number(ipo.score!.total_score) : null;
  const statusLower = (ipo.status || '').toLowerCase();

  // ── 1. DECISION READINESS SCORE (0 to 100) ──
  // Inputs: GMP availability/freshness (30%), Subscription (35%), Quality (25%), Snapshot History (10%)
  let readinessScore = 0;

  // GMP Availability & Freshness (30 pts max)
  if (gmpPct != null) {
    if (radar.isVeryStaleGmp) readinessScore += 10;
    else if (radar.isStaleGmp) readinessScore += 20;
    else readinessScore += 30;
  }

  // Subscription Availability & Component Depth (35 pts max)
  if (qibSub != null || ipo.nii_sub != null || ipo.retail_sub != null) {
    readinessScore += 35;
  } else if (totalSub != null) {
    readinessScore += 25;
  }

  // Quality / Fundamental Analysis (25 pts max)
  if (hasQuality) {
    readinessScore += 25;
  }

  // History & Trajectory (10 pts max)
  if (trajectoryResult.trajectory !== 'INSUFFICIENT_HISTORY') {
    readinessScore += 10;
  }

  readinessScore = Math.min(100, Math.max(0, readinessScore));

  let readinessLevel: ReadinessLevel = 'INSUFFICIENT_EVIDENCE';
  let readinessLabel = 'Insufficient Evidence';
  if (readinessScore >= 90) {
    readinessLevel = 'DECISION_READY';
    readinessLabel = 'Decision Ready';
  } else if (readinessScore >= 70) {
    readinessLevel = 'STRONG_EVIDENCE';
    readinessLabel = 'Strong Evidence';
  } else if (readinessScore >= 40) {
    readinessLevel = 'PARTIAL_EVIDENCE';
    readinessLabel = 'Partial Evidence';
  } else {
    readinessLevel = 'INSUFFICIENT_EVIDENCE';
    readinessLabel = 'Insufficient Evidence';
  }

  // ── 2. NEXT EVIDENCE ENGINE ──
  const nextEvidenceNeeded: string[] = [];
  if (totalSub == null && (statusLower === 'open' || statusLower === 'upcoming')) {
    nextEvidenceNeeded.push('Wait for retail & total subscription confirmation');
  }
  if (qibSub == null && (statusLower === 'open' || statusLower === 'upcoming')) {
    nextEvidenceNeeded.push('Wait for QIB institutional bidding data');
  }
  if (!hasQuality) {
    nextEvidenceNeeded.push('Fundamental quality analysis required');
  }
  if (radar.isStaleGmp || radar.isVeryStaleGmp) {
    nextEvidenceNeeded.push('Fresh GMP pricing update needed (>48h stale)');
  }
  if (trajectoryResult.trajectory === 'INSUFFICIENT_HISTORY') {
    nextEvidenceNeeded.push('Need at least one more meaningful radar update to verify momentum');
  }
  if (nextEvidenceNeeded.length === 0) {
    nextEvidenceNeeded.push('Monitor subscription and market demand before final bidding deadline');
  }

  // ── 3. EVIDENCE UPGRADE POTENTIAL (0 to 100%) ──
  let upgradePotential = 50;
  const upgradePotentialReasons: string[] = [];

  const momScore = trajectoryResult.momentum.score;
  upgradePotential += Math.round(momScore * 0.3); // max ±30%

  if (gmpPct != null && gmpPct >= 40) {
    upgradePotential += 15;
    upgradePotentialReasons.push('+ High GMP premium expanding listing potential');
  } else if (gmpPct != null && gmpPct < 10) {
    upgradePotential -= 20;
    upgradePotentialReasons.push('- Weak or flat GMP limits score potential');
  }

  if (totalSub != null && totalSub >= 15) {
    upgradePotential += 20;
    upgradePotentialReasons.push('+ Strong subscription demand confirms market interest');
  } else if (totalSub != null && totalSub < 1.0 && (statusLower === 'open' || statusLower === 'closed')) {
    upgradePotential -= 40;
    upgradePotentialReasons.push('- Severe undersubscription creates downside drag');
  }

  if (hasQuality && (qualityScore ?? 0) >= 70) {
    upgradePotential += 15;
    upgradePotentialReasons.push('+ Solid AI fundamental analysis score');
  } else if (!hasQuality) {
    upgradePotential -= 10;
    upgradePotentialReasons.push('- Fundamental quality analysis currently missing');
  }

  if (radar.isVeryStaleGmp) {
    upgradePotential -= 25;
    upgradePotentialReasons.push('- Stale GMP pricing (>4d old) reduces confidence');
  }

  // Bound 0 to 100%
  upgradePotential = Math.min(99, Math.max(1, upgradePotential));
  if (radar.category === 'HIGH_CONVICTION') {
    upgradePotential = 95;
    upgradePotentialReasons.length = 0;
    upgradePotentialReasons.push('+ Already established at 🔥 HIGH CONVICTION');
  } else if (radar.category === 'AVOID') {
    upgradePotential = 5;
    upgradePotentialReasons.length = 0;
    upgradePotentialReasons.push('- Severe risk penalties prevent upgrade');
  }

  // ── 4. CONVICTION RISK OF REVERSAL (LOW, MEDIUM, HIGH) ──
  let reversalRisk: ReversalRiskLevel = 'MEDIUM';
  const reversalRiskReasons: string[] = [];

  const isSpeculativeMomentum = gmpPct != null && gmpPct >= 30 && totalSub == null && !hasQuality;
  const isDecliningGmp = trajectoryResult.momentum.score <= -20 || (gmpPct != null && gmpPct <= -15);
  const isSolidConviction = radar.category === 'HIGH_CONVICTION' || (gmpPct != null && gmpPct >= 30 && totalSub != null && totalSub >= 10 && hasQuality);

  if (isSpeculativeMomentum) {
    reversalRisk = 'HIGH';
    reversalRiskReasons.push('High GMP without subscription or quality confirmation creates high speculative reversal risk');
  } else if (isDecliningGmp) {
    reversalRisk = 'HIGH';
    reversalRiskReasons.push('Declining GMP or negative price discount signals deteriorating market sentiment');
  } else if (radar.isVeryStaleGmp) {
    reversalRisk = 'HIGH';
    reversalRiskReasons.push('Very stale GMP (>4d old) carries unverified market risk');
  } else if (isSolidConviction && !radar.isStaleGmp) {
    reversalRisk = 'LOW';
    reversalRiskReasons.push('Multi-signal confirmation (GMP + Subscription + Fundamentals) minimizes reversal risk');
  } else {
    reversalRisk = 'MEDIUM';
    reversalRiskReasons.push('Moderate signal confirmation; monitor subscription trends before bidding');
  }

  // ── 5. SMART INVESTOR ACTION ENGINE ──
  let primaryAction: PrimaryInvestorAction = 'NO_ACTION';
  let primaryActionLabel = 'NO ACTION';
  let actionReason = '';

  if (radar.category === 'AVOID') {
    primaryAction = 'AVOID';
    primaryActionLabel = '🔴 AVOID';
    actionReason = 'Negative GMP, severe undersubscription, or fundamental Avoid recommendation increases downside risk.';
  } else if (radar.category === 'HIGH_CONVICTION') {
    primaryAction = 'APPLY';
    primaryActionLabel = '🔥 APPLY';
    actionReason = 'Conviction is strong across market momentum, institutional subscription demand, and fundamentals.';
  } else if (radar.category === 'WATCH' && readinessScore >= 70) {
    primaryAction = 'CONSIDER_APPLYING';
    primaryActionLabel = '👀 CONSIDER APPLYING';
    actionReason = 'Solid market metrics confirmed by strong evidence. Evaluate personal risk capacity.';
  } else if (radar.category === 'WATCH' || radar.category === 'MOMENTUM_CANDIDATE') {
    primaryAction = 'WATCH_CLOSELY';
    primaryActionLabel = '🔵 WATCH CLOSELY';
    actionReason = 'Strong market interest detected, but subscription or fundamental evidence is still incomplete. Momentum ≠ Recommendation.';
  } else if (readinessScore < 40 || totalSub == null) {
    primaryAction = 'WAIT_FOR_EVIDENCE';
    primaryActionLabel = '⚪ WAIT FOR EVIDENCE';
    actionReason = 'Key evidence (subscription demand or AI quality analysis) is still pending.';
  } else {
    primaryAction = 'NO_ACTION';
    primaryActionLabel = '⚪ NO ACTION';
    actionReason = 'Average or neutral market metrics; no immediate actionable signal.';
  }

  return {
    decisionReadinessScore: readinessScore,
    readinessLevel,
    readinessLabel,
    nextEvidenceNeeded,
    evidenceUpgradePotential: upgradePotential,
    upgradeProbability: upgradePotential,
    upgradePotentialReasons,
    upgradeProbabilityReasons: upgradePotentialReasons,
    reversalRisk,
    reversalRiskReasons,
    primaryAction,
    primaryActionLabel,
    actionReason,
  };
}
