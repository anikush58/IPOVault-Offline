import { SQLiteDatabase } from 'expo-sqlite';
import { IPORepository } from './ipoRepository';
import { LiveIPOProvider } from './providers/LiveIPOProvider';
import { ipoDiagnosticsStore } from './diagnosticsStore';
import { syncStore } from '@/services/sync/syncStatus';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { runWithTransaction, safeExecAsync, safeRunAsync, isClosedResourceError, isDatabaseOpen, markDatabaseClosed } from '@/utils/sqliteDebug';
import { concurrencyTelemetry } from '@/utils/concurrencyTelemetry';

import { API_BASE_URL } from '@/constants/apiConfig';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

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

  // 0. Database Lifecycle Guard
  if (!isDatabaseOpen(db)) {
    if (__DEV__) console.warn(`[IPOVault Sync] Database handle closed (Trigger: ${source}). Skipping.`);
    return {
      success: false,
      recordsDownloaded: 0,
      recordsUpdated: 0,
      error: 'Database handle closed',
    };
  }

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
  const syncProbe = concurrencyTelemetry.startExecuting('SYNC_TASK', `centralizedSync.${source}`);

  syncStore.update({
    state: 'Syncing',
    lastTriggerSource: source,
    error: null,
  });

  try {
    const repo = new IPORepository(db);
    const provider = new LiveIPOProvider();

    const since = await repo.getLastUpdatedTimestamp();
    const syncUrl = `${API_BASE_URL}/api/v1/ipos`;

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
            await safeExecAsync(
              db,
              `
              DELETE FROM ipo_master WHERE id IN (
                'ipo-leap-india', 'ipo-technocraft', 'ipo-lapl-auto', 'ipo-molbio-diag',
                'ipo-dhoot-trans', 'ipo-shiprocket', 'ipo-lalithaa-jewellery', 'ipo-ola-electric',
                'ipo-swiggy', 'ipo-hyundai-motor'
              ) OR id LIKE 'ipo-%' OR LOWER(company_name) LIKE '%test%' OR LOWER(ipo_name) LIKE '%test%' OR id LIKE '%test%';
            `,
              'centralizedSync.purgeLegacy'
            );
          } catch {}

          if (result.data && result.data.length > 0) {
            upsertedCount = await repo.upsertBatch(result.data, true);

            // 2. Reconcile deleted/unpublished server records:
            // Delete any SERVER-synced records in local SQLite that are no longer published in backend API response
            const activeIds = result.data.map((r) => r.id).filter(Boolean);
            if (activeIds.length > 0) {
              const placeholders = activeIds.map(() => '?').join(',');
              await safeRunAsync(
                db,
                `DELETE FROM ipo_master WHERE (source_type = 'SERVER' OR source_type IS NULL OR source_type = '') AND id NOT IN (${placeholders})`,
                activeIds as any,
                'centralizedSync.reconcileUnpublished'
              );
            }
          } else {
            await safeExecAsync(
              db,
              `DELETE FROM ipo_master WHERE (source_type = 'SERVER' OR source_type IS NULL OR source_type = '')`,
              'centralizedSync.purgeUnpublished'
            );
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
      let incompleteWritesReason: string | null = null;
      try {
        if (!isDatabaseOpen(db)) {
          incompleteWritesReason = 'Database closed before radar processing';
        } else {
          const { evaluateIPORadarScore } = require('./radarScoringEngine');
          const { persistRadarSnapshotIfChanged, markFinalPreListingSnapshot } = require('./radarSnapshotService');
          const { recordIPOOutcome } = require('./radarOutcomeService');
          const { IPOParser } = require('./ipoParser');

          // Pre-compute CPU transformations outside write transaction to minimize lock duration
          const preparedRadarBatch: Array<{
            fullIpo: any;
            radar: any;
            isClosedOrListed: boolean;
            outcomeRecord: any | null;
          }> = [];

          for (const rawData of result.data || []) {
            if (!rawData || !rawData.id) continue;
            const fullIpo = IPOParser.parse(rawData);
            if (!fullIpo || !fullIpo.id) continue;

            const radar = evaluateIPORadarScore(fullIpo, null, []);
            const statusLower = (fullIpo.status || '').toLowerCase();
            const isClosedOrListed = statusLower === 'closed' || statusLower === 'listed';
            const isListedWithGain = statusLower === 'listed' && (fullIpo.listing_price != null || fullIpo.listing_gain_percent != null);
            const outcomeRecord = isListedWithGain ? {
              ipo_id: fullIpo.id,
              company_name: fullIpo.company_name,
              issue_price: fullIpo.price_band_max || fullIpo.price_band_min || 0,
              listing_date: fullIpo.listing_date || new Date().toISOString(),
              listing_price: fullIpo.listing_price,
              listing_gain_percent: fullIpo.listing_gain_percent,
              outcome_recorded_at: new Date().toISOString(),
            } : null;

            preparedRadarBatch.push({ fullIpo, radar, isClosedOrListed, outcomeRecord });
          }

          // Process radar snapshots in small cooperative chunks yielding to event loop
          // so user-initiated interactive transactions are never blocked
          const CHUNK_SIZE = 5;
          for (let i = 0; i < preparedRadarBatch.length; i += CHUNK_SIZE) {
            if (!isDatabaseOpen(db)) {
              incompleteWritesReason = 'Database closed during radar batch processing';
              break;
            }
            const chunk = preparedRadarBatch.slice(i, i + CHUNK_SIZE);
            try {
              await runWithTransaction(
                db,
                async () => {
                  for (const item of chunk) {
                    await persistRadarSnapshotIfChanged(db, item.fullIpo, item.radar);
                    if (item.isClosedOrListed) {
                      await markFinalPreListingSnapshot(db, item.fullIpo.id);
                    }
                    if (item.outcomeRecord) {
                      await recordIPOOutcome(db, item.outcomeRecord);
                    }
                  }
                },
                `centralizedSync.radarSnapshotBatch.${i}`
              );
            } catch (batchErr: any) {
              if (isClosedResourceError(batchErr)) {
                markDatabaseClosed(db);
                incompleteWritesReason = 'Database closed during radar batch processing';
                if (__DEV__) console.log('[IPOVault Sync] DB closed during radar batch processing. Aborting remaining batches.');
                break;
              }
              throw batchErr;
            }
            // Yield event loop
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      } catch (radarErr: any) {
        if (isClosedResourceError(radarErr)) {
          markDatabaseClosed(db);
          incompleteWritesReason = 'Database closed during radar processing';
        } else {
          if (__DEV__) console.warn('[IPOVault Sync] Radar sync processing error:', radarErr);
        }
      }

      if (incompleteWritesReason) {
        syncStore.update({
          state: 'Idle',
          error: incompleteWritesReason,
        });
        return {
          success: false,
          recordsDownloaded: result.data.length,
          recordsUpdated: upsertedCount,
          error: incompleteWritesReason,
          statusCode: result.statusCode,
        };
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
    const errorMsg = err?.message || String(err) || 'Unexpected sync failure';
    const isClosed = errorMsg.toLowerCase().includes('closed resource') || errorMsg.toLowerCase().includes('access to closed resource');

    if (isClosed) {
      if (__DEV__) console.log(`[CentralizedSync] Database handle closed during reload (Source: ${source}). Skipping.`);
      syncStore.update({
        state: 'Idle',
        error: null,
      });
      return {
        success: false,
        recordsDownloaded: 0,
        recordsUpdated: 0,
        error: 'Database handle closed during reload',
      };
    }

    console.error(`[CentralizedSync] Unexpected sync error (Source: ${source}):`, err);

    syncProbe.finish(err);
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
    syncProbe.finish();
    isSyncing = false;
  }
}
