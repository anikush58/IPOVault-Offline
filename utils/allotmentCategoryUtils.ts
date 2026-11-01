/**
 * Utility functions for Category-Aware Allotment Checking and Multi-Category Card Rendering.
 *
 * Implements reliable registrar category mapping, display name formatting,
 * category theme color styling, duplicate category merging, and multi-category allotment aggregation.
 */

export interface CategoryBreakdownItem {
  category: string;
  rawCategory?: string;
  status:
    | 'allotted'
    | 'partially_allotted'
    | 'not_allotted'
    | 'no_record'
    | 'not_available'
    | 'check_failed'
    | 'needs_review'
    | 'pending';
  sharesAllotted?: number;
  sharesApplied?: number;
  applicationNumber?: string;
  applicationId?: string;
  id?: string;
}

/**
 * Normalizes raw registrar category strings into canonical category identifiers.
 * Never guesses missing categories. If unrecognized, returns the trimmed raw string.
 */
export function mapRegistrarCategory(raw?: unknown): string {
  if (typeof raw !== 'string') return 'RETAIL';
  const trimmed = raw.trim();
  if (!trimmed) return 'RETAIL';
  const upper = trimmed.toUpperCase();

  // Shareholder category indicators
  if (
    upper === 'S' ||
    upper === 'SH' ||
    upper === 'SHA' ||
    upper === 'SHR' ||
    upper === 'SHH' ||
    upper === 'SH_IND' ||
    upper.includes('SHAREHOLDER') ||
    upper.includes('SHARE HOLDER') ||
    upper.includes('SHARE-HOLDER')
  ) {
    return 'SHAREHOLDER';
  }

  // Retail individual investor indicators
  if (
    upper === 'IND' ||
    upper === 'RET' ||
    upper === 'RI' ||
    upper === 'RII' ||
    upper === 'RETAIL' ||
    upper.includes('RETAIL') ||
    upper.includes('INDIVIDUAL')
  ) {
    return 'RETAIL';
  }

  // Employee category indicators
  if (upper === 'EMP' || upper === 'EMPL' || upper.includes('EMPLOYEE')) {
    return 'EMPLOYEE';
  }

  // Non-Institutional / HNI indicators
  if (
    upper === 'NII' ||
    upper === 'HNI' ||
    upper === 'B-HNI' ||
    upper === 'S-HNI' ||
    upper === 'BHNI' ||
    upper === 'SHNI' ||
    upper.includes('NON INSTITUTIONAL') ||
    upper.includes('NON-INSTITUTIONAL')
  ) {
    return 'HNI';
  }

  // Institutional indicators
  if (upper === 'QIB' || upper.includes('QUALIFIED INSTITUTIONAL')) {
    return 'QIB';
  }

  // Policyholder indicators
  if (upper.includes('POLICYHOLDER') || upper.includes('POLICY HOLDER')) {
    return 'POLICYHOLDER';
  }

  return trimmed;
}

/**
 * Formats a canonical category key into a human-friendly display label.
 */
export function formatCategoryDisplayName(category?: string): string {
  if (!category) return 'Retail';
  const norm = mapRegistrarCategory(category);
  switch (norm) {
    case 'RETAIL':
      return 'Retail';
    case 'SHAREHOLDER':
      return 'Shareholder';
    case 'EMPLOYEE':
      return 'Employee';
    case 'HNI':
      return 'HNI';
    case 'QIB':
      return 'QIB';
    case 'POLICYHOLDER':
      return 'Policyholder';
    default: {
      const clean = category.trim();
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }
  }
}

/**
 * Returns a consistent palette color for category bullet/dot indicators.
 */
export function getCategoryThemeColor(category?: string): string {
  const norm = mapRegistrarCategory(category);
  switch (norm) {
    case 'RETAIL':
      return '#10B981'; // Emerald
    case 'SHAREHOLDER':
      return '#8B5CF6'; // Purple
    case 'EMPLOYEE':
      return '#3B82F6'; // Blue
    case 'HNI':
      return '#F59E0B'; // Amber
    case 'POLICYHOLDER':
      return '#EC4899'; // Pink
    case 'QIB':
      return '#6366F1'; // Indigo
    default:
      return '#64748B'; // Slate
  }
}

/**
 * Formats breakdown row labels deterministically.
 * Rules:
 * 1. If categories are genuinely distinct (e.g. Retail and Shareholder), preserves genuine category names.
 * 2. When categories are identical (e.g. repeated Retail, Retail) or unavailable, assigns neutral labels Bid 1, Bid 2, etc.
 * 3. Bid numbers are assigned deterministically based on stable application identifiers / ordering across reloads.
 * 4. Displays applied shares count as secondary text when available without application numbers.
 */
export function getDeterministicBreakdownLabel(
  current: CategoryBreakdownItem,
  allCategories: CategoryBreakdownItem[]
): string {
  if (!allCategories || allCategories.length <= 1) {
    return formatCategoryDisplayName(current.category);
  }

  // Check if categories have genuinely distinct names
  const normalizedNames = allCategories.map((c) =>
    formatCategoryDisplayName(c.category).toLowerCase().trim()
  );
  const distinctCount = new Set(normalizedNames).size;
  const isGenuinelyDistinct = distinctCount === allCategories.length;

  if (isGenuinelyDistinct) {
    return formatCategoryDisplayName(current.category);
  }

  // Categories are identical or missing; deterministically sort to assign stable Bid numbers
  const sorted = [...allCategories].sort((a, b) => {
    const idA = (a.applicationNumber || a.applicationId || a.id || '').trim();
    const idB = (b.applicationNumber || b.applicationId || b.id || '').trim();
    if (idA && idB) {
      return idA.localeCompare(idB, undefined, { numeric: true });
    }
    if (idA && !idB) return -1;
    if (!idA && idB) return 1;
    return 0;
  });

  const currentIdentifier = (
    current.applicationNumber ||
    current.applicationId ||
    current.id ||
    ''
  ).trim();

  let bidIndex = sorted.findIndex((item) => {
    const itemIdentifier = (
      item.applicationNumber ||
      item.applicationId ||
      item.id ||
      ''
    ).trim();
    if (currentIdentifier && itemIdentifier) {
      return currentIdentifier === itemIdentifier;
    }
    return item === current;
  });

  if (bidIndex < 0) {
    bidIndex = allCategories.indexOf(current);
  }

  const bidNumber = bidIndex >= 0 ? bidIndex + 1 : 1;
  const appliedShares =
    typeof current.sharesApplied === 'number' && current.sharesApplied > 0
      ? current.sharesApplied
      : null;

  return appliedShares !== null
    ? `Bid ${bidNumber} (${appliedShares} Applied)`
    : `Bid ${bidNumber}`;
}

/**
 * Sorts category breakdown items so that:
 * 1. Genuinely distinct categories follow standard hierarchy (Retail, Shareholder, etc.).
 * 2. Multi-bid applications are deterministically ordered so Bid 1 always comes first, then Bid 2, Bid 3.
 */
export function sortCategoriesForDisplay(
  categories?: CategoryBreakdownItem[]
): CategoryBreakdownItem[] {
  if (!categories || categories.length <= 1) return categories ? [...categories] : [];

  return [...categories].sort((a, b) => {
    // Check if categories have genuinely distinct names
    const nameA = formatCategoryDisplayName(a.category);
    const nameB = formatCategoryDisplayName(b.category);

    if (nameA.toLowerCase() !== nameB.toLowerCase()) {
      const priority: Record<string, number> = {
        RETAIL: 1,
        SHAREHOLDER: 2,
        EMPLOYEE: 3,
        HNI: 4,
        POLICYHOLDER: 5,
        QIB: 6,
      };
      const pA = priority[mapRegistrarCategory(a.category)] || 99;
      const pB = priority[mapRegistrarCategory(b.category)] || 99;
      if (pA !== pB) return pA - pB;
      return nameA.localeCompare(nameB);
    }

    // For identical categories (multi-bids), sort by stable application identifier
    const idA = (a.applicationNumber || a.applicationId || a.id || '').trim();
    const idB = (b.applicationNumber || b.applicationId || b.id || '').trim();
    if (idA && idB) {
      return idA.localeCompare(idB, undefined, { numeric: true });
    }
    if (idA && !idB) return -1;
    if (!idA && idB) return 1;
    return 0;
  });
}

/**
 * Formats compact status text for category breakdown rows without background badges.
 * Examples:
 * - "Allotted · 12 Shares"
 * - "Partial · 6 Shares"
 * - "Not Allotted · 0 Shares"
 */
export function formatCategoryStatusText(item: {
  status?: string;
  sharesAllotted?: number | null;
}): string {
  const s = (item.status || '').toLowerCase();
  const shares = item.sharesAllotted && item.sharesAllotted > 0 ? item.sharesAllotted : 0;
  if (s === 'allotted') {
    return `Allotted · ${shares} Shares`;
  }
  if (s === 'partially_allotted') {
    return `Partial · ${shares} Shares`;
  }
  if (s === 'not_allotted') {
    return 'Not Allotted · 0 Shares';
  }
  if (s === 'no_record') {
    return 'No Record · 0 Shares';
  }
  if (s === 'not_available') {
    return 'Not Available';
  }
  if (s === 'pending') {
    return 'Pending';
  }
  return 'Needs Review';
}

/**
 * Returns subtle text color for category breakdown rows consistent with the design system.
 */
export function getCategoryStatusTextColor(status?: string, isDark?: boolean): string {
  const s = (status || '').toLowerCase();
  if (s === 'allotted') {
    return isDark ? '#34D399' : '#059669'; // Subtle emerald / green
  }
  if (s === 'partially_allotted') {
    return isDark ? '#FBBF24' : '#D97706'; // Subtle amber
  }
  if (s === 'not_allotted') {
    return isDark ? '#F87171' : '#DC2626'; // Subtle soft red
  }
  if (s === 'needs_review') {
    return isDark ? '#FBBF24' : '#D97706';
  }
  return isDark ? '#94A3B8' : '#64748B'; // Muted slate
}

/**
 * Deduplicates repeated records from registrar responses and storage.
 *
 * CRITICAL RULE:
 * Never deduplicate records solely because their category names match!
 * When application identifiers (applicationNumber, applicationId, id) are distinct,
 * those records represent distinct applications/allotments and MUST be preserved.
 *
 * Genuine duplicates (same application identifier and category, or identical repeated records)
 * are merged into a single entry to avoid double-counting.
 */
export function deduplicateCategoryRecords<
  T extends {
    category?: string;
    rawCategory?: string;
    status?: string;
    sharesAllotted?: number | null;
    sharesApplied?: number | null;
    applicationNumber?: string | null;
    applicationId?: string | null;
    id?: string | null;
  }
>(records: T[]): T[] {
  if (!records || records.length <= 1) return records || [];

  const seen = new Map<string, T>();

  for (const record of records) {
    const cat = mapRegistrarCategory(record.category || record.rawCategory);
    const appIdentifier = (
      record.applicationNumber ||
      record.applicationId ||
      record.id ||
      ''
    ).trim();

    let key: string;
    if (appIdentifier) {
      // Key by distinct application identifier + category so distinct applications are NEVER merged
      key = `${appIdentifier}:::${cat}`;
    } else {
      // If no application identifier exists:
      // Match an existing entry if and only if it has no application identifier, identical category,
      // and identical status and shares (genuine duplicate server row)
      const identicalMatch = Array.from(seen.entries()).find(([_k, existing]) => {
        const existingCat = mapRegistrarCategory(existing.category || existing.rawCategory);
        const existingAppId = (
          existing.applicationNumber ||
          existing.applicationId ||
          existing.id ||
          ''
        ).trim();
        return (
          !existingAppId &&
          existingCat === cat &&
          (existing.status || '').toUpperCase() === (record.status || '').toUpperCase() &&
          (existing.sharesAllotted || 0) === (record.sharesAllotted || 0)
        );
      });

      if (identicalMatch) {
        key = identicalMatch[0];
      } else {
        key = `${cat}:::entry_${seen.size}`;
      }
    }

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...record, category: cat });
    } else {
      // Genuine duplicate identified with matching application identifier and category:
      // Merge safely without double-counting shares
      const existingStatus = (existing.status || '').toUpperCase();
      const currentStatus = (record.status || '').toUpperCase();
      const isExistingAllotted =
        existingStatus === 'ALLOTTED' || existingStatus === 'PARTIALLY_ALLOTTED';
      const isCurrentAllotted =
        currentStatus === 'ALLOTTED' || currentStatus === 'PARTIALLY_ALLOTTED';

      let mergedStatus = existing.status;
      if (!isExistingAllotted && isCurrentAllotted) {
        mergedStatus = record.status;
      } else if (isExistingAllotted && !isCurrentAllotted) {
        mergedStatus = existing.status;
      } else if (existingStatus === 'ALLOTTED' || currentStatus === 'ALLOTTED') {
        mergedStatus = 'ALLOTTED';
      }

      const mergedSharesAllotted = Math.max(
        existing.sharesAllotted || 0,
        record.sharesAllotted || 0
      );
      const mergedSharesApplied = Math.max(
        existing.sharesApplied || 0,
        record.sharesApplied || 0
      );
      const mergedAppNumber =
        (isCurrentAllotted && record.applicationNumber) ||
        existing.applicationNumber ||
        record.applicationNumber;

      seen.set(key, {
        ...existing,
        ...record,
        category: cat,
        status: mergedStatus,
        sharesAllotted: mergedSharesAllotted,
        sharesApplied: mergedSharesApplied,
        applicationNumber: mergedAppNumber,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Derives overall applicant allotment outcome from category-level results.
 *
 * Rules:
 * 1. Total allotted shares = sum only from verified allotted quantities across distinct categories.
 *    Never counts applied shares as allotted shares. Zero-allotment categories contribute 0 shares.
 * 2. If ALL categories are confirmed allotted, overall status is 'allotted'.
 * 3. If at least one category has shares allotted but another is not allotted or partially allotted,
 *    the applicant is NOT labeled fully allotted; overall status is derived as 'partially_allotted'.
 * 4. Overall status is 'not_allotted' only when all applicable categories have been checked and confirmed not allotted.
 */
export function deriveOverallCategoryAllotment(
  categories: CategoryBreakdownItem[]
): {
  status:
    | 'allotted'
    | 'partially_allotted'
    | 'not_allotted'
    | 'no_record'
    | 'not_available'
    | 'needs_review'
    | 'pending';
  totalSharesAllotted: number;
  totalSharesApplied: number;
} {
  if (!categories || categories.length === 0) {
    return {
      status: 'pending',
      totalSharesAllotted: 0,
      totalSharesApplied: 0,
    };
  }

  const deduped = deduplicateCategoryRecords(categories);

  // Calculate total allotted shares strictly from confirmed allotted or partially allotted quantities
  const totalSharesAllotted = deduped.reduce((sum, c) => {
    const s = (c.status || '').toLowerCase();
    if (s === 'allotted' || s === 'partially_allotted') {
      const shares = typeof c.sharesAllotted === 'number' && c.sharesAllotted > 0 ? c.sharesAllotted : 0;
      return sum + shares;
    }
    return sum;
  }, 0);

  const totalSharesApplied = deduped.reduce((sum, c) => {
    const applied = typeof c.sharesApplied === 'number' && c.sharesApplied > 0 ? c.sharesApplied : 0;
    return sum + applied;
  }, 0);

  const allCategoriesAllotted =
    deduped.length > 0 &&
    deduped.every((c) => (c.status || '').toLowerCase() === 'allotted');

  const anyAllottedOrPartial = deduped.some((c) => {
    const s = (c.status || '').toLowerCase();
    return s === 'allotted' || s === 'partially_allotted';
  });

  // Only label fully 'allotted' if ALL categories are allotted and confirmed shares > 0
  if (allCategoriesAllotted && totalSharesAllotted > 0) {
    return {
      status: 'allotted',
      totalSharesAllotted,
      totalSharesApplied,
    };
  }

  // If one category was allotted but another was not allotted (or partial), overall is partially_allotted
  if (anyAllottedOrPartial || totalSharesAllotted > 0) {
    return {
      status: 'partially_allotted',
      totalSharesAllotted,
      totalSharesApplied,
    };
  }

  const allNotAllotted = deduped.every((c) => (c.status || '').toLowerCase() === 'not_allotted');
  if (allNotAllotted) {
    return {
      status: 'not_allotted',
      totalSharesAllotted: 0,
      totalSharesApplied,
    };
  }

  const hasNotAvailable = deduped.some(
    (c) => (c.status || '').toLowerCase() === 'not_available'
  );
  if (hasNotAvailable) {
    return {
      status: 'not_available',
      totalSharesAllotted: 0,
      totalSharesApplied,
    };
  }

  const allNoRecord = deduped.every((c) => (c.status || '').toLowerCase() === 'no_record');
  if (allNoRecord) {
    return {
      status: 'no_record',
      totalSharesAllotted: 0,
      totalSharesApplied,
    };
  }

  return {
    status: 'needs_review',
    totalSharesAllotted: 0,
    totalSharesApplied,
  };
}
