import { IPOMasterRecord } from './types';
import { calculateNormalizedIPOStatus } from './statusNormalizer';

export class IPOParser {
  static parse(raw: Partial<IPOMasterRecord>): IPOMasterRecord {
    if (__DEV__ && (raw.company_name?.includes('Lalithaa') || raw.company_name?.includes('Horizon') || raw.ipo_name?.includes('Lalithaa') || raw.ipo_name?.includes('Horizon'))) {
      console.log('[IPOVault GMP TRACE] PARSER INPUT:', JSON.stringify(raw, null, 2));
    }
    const now = new Date().toISOString();
    const normalizedStatus = calculateNormalizedIPOStatus({
      status: raw.status,
      open_date: raw.open_date,
      close_date: raw.close_date,
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

      is_favorite: raw.is_favorite ?? 0,
      source_type: raw.source_type || 'SERVER',
      
      sync_version: raw.sync_version ?? 0,
      created_at: raw.created_at || now,
      updated_at: raw.updated_at || now,
      deleted_at: raw.deleted_at || null,
    };

    return record;
  }
}
