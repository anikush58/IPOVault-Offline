import { SQLiteDatabase } from 'expo-sqlite';
import { IPORepository } from './ipoRepository';
import { LiveIPOProvider } from './providers/LiveIPOProvider';
import { ipoDiagnosticsStore } from './ipoUpdater';
import { syncStore } from '@/services/sync/syncStatus';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { runWithTransaction } from '@/utils/sqliteDebug';

import { API_BASE_URL } from '@/constants/apiConfig';

export const LAST_SYNCED_AT_KEY = 'ipo_last_synced_at';

let isSyncing = false;
let lastSyncAttemptMs = 0;

export interface CentralizedSyncOptions {
  source?: string;
  force?: boolean;
}

export interface CentralizedSyncResult {
  success: boolean;
  recordsDownloaded: number;
  recordsUpdated: number;
  error: string | null;
  statusCode?: number;
}

export async function triggerCentralizedIPOSync(
  db: SQLiteDatabase,
  options?: CentralizedSyncOptions
): Promise<CentralizedSyncResult> {
  const source = options?.source || 'Manual';
  const nowMs = Date.now();

  // 1. Concurrency & Debounce Guard (5s minimum interval unless forced)
  if (isSyncing) {
    if (__DEV__) console.log(`[IPOVault Sync] Sync already in progress (Trigger: ${source}). Skipping.`);
    return {
      success: false,
      recordsDownloaded: 0,
      recordsUpdated: 0,
      error: 'Sync already in progress',
    };
  }

  if (!options?.force && nowMs - lastSyncAttemptMs < 5000) {
    if (__DEV__) console.log(`[IPOVault Sync] Debounced sync attempt (Trigger: ${source}). Skipping.`);
    return {
      success: true,
      recordsDownloaded: 0,
      recordsUpdated: 0,
      error: null,
    };
  }

  isSyncing = true;
  lastSyncAttemptMs = nowMs;
  const startTime = Date.now();

  syncStore.update({
    state: 'Syncing',
    lastTriggerSource: source,
    error: null,
  });

  try {
    const repo = new IPORepository(db);
    const provider = new LiveIPOProvider();

    const since = await repo.getLastUpdatedTimestamp();
    const syncUrl = `${API_BASE_URL}/api/ipo/sync`;

    if (__DEV__) {
      console.log('[IPOVault Sync] Starting sync');
      console.log(`[IPOVault Sync] Trigger: ${source}`);
      console.log(`[IPOVault Sync] API Base URL: ${API_BASE_URL}`);
      console.log(`[IPOVault Sync] Full Sync URL: ${syncUrl}`);
    }

    const result = await provider.fetchIPOs(since);
    const durationMs = Date.now() - startTime;

    if (result.success) {
      let upsertedCount = 0;

      await runWithTransaction(
        db,
        async () => {
          // 1. Purge legacy hardcoded seed records & test records from local SQLite
          try {
            await db.execAsync(`
              DELETE FROM ipo_master WHERE id IN (
                'ipo-leap-india', 'ipo-technocraft', 'ipo-lapl-auto', 'ipo-molbio-diag',
                'ipo-dhoot-trans', 'ipo-shiprocket', 'ipo-lalithaa-jewellery', 'ipo-ola-electric',
                'ipo-swiggy', 'ipo-hyundai-motor'
              ) OR id LIKE 'ipo-%' OR LOWER(company_name) LIKE '%test%' OR LOWER(ipo_name) LIKE '%test%' OR id LIKE '%test%';
            `);
          } catch {}

          if (result.data && result.data.length > 0) {
            upsertedCount = await repo.upsertBatch(result.data, true);

            // 2. Reconcile deleted/unpublished server records:
            // Delete any SERVER-synced records in local SQLite that are no longer published in backend API response
            const activeIds = result.data.map((r) => r.id).filter(Boolean);
            if (activeIds.length > 0) {
              const placeholders = activeIds.map(() => '?').join(',');
              await db.runAsync(
                `DELETE FROM ipo_master WHERE (source_type = 'SERVER' OR source_type IS NULL OR source_type = '') AND id NOT IN (${placeholders})`,
                activeIds as any
              );
            }
          } else {
            await db.execAsync(`DELETE FROM ipo_master WHERE (source_type = 'SERVER' OR source_type IS NULL OR source_type = '')`);
          }
        },
        'centralizedSync.dbWriteTransaction'
      );

      const lastSyncedIso = new Date().toISOString();
      await safeAsyncStorage.setItem(LAST_SYNCED_AT_KEY, lastSyncedIso);

      // Run Notification Engine evaluation on fresh server data
      try {
        const { runNotificationEngine } = require('@/services/notifications/notificationEngine');
        const notifCount = await runNotificationEngine(db, result.data || []);
        if (__DEV__ && notifCount > 0) {
          console.log(`[IPOVault Sync] Notification Engine generated ${notifCount} new notification(s)`);
        }
      } catch (notifErr) {
        if (__DEV__) console.warn('[IPOVault Sync] Notification engine error:', notifErr);
      }

      // ── RUN RADAR SNAPSHOT & OUTCOME INTEGRATION ──
      try {
        const { evaluateIPORadarScore } = require('./radarScoringEngine');
        const { persistRadarSnapshotIfChanged, markFinalPreListingSnapshot } = require('./radarSnapshotService');
        const { recordIPOOutcome } = require('./radarOutcomeService');

        for (const ipoData of result.data || []) {
          if (!ipoData.id) continue;
          const fullIpo = await repo.getById(ipoData.id);
          if (!fullIpo) continue;

          const radar = evaluateIPORadarScore(fullIpo, null, []);
          await persistRadarSnapshotIfChanged(db, fullIpo, radar);

          const statusLower = (fullIpo.status || '').toLowerCase();
          if (statusLower === 'closed' || statusLower === 'listed') {
            await markFinalPreListingSnapshot(db, fullIpo.id);
          }

          if (statusLower === 'listed' && (fullIpo.listing_price != null || fullIpo.listing_gain_percent != null)) {
            await recordIPOOutcome(db, {
              ipo_id: fullIpo.id,
              company_name: fullIpo.company_name,
              issue_price: fullIpo.price_band_max || fullIpo.price_band_min || 0,
              listing_date: fullIpo.listing_date || new Date().toISOString(),
              listing_price: fullIpo.listing_price,
              listing_gain_percent: fullIpo.listing_gain_percent,
              outcome_recorded_at: new Date().toISOString(),
            });
          }
        }
      } catch (radarErr) {
        if (__DEV__) console.warn('[IPOVault Sync] Radar sync processing error:', radarErr);
      }

      if (__DEV__) {
        console.log(`[IPOVault Sync] HTTP: ${result.statusCode || 200}`);
        console.log(`[IPOVault Sync] Received: ${result.data.length} IPOs`);
        console.log(`[IPOVault Sync] Upserted: ${upsertedCount}`);
        console.log(`[IPOVault Sync] Last Synced At: ${lastSyncedIso}`);
        console.log('[IPOVault Sync] Completed successfully');
      }

      ipoDiagnosticsStore.update({
        lastSuccessfulSync: lastSyncedIso,
        providerUsed: result.providerUsed || 'live',
        recordsDownloaded: result.data.length,
        recordsUpdated: upsertedCount,
        syncDurationMs: durationMs,
        syncError: null,
      });

      syncStore.update({
        state: 'Idle',
        lastSyncTimestamp: lastSyncedIso,
        rowsDownloaded: result.data.length,
        error: null,
      });

      return {
        success: true,
        recordsDownloaded: result.data.length,
        recordsUpdated: upsertedCount,
        error: null,
        statusCode: result.statusCode,
      };
    } else {
      if (__DEV__) {
        console.log('[IPOVault Sync] FAILED');
        console.log(`[IPOVault Sync] URL: ${syncUrl}`);
        console.log(`[IPOVault Sync] Error: ${result.error}`);
      }

      const isOfflineErr =
        result.error?.toLowerCase().includes('network') ||
        result.error?.toLowerCase().includes('unreachable') ||
        result.error?.toLowerCase().includes('dns') ||
        result.error?.toLowerCase().includes('fetch failed');

      const syncState = isOfflineErr ? 'Offline' : 'Error';

      ipoDiagnosticsStore.update({
        syncDurationMs: durationMs,
        syncError: result.error || 'Backend sync unavailable',
      });

      syncStore.update({
        state: syncState,
        error: result.error || 'Backend sync unavailable',
      });

      return {
        success: false,
        recordsDownloaded: 0,
        recordsUpdated: 0,
        error: result.error || 'Backend sync unavailable',
        statusCode: result.statusCode,
      };
    }
  } catch (err: any) {
    const errorMsg = err.message || 'Unexpected sync failure';
    console.error(`[CentralizedSync] Unexpected sync error (Source: ${source}):`, err);

    syncStore.update({
      state: 'Error',
      error: errorMsg,
    });

    return {
      success: false,
      recordsDownloaded: 0,
      recordsUpdated: 0,
      error: errorMsg,
    };
  } finally {
    isSyncing = false;
  }
}
