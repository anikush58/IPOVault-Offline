import { BackendIpo } from '@/types/backend-ipo';
import { normalizeLifecycleStatus } from '@/services/ipo/statusNormalizer';

export interface AllotmentCheckerIpoItem {
  id: string; // Canonical Backend UUID
  symbol: string;
  company_name: string;
  ipo_name: string;
  status: string;
  registrar: string;
  allotment_date: string;
  issue_type: string;
  lot_size: number;
  buy_price: number;
  logo_url?: string;
}

/**
 * Filter predicate to determine if an IPO is eligible for allotment checking.
 * STRICT REQUIREMENT: Only IPOs whose status is one of:
 * - Allotment Out (ALLOTMENT_OUT, ALLOTMENT_COMPLETED, ALLOTMENT, ALLOTTED, ALLOTTED_AVAILABLE)
 * - Listed (LISTED)
 *
 * Excludes:
 * - Closed (where allotment is not out yet)
 * - Upcoming
 * - Open / Active / Live / Closing Today / Bidding
 * - Draft / Archived / Deleted / Withdrawn / Cancelled
 */
export function isBackendIpoAllotmentEligible(b: BackendIpo): boolean {
  if (!b || !b.id) return false;
  const rawStatus = (b.status || '').trim();
  const clean = rawStatus.toUpperCase().replace(/[\s-]+/g, '_');

  if (['DRAFT', 'ARCHIVED', 'DELETED', 'CANCELLED', 'WITHDRAWN', ''].includes(clean)) return false;

  // Ineligible statuses: CLOSED, ALLOTMENT_PENDING, LISTING_PENDING, OPEN, UPCOMING, LIVE, etc.
  if (
    clean === 'CLOSED' ||
    clean === 'ALLOTMENT_PENDING' ||
    clean === 'ALLOTTED_PENDING' ||
    clean === 'PENDING_ALLOTMENT' ||
    clean === 'LISTING_PENDING' ||
    clean === 'LISTING_UPCOMING' ||
    clean === 'OPEN' ||
    clean === 'CLOSING_TODAY' ||
    clean === 'UPCOMING' ||
    clean === 'LIVE' ||
    clean === 'ACTIVE' ||
    clean === 'BIDDING'
  ) {
    return false;
  }

  // Eligible statuses: ALLOTMENT OUT (including ALLOTMENT_COMPLETED, ALLOTTED) and LISTED
  const isAllotmentOut =
    clean === 'ALLOTMENT_COMPLETED' ||
    clean === 'ALLOTMENT_OUT' ||
    clean === 'ALLOTMENT' ||
    clean === 'ALLOTTED' ||
    clean === 'ALLOTTED_AVAILABLE';
  const isListed = clean === 'LISTED';

  if (isAllotmentOut || isListed) return true;

  const normalized = normalizeLifecycleStatus(rawStatus);
  return normalized === 'ALLOTTED_AVAILABLE' || normalized === 'LISTED';
}

/**
 * Normalizes a BackendIpo into the view model structure for the Allotment Checker screen.
 */
export function normalizeBackendIpoForChecker(b: BackendIpo): AllotmentCheckerIpoItem {
  const companyName = b.company?.displayName || b.companyName || b.symbol || 'IPO';
  const registrar =
    b.allotmentConfig?.registrar ||
    b.allotment?.registrar ||
    b.registrar ||
    b.participants?.find((p) => p.role === 'REGISTRAR')?.name ||
    '';
  const allotmentDate =
    b.allotmentDate ||
    b.lifecycle?.basisOfAllotmentDate ||
    b.allotmentConfig?.expectedDate ||
    b.allotment?.expectedDate ||
    b.closeDate ||
    'TBD';
  const issueType = b.marketSegment === 'SME' ? 'SME' : 'Mainboard';
  const lotSize = b.lotSize || 0;
  const buyPrice = b.priceBandHigh ?? b.issuePriceInr ?? b.priceBandLow ?? 0;
  const logoUrl =
    b.company?.logoUrl ||
    b.logoUrl ||
    (b as any).logo_url ||
    (b as any).companyLogo ||
    '';

  return {
    id: b.id,
    symbol: b.symbol || '',
    company_name: companyName,
    ipo_name: companyName,
    status: (b.status || '').toUpperCase(),
    registrar,
    allotment_date: allotmentDate,
    issue_type: issueType,
    lot_size: lotSize,
    buy_price: buyPrice,
    logo_url: logoUrl,
  };
}

/**
 * Extracts a numeric timestamp from candidate date fields for sorting allotment IPOs.
 * Checks allotment date fields first, then close date, then update/creation timestamps.
 */
export function parseAllotmentSortTimestamp(b: BackendIpo): number {
  if (!b) return 0;
  const dateCandidates = [
    b.allotmentDate,
    b.lifecycle?.basisOfAllotmentDate,
    b.allotmentConfig?.expectedDate,
    b.allotment?.expectedDate,
    b.closeDate,
    b.lifecycle?.closeDate,
    b.listingDate,
    b.lifecycle?.listingDate,
    b.updatedAt,
    b.createdAt,
  ];

  for (const d of dateCandidates) {
    if (d && typeof d === 'string') {
      const trimmed = d.trim();
      if (trimmed !== '' && trimmed.toUpperCase() !== 'TBD') {
        const parsed = Date.parse(trimmed);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  }
  return 0;
}

/**
 * Sorts backend IPOs so that newly allotment out IPOs appear at the top,
 * followed by recently closed IPOs, and older IPOs appear at the bottom.
 */
export function sortCheckerIposByAllotmentRecency(ipos: BackendIpo[]): BackendIpo[] {
  return [...ipos].sort((a, b) => {
    const timeA = parseAllotmentSortTimestamp(a);
    const timeB = parseAllotmentSortTimestamp(b);

    if (timeA !== timeB) {
      return timeB - timeA; // Descending: newest date first
    }

    // Secondary priority: Allotment Out status before Closed, and Closed before Listed
    const getStatusWeight = (status: string) => {
      const s = (status || '').toUpperCase();
      if (s.includes('ALLOT')) return 3;
      if (s.includes('CLOSED') || s.includes('PENDING')) return 2;
      if (s.includes('LISTED')) return 1;
      return 0;
    };

    const weightA = getStatusWeight(a.status || '');
    const weightB = getStatusWeight(b.status || '');
    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // Tertiary: alphabetical by company name / symbol
    const nameA = a.company?.displayName || a.companyName || a.symbol || '';
    const nameB = b.company?.displayName || b.companyName || b.symbol || '';
    return nameA.localeCompare(nameB);
  });
}
