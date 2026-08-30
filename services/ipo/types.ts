export interface CategoryScoreBreakdown {
  business_quality: number; // max 20
  financial_strength: number; // max 20
  industry_growth: number; // max 15
  valuation: number; // max 15
  management_promoters: number; // max 15
  issue_structure: number; // max 10
  risk_factors: number; // max 5
}

export interface IPOScoreRecord {
  total_score: number;
  recommendation: 'Strong Apply' | 'Apply' | 'Neutral' | 'Avoid';
  categories: CategoryScoreBreakdown;
  explanations?: Record<string, string>;
  is_manual_override?: boolean;
}

export interface FinancialYearData {
  year: string; // e.g. "FY23", "FY24", "FY25"
  revenue_cr: number;
  pat_cr: number;
  assets_cr?: number;
  net_worth_cr?: number;
}

export interface PeerComparisonData {
  company_name: string;
  pe_ratio: number | null;
  roe_percent: number | null;
  ronw_percent: number | null;
  eps: number | null;
}

export interface PromoterInfo {
  name: string;
  holding_pre_percent?: number;
  holding_post_percent?: number;
}

export interface IPOIntelligenceRecord {
  objects_of_issue?: string[];
  financials?: FinancialYearData[];
  peer_comparison?: PeerComparisonData[];
  strengths?: string[];
  risks?: string[];
  promoters?: PromoterInfo[];
  drhp_url?: string;
  rhp_url?: string;
  anchor_investors_url?: string;
}

export interface IPOMasterRecord {
  id: string;
  company_name: string;
  ipo_name: string;
  symbol: string;
  exchange: string;
  issue_type: string;
  price_band_min: number | null;
  price_band_max: number | null;
  lot_size: number | null;
  issue_size: number | null;
  listing_date: string | null;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  refund_date: string | null;
  demat_credit_date: string | null;
  registrar: string;
  lead_manager: string;
  status: string;
  logo_url: string;
  sector: string;
  description: string;
  website: string;
  prospectus_url: string;
  
  retail_sub: number | null;
  qib_sub: number | null;
  nii_sub: number | null;
  employee_sub: number | null;
  shareholder_sub: number | null;
  anchor_sub: number | null;
  total_sub: number | null;
  subscription_timestamp: string | null;
  
  registrar_website: string;
  allotment_link: string;
  
  listing_price: number | null;
  listing_gain_percent: number | null;
  current_price: number | null;
  current_price_updated_at: string | null;

  // Grey Market Premium (GMP) Market Data
  gmp_amount?: number | null;
  gmp_percent?: number | null;
  profit_per_lot?: number | null;
  gmp_updated_at?: string | null;
  
  // Intelligence & Score attributes
  intelligence?: IPOIntelligenceRecord;
  score?: IPOScoreRecord;
  
  // Lifecycle Metadata
  lifecycle_status?: string;
  lifecycle_confidence?: 'High' | 'Medium' | 'Low';
  lifecycle_source?: string;
  lifecycle_last_verified_at?: string;

  is_favorite?: number;
  source_type?: 'SERVER' | 'LOCAL';
  sync_version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FetchResult {
  success: boolean;
  data: Partial<IPOMasterRecord>[];
  error?: string;
  statusCode?: number;
  providerUsed: 'live' | 'mock' | 'demo';
}

export interface IPOProvider {
  readonly name: 'live' | 'mock' | 'demo';
  fetchIPOs(since: string | null): Promise<FetchResult>;
}

// ── IPO RADAR V5: HISTORICAL CALIBRATION & OUTCOME INTELLIGENCE FOUNDATION ──

export interface RadarDecisionSnapshot {
  ipo_id: string;
  evaluated_at: string;
  category: string;
  score: number;
  confidence: number;
  decision_readiness_score: number;
  evidence_upgrade_potential: number;
  reversal_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  primary_action: string;
  gmp_percent_at_decision: number | null;
  total_subscription_at_decision: number | null;
  quality_score_at_decision: number | null;
}

export interface IPOOutcomeRecord {
  ipo_id: string;
  company_name: string;
  issue_price: number;
  listing_date: string;
  listing_price: number | null;
  listing_gain_percent: number | null;
  day30_closing_price?: number | null;
  day30_gain_percent?: number | null;
  outcome_recorded_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RadarCategoryAccuracyMetric {
  category: string;
  total_evaluated: number;
  positive_listings: number;
  negative_listings: number;
  average_listing_gain_percent: number;
  accuracy_rate_percent: number;
}

export interface RadarOutcomeMetrics {
  total_tracked_ipos: number;
  category_accuracies: RadarCategoryAccuracyMetric[];
  high_gmp_reversal_occurrences: number; // Count of high GMP IPOs that listed at a loss
  calibrated_at: string;
}
