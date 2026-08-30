import { IPOProvider, IPOMasterRecord, FetchResult } from './types';
import { IPORepository } from './ipoRepository';
import { DemoSeedProvider } from './providers/DemoSeedProvider';

/**
 * Maps technical raw error strings into friendly user-facing messages.
 * Prevents raw technical exceptions (URLs, DNS, ENOTFOUND, stack traces) from leaking to end users.
 */
export function mapSyncErrorToUserMessage(rawError: string | null): string {
  if (!rawError) return '';
  const err = rawError.toLowerCase();

  if (err.includes('timeout') || err.includes('timed out')) {
    return 'The update request took too long. Using local data.';
  }
  if (err.includes('404') || err.includes('not found')) {
    return 'Live synchronization is currently unavailable.';
  }
  if (err.includes('500') || err.includes('502') || err.includes('503') || err.includes('server')) {
    return 'Server is temporarily unavailable.';
  }
  if (err.includes('dns') || err.includes('enotfound') || err.includes('network') || err.includes('fetch failed') || err.includes('unreachable')) {
    return 'Unable to check for updates. Using your local IPO database.';
  }
  return "Live sync isn't available yet. Your local IPO database is still available.";
}

export interface IPODiagnostics {
  lastSuccessfulSync: string | null;
  providerUsed: 'live' | 'mock' | 'demo';
  recordsDownloaded: number;
  recordsUpdated: number;
  totalRowsUpserted: number;
  syncDurationMs: number;
  syncError: string | null;
}

type Listener = (d: IPODiagnostics) => void;

class IPODiagnosticsStore {
  private data: IPODiagnostics = {
    lastSuccessfulSync: null,
    providerUsed: 'live',
    recordsDownloaded: 0,
    recordsUpdated: 0,
    totalRowsUpserted: 0,
    syncDurationMs: 0,
    syncError: null,
  };
  private listeners: Set<Listener> = new Set();

  get() { return { ...this.data }; }
  
  update(partial: Partial<IPODiagnostics>) {
    this.data = { ...this.data, ...partial };
    this.notify();
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.get());
    return () => this.listeners.delete(l);
  }

  private notify() {
    for (const l of this.listeners) l(this.get());
  }
}
export const ipoDiagnosticsStore = new IPODiagnosticsStore();

/**
 * MockIPOProvider for offline testing during development.
 * Classification: Development Testing Only.
 */
export class MockIPOProvider implements IPOProvider {
  readonly name = 'mock' as const;

  async fetchIPOs(since: string | null): Promise<FetchResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const now = new Date().toISOString();
        resolve({
          success: true,
          providerUsed: 'mock',
          data: [
            {
              id: 'mock-1',
              company_name: 'TechFlow Private Limited',
              ipo_name: 'TechFlow IPO',
              symbol: 'TECHFLOW',
              exchange: 'NSE',
              status: 'Upcoming',
              sector: 'Technology',
              updated_at: now,
            },
            {
              id: 'mock-2',
              company_name: 'GreenEnergy Solutions Ltd',
              ipo_name: 'GreenEnergy IPO',
              symbol: 'GREENEN',
              exchange: 'BSE',
              status: 'Open',
              sector: 'Renewable Energy',
              updated_at: now,
              close_date: new Date(Date.now() + 86400000 * 2).toISOString(),
            },
          ],
        });
      }, 500);
    });
  }
}

export class IPOUpdater {
  private isUpdating = false;
  private hasLoggedWarning = false;

  constructor(
    private repository: IPORepository,
    private provider: IPOProvider
  ) {}

  async runUpdate() {
    if (this.isUpdating) return;
    this.isUpdating = true;
    const startTime = Date.now();

    try {
      const since = await this.repository.getLastUpdatedTimestamp();
      let res: FetchResult = await this.provider.fetchIPOs(since);
      const duration = Date.now() - startTime;

      // ── Fallback Hierarchy ──────────────────────────────────────────────────
      if (!res.success) {
        if (!this.hasLoggedWarning) {
          console.warn(`[IPOUpdater] Live sync endpoint unreachable. Operating on local cache (${res.error || 'No internet'}).`);
          this.hasLoggedWarning = true;
        }

        // Check local SQLite cache row count
        const stats = await this.repository.getStats();
        if (stats.totalCount > 0) {
          // Local cache exists — gracefully fall back to local cache without overwriting
          ipoDiagnosticsStore.update({
            providerUsed: this.provider.name,
            syncDurationMs: duration,
            syncError: res.error || 'Live sync endpoint unreachable. Operating on local cache.',
          });
          return;
        }

        // If local cache is 0 rows (first-run dev/demo), fall back to DemoSeedProvider
        console.log('[IPOUpdater] Local SQLite cache empty. Initializing first-run DemoSeedProvider...');
        const demoProvider = new DemoSeedProvider();
        res = await demoProvider.fetchIPOs(null);
      }

      // If data returned, upsert into SQLite ipo_master
      if (res.success && res.data.length > 0) {
        console.log(`[IPOUpdater] Upserting ${res.data.length} records into SQLite ipo_master...`);
        const upserted = await this.repository.upsertBatch(res.data);

        ipoDiagnosticsStore.update({
          lastSuccessfulSync: new Date().toISOString(),
          providerUsed: res.providerUsed,
          recordsDownloaded: res.data.length,
          recordsUpdated: upserted,
          totalRowsUpserted: ipoDiagnosticsStore.get().totalRowsUpserted + upserted,
          syncDurationMs: Date.now() - startTime,
          syncError: null,
        });
      } else {
        ipoDiagnosticsStore.update({
          lastSuccessfulSync: new Date().toISOString(),
          providerUsed: res.providerUsed,
          recordsDownloaded: 0,
          recordsUpdated: 0,
          syncDurationMs: Date.now() - startTime,
          syncError: null,
        });
      }
    } catch (e: any) {
      if (!this.hasLoggedWarning) {
        console.warn(`[IPOUpdater] Sync execution error: ${e.message || e}`);
        this.hasLoggedWarning = true;
      }
      ipoDiagnosticsStore.update({
        syncError: e.message || 'Sync execution error',
        syncDurationMs: Date.now() - startTime,
      });
    } finally {
      this.isUpdating = false;
    }
  }

  updateCacheAge() {
    const last = ipoDiagnosticsStore.get().lastSuccessfulSync;
    if (last) {
      const ageMs = Date.now() - new Date(last).getTime();
      ipoDiagnosticsStore.update({
        syncDurationMs: ageMs,
      });
    }
  }
}
