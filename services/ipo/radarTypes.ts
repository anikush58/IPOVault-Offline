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

export const CATEGORY_RANK: Record<RadarCategory, number> = {
  HIGH_CONVICTION: 5,
  WATCH: 4,
  MOMENTUM_CANDIDATE: 3,
  NEUTRAL: 2,
  LOW_PRIORITY: 1,
  AVOID: 0,
};
