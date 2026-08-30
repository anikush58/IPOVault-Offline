import { IPOProvider, IPOMasterRecord, FetchResult } from '../types';
import { API_BASE_URL } from '@/constants/apiConfig';

export interface LiveIPOProviderConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * LiveIPOProvider connects to the production FastAPI /v1/sync endpoint.
 * Supports version tracking, ETags, HTTP 304 handling, and tombstones.
 */
export class LiveIPOProvider implements IPOProvider {
  readonly name = 'live' as const;
  private baseUrl: string;
  private timeoutMs: number;
  private lastEtag: string | null = null;

  constructor(config?: LiveIPOProviderConfig) {
    this.baseUrl =
      config?.baseUrl ||
      process.env.EXPO_PUBLIC_IPO_SYNC_URL ||
      `${API_BASE_URL}/api/ipo/sync`;
    this.timeoutMs = config?.timeoutMs || 8000;
  }

  async fetchIPOs(since: string | null): Promise<FetchResult> {
    const startTime = Date.now();
    try {
      const url = new URL(this.baseUrl);
      // Pass since version parameter if available
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
        if (netErr.name === 'AbortError') {
          return {
            success: false,
            data: [],
            error: `Network timeout (${this.timeoutMs}ms) connecting to ${this.baseUrl}`,
            providerUsed: 'live',
          };
        }
        return {
          success: false,
          data: [],
          error: `Network/DNS unreachable: ${netErr.message || 'fetch failed'} (${this.baseUrl})`,
          providerUsed: 'live',
        };
      }

      clearTimeout(timeoutId);

      // Handle HTTP 304 Not Modified
      if (response.status === 304) {
        return {
          success: true,
          data: [],
          statusCode: 304,
          providerUsed: 'live',
        };
      }

      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `HTTP ${response.status} ${response.statusText || 'Error'} from ${this.baseUrl}`,
          statusCode: response.status,
          providerUsed: 'live',
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
          error: `Invalid JSON response received from ${this.baseUrl}: ${jsonErr.message}`,
          statusCode: response.status,
          providerUsed: 'live',
        };
      }

      // Extract delta array and tombstones from backend SyncDeltaResponse schema
      const rawRecords: any[] = Array.isArray(json) ? json : json.delta || json.data || json.ipos || [];
      const tombstones: string[] = json.tombstones || [];

      const normalized = rawRecords.map((item) => this.normalizeRecord(item));

      // Append soft-deleted tombstone records with deleted_at flag
      tombstones.forEach((tombId) => {
        normalized.push({
          id: tombId,
          deleted_at: new Date().toISOString(),
        });
      });

      return {
        success: true,
        data: normalized,
        statusCode: response.status,
        providerUsed: 'live',
      };
    } catch (error: any) {
      return {
        success: false,
        data: [],
        error: `Unexpected LiveIPOProvider error: ${error.message || error}`,
        providerUsed: 'live',
      };
    }
  }

  /**
   * Normalizes production FastAPI payload object into Partial<IPOMasterRecord> schema.
   */
  private normalizeRecord(raw: any): Partial<IPOMasterRecord> {
    const id = String(raw.id || raw.ipo_id || raw.symbol || `ipo-${Date.now()}`);
    const now = new Date().toISOString();

    return {
      id,
      company_name: String(raw.company_name || raw.companyName || raw.name || '').trim(),
      ipo_name: String(raw.ipo_name || raw.ipoName || raw.name || raw.company_name || '').trim(),
      symbol: String(raw.symbol || raw.ticker || '').trim(),
      exchange: String(raw.exchange || raw.board || 'NSE').trim(),
      issue_type: String(raw.issue_type || raw.issueType || raw.category || 'Mainboard').trim(),
      price_band_min: raw.price_band_min ?? raw.minPrice ?? null,
      price_band_max: raw.price_band_max ?? raw.maxPrice ?? null,
      lot_size: raw.lot_size ?? raw.lotSize ?? null,
      issue_size: raw.issue_size_cr ?? raw.issue_size ?? raw.issueSize ?? null,
      open_date: raw.open_date || raw.openDate || null,
      close_date: raw.close_date || raw.closeDate || null,
      allotment_date: raw.allotment_date || raw.allotmentDate || null,
      listing_date: raw.listing_date || raw.listingDate || null,
      refund_date: raw.refund_date || raw.refundDate || null,
      demat_credit_date: raw.demat_credit_date || raw.dematCreditDate || null,
      registrar: String(raw.registrar || raw.registrar_name || '').trim(),
      lead_manager: String(raw.lead_manager || raw.leadManager || '').trim(),
      status: String(raw.status || 'Upcoming').trim(),
      logo_url: String(raw.logo_url || raw.logoUrl || '').trim(),
      sector: String(raw.sector || '').trim(),
      description: String(raw.description || '').trim(),
      website: String(raw.website || raw.company_website || '').trim(),
      prospectus_url: String(raw.prospectus_url || raw.rhp_url || '').trim(),
      gmp_amount: raw.gmp_amount !== undefined ? (raw.gmp_amount ?? null) : ((raw.gmp !== undefined && raw.gmp !== null) ? Number(raw.gmp) : null),
      gmp_percent: raw.gmp_percent ?? null,
      profit_per_lot: raw.profit_per_lot ?? null,
      gmp_updated_at: raw.gmp_updated_at || null,
      sync_version: raw.sync_version ?? 1,
      updated_at: raw.updated_at || raw.updatedAt || now,
    };
  }
}
