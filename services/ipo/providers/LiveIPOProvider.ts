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

      // If multiple pages exist in metadata, fetch remaining pages to retrieve complete IPO list
      const totalPages = json?.meta?.totalPages;
      if (typeof totalPages === 'number' && totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          const pageUrl = new URL(url.toString());
          pageUrl.searchParams.set('page', String(p));
          pagePromises.push(
            fetch(pageUrl.toString(), {
              method: 'GET',
              headers,
              signal: controller.signal,
            })
              .then(async (r) => (r.ok ? r.json() : null))
              .catch(() => null)
          );
        }
        const extraPages = await Promise.all(pagePromises);
        for (const extraJson of extraPages) {
          if (extraJson) {
            const extraRecords = Array.isArray(extraJson)
              ? extraJson
              : extraJson.delta || extraJson.data || extraJson.ipos || [];
            rawRecords.push(...extraRecords);
            if (Array.isArray(extraJson.tombstones)) {
              tombstones.push(...extraJson.tombstones);
            }
          }
        }
      }

      // Prevent duplicate IPOs when combining pages
      const seen = new Set<string>();
      const dedupedRecords: any[] = [];
      for (const rec of rawRecords) {
        const key = rec?.id || rec?.symbol;
        if (key && !seen.has(key)) {
          seen.add(key);
          dedupedRecords.push(rec);
        } else if (!key) {
          dedupedRecords.push(rec);
        }
      }

      const normalized = dedupedRecords.map((item) => this.normalizeRecord(item));

      // Append soft-deleted tombstone records with deleted_at flag
      tombstones.forEach((tombId) => {
        if (!seen.has(tombId)) {
          seen.add(tombId);
          normalized.push({
            id: tombId,
            deleted_at: new Date().toISOString(),
          });
        }
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

    const regPart = Array.isArray(raw.participants)
      ? raw.participants.find((p: any) => p.role === 'REGISTRAR')
      : null;

    const registrarName =
      raw.allotment?.registrar ||
      raw.allotmentConfig?.registrar ||
      raw.registrar ||
      raw.registrar_name ||
      regPart?.name ||
      '';

    const registrarPhone =
      raw.registrar_phone ||
      regPart?.phone ||
      raw.company?.registrar?.phone ||
      '';

    const registrarEmail =
      raw.registrar_email ||
      regPart?.email ||
      raw.company?.registrar?.email ||
      '';

    const registrarWebsite =
      raw.registrar_website ||
      raw.registrar_url ||
      regPart?.website ||
      raw.company?.registrar?.websiteUrl ||
      '';

    const brlmNames = Array.isArray(raw.participants)
      ? raw.participants.filter((p: any) => p.role === 'BRLM' || p.role === 'CO_BRLM').map((p: any) => p.name?.trim()).filter(Boolean)
      : [];

    const leadMgr =
      brlmNames.length > 0
        ? brlmNames.join(', ')
        : raw.lead_manager || raw.leadManager || '';

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

    const preIpoEps = raw.preIpoEps !== undefined && raw.preIpoEps !== null ? Number(raw.preIpoEps) : (raw.pre_ipo_eps ?? null);
    const postIpoEps = raw.postIpoEps !== undefined && raw.postIpoEps !== null ? Number(raw.postIpoEps) : (raw.post_ipo_eps ?? null);
    const preIpoPe = raw.preIpoPe !== undefined && raw.preIpoPe !== null ? Number(raw.preIpoPe) : (raw.pre_ipo_pe ?? null);
    const postIpoPe = raw.postIpoPe !== undefined && raw.postIpoPe !== null ? Number(raw.postIpoPe) : (raw.post_ipo_pe ?? null);
    const preIpoPromoter = raw.preIpoPromoterHolding !== undefined && raw.preIpoPromoterHolding !== null ? Number(raw.preIpoPromoterHolding) : (raw.pre_ipo_promoter_holding ?? raw.company?.promoterHoldingPre ?? null);
    const postIpoPromoter = raw.postIpoPromoterHolding !== undefined && raw.postIpoPromoterHolding !== null ? Number(raw.postIpoPromoterHolding) : (raw.post_ipo_promoter_holding ?? raw.company?.promoterHoldingPost ?? null);
    const preIpoMcap = raw.preIpoMarketCap !== undefined && raw.preIpoMarketCap !== null ? Number(raw.preIpoMarketCap) : (raw.pre_ipo_market_cap ?? null);
    const postIpoMcap = raw.postIpoMarketCap !== undefined && raw.postIpoMarketCap !== null ? Number(raw.postIpoMarketCap) : (raw.post_ipo_market_cap ?? null);
    const mcap = raw.marketCap !== undefined && raw.marketCap !== null ? Number(raw.marketCap) : (raw.market_cap ?? (postIpoMcap ?? preIpoMcap));

    const freshIssue = raw.freshIssueSize !== undefined && raw.freshIssueSize !== null ? Number(raw.freshIssueSize) : (raw.fresh_issue_size ?? null);
    const ofs = raw.ofsSize !== undefined && raw.ofsSize !== null ? Number(raw.ofsSize) : (raw.ofs_size ?? null);

    const drhpUrl = String(raw.drhpUrl || raw.drhp_url || raw.documents?.find((d: any) => d.documentType === 'DRHP')?.sourceUrl || '').trim();
    const rhpUrl = String(raw.rhpUrl || raw.rhp_url || raw.documents?.find((d: any) => d.documentType === 'RHP')?.sourceUrl || '').trim();
    const anchorListUrl = String(raw.anchorListUrl || raw.anchor_list_url || raw.anchorDetails?.documentUrl || raw.documents?.find((d: any) => d.documentType === 'ANCHOR_LIST')?.sourceUrl || '').trim();
    const prospectusUrl = String(raw.prospectusUrl || raw.prospectus_url || raw.rhpUrl || raw.rhp_url || raw.documents?.find((d: any) => d.documentType === 'PROSPECTUS')?.sourceUrl || '').trim();

    const companyPhone = String(raw.company?.phone || raw.company_phone || '').trim();
    const companyEmail = String(raw.company?.email || raw.company_email || '').trim();

    const rawFinancials = Array.isArray(raw.company?.financials)
      ? raw.company.financials
      : Array.isArray(raw.financials)
      ? raw.financials
      : Array.isArray(raw.intelligence?.financials)
      ? raw.intelligence.financials
      : null;
    const financialsJson = rawFinancials && rawFinancials.length > 0 ? JSON.stringify(rawFinancials) : null;

    const rawParticipants = Array.isArray(raw.participants) && raw.participants.length > 0 ? raw.participants : null;
    const participantsJson = rawParticipants ? JSON.stringify(rawParticipants) : null;

    const rawDocuments = Array.isArray(raw.documents) && raw.documents.length > 0 ? raw.documents : null;
    const documentsJson = rawDocuments ? JSON.stringify(rawDocuments) : null;

    const rawIntelligence = raw.intelligence || (raw.strengths || raw.risks || raw.objectsOfIssue ? {
      strengths: raw.strengths || [],
      risks: raw.risks || [],
      objects_of_issue: raw.objectsOfIssue || [],
    } : null);
    const intelligenceJson = rawIntelligence ? JSON.stringify(rawIntelligence) : null;

    const rawAnchor = raw.anchorDetails || raw.anchor_details || null;
    const anchorDetailsJson = rawAnchor ? JSON.stringify(rawAnchor) : null;

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
      prospectus_url: prospectusUrl,
      drhp_url: drhpUrl,
      rhp_url: rhpUrl,
      anchor_list_url: anchorListUrl,
      company_phone: companyPhone,
      company_email: companyEmail,
      registrar_phone: String(registrarPhone).trim(),
      registrar_email: String(registrarEmail).trim(),
      registrar_website: String(registrarWebsite).trim(),
      allotment_link: String(raw.allotment_link || raw.allotment?.sourceUrl || raw.allotment?.allotmentSourceUrl || '').trim(),
      gmp_amount: gmpAmt,
      gmp_percent: gmpPct,
      profit_per_lot: profitPerLot,
      gmp_updated_at: gmpUpdated,
      total_sub: totalSub,
      qib_sub: qibSub ?? (raw.qib_sub != null ? Number(raw.qib_sub) : null),
      nii_sub: niiSub ?? (raw.nii_sub != null ? Number(raw.nii_sub) : null),
      retail_sub: retailSub ?? (raw.retail_sub != null ? Number(raw.retail_sub) : null),
      pre_ipo_eps: preIpoEps != null ? Number(preIpoEps) : null,
      post_ipo_eps: postIpoEps != null ? Number(postIpoEps) : null,
      pre_ipo_pe: preIpoPe != null ? Number(preIpoPe) : null,
      post_ipo_pe: postIpoPe != null ? Number(postIpoPe) : null,
      pre_ipo_promoter_holding: preIpoPromoter != null ? Number(preIpoPromoter) : null,
      post_ipo_promoter_holding: postIpoPromoter != null ? Number(postIpoPromoter) : null,
      pre_ipo_market_cap: preIpoMcap != null ? Number(preIpoMcap) : null,
      post_ipo_market_cap: postIpoMcap != null ? Number(postIpoMcap) : null,
      market_cap: mcap != null ? Number(mcap) : null,
      fresh_issue_size: freshIssue != null ? Number(freshIssue) : null,
      ofs_size: ofs != null ? Number(ofs) : null,
      financials_json: financialsJson,
      participants_json: participantsJson,
      documents_json: documentsJson,
      intelligence_json: intelligenceJson,
      anchor_details_json: anchorDetailsJson,
      company: raw.company || {
        displayName: companyDisplayName,
        aboutDescription: raw.description,
        sector: raw.sector,
        website: raw.website,
        phone: companyPhone,
        email: companyEmail,
        financials: rawFinancials,
      },
      participants: rawParticipants,
      documents: rawDocuments,
      financials: rawFinancials,
      risks: raw.risks || (rawIntelligence?.risks ?? null),
      strengths: raw.strengths || (rawIntelligence?.strengths ?? null),
      objectsOfIssue: raw.objectsOfIssue || (rawIntelligence?.objects_of_issue ?? null),
      sync_version: raw.sync_version ?? 1,
      updated_at: raw.updated_at || raw.updatedAt || now,
    };
  }
}
