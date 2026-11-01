import { safeAsyncStorage } from './safeAsyncStorage';

/**
 * Persistently marks an IPO allotment result modal as seen across all possible identifiers.
 */
export async function markAllotmentModalAsSeen(
  identifiers: (string | null | undefined)[]
): Promise<void> {
  const validIds = identifiers.filter(
    (id): id is string => Boolean(id && typeof id === 'string' && id.trim().length > 0)
  );
  if (validIds.length === 0) return;

  const keysToSave = new Set<string>();
  for (const rawId of validIds) {
    const trimmed = rawId.trim();
    keysToSave.add(`seen_allotment_modal_${trimmed}`);
    keysToSave.add(`seen_allotment_modal_${trimmed.toLowerCase()}`);
  }
  await Promise.all(
    Array.from(keysToSave).map((k) => safeAsyncStorage.setItem(k, 'true'))
  );
}

/**
 * Checks whether an allotment result modal has already been seen for any of the given identifiers.
 */
export async function isAllotmentModalSeen(
  identifiers: (string | null | undefined)[]
): Promise<boolean> {
  const validIds = identifiers.filter(
    (id): id is string => Boolean(id && typeof id === 'string' && id.trim().length > 0)
  );
  if (validIds.length === 0) return false;

  const keysToCheck = new Set<string>();
  for (const rawId of validIds) {
    const trimmed = rawId.trim();
    keysToCheck.add(`seen_allotment_modal_${trimmed}`);
    keysToCheck.add(`seen_allotment_modal_${trimmed.toLowerCase()}`);
  }

  const seenValues = await Promise.all(
    Array.from(keysToCheck).map((k) => safeAsyncStorage.getItem(k))
  );
  return seenValues.some((v) => v === 'true');
}

export const MAX_ALLOTMENT_FRESHNESS_MS = 5 * 24 * 60 * 60 * 1000; // 5 days max window for latest allotment

/**
 * Checks whether an IPO has already listed based on status, lifecycle status, or listing date.
 * If already listed, it must never show an allotment confirmation modal.
 */
export function isIpoAlreadyListed(data: {
  ipoStatus?: string | null;
  lifecycleStatus?: string | null;
  listingDate?: string | null;
}): boolean {
  const normStatus = (data.ipoStatus || '').trim().toUpperCase();
  const normLifecycle = (data.lifecycleStatus || '').trim().toUpperCase();

  // 1. Explicit listed or closed or archived status
  if (
    normStatus === 'LISTED' ||
    normLifecycle === 'LISTED' ||
    normStatus === 'CLOSED' ||
    normLifecycle === 'CLOSED' ||
    normStatus === 'ARCHIVED' ||
    normLifecycle === 'ARCHIVED'
  ) {
    return true;
  }

  // 2. Listing date check: If listing date has already arrived or passed, the IPO is already listed!
  if (data.listingDate && data.listingDate.trim().length > 0) {
    try {
      const listingStr = data.listingDate.trim();
      const listingTime = new Date(
        listingStr.includes('T') ? listingStr : `${listingStr}T00:00:00.000Z`
      ).getTime();
      if (!isNaN(listingTime)) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayMidnight = new Date(`${todayStr}T00:00:00.000Z`).getTime();
        if (todayMidnight >= listingTime) {
          return true;
        }
      }
    } catch {}
  }

  return false;
}

/**
 * Checks whether the allotment event is fresh/latest (within the last 5 days).
 * Historical or older allotments are excluded from pop-up celebration modals.
 */
export function isAllotmentLatestAndFresh(data: {
  allotmentDate?: string | null;
  latestCheckedAt?: string | null;
}): boolean {
  const now = Date.now();

  // 1. If checked_at exists, verify it was checked within the freshness window (last 5 days)
  if (data.latestCheckedAt) {
    try {
      const checkedTime = new Date(data.latestCheckedAt).getTime();
      if (!isNaN(checkedTime)) {
        return now - checkedTime <= MAX_ALLOTMENT_FRESHNESS_MS;
      }
    } catch {}
  }

  // 2. If allotment_date exists, verify it fell within the freshness window (last 5 days)
  if (data.allotmentDate && data.allotmentDate.trim().length > 0) {
    try {
      const allotStr = data.allotmentDate.trim();
      const allotTime = new Date(
        allotStr.includes('T') ? allotStr : `${allotStr}T00:00:00.000Z`
      ).getTime();
      if (!isNaN(allotTime)) {
        return now - allotTime <= MAX_ALLOTMENT_FRESHNESS_MS;
      }
    } catch {}
  }

  // If no recent verified check or allotment date exists, it is not a latest allotment
  return false;
}
