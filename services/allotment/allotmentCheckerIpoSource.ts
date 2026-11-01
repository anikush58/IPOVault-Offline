import { resolveIpoLotSize } from '../../utils/ipoCategoryUtils';
import { getResolvedLogoUrl } from '../../utils/formatters';
import { BackendIpo } from '../../types/backend-ipo';
import { normalizeLifecycleStatus } from '../ipo/statusNormalizer';

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
  const lotSize = resolveIpoLotSize(b);
  const buyPrice = b.priceBandHigh ?? b.issuePriceInr ?? b.priceBandLow ?? 0;
  const rawLogo =
    b.company?.logoUrl ||
    b.logoUrl ||
    (b as any).logo_url ||
    (b as any).companyLogo ||
    '';
  const logoUrl = getResolvedLogoUrl(rawLogo) || rawLogo;

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

/**
 * Extracts the latest activity date timestamp from candidate offering date fields.
 * Considers listingDate, allotmentDate, and closeDate.
 */
export function getLatestIpoActivityTimestamp(b: BackendIpo): number {
  if (!b) return 0;
  const candidateDates = [
    b.listingDate,
    b.lifecycle?.listingDate,
    b.allotmentDate,
    b.lifecycle?.basisOfAllotmentDate,
    b.allotmentConfig?.expectedDate,
    b.allotment?.expectedDate,
    b.closeDate,
    b.lifecycle?.closeDate,
  ];

  let maxTs = 0;
  let foundOfferingDate = false;

  for (const d of candidateDates) {
    if (d && typeof d === 'string') {
      const trimmed = d.trim();
      if (trimmed !== '' && trimmed.toUpperCase() !== 'TBD') {
        const parsed = Date.parse(trimmed);
        if (!isNaN(parsed) && parsed > 0) {
          foundOfferingDate = true;
          if (parsed > maxTs) {
            maxTs = parsed;
          }
        }
      }
    }
  }

  if (foundOfferingDate) {
    return maxTs;
  }

  // Fallback to update/created dates if no offering dates were provided
  for (const d of [b.updatedAt, b.createdAt]) {
    if (d && typeof d === 'string') {
      const parsed = Date.parse(d.trim());
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return 0;
}

/**
 * Checks whether an IPO has activity within the last 30 days (or in the future).
 * IPOs older than 30 days return false.
 */
export function isIpoWithin30Days(b: BackendIpo, now = Date.now()): boolean {
  if (!b) return false;
  const ts = getLatestIpoActivityTimestamp(b);
  if (ts <= 0) return true; // Keep if no valid date found so we do not aggressively hide active IPOs
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return ts >= (now - thirtyDaysMs);
}
