import { SmartIPOLifecycleStatus } from '@/lib/smartIpo/types/smartIpo';

export type NormalizedIPOStatus =
  | 'UPCOMING'
  | 'OPEN'
  | 'CLOSING_TODAY'
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

export function getISTDateTime(date: Date = new Date()): {
  istDate: string;
  istHours: number;
  istMinutes: number;
  nowIso: string;
} {
  // Using Intl format in Asia/Kolkata timezone (UTC+05:30)
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const yyyy = getPart('year');
    const mm = getPart('month');
    const dd = getPart('day');
    const hh = parseInt(getPart('hour'), 10) || 0;
    const min = parseInt(getPart('minute'), 10) || 0;
    return {
      istDate: `${yyyy}-${mm}-${dd}`,
      istHours: hh,
      istMinutes: min,
      nowIso: date.toISOString(),
    };
  } catch {
    // Fallback: compute UTC offset for +05:30 (+330 mins)
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const istTime = new Date(utc + 3600000 * 5.5);
    const yyyy = istTime.getFullYear();
    const mm = String(istTime.getMonth() + 1).padStart(2, '0');
    const dd = String(istTime.getDate()).padStart(2, '0');
    return {
      istDate: `${yyyy}-${mm}-${dd}`,
      istHours: istTime.getHours(),
      istMinutes: istTime.getMinutes(),
      nowIso: date.toISOString(),
    };
  }
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
  currentDateOverride?: string,
  currentTimeOverride?: { hours: number; minutes: number }
): LifecycleEvaluation {
  const ist = getISTDateTime();
  const nowIso = ist.nowIso;
  const today = currentDateOverride && isValidDate(currentDateOverride)
    ? currentDateOverride.trim()
    : ist.istDate;
  const istHours = currentTimeOverride ? currentTimeOverride.hours : ist.istHours;
  const istMinutes = currentTimeOverride ? currentTimeOverride.minutes : ist.istMinutes;

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

  // 1. Authoritative Backend Status is the PRIMARY source of truth
  const rawStatus = (record.status || '').trim();
  if (rawStatus) {
    const normalized = normalizeLifecycleStatus(rawStatus);
    if (normalized !== 'UNKNOWN') {
      // Dynamic lifecycle refinement based on authoritative IST time & date boundaries:
      if (normalized === 'CLOSING_TODAY') {
        // If current IST time on close date has reached or passed 17:00 IST (5 PM), market has closed
        if (hasValidClose && today === closeDate && (istHours > 17 || (istHours === 17 && istMinutes >= 0))) {
          return {
            lifecycle_status: 'CLOSED',
            lifecycle_confidence: 'High',
            lifecycle_source: 'Authoritative Close Time (17:00 IST Passed)',
            lifecycle_last_verified_at: nowIso,
          };
        }
        if (hasValidClose && today > closeDate) {
          return {
            lifecycle_status: 'ALLOTTED_PENDING',
            lifecycle_confidence: 'High',
            lifecycle_source: 'Authoritative Date Progression',
            lifecycle_last_verified_at: nowIso,
          };
        }
      }

      if (normalized === 'OPEN') {
        if (hasValidClose && today === closeDate) {
          if (istHours >= 17) {
            return {
              lifecycle_status: 'CLOSED',
              lifecycle_confidence: 'High',
              lifecycle_source: 'Authoritative Close Time (17:00 IST Passed)',
              lifecycle_last_verified_at: nowIso,
            };
          }
          return {
            lifecycle_status: 'CLOSING_TODAY',
            lifecycle_confidence: 'High',
            lifecycle_source: 'Authoritative Date Range',
            lifecycle_last_verified_at: nowIso,
          };
        }
        if (hasValidClose && today > closeDate) {
          return {
            lifecycle_status: 'ALLOTTED_PENDING',
            lifecycle_confidence: 'High',
            lifecycle_source: 'Authoritative Close Date',
            lifecycle_last_verified_at: nowIso,
          };
        }
      }

      if (normalized === 'CLOSED') {
        // If close date has passed (subsequent day) and not yet declared/listed, progress to ALLOTTED_PENDING
        if (hasValidClose && today > closeDate) {
          if (hasValidListing && today >= listingDate) {
            return {
              lifecycle_status: 'LISTED',
              lifecycle_confidence: 'High',
              lifecycle_source: 'Authoritative Listing Date',
              lifecycle_last_verified_at: nowIso,
            };
          }
          return {
            lifecycle_status: 'ALLOTTED_PENDING',
            lifecycle_confidence: 'High',
            lifecycle_source: 'Authoritative Post-Close Progression',
            lifecycle_last_verified_at: nowIso,
          };
        }
      }

      return {
        lifecycle_status: normalized,
        lifecycle_confidence: 'High',
        lifecycle_source: 'Authoritative Backend Status',
        lifecycle_last_verified_at: nowIso,
      };
    }
  }

  // 2. Client-side date fallbacks (ONLY if record.status is missing or UNKNOWN)
  // Listing date passed -> LISTED
  if (hasValidListing && today >= listingDate) {
    return {
      lifecycle_status: 'LISTED',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Listing Date',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // Close date passed -> ALLOTTED_PENDING (Client-side date alone cannot determine allotment result)
  if (hasValidClose && today > closeDate) {
    return {
      lifecycle_status: 'ALLOTTED_PENDING',
      lifecycle_confidence: 'Medium',
      lifecycle_source: 'Authoritative Close Date',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // Close date is today
  if (hasValidOpen && hasValidClose && today === closeDate) {
    // Before 17:00 IST -> CLOSING_TODAY, At/after 17:00 IST -> CLOSED
    if (istHours < 17) {
      return {
        lifecycle_status: 'CLOSING_TODAY',
        lifecycle_confidence: 'High',
        lifecycle_source: 'Authoritative Date Range',
        lifecycle_last_verified_at: nowIso,
      };
    }
    return {
      lifecycle_status: 'CLOSED',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Close Time (17:00 IST)',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // Current date between Open and Close (before close date) -> OPEN
  if (hasValidOpen && hasValidClose && today >= openDate && today < closeDate) {
    return {
      lifecycle_status: 'OPEN',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Date Range',
      lifecycle_last_verified_at: nowIso,
    };
  }

  // Current date before Open -> UPCOMING
  if (hasValidOpen && today < openDate) {
    return {
      lifecycle_status: 'UPCOMING',
      lifecycle_confidence: 'High',
      lifecycle_source: 'Authoritative Open Date',
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
  currentDateOverride?: string,
  currentTimeOverride?: { hours: number; minutes: number }
): NormalizedIPOStatus {
  return evaluateLifecycle(record, currentDateOverride, currentTimeOverride).lifecycle_status;
}

/**
 * Safely normalizes raw string inputs to canonical NormalizedIPOStatus.
 * Example: "Open" -> "OPEN", "upcoming" -> "UPCOMING", "listed" -> "LISTED", "ALLOTMENT_AWAITING" -> "ALLOTTED_PENDING"
 */
export function normalizeLifecycleStatus(value: string | null | undefined): NormalizedIPOStatus {
  if (!value || typeof value !== 'string') return 'UNKNOWN';
  const clean = value.trim().toUpperCase().replace(/[\s-]+/g, '_');

  switch (clean) {
    case 'UPCOMING':
    case 'ANNOUNCED':
    case 'FUTURE':
      return 'UPCOMING';

    case 'OPEN':
    case 'LIVE_NOW':
    case 'ACTIVE':
    case 'LIVE':
    case 'BIDDING':
      return 'OPEN';

    case 'CLOSING_TODAY':
    case 'CLOSES_TODAY':
    case 'CLOSING':
      return 'CLOSING_TODAY';

    case 'CLOSED':
      return 'CLOSED';

    case 'ALLOTTED_PENDING':
    case 'ALLOTMENT_PENDING':
    case 'ALLOTMENT_AWAITED':
    case 'ALLOTMENT_AWAITING':
    case 'AWAITING_ALLOTMENT':
    case 'PENDING_ALLOTMENT':
      return 'ALLOTTED_PENDING';

    case 'ALLOTTED_AVAILABLE':
    case 'ALLOTTED':
    case 'ALLOTMENT_OUT':
    case 'ALLOTMENT_COMPLETED':
    case 'ALLOTMENT_SUCCESS':
      return 'ALLOTTED_AVAILABLE';

    case 'LISTING_UPCOMING':
    case 'LISTING_PENDING':
    case 'PRE_LISTING':
      return 'LISTING_UPCOMING';

    case 'LISTED':
      return 'LISTED';

    default:
      // Substring & keyword matching with strict priority:
      // 1. Check AWAIT / PENDING first so ALLOTMENT_PENDING / ALLOTMENT_AWAITING / ALLOTMENT_AWAITED never match ALLOT
      if (clean.includes('AWAIT') || clean.includes('PENDING')) {
        if (clean.includes('LISTING')) return 'LISTING_UPCOMING';
        return 'ALLOTTED_PENDING';
      }
      if (clean.includes('CLOSING') || clean.includes('CLOSES_TODAY')) return 'CLOSING_TODAY';
      if (clean.includes('LISTED')) return 'LISTED';
      if (clean.includes('PRE_LISTING')) return 'LISTING_UPCOMING';
      if (clean.includes('OUT') || clean.includes('COMPLETED') || clean.includes('AVAILABLE') || clean.includes('SUCCESS')) {
        if (clean.includes('ALLOT')) return 'ALLOTTED_AVAILABLE';
      }
      if (clean === 'ALLOTTED') return 'ALLOTTED_AVAILABLE';
      if (clean.includes('CLOSED')) return 'CLOSED';
      if (clean.includes('OPEN') || clean.includes('LIVE')) return 'OPEN';
      if (clean.includes('UPCOMING') || clean.includes('ANNOUNCED')) return 'UPCOMING';
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
      return 'Live Now';
    case 'CLOSING_TODAY':
      return 'Closing Today';
    case 'CLOSED':
      return 'Closed';
    case 'ALLOTTED_PENDING':
      return 'Allotment Awaited';
    case 'ALLOTTED_AVAILABLE':
      return 'Allotment Out';
    case 'LISTING_UPCOMING':
      return 'Listing Soon';
    case 'LISTED':
      return 'Listed';
    default:
      return 'Unknown';
  }
}
