import { SmartIPOLifecycleStatus } from '@/lib/smartIpo/types/smartIpo';

export type NormalizedIPOStatus =
  | 'UPCOMING'
  | 'OPEN'
  | 'CLOSED'
  | 'ALLOTTED_PENDING'
  | 'ALLOTTED_AVAILABLE'
  | 'LISTING_UPCOMING'
  | 'LISTED'
  | 'UNKNOWN';

export type LifecycleConfidence = 'High' | 'Medium' | 'Low';
export type DataFreshnessStatus = 'Fresh' | 'Aging' | 'Stale' | 'Unknown';

export interface FreshnessResult {
  status: DataFreshnessStatus;
  displayText: string;
  diffHours: number | null;
}

export interface LifecycleEvaluation {
  lifecycle_status: NormalizedIPOStatus;
  lifecycle_confidence: LifecycleConfidence;
  lifecycle_source: string;
  lifecycle_last_verified_at: string;
}

export function calculateDataFreshness(timestampStr: string | null | undefined): FreshnessResult {
  if (!timestampStr) {
    return { status: 'Stale', displayText: 'Stale data', diffHours: null };
  }

  const d = new Date(timestampStr);
  if (isNaN(d.getTime())) {
    return { status: 'Stale', displayText: 'Stale data', diffHours: null };
  }

  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) {
    return { status: 'Fresh', displayText: 'Updated just now', diffHours: 0 };
  }
  if (diffMins < 60) {
    return { status: 'Fresh', displayText: `${diffMins}m ago`, diffHours: 0 };
  }
  if (diffHours < 24) {
    return { status: 'Fresh', displayText: `${diffHours}h ago`, diffHours };
  }
  if (diffHours < 48) {
    return { status: 'Aging', displayText: `1d ago`, diffHours };
  }
  const days = Math.floor(diffHours / 24);
  return { status: 'Stale', displayText: `Stale data (${days}d ago)`, diffHours };
}

function isValidDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const clean = dateStr.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) && !isNaN(Date.parse(clean));
}

export function evaluateLifecycle(
  record: {
    status?: string | null;
    open_date?: string | null;
    close_date?: string | null;
    allotment_date?: string | null;
    listing_date?: string | null;
  } | null | undefined,
  currentDateOverride?: string
): LifecycleEvaluation {
  const nowIso = new Date().toISOString();
  const today = currentDateOverride && isValidDate(currentDateOverride)
    ? currentDateOverride.trim()
    : nowIso.split('T')[0];

  if (!record) {
    return {
      lifecycle_status: 'UNKNOWN',
      lifecycle_confidence: 'Low',
      lifecycle_source: 'Missing Record Input',
      lifecycle_last_verified_at: nowIso,
    };
  }

  const openDate = record.open_date?.trim() || '';
  const closeDate = record.close_date?.trim() || '';
  const allotmentDate = record.allotment_date?.trim() || '';
  const listingDate = record.listing_date?.trim() || '';

  const hasValidOpen = isValidDate(openDate);
  const hasValidClose = isValidDate(closeDate);
  const hasValidAllotment = isValidDate(allotmentDate);
  const hasValidListing = isValidDate(listingDate);

  // 1. Listing date passed -> LISTED
  if (hasValidListing && today >= listingDate) {
    return {
      lifecycle_status: 'LISTED',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Listing Date',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // 2. Pre-listing day (day before listing) -> LISTING_UPCOMING
  if (hasValidListing && hasValidAllotment && today >= allotmentDate && today < listingDate) {
    return {
      lifecycle_status: 'LISTING_UPCOMING',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Pre-Listing Timeline',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // 3. Allotment date passed -> ALLOTTED_AVAILABLE
  if (
    hasValidAllotment &&
    today >= allotmentDate &&
    (!hasValidListing || today < listingDate)
  ) {
    return {
      lifecycle_status: 'ALLOTTED_AVAILABLE',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Allotment Date',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // 4. Close date passed but allotment date not reached -> ALLOTTED_PENDING
  if (hasValidClose && today > closeDate) {
    return {
      lifecycle_status: 'ALLOTTED_PENDING',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Close Date',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // 5. Current date between Open and Close -> OPEN
  if (hasValidOpen && hasValidClose && today >= openDate && today <= closeDate) {
    return {
      lifecycle_status: 'OPEN',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Date Range',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // 6. Current date before Open -> UPCOMING
  if (hasValidOpen && today < openDate) {
    return {
      lifecycle_status: 'UPCOMING',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Open Date',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // 7. Fallbacks based on raw status strings
  const rawStatus = (record.status || '').trim().toUpperCase();
  if (rawStatus.includes('LISTED')) {
    return {
      lifecycle_status: 'LISTED',
      lifecycle_confidence: 'Medium',
      lifecycle_source: 'Raw Status String Fallback',
      lifecycle_last_verified_at: nowIso,
    };
  }
  if (rawStatus.includes('ALLOT') || rawStatus.includes('ALLOTTED')) {
    return {
      lifecycle_status: 'ALLOTTED_AVAILABLE',
      lifecycle_confidence: 'Medium',
      lifecycle_source: 'Raw Status String Fallback',
      lifecycle_last_verified_at: nowIso,
    };
  }
  if (rawStatus.includes('CLOSED')) {
    return {
      lifecycle_status: 'CLOSED',
      lifecycle_confidence: 'Medium',
      lifecycle_source: 'Raw Status String Fallback',
      lifecycle_last_verified_at: nowIso,
    };
  }
  if (rawStatus.includes('OPEN')) {
    return {
      lifecycle_status: 'OPEN',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Raw Status String Fallback',
      lifecycle_last_verified_at: nowIso,
    };
  }
  if (rawStatus.includes('UPCOMING') || rawStatus.includes('ANNOUNCED')) {
    return {
      lifecycle_status: 'UPCOMING',
      lifecycle_confidence: 'Medium',
      lifecycle_source: 'Raw Status String Fallback',
      lifecycle_last_verified_at: nowIso,
    };
  }

  return {
    lifecycle_status: 'UNKNOWN',
    lifecycle_confidence: 'Low',
    lifecycle_source: 'Incomplete / Missing Lifecycle Data',
    lifecycle_last_verified_at: nowIso,
  };
}

export function calculateNormalizedIPOStatus(
  record: {
    status?: string | null;
    open_date?: string | null;
    close_date?: string | null;
    allotment_date?: string | null;
    listing_date?: string | null;
  } | null | undefined,
  currentDateOverride?: string
): NormalizedIPOStatus {
  return evaluateLifecycle(record, currentDateOverride).lifecycle_status;
}

/**
 * Safely normalizes raw string inputs to canonical NormalizedIPOStatus.
 * Example: "Open" -> "OPEN", "upcoming" -> "UPCOMING", "listed" -> "LISTED"
 */
export function normalizeLifecycleStatus(value: string | null | undefined): NormalizedIPOStatus {
  if (!value || typeof value !== 'string') return 'UNKNOWN';
  const clean = value.trim().toUpperCase();

  switch (clean) {
    case 'UPCOMING':
    case 'ANNOUNCED':
    case 'FUTURE':
      return 'UPCOMING';

    case 'OPEN':
    case 'ACTIVE':
    case 'LIVE':
    case 'BIDDING':
      return 'OPEN';

    case 'CLOSED':
      return 'CLOSED';

    case 'ALLOTTED_PENDING':
    case 'ALLOTMENT_PENDING':
    case 'PENDING_ALLOTMENT':
      return 'ALLOTTED_PENDING';

    case 'ALLOTTED_AVAILABLE':
    case 'ALLOTTED':
    case 'ALLOTMENT_OUT':
      return 'ALLOTTED_AVAILABLE';

    case 'LISTING_UPCOMING':
    case 'PRE_LISTING':
      return 'LISTING_UPCOMING';

    case 'LISTED':
      return 'LISTED';

    default:
      if (clean.includes('LISTED')) return 'LISTED';
      if (clean.includes('ALLOTTED')) return 'ALLOTTED_AVAILABLE';
      if (clean.includes('CLOSED')) return 'CLOSED';
      if (clean.includes('OPEN')) return 'OPEN';
      if (clean.includes('UPCOMING')) return 'UPCOMING';
      return 'UNKNOWN';
  }
}

/**
 * Returns human-readable label for UI display.
 */
export function getLifecycleStatusLabel(status: NormalizedIPOStatus): string {
  switch (status) {
    case 'UPCOMING':
      return 'Upcoming';
    case 'OPEN':
      return 'Open';
    case 'CLOSED':
      return 'Closed';
    case 'ALLOTTED_PENDING':
      return 'Allotment Pending';
    case 'ALLOTTED_AVAILABLE':
      return 'Allotment Available';
    case 'LISTING_UPCOMING':
      return 'Listing Soon';
    case 'LISTED':
      return 'Listed';
    default:
      return 'Unknown';
  }
}
