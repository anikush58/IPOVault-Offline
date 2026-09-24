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
      `${API_BASE_URL}/api/v1/ipos`;
    this.timeoutMs = config?.timeoutMs || 8000;
  }

  async fetchIPOs(since: string | null): Promise<FetchResult> {
    const startTime = Date.now();
    try {
      const url = new URL(this.baseUrl);
      if (!url.searchParams.has('limit')) {
        url.searchParams.append('limit', '100');
      }
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
    const companyDisplayName = raw.company?.displayName || raw.companyName || raw.company_name || raw.name || raw.symbol || '';

    const registrarName =
      raw.registrar ||
      raw.registrar_name ||
      raw.participants?.find((p: any) => p.role === 'REGISTRAR')?.name ||
      '';

    const leadMgr =
      raw.lead_manager ||
      raw.leadManager ||
      raw.participants?.find((p: any) => p.role === 'BRLM' || p.role === 'CO_BRLM')?.name ||
      '';

    const gmpAmt =
      raw.currentGmp?.gmpAmount != null
        ? Number(raw.currentGmp.gmpAmount)
        : raw.gmp_amount !== undefined
        ? raw.gmp_amount
        : raw.gmp !== undefined && raw.gmp !== null
        ? Number(raw.gmp)
        : null;

    const gmpPct =
      raw.currentGmp?.gmpPercentage != null
        ? Number(raw.currentGmp.gmpPercentage)
        : raw.gmp_percent ?? null;

    const profitPerLot =
      raw.currentGmp?.estProfitPerLot != null
        ? Number(raw.currentGmp.estProfitPerLot)
        : raw.profit_per_lot ?? null;

    const gmpUpdated = raw.currentGmp?.observedAt || raw.gmp_updated_at || null;

    let totalSub: number | null = null;
    let qibSub: number | null = null;
    let niiSub: number | null = null;
    let retailSub: number | null = null;

    if (raw.currentSubscription) {
      if (raw.currentSubscription.totalSubscriptionMultiple != null) {
        totalSub = Number(raw.currentSubscription.totalSubscriptionMultiple);
      }
      if (Array.isArray(raw.currentSubscription.categories)) {
        for (const cat of raw.currentSubscription.categories) {
          const mult = Number(cat.subscriptionMultiple);
          if (!isNaN(mult)) {
            if (cat.category === 'QIB') qibSub = mult;
            else if (cat.category === 'NII') niiSub = mult;
            else if (cat.category === 'RETAIL') retailSub = mult;
            else if ((cat.category === 'OTHER' || cat.category === 'TOTAL') && totalSub == null) totalSub = mult;
          }
        }
      }
    } else if (raw.subscriptionObservations && Array.isArray(raw.subscriptionObservations)) {
      for (const obs of raw.subscriptionObservations) {
        const mult = Number(obs.subscriptionMultiple);
        if (!isNaN(mult)) {
          if (obs.category === 'QIB') qibSub = mult;
          else if (obs.category === 'NII') niiSub = mult;
          else if (obs.category === 'RETAIL') retailSub = mult;
          else if ((obs.category === 'OTHER' || obs.category === 'TOTAL') && totalSub == null) totalSub = mult;
        }
      }
    }

    if (totalSub == null && (raw.total_sub != null || raw.total_subscription != null)) {
      totalSub = Number(raw.total_sub ?? raw.total_subscription);
    }

    return {
      id,
      company_name: String(companyDisplayName).trim(),
      ipo_name: String(companyDisplayName).trim(),
      symbol: String(raw.symbol || raw.ticker || '').trim(),
      exchange: String(raw.exchange || raw.board || 'NSE').trim(),
      issue_type: raw.marketSegment === 'SME' ? 'SME' : String(raw.issue_type || raw.issueType || raw.category || 'Mainboard').trim(),
      price_band_min: raw.priceBandLow ?? raw.price_band_min ?? raw.minPrice ?? raw.issuePriceInr ?? null,
      price_band_max: raw.priceBandHigh ?? raw.price_band_max ?? raw.maxPrice ?? raw.issuePriceInr ?? null,
      lot_size: raw.lotSize ?? raw.lot_size ?? null,
      issue_size: raw.issueSize ?? raw.issue_size_cr ?? raw.issue_size ?? null,
      open_date: raw.openDate || raw.open_date || raw.lifecycle?.openDate || null,
      close_date: raw.closeDate || raw.close_date || raw.lifecycle?.closeDate || null,
      allotment_date:
        raw.allotmentDate ||
        raw.allotment_date ||
        raw.lifecycle?.basisOfAllotmentDate ||
        raw.lifecycle?.allotmentDate ||
        raw.allotment?.expectedDate ||
        raw.allotment?.expectedAllotmentDate ||
        null,
      listing_date: raw.listingDate || raw.listing_date || raw.lifecycle?.listingDate || null,
      refund_date: raw.refundDate || raw.refund_date || raw.lifecycle?.refundInitiationDate || null,
      demat_credit_date: raw.dematCreditDate || raw.demat_credit_date || raw.lifecycle?.dematCreditDate || null,
      registrar: String(registrarName).trim(),
      lead_manager: String(leadMgr).trim(),
      status: String(raw.status || 'Upcoming').trim(),
      logo_url: String(raw.company?.logoUrl || raw.logoUrl || raw.logo_url || '').trim(),
      sector: String(raw.company?.sector || raw.sector || '').trim(),
      description: String(raw.company?.aboutDescription || raw.description || '').trim(),
      website: String(raw.company?.website || raw.company_website || raw.website || '').trim(),
      prospectus_url: String(raw.rhpUrl || raw.prospectusUrl || raw.prospectus_url || raw.rhp_url || '').trim(),
      gmp_amount: gmpAmt,
      gmp_percent: gmpPct,
      profit_per_lot: profitPerLot,
      gmp_updated_at: gmpUpdated,
      total_sub: totalSub,
      qib_sub: qibSub ?? (raw.qib_sub != null ? Number(raw.qib_sub) : null),
      nii_sub: niiSub ?? (raw.nii_sub != null ? Number(raw.nii_sub) : null),
      retail_sub: retailSub ?? (raw.retail_sub != null ? Number(raw.retail_sub) : null),
      sync_version: raw.sync_version ?? 1,
      updated_at: raw.updated_at || raw.updatedAt || now,
    };
  }
}
