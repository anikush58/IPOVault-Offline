/**
 * Centralized IPO Data Normalization & Multi-Source Merging Utility
 */

export interface NormalizedIPODetails {
  companyName: string;
  cutoffPrice: number | null;
  lotSize: number | null;
  openDate: string;
  closeDate: string;
  allotmentDate: string;
  listingDate: string;
  registrar: string;
  exchange: string;
  issueType: 'Mainboard' | 'SME';
  fieldStatus: {
    companyName: boolean;
    cutoffPrice: boolean;
    lotSize: boolean;
    openDate: boolean;
    closeDate: boolean;
    allotmentDate: boolean;
    listingDate: boolean;
    registrar: boolean;
    exchange: boolean;
    issueType: boolean;
  };
}

/**
 * Normalizes a search query by removing common suffix/noise words, punctuation, and extra spaces.
 */
export function normalizeSearchTerm(term: string): string {
  if (!term) return '';
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\b(ltd|limited|ipo|pvt|private|inc|corp|corporation)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts normalized tokens from a search term for flexible fuzzy matching.
 */
export function getSearchTokens(term: string): string[] {
  const cleaned = normalizeSearchTerm(term);
  return cleaned.split(' ').filter((t) => t.length > 0);
}

/**
 * Helper to pick the first non-empty string from potential field variant names.
 */
function pickString(...values: any[]): string {
  for (const v of values) {
    if (v != null && typeof v === 'string' && v.trim().length > 0) {
      return v.trim();
    }
  }
  return '';
}

/**
 * Helper to pick the first valid positive number from potential field variant names.
 */
function pickNumber(...values: any[]): number | null {
  for (const v of values) {
    if (v != null) {
      const num = typeof v === 'number' ? v : parseFloat(String(v));
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }
  return null;
}

/**
 * Helper to extract Issue Type ('Mainboard' vs 'SME').
 */
function pickIssueType(...values: any[]): 'Mainboard' | 'SME' {
  for (const v of values) {
    if (v != null) {
      if (typeof v === 'boolean' && v === true) return 'SME';
      const str = String(v).toLowerCase();
      if (str.includes('sme')) return 'SME';
      if (str.includes('mainboard') || str.includes('main')) return 'Mainboard';
    }
  }
  return 'Mainboard';
}

/**
 * Merges raw objects from multiple sources (e.g. [local_ipo_master, local_ipo_listings, remote_api_res])
 * into a single normalized IPO object.
 */
export function mergeAndNormalizeIPOData(sources: any[]): NormalizedIPODetails {
  const validSources = sources.filter((s) => s != null && typeof s === 'object');

  const companyName = pickString(
    ...validSources.map((s) => s.company_name),
    ...validSources.map((s) => s.companyName),
    ...validSources.map((s) => s.ipo_name),
    ...validSources.map((s) => s.ipoName),
    ...validSources.map((s) => s.title),
    ...validSources.map((s) => s.company)
  );

  const cutoffPrice = pickNumber(
    ...validSources.map((s) => s.buy_price),
    ...validSources.map((s) => s.buyPrice),
    ...validSources.map((s) => s.price_band_max),
    ...validSources.map((s) => s.priceBandMax),
    ...validSources.map((s) => s.cutoff_price),
    ...validSources.map((s) => s.cutoffPrice),
    ...validSources.map((s) => s.issue_price),
    ...validSources.map((s) => s.issuePrice),
    ...validSources.map((s) => s.price)
  );

  const lotSize = pickNumber(
    ...validSources.map((s) => s.quantity),
    ...validSources.map((s) => s.qty),
    ...validSources.map((s) => s.lot_size),
    ...validSources.map((s) => s.lotSize),
    ...validSources.map((s) => s.shares_per_lot),
    ...validSources.map((s) => s.sharesPerLot)
  );

  const openDate = pickString(
    ...validSources.map((s) => s.open_date),
    ...validSources.map((s) => s.openDate),
    ...validSources.map((s) => s.opening_date),
    ...validSources.map((s) => s.openingDate)
  );

  const closeDate = pickString(
    ...validSources.map((s) => s.close_date),
    ...validSources.map((s) => s.closeDate),
    ...validSources.map((s) => s.closing_date),
    ...validSources.map((s) => s.closingDate)
  );

  const allotmentDate = pickString(
    ...validSources.map((s) => s.allotment_date),
    ...validSources.map((s) => s.allotmentDate),
    ...validSources.map((s) => s.basis_of_allotment_date),
    ...validSources.map((s) => s.basisOfAllotmentDate),
    ...validSources.map((s) => s.allotment_finalization_date),
    ...validSources.map((s) => s.allotment)
  );

  const listingDate = pickString(
    ...validSources.map((s) => s.listing_date),
    ...validSources.map((s) => s.listingDate),
    ...validSources.map((s) => s.tentative_listing_date),
    ...validSources.map((s) => s.listing)
  );

  const registrar = pickString(
    ...validSources.map((s) => s.registrar),
    ...validSources.map((s) => s.registrar_name),
    ...validSources.map((s) => s.registrarName),
    ...validSources.map((s) => s.registrar_details),
    ...validSources.map((s) => s.registrarDetails)
  );

  const exchange = pickString(
    ...validSources.map((s) => s.exchange),
    ...validSources.map((s) => s.exchange_name),
    ...validSources.map((s) => s.exchanges),
    ...validSources.map((s) => s.listing_exchange)
  );

  const issueType = pickIssueType(
    ...validSources.map((s) => s.issue_type),
    ...validSources.map((s) => s.issueType),
    ...validSources.map((s) => s.board_type),
    ...validSources.map((s) => s.boardType),
    ...validSources.map((s) => s.category),
    ...validSources.map((s) => s.segment),
    ...validSources.map((s) => s.sme_flag),
    ...validSources.map((s) => s.is_sme)
  );

  const fieldStatus = {
    companyName: companyName.length > 0,
    cutoffPrice: cutoffPrice != null && cutoffPrice > 0,
    lotSize: lotSize != null && lotSize > 0,
    openDate: openDate.length > 0,
    closeDate: closeDate.length > 0,
    allotmentDate: allotmentDate.length > 0,
    listingDate: listingDate.length > 0,
    registrar: registrar.length > 0,
    exchange: exchange.length > 0,
    issueType: true,
  };

  return {
    companyName,
    cutoffPrice,
    lotSize,
    openDate,
    closeDate,
    allotmentDate,
    listingDate,
    registrar,
    exchange,
    issueType,
    fieldStatus,
  };
}

/**
 * Prints a development-only audit summary of auto-filled IPO fields.
 */
export function logAutoFillAuditSummary(normalized: NormalizedIPODetails): void {
  if (!__DEV__) return;

  const logField = (label: string, value: any, isPresent: boolean) => {
    if (isPresent) {
      console.log(`  ✓ ${label}: ${value}`);
    } else {
      console.log(`  ❌ ${label}: Missing (not available in source)`);
    }
  };

  console.log('─────────────── [IPO Auto-Fill Audit] ───────────────');
  logField('Company Name', normalized.companyName, normalized.fieldStatus.companyName);
  logField('Cut-off Price', normalized.cutoffPrice ? `₹${normalized.cutoffPrice}` : '', normalized.fieldStatus.cutoffPrice);
  logField('Lot Size', normalized.lotSize ? `${normalized.lotSize} Qty` : '', normalized.fieldStatus.lotSize);
  logField('Open Date', normalized.openDate, normalized.fieldStatus.openDate);
  logField('Close Date', normalized.closeDate, normalized.fieldStatus.closeDate);
  logField('Allotment Date', normalized.allotmentDate, normalized.fieldStatus.allotmentDate);
  logField('Listing Date', normalized.listingDate, normalized.fieldStatus.listingDate);
  logField('Registrar', normalized.registrar, normalized.fieldStatus.registrar);
  logField('Exchange', normalized.exchange, normalized.fieldStatus.exchange);
  logField('Issue Type', normalized.issueType, normalized.fieldStatus.issueType);
  console.log('──────────────────────────────────────────────────────');
}
