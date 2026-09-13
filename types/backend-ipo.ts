export interface BackendCompanyFinancial {
  id?: string;
  fiscalPeriod: string;
  periodType?: string;
  totalAssets?: string | number | null;
  totalRevenue?: string | number | null;
  pat?: string | number | null;
  ebitda?: string | number | null;
  netWorth?: string | number | null;
  roePercentage?: string | number | null;
  rocePercentage?: string | number | null;
  eps?: string | number | null;
  patMarginPercent?: string | number | null;
}

export interface BackendIpoCompany {
  id?: string;
  displayName: string;
  legalName?: string;
  logoUrl?: string;
  website?: string | null;
  industry?: string | null;
  sector?: string | null;
  aboutDescription?: string | null;
  phone?: string | null;
  email?: string | null;
  contactPerson?: string | null;
  financials?: BackendCompanyFinancial[];
}

export interface BackendIpoLifecycle {
  openDate?: string | null;
  closeDate?: string | null;
  listingDate?: string | null;
  drhpDate?: string | null;
  rhpDate?: string | null;
  anchorDate?: string | null;
  basisOfAllotmentDate?: string | null;
  refundInitiationDate?: string | null;
  dematCreditDate?: string | null;
}

export interface BackendOfferCategory {
  id?: string;
  category: string;
  allocationPct?: string | number | null;
  minLots?: number | null;
  maxLots?: number | null;
  minShares?: number | null;
  maxShares?: number | null;
  minAmount?: string | number | null;
  maxAmount?: string | number | null;
  isUpiEligible?: boolean;
}

export interface BackendParticipant {
  id?: string;
  role: 'REGISTRAR' | 'BRLM' | 'CO_BRLM' | 'SYNDICATE_MEMBER';
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  displayOrder?: number;
}

export interface BackendDocument {
  id?: string;
  documentType: 'DRHP' | 'RHP' | 'PROSPECTUS' | 'OTHER';
  title?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  documentUrl?: string | null;
  sourceUrl?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
}

export interface BackendAllotment {
  registrar?: string | null;
  registrarIpoCode?: string | null;
  sourceUrl?: string | null;
  allotmentSourceUrl?: string | null;
  expectedDate?: string | null;
  expectedAllotmentDate?: string | null;
  enabled?: boolean;
}

export interface BackendGmp {
  gmpAmount: string | number;
  gmpPercentage?: string | number | null;
  estProfitPerLot?: string | number | null;
  observedAt?: string | null;
}

export interface BackendSubscriptionCategory {
  category: string;
  subscriptionMultiple: string | number;
}

export interface BackendSubscription {
  totalSubscriptionMultiple?: string | number | null;
  categories?: BackendSubscriptionCategory[];
  observedAt?: string | null;
}

export interface BackendIpo {
  id: string;
  symbol: string;
  status: string;
  marketSegment: 'MAINBOARD' | 'SME';
  exchange?: 'NSE' | 'BSE' | 'BOTH';
  issuePriceInr?: number | null;
  priceBandLow?: number | null;
  priceBandHigh?: number | null;
  faceValue?: number | string | null;
  lotSize?: number | null;
  issueSize?: number | null;
  freshIssueSize?: number | null;
  ofsSize?: number | null;
  issueShareCount?: number | null;
  freshIssueShareCount?: number | null;
  ofsShareCount?: number | null;
  openDate?: string | null;
  closeDate?: string | null;
  allotmentDate?: string | null;
  listingDate?: string | null;
  lifecycle?: BackendIpoLifecycle;
  company?: BackendIpoCompany;
  companyName?: string;
  offerCategories?: BackendOfferCategory[];
  participants?: BackendParticipant[];
  documents?: BackendDocument[];
  allotment?: BackendAllotment | null;
  currentGmp?: BackendGmp | null;
  currentSubscription?: BackendSubscription | null;
  createdAt?: string;
  updatedAt?: string;
}
