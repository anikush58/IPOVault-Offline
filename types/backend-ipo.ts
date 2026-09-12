export interface BackendIpoCompany {
  id?: string;
  displayName: string;
  legalName?: string;
  logoUrl?: string;
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
  lotSize?: number | null;
  issueSize?: number | null;
  freshIssueSize?: number | null;
  ofsSize?: number | null;
  issueShareCount?: number | null;
  freshIssueShareCount?: number | null;
  ofsShareCount?: number | null;
  openDate?: string | null;
  closeDate?: string | null;
  listingDate?: string | null;
  company?: BackendIpoCompany;
  companyName?: string;
  createdAt?: string;
  updatedAt?: string;
}
