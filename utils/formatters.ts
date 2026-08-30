export function formatCurrency(
  amount?: number | null,
  currency: string | boolean = "INR"
): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "₹0";
  }

  const currStr = typeof currency === "string" ? currency : "INR";
  const rounded = Math.ceil(amount);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currStr,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rounded);
}

export function formatRupees(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "₹0";
  return `₹${Math.ceil(amount).toLocaleString("en-IN")}`;
}

export function formatLakhsCrores(amountInRupees?: number | null): string {
  if (!amountInRupees || isNaN(amountInRupees)) return "₹0";

  if (amountInRupees >= 10000000) {
    const crores = Math.ceil(amountInRupees / 10000000);
    return `₹${crores} Cr`;
  } else if (amountInRupees >= 100000) {
    const lakhs = Math.ceil(amountInRupees / 100000);
    return `₹${lakhs} Lakh`;
  }

  return formatRupees(amountInRupees);
}

export function formatDate(dateVal?: string | number | Date | boolean | null): string {
  if (!dateVal || typeof dateVal === "boolean") return "N/A";
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatShortDate(dateVal?: string | number | Date | boolean | null): string {
  if (!dateVal || typeof dateVal === "boolean") return "N/A";
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function formatPercentage(val?: number | null): string {
  if (val === undefined || val === null || isNaN(val)) return "0%";
  const rounded = Math.ceil(val);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

export function formatSubscriptionTimes(multiplier?: number | null): string {
  if (multiplier === undefined || multiplier === null || isNaN(multiplier)) return "0x";
  return `${Math.ceil(multiplier)}x`;
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}
