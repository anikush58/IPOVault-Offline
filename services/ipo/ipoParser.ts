import { IPOMasterRecord } from './types';
import { calculateNormalizedIPOStatus } from './statusNormalizer';

export class IPOParser {
  static parse(raw: Partial<IPOMasterRecord>): IPOMasterRecord {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && (raw.company_name?.includes('Lalithaa') || raw.company_name?.includes('Horizon') || raw.ipo_name?.includes('Lalithaa') || raw.ipo_name?.includes('Horizon'))) {
      console.log('[IPOVault GMP TRACE] PARSER INPUT:', JSON.stringify(raw, null, 2));
    }
    const now = new Date().toISOString();
    const normalizedStatus = calculateNormalizedIPOStatus({
      status: raw.status,
      open_date: raw.open_date,
      close_date: raw.close_date,
      allotment_date: raw.allotment_date,
      listing_date: raw.listing_date,
    });

    const record: IPOMasterRecord = {
      id: raw.id || crypto.randomUUID(),
      company_name: raw.company_name || '',
      ipo_name: raw.ipo_name || '',
      symbol: raw.symbol || '',
      exchange: raw.exchange || '',
      issue_type: raw.issue_type || '',
      price_band_min: raw.price_band_min ?? null,
      price_band_max: raw.price_band_max ?? null,
      lot_size: raw.lot_size ?? null,
      issue_size: raw.issue_size ?? null,
      listing_date: raw.listing_date || null,
      open_date: raw.open_date || null,
      close_date: raw.close_date || null,
      allotment_date: raw.allotment_date || null,
      refund_date: raw.refund_date || null,
      demat_credit_date: raw.demat_credit_date || null,
      registrar: raw.registrar || '',
      lead_manager: raw.lead_manager || '',
      status: normalizedStatus,
      logo_url: raw.logo_url || '',
      sector: raw.sector || '',
      description: raw.description || '',
      website: raw.website || '',
      prospectus_url: raw.prospectus_url || '',
      
      retail_sub: raw.retail_sub ?? null,
      qib_sub: raw.qib_sub ?? null,
      nii_sub: raw.nii_sub ?? null,
      employee_sub: raw.employee_sub ?? null,
      shareholder_sub: raw.shareholder_sub ?? null,
      anchor_sub: raw.anchor_sub ?? null,
      total_sub: raw.total_sub ?? null,
      subscription_timestamp: raw.subscription_timestamp || null,
      
      registrar_website: raw.registrar_website || '',
      allotment_link: raw.allotment_link || '',
      
      listing_price: raw.listing_price ?? null,
      listing_gain_percent: raw.listing_gain_percent ?? null,
      current_price: raw.current_price ?? null,
      current_price_updated_at: raw.current_price_updated_at || null,
      
      gmp_amount: raw.gmp_amount !== undefined ? (raw.gmp_amount ?? null) : ((raw as any).gmp !== undefined && (raw as any).gmp !== null ? Number((raw as any).gmp) : null),
      gmp_percent: raw.gmp_percent ?? null,
      profit_per_lot: raw.profit_per_lot ?? null,
      gmp_updated_at: raw.gmp_updated_at || null,

      pre_ipo_eps: raw.pre_ipo_eps !== undefined ? raw.pre_ipo_eps : (raw as any).preIpoEps !== undefined && (raw as any).preIpoEps !== null ? Number((raw as any).preIpoEps) : null,
      post_ipo_eps: raw.post_ipo_eps !== undefined ? raw.post_ipo_eps : (raw as any).postIpoEps !== undefined && (raw as any).postIpoEps !== null ? Number((raw as any).postIpoEps) : null,
      pre_ipo_pe: raw.pre_ipo_pe !== undefined ? raw.pre_ipo_pe : (raw as any).preIpoPe !== undefined && (raw as any).preIpoPe !== null ? Number((raw as any).preIpoPe) : null,
      post_ipo_pe: raw.post_ipo_pe !== undefined ? raw.post_ipo_pe : (raw as any).postIpoPe !== undefined && (raw as any).postIpoPe !== null ? Number((raw as any).postIpoPe) : null,
      pre_ipo_promoter_holding: raw.pre_ipo_promoter_holding !== undefined ? raw.pre_ipo_promoter_holding : (raw as any).preIpoPromoterHolding !== undefined && (raw as any).preIpoPromoterHolding !== null ? Number((raw as any).preIpoPromoterHolding) : null,
      post_ipo_promoter_holding: raw.post_ipo_promoter_holding !== undefined ? raw.post_ipo_promoter_holding : (raw as any).postIpoPromoterHolding !== undefined && (raw as any).postIpoPromoterHolding !== null ? Number((raw as any).postIpoPromoterHolding) : null,
      pre_ipo_market_cap: raw.pre_ipo_market_cap !== undefined ? raw.pre_ipo_market_cap : (raw as any).preIpoMarketCap !== undefined && (raw as any).preIpoMarketCap !== null ? Number((raw as any).preIpoMarketCap) : null,
      post_ipo_market_cap: raw.post_ipo_market_cap !== undefined ? raw.post_ipo_market_cap : (raw as any).postIpoMarketCap !== undefined && (raw as any).postIpoMarketCap !== null ? Number((raw as any).postIpoMarketCap) : null,
      market_cap: raw.market_cap !== undefined ? raw.market_cap : (raw as any).marketCap !== undefined && (raw as any).marketCap !== null ? Number((raw as any).marketCap) : null,

      fresh_issue_size: raw.fresh_issue_size !== undefined ? raw.fresh_issue_size : (raw as any).freshIssueSize !== undefined && (raw as any).freshIssueSize !== null ? Number((raw as any).freshIssueSize) : null,
      ofs_size: raw.ofs_size !== undefined ? raw.ofs_size : (raw as any).ofsSize !== undefined && (raw as any).ofsSize !== null ? Number((raw as any).ofsSize) : null,

      drhp_url: raw.drhp_url || (raw as any).drhpUrl || '',
      rhp_url: raw.rhp_url || (raw as any).rhpUrl || '',
      anchor_list_url: raw.anchor_list_url || (raw as any).anchorListUrl || '',

      company_phone: raw.company_phone || (raw as any).companyPhone || (raw as any).company?.phone || '',
      company_email: raw.company_email || (raw as any).companyEmail || (raw as any).company?.email || '',
      registrar_phone: raw.registrar_phone || (raw as any).registrarPhone || '',
      registrar_email: raw.registrar_email || (raw as any).registrarEmail || '',

      financials_json: raw.financials_json || null,
      participants_json: raw.participants_json || null,
      documents_json: raw.documents_json || null,
      intelligence_json: raw.intelligence_json || null,
      anchor_details_json: raw.anchor_details_json || null,

      company: raw.company || null,
      participants: raw.participants || null,
      documents: raw.documents || null,
      financials: raw.financials || null,
      risks: raw.risks || null,
      strengths: raw.strengths || null,
      objectsOfIssue: raw.objectsOfIssue || null,

      is_favorite: raw.is_favorite ?? 0,
      source_type: raw.source_type || 'SERVER',
      
      lifecycle_status: raw.lifecycle_status || normalizedStatus,
      lifecycle_confidence: raw.lifecycle_confidence || undefined,
      lifecycle_source: raw.lifecycle_source || undefined,
      lifecycle_last_verified_at: raw.lifecycle_last_verified_at || undefined,

      sync_version: raw.sync_version ?? 0,
      created_at: raw.created_at || now,
      updated_at: raw.updated_at || now,
      deleted_at: raw.deleted_at || null,
    };

    return record;
  }
}
