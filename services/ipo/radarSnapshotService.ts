import { SQLiteDatabase } from 'expo-sqlite';
import { IPOMasterRecord } from './types';
import { evaluateIPORadarScore, RadarScoreBreakdown, RadarCategory } from './radarScoringEngine';

export interface RadarSnapshotRecord {
  id: string;
  ipo_id: string;
  category: RadarCategory;
  score: number;
  confidence: number;
  gmp_amount: number | null;
  gmp_percent: number | null;
  total_subscription: number | null;
  retail_subscription: number | null;
  qib_subscription: number | null;
  nii_subscription: number | null;
  quality_score: number | null;
  risk_score: number | null;
  decision_readiness_score?: number | null;
  reversal_risk?: string | null;
  primary_action_label?: string | null;
  is_final_pre_listing: number; // 1 if last snapshot before listing date
  created_at: string;
}

/**
 * Builds a snapshot record object from an IPO and optional previous snapshot.
 */
export function buildSnapshotFromIPO(ipo: IPOMasterRecord, prev?: RadarSnapshotRecord | null): RadarSnapshotRecord {
  const radar = evaluateIPORadarScore(ipo, prev || null);
  return {
    id: `snap_${ipo.id}_${Date.now()}`,
    ipo_id: ipo.id,
    category: radar.category,
    score: radar.score,
    confidence: radar.confidence,
    gmp_amount: ipo.gmp_amount != null ? Number(ipo.gmp_amount) : null,
    gmp_percent: ipo.gmp_percent != null ? Number(ipo.gmp_percent) : null,
    total_subscription: ipo.total_sub != null ? Number(ipo.total_sub) : null,
    retail_subscription: ipo.retail_sub != null ? Number(ipo.retail_sub) : null,
    qib_subscription: ipo.qib_sub != null ? Number(ipo.qib_sub) : null,
    nii_subscription: ipo.nii_sub != null ? Number(ipo.nii_sub) : null,
    quality_score: ipo.score?.total_score != null ? Number(ipo.score.total_score) : null,
    risk_score: radar.signals?.riskPenalty != null ? Number(radar.signals.riskPenalty) : null,
    decision_readiness_score: radar.v4Predictive?.decisionReadinessScore,
    reversal_risk: radar.v4Predictive?.reversalRisk,
    primary_action_label: radar.v4Predictive?.primaryActionLabel,
    is_final_pre_listing: (ipo.status || '').toLowerCase() === 'closed' ? 1 : 0,
    created_at: new Date().toISOString(),
  };
}

/**
 * Trigger rules: Evaluate if snapshot should be persisted based on meaningful change.
 */
export function shouldPersistSnapshot(
  prev: RadarSnapshotRecord | any | null,
  curr: {
    category: RadarCategory;
    score: number;
    gmp_percent: number | null;
    total_subscription: number | null;
    primaryAction?: string;
    reversalRisk?: string;
    decisionReadinessScore?: number;
    status?: string;
  }
): boolean {
  if (!prev) return true;

  // Category change triggers immediate snapshot
  if (prev.category !== curr.category) return true;

  // Primary action change triggers snapshot
  const prevPrimaryAction = prev.primaryAction || prev.primary_action_label;
  if (curr.primaryAction && prevPrimaryAction && prevPrimaryAction !== curr.primaryAction) return true;

  // Reversal risk level change triggers snapshot
  const prevReversalRisk = prev.reversalRisk || prev.reversal_risk;
  if (curr.reversalRisk && prevReversalRisk && prevReversalRisk !== curr.reversalRisk) return true;

  // Decision readiness score delta >= 5 points triggers snapshot
  const prevReadiness = prev.decisionReadinessScore ?? prev.decision_readiness_score;
  if (curr.decisionReadinessScore != null && prevReadiness != null) {
    if (Math.abs(curr.decisionReadinessScore - prevReadiness) >= 5) return true;
  }

  // Score delta >= 5 points triggers snapshot
  const scoreDiff = Math.abs(curr.score - prev.score);
  if (scoreDiff >= 5) return true;

  // GMP % delta >= 5% triggers snapshot
  const prevGmp = prev.gmp_percent ?? 0;
  const currGmp = curr.gmp_percent ?? 0;
  if (Math.abs(currGmp - prevGmp) >= 5) return true;

  // Subscription delta >= 2x triggers snapshot
  const prevSub = prev.total_subscription ?? 0;
  const currSub = curr.total_subscription ?? 0;
  if (Math.abs(currSub - prevSub) >= 2) return true;

  // Bidding stage transition to Closed or Listed triggers snapshot
  const statusLower = (curr.status || '').toLowerCase();
  const prevStatusLower = (prev.status || '').toLowerCase();
  if ((statusLower === 'closed' || statusLower === 'listed') && statusLower !== prevStatusLower) return true;

  return false;
}

/**
 * Fetch all radar snapshots for a specific IPO ordered by timestamp desc.
 */
export async function getIPORadarSnapshots(
  db: SQLiteDatabase,
  ipoId: string,
  limit: number = 10
): Promise<RadarSnapshotRecord[]> {
  try {
    const rows = await db.getAllAsync<RadarSnapshotRecord>(
      'SELECT * FROM radar_snapshots WHERE ipo_id = ? ORDER BY created_at DESC LIMIT ?',
      [ipoId, limit]
    );
    return rows || [];
  } catch (err) {
    console.error('[RadarSnapshot] Error fetching snapshots:', err);
    return [];
  }
}

/**
 * Fetch latest snapshot for a specific IPO.
 */
export async function getLatestRadarSnapshot(
  db: SQLiteDatabase,
  ipoId: string
): Promise<RadarSnapshotRecord | null> {
  try {
    const rows = await db.getAllAsync<RadarSnapshotRecord>(
      'SELECT * FROM radar_snapshots WHERE ipo_id = ? ORDER BY created_at DESC LIMIT 1',
      [ipoId]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('[RadarSnapshot] Error fetching latest snapshot:', err);
    return null;
  }
}

/**
 * Persists snapshot if trigger conditions are met.
 */
export async function persistRadarSnapshotIfChanged(
  db: SQLiteDatabase,
  ipo: IPOMasterRecord,
  radar: RadarScoreBreakdown
): Promise<boolean> {
  try {
    const prev = await getLatestRadarSnapshot(db, ipo.id);
    const checkState = {
      category: radar.category,
      score: radar.score,
      gmp_percent: ipo.gmp_percent != null ? Number(ipo.gmp_percent) : null,
      total_subscription: ipo.total_sub != null ? Number(ipo.total_sub) : null,
      primaryAction: radar.v4Predictive?.primaryAction,
      reversalRisk: radar.v4Predictive?.reversalRisk,
      decisionReadinessScore: radar.v4Predictive?.decisionReadinessScore,
      status: ipo.status,
    };

    if (!shouldPersistSnapshot(prev, checkState)) {
      return false;
    }

    const id = `snap_${ipo.id}_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const isClosed = (ipo.status || '').toLowerCase() === 'closed';

    await db.runAsync(
      `INSERT INTO radar_snapshots (
        id, ipo_id, category, score, confidence, gmp_amount, gmp_percent,
        total_subscription, retail_subscription, qib_subscription, nii_subscription,
        quality_score, risk_score, is_final_pre_listing, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ipo.id,
        radar.category,
        radar.score,
        radar.confidence,
        ipo.gmp_amount != null ? Number(ipo.gmp_amount) : null,
        ipo.gmp_percent != null ? Number(ipo.gmp_percent) : null,
        ipo.total_sub != null ? Number(ipo.total_sub) : null,
        ipo.retail_sub != null ? Number(ipo.retail_sub) : null,
        ipo.qib_sub != null ? Number(ipo.qib_sub) : null,
        ipo.nii_sub != null ? Number(ipo.nii_sub) : null,
        ipo.score?.total_score != null ? Number(ipo.score.total_score) : null,
        radar.signals?.riskPenalty != null ? Number(radar.signals.riskPenalty) : null,
        isClosed ? 1 : 0,
        createdAt,
      ]
    );

    return true;
  } catch (err) {
    console.error('[RadarSnapshot] Error persisting snapshot:', err);
    return false;
  }
}

/**
 * Marks the latest pre-listing snapshot as immutable final baseline (is_final_pre_listing = 1).
 */
export async function markFinalPreListingSnapshot(
  db: SQLiteDatabase,
  ipoId: string
): Promise<boolean> {
  try {
    const latest = await getLatestRadarSnapshot(db, ipoId);
    if (!latest) return false;

    await db.runAsync(
      'UPDATE radar_snapshots SET is_final_pre_listing = 1 WHERE id = ?',
      [latest.id]
    );
    return true;
  } catch (err) {
    console.error('[RadarSnapshot] Error marking final pre-listing snapshot:', err);
    return false;
  }
}

/**
 * Fetches the immutable final pre-listing snapshot for an IPO.
 */
export async function getFinalPreListingSnapshot(
  db: SQLiteDatabase,
  ipoId: string
): Promise<RadarSnapshotRecord | null> {
  try {
    const row = await db.getFirstAsync<RadarSnapshotRecord>(
      'SELECT * FROM radar_snapshots WHERE ipo_id = ? AND is_final_pre_listing = 1 ORDER BY created_at DESC LIMIT 1',
      [ipoId]
    );
    return row || null;
  } catch (err) {
    console.error('[RadarSnapshot] Error fetching final pre-listing snapshot:', err);
    return null;
  }
}
