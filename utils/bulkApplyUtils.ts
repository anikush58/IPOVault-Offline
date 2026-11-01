export const UPI_APPS = ['GPay', 'PhonePe', 'Paytm', 'BHIM', 'BoB ASBA', 'IDFC ASBA', 'Other'] as const;

/**
 * Automatically selects the UPI app mapped to the selected bank account.
 * - Matches case-insensitively against supported UPI apps.
 * - Handles missing, empty, or invalid mappings by returning null.
 */
export function resolveBankLinkedUpiApp(
  bankName: string | null | undefined,
  bankAccounts: Array<{ bank_name: string; upi_app?: string | null }>,
  supportedUpiApps: readonly string[] = UPI_APPS
): string | null {
  if (!bankName || !bankName.trim()) return null;
  const targetName = bankName.trim().toLowerCase();

  const matched = bankAccounts.find(
    (b) => b.bank_name && b.bank_name.trim().toLowerCase() === targetName
  );

  if (!matched || !matched.upi_app || !matched.upi_app.trim()) {
    return null;
  }

  const rawUpi = matched.upi_app.trim();
  const matchedApp = supportedUpiApps.find(
    (app) => app.toLowerCase() === rawUpi.toLowerCase()
  );
  return matchedApp || null;
}

export function parseDateOnly(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{4}-\d{2}-\d{2}T/.test(clean)) return clean.substring(0, 10);
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

export function isIpoCurrentlyOpen(record: {
  status?: string | null;
  lifecycle_status?: string | null;
  open_date?: string | null;
  close_date?: string | null;
  allotment_date?: string | null;
  listing_date?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  allotmentDate?: string | null;
  listingDate?: string | null;
}): boolean {
  const openDateRaw = record.open_date || record.openDate || null;
  const closeDateRaw = record.close_date || record.closeDate || null;
  const allotmentDateRaw = record.allotment_date || record.allotmentDate || null;
  const listingDateRaw = record.listing_date || record.listingDate || null;
  const statusRaw = record.status || record.lifecycle_status || null;

  const openDate = parseDateOnly(openDateRaw);
  const closeDate = parseDateOnly(closeDateRaw);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 1. If close date has passed, it is closed
  if (closeDate && todayStr > closeDate) {
    return false;
  }

  // 2. If open date is in the future, bidding is not open yet
  if (openDate && todayStr < openDate) {
    return false;
  }

  const rawUpper = (statusRaw || '').trim().toUpperCase();
  if (
    rawUpper.includes('CLOSED') ||
    rawUpper.includes('ALLOT') ||
    rawUpper.includes('LISTED') ||
    rawUpper.includes('UPCOMING')
  ) {
    return false;
  }

  return true;
}

/**
 * In bulk apply, show open IPOs and closed IPOs until their allotment date.
 * Hides IPOs once their allotment date has passed or once listed.
 */
export function isIpoAvailableForBulkApply(record: {
  status?: string | null;
  lifecycle_status?: string | null;
  open_date?: string | null;
  close_date?: string | null;
  allotment_date?: string | null;
  listing_date?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  allotmentDate?: string | null;
  listingDate?: string | null;
}): boolean {
  const openDateRaw = record.open_date || record.openDate || null;
  const closeDateRaw = record.close_date || record.closeDate || null;
  const allotmentDateRaw = record.allotment_date || record.allotmentDate || null;
  const listingDateRaw = record.listing_date || record.listingDate || null;
  const statusRaw = record.status || record.lifecycle_status || null;

  const openDate = parseDateOnly(openDateRaw);
  const closeDate = parseDateOnly(closeDateRaw);
  const allotmentDate = parseDateOnly(allotmentDateRaw);
  const listingDate = parseDateOnly(listingDateRaw);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rawUpper = (statusRaw || '').trim().toUpperCase();

  // 1. If listed or listing date has passed, hide
  if (rawUpper.includes('LISTED')) {
    return false;
  }
  if (listingDate && todayStr > listingDate) {
    return false;
  }

  // 2. If upcoming and open date is in future, hide
  if (rawUpper.includes('UPCOMING') && openDate && todayStr < openDate) {
    return false;
  }

  // 3. If allotment date is defined and has passed, hide
  if (allotmentDate && todayStr > allotmentDate) {
    return false;
  }

  // 4. If no allotment date is defined, check closeDate with a grace period
  if (!allotmentDate && closeDate && todayStr > closeDate) {
    if (listingDate && todayStr <= listingDate) {
      return true;
    }
    const closeMs = new Date(closeDate).getTime();
    const todayMs = new Date(todayStr).getTime();
    const daysSinceClose = (todayMs - closeMs) / (1000 * 60 * 60 * 24);
    if (daysSinceClose > 5) {
      return false;
    }
  }

  return true;
}

