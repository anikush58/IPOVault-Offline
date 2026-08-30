/**
 * Smart IPO Database — Unified Domain Types & Interfaces
 * Single source of truth for IPO metadata, timelines, GMP, subscription breakdown, and lifecycle stages.
 */

export type SmartIPOLifecycleStatus =
  | 'UPCOMING'
  | 'OPEN'
  | 'CLOSED'
  | 'ALLOTTED_PENDING'
  | 'ALLOTTED_AVAILABLE'
  | 'LISTING_UPCOMING'
  | 'LISTED'
  | 'UNKNOWN';

export type LifecycleConfidence = 'High' | 'Medium' | 'Low';
export type IPOExchange = 'NSE' | 'BSE' | 'NSE/BSE' | 'BSE SME' | 'NSE Emerge';
export type IPOIssueType = 'Mainboard' | 'SME';

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

export interface SmartIPORecord {
  // Core Identification
  id: string;
  company_name: string;
  ipo_name: string;
  symbol: string;
  exchange: IPOExchange | string;
  issue_type: IPOIssueType | string;

  // Financial & Issue Parameters
  price_band_min: number | null;
  price_band_max: number | null;
  lot_size: number | null;
  issue_size: number | null; // ₹ Cr
  fresh_issue_size?: number | null; // ₹ Cr
  ofs_size?: number | null; // ₹ Cr

  // Milestone Timelines (YYYY-MM-DD)
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  refund_date: string | null;
  demat_credit_date: string | null;
  listing_date: string | null;

  // Key Parties & Registrars
  registrar: string;
  lead_manager: string;
  registrar_website: string;
  allotment_link: string;

  // Lifecycle & Deterministic Status
  status: string; // Legacy string fallback
  lifecycle_status: SmartIPOLifecycleStatus;
  lifecycle_confidence: LifecycleConfidence;
  lifecycle_source: string;
  lifecycle_last_verified_at: string | null;

  // Live Market & GMP Data
  gmp_amount?: number | null;
  gmp_percent?: number | null;
  profit_per_lot?: number | null;
  gmp_updated_at?: string | null;

  // Subscription Breakdown (Times Subscribed)
  retail_sub: number | null;
  qib_sub: number | null;
  nii_sub: number | null;
  employee_sub: number | null;
  shareholder_sub: number | null;
  anchor_sub: number | null;
  total_sub: number | null;
  subscription_timestamp: string | null;

  // Listing Outcomes
  listing_price: number | null;
  listing_gain_percent: number | null;
  current_price: number | null;
  current_price_updated_at: string | null;

  // Branding & Documentation
  logo_url: string;
  sector: string;
  description: string;
  website: string;
  prospectus_url: string;

  // Intelligence & Score
  intelligence?: IPOIntelligenceRecord;
  score?: IPOScoreRecord;

  // System Flags
  is_favorite?: number;
  source_type?: 'SERVER' | 'LOCAL' | 'MOCK';
  sync_version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
