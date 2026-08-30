import { SQLiteDatabase } from 'expo-sqlite';
import { IPODataProvider, IPOFilterOptions, IPODataProviderResult } from '../types/provider';
import { SmartIPORecord } from '../types/smartIpo';
import { validateSmartIPOPayload } from '../validation/smartIPOValidator';
import { LocalSQLiteProvider } from './LocalSQLiteProvider';
import { API_BASE_URL } from '@/constants/apiConfig';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { runWithTransaction } from '@/utils/sqliteDebug';

export interface RemoteSmartIPOProviderConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

export class RemoteSmartIPOProvider implements IPODataProvider {
  readonly id = 'remote_smart_ipo';
  readonly name = 'Remote Smart IPO Data Provider';
  readonly isRemote = true;

  private db: SQLiteDatabase;
  private localFallbackProvider: LocalSQLiteProvider;
  private baseUrl: string;
  private timeoutMs: number;
  private lastEtag: string | null = null;

  constructor(db: SQLiteDatabase, config?: RemoteSmartIPOProviderConfig) {
    this.db = db;
    this.localFallbackProvider = new LocalSQLiteProvider(db);
    this.baseUrl =
      config?.baseUrl ||
      process.env.EXPO_PUBLIC_IPO_SYNC_URL ||
      `${API_BASE_URL}/api/ipo/sync`;
    this.timeoutMs = config?.timeoutMs || 8000;
  }

  async getIPOs(options?: IPOFilterOptions): Promise<IPODataProviderResult> {
    // 1. Attempt live network refresh if online
    const syncRes = await this.refreshIPOs();

    // 2. Regardless of network success/error, serve from local SQLite cache for instant UI response
    const cachedRes = await this.localFallbackProvider.getIPOs(options);

    return {
      success: cachedRes.success,
      data: cachedRes.data,
      totalCount: cachedRes.totalCount,
      providerName: syncRes.success ? this.name : `${this.name} (Offline Cache Fallback)`,
      fetchedAt: new Date().toISOString(),
      error: syncRes.success ? undefined : syncRes.error,
    };
  }

  async getIPOById(id: string): Promise<SmartIPORecord | null> {
    return this.localFallbackProvider.getIPOById(id);
  }

  async refreshIPOs(): Promise<IPODataProviderResult> {
    const startTime = Date.now();
    try {
      const repo = new IPORepository(this.db);
      const since = await repo.getLastUpdatedTimestamp();

      const url = new URL(this.baseUrl);
      if (since) {
        url.searchParams.append('since', since);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };
      if (this.lastEtag) {
        headers['If-None-Match'] = this.lastEtag;
      }

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
      } catch (netErr: any) {
        clearTimeout(timeoutId);
        const errMsg = netErr.name === 'AbortError'
          ? `Timeout (${this.timeoutMs}ms) connecting to remote IPO server`
          : `Network error: ${netErr.message || 'fetch failed'}`;

        if (__DEV__) console.warn(`[RemoteSmartIPOProvider] ${errMsg}. Falling back to SQLite cache.`);

        return {
          success: false,
          data: [],
          totalCount: 0,
          providerName: this.name,
          fetchedAt: new Date().toISOString(),
          error: errMsg,
        };
      }

      clearTimeout(timeoutId);

      // Handle HTTP 304 Not Modified
      if (response.status === 304) {
        if (__DEV__) console.log('[RemoteSmartIPOProvider] HTTP 304 Not Modified. Cache is fresh.');
        return {
          success: true,
          data: [],
          totalCount: 0,
          providerName: this.name,
          fetchedAt: new Date().toISOString(),
        };
      }

      if (!response.ok) {
        const errMsg = `HTTP ${response.status} from ${this.baseUrl}`;
        if (__DEV__) console.warn(`[RemoteSmartIPOProvider] ${errMsg}`);
        return {
          success: false,
          data: [],
          totalCount: 0,
          providerName: this.name,
          fetchedAt: new Date().toISOString(),
          error: errMsg,
        };
      }

      const etagHeader = response.headers.get('ETag');
      if (etagHeader) {
        this.lastEtag = etagHeader;
      }

      let json: any;
      try {
        json = await response.json();
      } catch (jsonErr: any) {
        return {
          success: false,
          data: [],
          totalCount: 0,
          providerName: this.name,
          fetchedAt: new Date().toISOString(),
          error: `Invalid JSON payload: ${jsonErr.message}`,
        };
      }

      const rawRecords: any[] = Array.isArray(json) ? json : json.data || json.delta || json.ipos || [];
      const validation = validateSmartIPOPayload(rawRecords);

      if (validation.validRecords.length > 0) {
        await runWithTransaction(
          this.db,
          async () => {
            await repo.upsertBatch(validation.validRecords as any, true);
          },
          'RemoteSmartIPOProvider.cacheUpsert'
        );
      }

      if (__DEV__) {
        console.log(`[RemoteSmartIPOProvider] Synced ${validation.validRecords.length} records in ${Date.now() - startTime}ms`);
      }

      return {
        success: true,
        data: validation.validRecords,
        totalCount: validation.validRecords.length,
        providerName: this.name,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error('[RemoteSmartIPOProvider] Unexpected refresh error:', err);
      return {
        success: false,
        data: [],
        totalCount: 0,
        providerName: this.name,
        fetchedAt: new Date().toISOString(),
        error: err?.message || 'Remote sync failed',
      };
    }
  }
}
