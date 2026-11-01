export type AllotmentHistoryItem = {
  id: string;
  ipoId?: string;
  ipoName: string;
  ipoOpenDate?: string;
  userName: string;
  pan: string;
  status: string;
  sharesAllotted?: number;
  checkedAt?: string;
  checkedAtFormatted?: string;
  category?: string;
  applicationId?: string;
};

export function formatAllotmentTimestamp(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  const d = new Date(ms);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Parses various IPO issue/opening date string formats into millisecond timestamp.
 * Returns null if missing or unparseable. Never invents dates.
 */
export function parseIpoDate(dateStr?: string | null): number | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed.toUpperCase() === 'TBA' || trimmed.toUpperCase() === 'N/A') return null;

  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('-').map(Number);
    const ms = Date.UTC(y, m - 1, d);
    return Number.isNaN(ms) ? null : ms;
  }

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/').map(Number);
    const ms = Date.UTC(y, m - 1, d);
    return Number.isNaN(ms) ? null : ms;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const ms = Date.UTC(y, m - 1, d);
    return Number.isNaN(ms) ? null : ms;
  }

  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

export interface AllotmentHistorySortable {
  id: string;
  ipoId?: string;
  ipoName?: string;
  ipoOpenDate?: string;
  checkedAt?: string;
}

function isSameIpo(a: AllotmentHistorySortable, b: AllotmentHistorySortable): boolean {
  if (a.ipoId && b.ipoId && a.ipoId === b.ipoId) {
    return true;
  }
  const nameA = (a.ipoName || '').trim().toLowerCase();
  const nameB = (b.ipoName || '').trim().toLowerCase();
  if (nameA && nameB && nameA === nameB) {
    return true;
  }
  return false;
}

function compareCheckTimestamp(a: AllotmentHistorySortable, b: AllotmentHistorySortable): number {
  const timeA = a.checkedAt ? Date.parse(a.checkedAt) : NaN;
  const timeB = b.checkedAt ? Date.parse(b.checkedAt) : NaN;

  const validA = !Number.isNaN(timeA);
  const validB = !Number.isNaN(timeB);

  if (validA && validB) {
    if (timeB !== timeA) {
      return timeB - timeA; // Descending (newest check first)
    }
    return (a.id || '').localeCompare(b.id || '');
  }

  if (validA && !validB) return -1;
  if (!validA && validB) return 1;

  return (a.id || '').localeCompare(b.id || '');
}

/**
 * Sorts allotment history entries by latest IPO first (issue/opening date),
 * grouping applications belonging to the same IPO together and sorting by check timestamp.
 *
 * Rules:
 * 1. Primary sort: IPO's actual issue/opening date, newest IPO first.
 * 2. Records of the same IPO are grouped together and sorted by actual allotment/check timestamp, newest first.
 * 3. Records missing IPO issue/opening dates are placed after IPOs with valid dates, using a deterministic secondary sort.
 * 4. Ties are broken deterministically by ID without fabricating dates.
 */
export function compareAllotmentHistory(
  a: AllotmentHistorySortable,
  b: AllotmentHistorySortable
): number {
  if (a === b) return 0;

  // 1. Group records for the exact same IPO together
  const sameIpo = isSameIpo(a, b);
  if (sameIpo) {
    return compareCheckTimestamp(a, b);
  }

  // 2. Different IPOs: compare by reliable issue/opening date (newest first)
  const dateA = parseIpoDate(a.ipoOpenDate);
  const dateB = parseIpoDate(b.ipoOpenDate);

  const hasDateA = dateA !== null;
  const hasDateB = dateB !== null;

  if (hasDateA && hasDateB) {
    if (dateB !== dateA) {
      return dateB! - dateA!; // Descending (newest IPO issue/opening date first)
    }
    // Equal issue date: group deterministically by IPO name, then IPO ID
    const nameCmp = (a.ipoName || '').trim().localeCompare((b.ipoName || '').trim());
    if (nameCmp !== 0) return nameCmp;

    const ipoIdCmp = (a.ipoId || '').localeCompare(b.ipoId || '');
    if (ipoIdCmp !== 0) return ipoIdCmp;

    return compareCheckTimestamp(a, b);
  }

  if (hasDateA && !hasDateB) {
    return -1; // Valid IPO date precedes missing IPO date
  }

  if (!hasDateA && hasDateB) {
    return 1; // Missing IPO date comes after valid IPO date
  }

  // Neither has a valid IPO date: deterministic secondary sort by IPO name/ID, then check timestamp
  const nameCmp = (a.ipoName || '').trim().localeCompare((b.ipoName || '').trim());
  if (nameCmp !== 0) return nameCmp;

  const ipoIdCmp = (a.ipoId || '').localeCompare(b.ipoId || '');
  if (ipoIdCmp !== 0) return ipoIdCmp;

  return compareCheckTimestamp(a, b);
}

export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export type MonthShort = typeof MONTH_NAMES_SHORT[number];

export interface AllotmentMonthYear {
  month: MonthShort;
  monthIndex: number;
  year: number;
  yearShort: string;
  label: string; // e.g. 'Oct 26', 'Jan 27'
  key: string;   // e.g. 'oct-26', 'jan-27'
}

export interface MonthChipItem {
  key: string;
  label: string;
  count: number;
  isCurrent?: boolean;
}

export function formatMonthYearLabel(monthIndex: number, year: number): { label: string; key: string } {
  const safeMonthIdx = Math.max(0, Math.min(11, monthIndex));
  const month = MONTH_NAMES_SHORT[safeMonthIdx];
  const yearShort = String(year).slice(-2);
  return {
    label: `${month} ${yearShort}`,
    key: `${month.toLowerCase()}-${yearShort}`,
  };
}

/**
 * Extracts month and year information from an AllotmentHistoryItem.
 * Checks checkedAt timestamp first, then ipoOpenDate, then checkedAtFormatted string.
 * Formats label as 'MMM YY' (e.g. 'Oct 26', 'Jan 27').
 */
export function getAllotmentItemMonthYear(item: AllotmentHistoryItem): AllotmentMonthYear | null {
  if (item.checkedAt) {
    const ms = Date.parse(item.checkedAt);
    if (!Number.isNaN(ms)) {
      const d = new Date(ms);
      const monthIdx = d.getMonth();
      const month = MONTH_NAMES_SHORT[monthIdx];
      const year = d.getFullYear();
      const yearShort = String(year).slice(-2);
      return {
        month,
        monthIndex: monthIdx,
        year,
        yearShort,
        label: `${month} ${yearShort}`,
        key: `${month.toLowerCase()}-${yearShort}`,
      };
    }
  }

  if (item.ipoOpenDate) {
    const ms = parseIpoDate(item.ipoOpenDate);
    if (ms !== null) {
      const d = new Date(ms);
      const monthIdx = d.getUTCMonth();
      const month = MONTH_NAMES_SHORT[monthIdx];
      const year = d.getUTCFullYear();
      const yearShort = String(year).slice(-2);
      return {
        month,
        monthIndex: monthIdx,
        year,
        yearShort,
        label: `${month} ${yearShort}`,
        key: `${month.toLowerCase()}-${yearShort}`,
      };
    }
  }

  if (item.checkedAtFormatted) {
    const match = item.checkedAtFormatted.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b(?:[^\d]*(\d{2,4}))?/i);
    if (match) {
      const normalized = match[1].charAt(0).toUpperCase() + match[1].slice(1, 3).toLowerCase();
      const idx = MONTH_NAMES_SHORT.findIndex((m) => m.toLowerCase() === normalized.toLowerCase());
      if (idx >= 0) {
        let year = new Date().getFullYear();
        if (match[2]) {
          const num = Number(match[2]);
          year = num < 100 ? 2000 + num : num;
        }
        const yearShort = String(year).slice(-2);
        return {
          month: MONTH_NAMES_SHORT[idx],
          monthIndex: idx,
          year,
          yearShort,
          label: `${MONTH_NAMES_SHORT[idx]} ${yearShort}`,
          key: `${MONTH_NAMES_SHORT[idx].toLowerCase()}-${yearShort}`,
        };
      }
    }
  }

  return null;
}

/**
 * Extracts standard 3-letter month string ('Jan', 'Feb', ..., 'Dec') from an AllotmentHistoryItem.
 * Maintained for backward compatibility.
 */
export function getAllotmentItemMonth(item: AllotmentHistoryItem): MonthShort | null {
  const my = getAllotmentItemMonthYear(item);
  return my ? my.month : null;
}

/**
 * Generates month filter chips with the format 'MMM YY' (e.g. 'Oct 26', 'Jan 27').
 * Chip arrangement:
 * - Current month sits directly beside sticky 'All'.
 * - Preceding months run descending down to the app's install month (or earliest data month):
 *   e.g. If installed in Oct 26:
 *   - In Oct 26: [ Oct 26 (count) ]
 *   - In Dec 26: [ Dec 26 (count) ] [ Nov 26 (count) ] [ Oct 26 (count) ]
 * - Future months with no data are NOT shown.
 * - Prior months before install date with no data are NOT shown.
 */
export function generateMonthChips(
  items: AllotmentHistoryItem[],
  referenceDate: Date = new Date(),
  installDate?: Date | null
): MonthChipItem[] {
  const counts: Record<string, number> = {};
  const dataMonthsMap = new Map<number, AllotmentMonthYear>();

  for (const item of items) {
    const my = getAllotmentItemMonthYear(item);
    if (my) {
      counts[my.key] = (counts[my.key] || 0) + 1;
      const mVal = my.year * 12 + my.monthIndex;
      if (!dataMonthsMap.has(mVal)) {
        dataMonthsMap.set(mVal, my);
      }
    }
  }

  const currentMonthIdx = referenceDate.getMonth();
  const currentYear = referenceDate.getFullYear();
  const currentMonthVal = currentYear * 12 + currentMonthIdx;

  // Determine install month value (defaults to currentMonthVal)
  let installMonthVal = currentMonthVal;
  if (installDate && !Number.isNaN(installDate.getTime())) {
    installMonthVal = Math.min(
      installDate.getFullYear() * 12 + installDate.getMonth(),
      currentMonthVal
    );
  }

  // Determine earliest month to display:
  // Down to install month, or earliest historical data if data exists before install
  let earliestMonthVal = installMonthVal;
  for (const mVal of dataMonthsMap.keys()) {
    if (mVal < earliestMonthVal) {
      earliestMonthVal = mVal;
    }
  }

  const chips: MonthChipItem[] = [];
  const addedKeys = new Set<string>();

  // Months descending from current month down to earliest month (e.g. Dec 26, Nov 26, Oct 26)
  for (let v = currentMonthVal; v >= earliestMonthVal; v--) {
    const y = Math.floor(v / 12);
    const m = v % 12;
    const my = formatMonthYearLabel(m, y);
    chips.push({
      key: my.key,
      label: my.label,
      count: counts[my.key] || 0,
      isCurrent: v === currentMonthVal,
    });
    addedKeys.add(my.key);
  }

  // Include any future months that actually have data (e.g. In tests or future scheduled records)
  const futureDataMVals = Array.from(dataMonthsMap.keys())
    .filter((v) => v > currentMonthVal)
    .sort((a, b) => a - b);

  for (const v of futureDataMVals) {
    const y = Math.floor(v / 12);
    const m = v % 12;
    const my = formatMonthYearLabel(m, y);
    if (!addedKeys.has(my.key)) {
      chips.push({
        key: my.key,
        label: my.label,
        count: counts[my.key] || 0,
        isCurrent: false,
      });
      addedKeys.add(my.key);
    }
  }

  return chips;
}

/**
 * Filters a list of allotment history items by month or month-year.
 * Supports:
 * - 'all' or empty: returns all items unchanged
 * - 'oct-26', 'oct 26', 'Oct 26': matches October 2026
 * - 'oct', 'Nov': matches month regardless of year (backward compatibility)
 */
export function filterAllotmentHistoryByMonth(
  items: AllotmentHistoryItem[],
  monthFilter?: string | null
): AllotmentHistoryItem[] {
  if (!monthFilter || monthFilter.trim().toLowerCase() === 'all') {
    return items;
  }
  const rawTarget = monthFilter.trim().toLowerCase();
  const normalizedTarget = rawTarget.replace(/\s+/g, '-');

  return items.filter((item) => {
    const my = getAllotmentItemMonthYear(item);
    if (!my) return false;

    // Direct key match (e.g. 'oct-26')
    if (my.key === normalizedTarget) return true;

    // Label match with space (e.g. 'oct 26')
    if (`${my.month.toLowerCase()} ${my.yearShort}` === rawTarget) return true;
    if (my.label.toLowerCase() === rawTarget) return true;

    // Month-only match for backward compatibility (e.g. 'oct')
    if (my.month.toLowerCase() === rawTarget || my.month.toLowerCase() === normalizedTarget) {
      return true;
    }

    return false;
  });
}
