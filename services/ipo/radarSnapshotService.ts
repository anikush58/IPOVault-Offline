import { SQLiteDatabase } from 'expo-sqlite';
import { IPOMasterRecord } from './types';
import { evaluateIPORadarScore, RadarScoreBreakdown, RadarCategory } from './radarScoringEngine';
import { safeRunAsync, safeGetAllAsync, safeGetFirstAsync, isClosedResourceError } from '@/utils/sqliteDebug';

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
 * Safely parses any value into a finite number or null.
 * Rejects NaN, Infinity, -Infinity, '--', 'N/A', empty strings, etc.
 */
export function safeNumber(val: any): number | null {
  if (val == null) return null;
  if (typeof val === 'number') {
    return Number.isNaN(val) || !Number.isFinite(val) ? null : val;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === '--' || trimmed === 'N/A' || trimmed === 'null' || trimmed === 'undefined') {
      return null;
    }
    const cleaned = trimmed.replace(/[₹$,%]/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) || !Number.isFinite(parsed) ? null : parsed;
  }
  return null;
}

let lastLoggedErrorTime = 0;
let lastErrorMessage = '';
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
const THROTTLE_MS = 10000;

function logRadarSnapshotError(context: string, err: any) {
  const isClosed = isClosedResourceError(err);
  const now = Date.now();
  if (isClosed) {
    if (now - lastLoggedErrorTime > THROTTLE_MS || lastErrorMessage !== 'closed_resource') {
      lastLoggedErrorTime = now;
      lastErrorMessage = 'closed_resource';
      if (isDev) {
        console.warn(`[RadarSnapshot] Database closed during ${context}. Operation skipped safely.`);
      }
    }
    return;
  }

  const msg = err?.message || String(err);
  if (now - lastLoggedErrorTime > THROTTLE_MS || lastErrorMessage !== msg) {
    lastLoggedErrorTime = now;
    lastErrorMessage = msg;
    console.error(`[RadarSnapshot] Error in ${context}:`, err);
  }
}

/**
 * Builds a snapshot record object from an IPO and optional previous snapshot.
 */
export function buildSnapshotFromIPO(ipo: IPOMasterRecord, prev?: RadarSnapshotRecord | null): RadarSnapshotRecord {
  const radar = evaluateIPORadarScore(ipo, prev || null);
  return {
    id: `snap_${ipo.id}_${Date.now()}`,
    ipo_id: String(ipo.id),
    category: radar.category,
    score: safeNumber(radar.score) ?? 0,
    confidence: safeNumber(radar.confidence) ?? 0,
    gmp_amount: safeNumber(ipo.gmp_amount),
    gmp_percent: safeNumber(ipo.gmp_percent),
    total_subscription: safeNumber(ipo.total_sub),
    retail_subscription: safeNumber(ipo.retail_sub),
    qib_subscription: safeNumber(ipo.qib_sub),
    nii_subscription: safeNumber(ipo.nii_sub),
    quality_score: safeNumber(ipo.score?.total_score),
    risk_score: safeNumber(radar.signals?.riskPenalty),
    decision_readiness_score: safeNumber(radar.v4Predictive?.decisionReadinessScore),
    reversal_risk: radar.v4Predictive?.reversalRisk || null,
    primary_action_label: radar.v4Predictive?.primaryActionLabel || null,
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
  const prevScore = safeNumber(prev.score) ?? 0;
  const currScore = safeNumber(curr.score) ?? 0;
  const scoreDiff = Math.abs(currScore - prevScore);
  if (scoreDiff >= 5) return true;

  // GMP % delta >= 5% triggers snapshot
  const prevGmp = safeNumber(prev.gmp_percent) ?? 0;
  const currGmp = safeNumber(curr.gmp_percent) ?? 0;
  if (Math.abs(currGmp - prevGmp) >= 5) return true;

  // Subscription delta >= 2x triggers snapshot
  const prevSub = safeNumber(prev.total_subscription) ?? 0;
  const currSub = safeNumber(curr.total_subscription) ?? 0;
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
  if (!db || !ipoId) return [];
  const safeLimit = Math.max(1, safeNumber(limit) ?? 10);
  try {
    const rows = await safeGetAllAsync<RadarSnapshotRecord>(
      db,
      'SELECT * FROM radar_snapshots WHERE ipo_id = ? ORDER BY created_at DESC LIMIT ?',
      [String(ipoId), safeLimit],
      'RadarSnapshot.getIPORadarSnapshots'
    );
    return rows || [];
  } catch (err: any) {
    logRadarSnapshotError('getIPORadarSnapshots', err);
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
  if (!db || !ipoId) return null;
  try {
    const row = await safeGetFirstAsync<RadarSnapshotRecord>(
      db,
      'SELECT * FROM radar_snapshots WHERE ipo_id = ? ORDER BY created_at DESC LIMIT 1',
      [String(ipoId)],
      'RadarSnapshot.getLatestRadarSnapshot'
    );
    return row || null;
  } catch (err: any) {
    if (isClosedResourceError(err)) {
      logRadarSnapshotError('getLatestRadarSnapshot', err);
      throw err;
    }
    logRadarSnapshotError('getLatestRadarSnapshot', err);
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
  if (!db || !ipo || !ipo.id) {
    return false;
  }

  try {
    const prev = await getLatestRadarSnapshot(db, ipo.id);
    const checkState = {
      category: radar.category,
      score: safeNumber(radar.score) ?? 0,
      gmp_percent: safeNumber(ipo.gmp_percent),
      total_subscription: safeNumber(ipo.total_sub),
      primaryAction: radar.v4Predictive?.primaryAction,
      reversalRisk: radar.v4Predictive?.reversalRisk,
      decisionReadinessScore: safeNumber(radar.v4Predictive?.decisionReadinessScore) ?? undefined,
      status: ipo.status,
    };

    if (!shouldPersistSnapshot(prev, checkState)) {
      return false;
    }

    const id = `snap_${ipo.id}_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const isClosed = (ipo.status || '').toLowerCase() === 'closed';

    await safeRunAsync(
      db,
      `INSERT INTO radar_snapshots (
        id, ipo_id, category, score, confidence, gmp_amount, gmp_percent,
        total_subscription, retail_subscription, qib_subscription, nii_subscription,
        quality_score, risk_score, is_final_pre_listing, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(ipo.id),
        String(radar.category || 'AVOID'),
        safeNumber(radar.score) ?? 0,
        safeNumber(radar.confidence) ?? 0,
        safeNumber(ipo.gmp_amount),
        safeNumber(ipo.gmp_percent),
        safeNumber(ipo.total_sub),
        safeNumber(ipo.retail_sub),
        safeNumber(ipo.qib_sub),
        safeNumber(ipo.nii_sub),
        safeNumber(ipo.score?.total_score),
        safeNumber(radar.signals?.riskPenalty),
        isClosed ? 1 : 0,
        createdAt,
      ],
      'RadarSnapshot.persistRadarSnapshotIfChanged'
    );

    return true;
  } catch (err: any) {
    if (isClosedResourceError(err)) {
      logRadarSnapshotError('persistRadarSnapshotIfChanged', err);
      throw err;
    }
    logRadarSnapshotError('persistRadarSnapshotIfChanged', err);
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
  if (!db || !ipoId) return false;
  try {
    const latest = await getLatestRadarSnapshot(db, ipoId);
    if (!latest) return false;

    await safeRunAsync(
      db,
      'UPDATE radar_snapshots SET is_final_pre_listing = 1 WHERE id = ?',
      [latest.id],
      'RadarSnapshot.markFinalPreListingSnapshot'
    );
    return true;
  } catch (err: any) {
    if (isClosedResourceError(err)) {
      logRadarSnapshotError('markFinalPreListingSnapshot', err);
      throw err;
    }
    logRadarSnapshotError('markFinalPreListingSnapshot', err);
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
  if (!db || !ipoId) return null;
  try {
    const row = await safeGetFirstAsync<RadarSnapshotRecord>(
      db,
      'SELECT * FROM radar_snapshots WHERE ipo_id = ? AND is_final_pre_listing = 1 ORDER BY created_at DESC LIMIT 1',
      [String(ipoId)],
      'RadarSnapshot.getFinalPreListingSnapshot'
    );
    return row || null;
  } catch (err: any) {
    logRadarSnapshotError('getFinalPreListingSnapshot', err);
    return null;
  }
}
