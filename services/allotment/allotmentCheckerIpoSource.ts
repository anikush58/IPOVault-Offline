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
 * - Closed
 * - Allotment Out
 * - Listed
 *
 * Excludes:
 * - Upcoming
 * - Open / Active / Live
 * - Draft / Archived / Any other status
 */
export function isBackendIpoAllotmentEligible(b: BackendIpo): boolean {
  if (!b || !b.id) return false;
  const rawStatus = (b.status || '').trim();
  const clean = rawStatus.toUpperCase().replace(/[\s-]+/g, '_');

  if (['DRAFT', 'ARCHIVED', 'DELETED', ''].includes(clean)) return false;

  // Ineligible statuses: UPCOMING, OPEN, CLOSED, ALLOTMENT_PENDING, LISTING_PENDING
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
    clean === 'ACTIVE'
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
