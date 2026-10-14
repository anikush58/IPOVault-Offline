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
