export type SourceConfidence = 'high' | 'medium' | 'low';

export interface FieldSourceMeta {
  value: any;
  source: string;
  confidence: SourceConfidence;
  updated_at: string;
}

export interface CanonicalIPORecord {
  // IDENTITY
  id: string;
  company_name: string;
  normalized_company_name: string;
  isin?: string | null;
  symbol?: string | null;
  issue_type: 'Mainboard' | 'SME';
  exchange: string;

  // DATES
  open_date?: string | null;
  close_date?: string | null;
  allotment_date?: string | null;
  refund_date?: string | null;
  demat_credit_date?: string | null;
  listing_date?: string | null;

  // PRICING
  price_band_min?: number | null;
  price_band_max?: number | null;
  lot_size?: number | null;
  minimum_investment?: number | null;
  issue_size?: number | null;

  // ISSUE STRUCTURE
  fresh_issue?: number | null;
  ofs?: number | null;
  total_issue_size?: number | null;

  // SUBSCRIPTION
  qib_sub?: number | null;
  nii_sub?: number | null;
  retail_sub?: number | null;
  employee_sub?: number | null;
  shareholder_sub?: number | null;
  total_sub?: number | null;
  subscription_last_updated?: string | null;

  // LISTING
  issue_price?: number | null;
  listing_price?: number | null;
  listing_gain_percent?: number | null;
  gmp_amount?: number | null;
  gmp_percent?: number | null;
  profit_per_lot?: number | null;
  gmp_updated_at?: string | null;

  // COMPANY & METADATA
  description?: string | null;
  sector?: string | null;
  industry?: string | null;
  website?: string | null;
  registrar?: string | null;
  lead_manager?: string | null;

  // FINANCIALS
  revenue?: number | null;
  pat?: number | null;
  assets?: number | null;
  net_worth?: number | null;
  borrowings?: number | null;

  // VALUATION
  pre_ipo_pe?: number | null;
  post_ipo_pe?: number | null;
  pb?: number | null;
  roe?: number | null;
  roce?: number | null;
  eps?: number | null;
  debt_equity?: number | null;

  // DOCUMENTS
  rhp_url?: string | null;
  drhp_url?: string | null;
  prospectus_url?: string | null;
  registrar_website?: string | null;

  // DATA QUALITY METRICS
  completeness_score?: number;
  confidence_score?: number;
  missing_critical_fields?: string[];
  stale_fields?: string[];

  // SOURCE METADATA
  primary_source: string;
  source_url?: string | null;
  source_updated_at: string;
  last_verified_at: string;
  data_confidence: SourceConfidence;
  field_source_map?: Record<string, FieldSourceMeta>;
  is_published?: number;
  status?: string;
}

export interface IPOSourceAdapter {
  sourceName: string;
  fetchIPOCandidates(): Promise<CanonicalIPORecord[]>;
}
