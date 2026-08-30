import { SQLiteDatabase } from 'expo-sqlite';
import { IPOOutcomeRecord, RadarOutcomeMetrics, RadarCategoryAccuracyMetric } from './types';
import { RadarCategory } from './radarScoringEngine';
import { RadarSnapshotRecord } from './radarSnapshotService';

export type OutcomeClassification =
  | 'STRONG_POSITIVE'
  | 'POSITIVE'
  | 'FLAT'
  | 'NEGATIVE'
  | 'SEVERE_NEGATIVE';

export const OUTCOME_THRESHOLDS = {
  STRONG_POSITIVE_MIN: 20.0, // Listing gain >= +20%
  POSITIVE_MIN: 5.0,         // Listing gain > +5%
  FLAT_MIN: -2.0,            // Listing gain between -2% and +5%
  SEVERE_NEGATIVE_MAX: -15.0 // Listing gain <= -15%
};

export const MINIMUM_REQUIRED_SAMPLE = 5; // Small sample safety threshold

export interface OutcomeClassificationResult {
  classification: OutcomeClassification;
  label: string;
  badgeBg: string;
  badgeTextColor: string;
  icon: string;
}

export interface IPOOutcomePair {
  outcome: IPOOutcomeRecord;
  snapshot: RadarSnapshotRecord | null;
}

export interface CategoryPerformanceSummary {
  category: RadarCategory;
  categoryLabel: string;
  sampleSize: number;
  isSufficientSample: boolean;
  confidenceLabel: string;
  positiveCount: number;
  negativeCount: number;
  flatCount: number;
  positiveRatePercent: number;
  negativeRatePercent: number;
  averageListingGainPercent: number;
  medianListingGainPercent: number;
  severeReversalRatePercent: number;
}

/**
 * Classifies listing outcome against centralized thresholds.
 */
export function classifyIPOOutcome(listingGainPercent: number | null): OutcomeClassificationResult {
  if (listingGainPercent == null || isNaN(listingGainPercent)) {
    return {
      classification: 'FLAT',
      label: 'Flat (0.0%)',
      badgeBg: '#F3F4F6',
      badgeTextColor: '#6B7280',
      icon: '➡️',
    };
  }

  const gain = Number(listingGainPercent);

  if (gain >= OUTCOME_THRESHOLDS.STRONG_POSITIVE_MIN) {
    return {
      classification: 'STRONG_POSITIVE',
      label: `Strong Positive (+${gain.toFixed(1)}%)`,
      badgeBg: '#D1FAE5',
      badgeTextColor: '#10B981',
      icon: '🚀',
    };
  } else if (gain > OUTCOME_THRESHOLDS.POSITIVE_MIN) {
    return {
      classification: 'POSITIVE',
      label: `Positive (+${gain.toFixed(1)}%)`,
      badgeBg: '#ECFDF5',
      badgeTextColor: '#059669',
      icon: '📈',
    };
  } else if (gain >= OUTCOME_THRESHOLDS.FLAT_MIN) {
    return {
      classification: 'FLAT',
      label: `Flat (${gain >= 0 ? '+' : ''}${gain.toFixed(1)}%)`,
      badgeBg: '#FEF3C7',
      badgeTextColor: '#D97706',
      icon: '➡️',
    };
  } else if (gain <= OUTCOME_THRESHOLDS.SEVERE_NEGATIVE_MAX) {
    return {
      classification: 'SEVERE_NEGATIVE',
      label: `Severe Reversal (${gain.toFixed(1)}%)`,
      badgeBg: '#FEF2F2',
      badgeTextColor: '#DC2626',
      icon: '⚠️',
    };
  } else {
    return {
      classification: 'NEGATIVE',
      label: `Negative (${gain.toFixed(1)}%)`,
      badgeBg: '#FEE2E2',
      badgeTextColor: '#EF4444',
      icon: '📉',
    };
  }
}

/**
 * Pure analytics layer to calculate historical Radar category performance.
 * Strictly enforces small-sample safety (<5 sample size = INSUFFICIENT HISTORY).
 */
export function evaluateCategoryPerformance(
  category: RadarCategory,
  pairs: IPOOutcomePair[]
): CategoryPerformanceSummary {
  const categoryPairs = pairs.filter((p) => p.snapshot && p.snapshot.category === category);
  const sampleSize = categoryPairs.length;
  const isSufficientSample = sampleSize >= MINIMUM_REQUIRED_SAMPLE;
  const confidenceLabel = isSufficientSample ? 'SUFFICIENT SAMPLE' : 'INSUFFICIENT HISTORY';

  const categoryLabel = category.replace('_', ' ');

  if (sampleSize === 0) {
    return {
      category,
      categoryLabel,
      sampleSize: 0,
      isSufficientSample: false,
      confidenceLabel,
      positiveCount: 0,
      negativeCount: 0,
      flatCount: 0,
      positiveRatePercent: 0,
      negativeRatePercent: 0,
      averageListingGainPercent: 0,
      medianListingGainPercent: 0,
      severeReversalRatePercent: 0,
    };
  }

  let positiveCount = 0;
  let negativeCount = 0;
  let flatCount = 0;
  let severeReversalCount = 0;
  let gainSum = 0;
  const gains: number[] = [];

  categoryPairs.forEach((p) => {
    const gain = p.outcome.listing_gain_percent ?? 0;
    gainSum += gain;
    gains.push(gain);

    const cls = classifyIPOOutcome(gain).classification;
    if (cls === 'STRONG_POSITIVE' || cls === 'POSITIVE') positiveCount++;
    else if (cls === 'NEGATIVE' || cls === 'SEVERE_NEGATIVE') negativeCount++;
    else flatCount++;

    if (cls === 'SEVERE_NEGATIVE') severeReversalCount++;
  });

  gains.sort((a, b) => a - b);
  const mid = Math.floor(gains.length / 2);
  const medianListingGainPercent = gains.length % 2 !== 0 ? gains[mid] : (gains[mid - 1] + gains[mid]) / 2;

  const averageListingGainPercent = Number((gainSum / sampleSize).toFixed(1));
  const positiveRatePercent = Number(((positiveCount / sampleSize) * 100).toFixed(1));
  const negativeRatePercent = Number(((negativeCount / sampleSize) * 100).toFixed(1));
  const severeReversalRatePercent = Number(((severeReversalCount / sampleSize) * 100).toFixed(1));

  return {
    category,
    categoryLabel,
    sampleSize,
    isSufficientSample,
    confidenceLabel,
    positiveCount,
    negativeCount,
    flatCount,
    positiveRatePercent,
    negativeRatePercent,
    averageListingGainPercent,
    medianListingGainPercent,
    severeReversalRatePercent,
  };
}

/**
 * Calculates High GMP Reversal Rate: IPOs with GMP >= +30% before listing that listed at a loss.
 */
export function calculateHighGmpReversalRate(pairs: IPOOutcomePair[]): {
  highGmpCount: number;
  reversalCount: number;
  reversalRatePercent: number;
  isSufficientSample: boolean;
} {
  const highGmpPairs = pairs.filter(
    (p) => p.snapshot && p.snapshot.gmp_percent != null && p.snapshot.gmp_percent >= 30.0
  );

  const sampleSize = highGmpPairs.length;
  const isSufficientSample = sampleSize >= MINIMUM_REQUIRED_SAMPLE;

  if (sampleSize === 0) {
    return { highGmpCount: 0, reversalCount: 0, reversalRatePercent: 0, isSufficientSample: false };
  }

  let reversalCount = 0;
  highGmpPairs.forEach((p) => {
    const gain = p.outcome.listing_gain_percent ?? 0;
    if (gain < 0) reversalCount++;
  });

  const reversalRatePercent = Number(((reversalCount / sampleSize) * 100).toFixed(1));

  return {
    highGmpCount: sampleSize,
    reversalCount,
    reversalRatePercent,
    isSufficientSample,
  };
}

/**
 * Persist or update an authoritative IPO outcome record in SQLite.
 */
export async function recordIPOOutcome(
  db: SQLiteDatabase,
  outcome: IPOOutcomeRecord
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO ipo_outcomes (
        ipo_id, company_name, issue_price, listing_price, listing_gain_percent,
        listing_date, day_30_price, day_30_gain_percent, outcome_recorded_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ipo_id) DO UPDATE SET
        listing_price = excluded.listing_price,
        listing_gain_percent = excluded.listing_gain_percent,
        day_30_price = excluded.day_30_price,
        day_30_gain_percent = excluded.day_30_gain_percent,
        updated_at = excluded.updated_at`,
      [
        outcome.ipo_id,
        outcome.company_name,
        outcome.issue_price,
        outcome.listing_price,
        outcome.listing_gain_percent,
        outcome.listing_date,
        outcome.day30_closing_price ?? null,
        outcome.day30_gain_percent ?? null,
        outcome.outcome_recorded_at || now,
        outcome.created_at || now,
        now,
      ]
    );
    return true;
  } catch (err) {
    console.error('[RadarOutcome] Error recording IPO outcome:', err);
    return false;
  }
}

/**
 * Fetches single IPO outcome record from SQLite database by ipo_id.
 */
export async function getIPOOutcome(
  db: SQLiteDatabase,
  ipoId: string
): Promise<IPOOutcomeRecord | null> {
  try {
    const row = await db.getFirstAsync<IPOOutcomeRecord>(
      'SELECT * FROM ipo_outcomes WHERE ipo_id = ?',
      [ipoId]
    );
    return row || null;
  } catch (err) {
    console.error('[RadarOutcome] Error fetching IPO outcome:', err);
    return null;
  }
}
