export function formatCurrency(
  amount?: number | null,
  currency: string | boolean = "INR"
): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "N/A";
  }
  if (amount === 0) {
    return "₹0";
  }

  const currStr = typeof currency === "string" ? currency : "INR";
  const rounded = Math.round(amount);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currStr,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rounded);
}

export function formatRupees(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "N/A";
  if (amount === 0) return "₹0";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function formatLakhsCrores(amountInRupees?: number | null): string {
  if (amountInRupees === undefined || amountInRupees === null || isNaN(amountInRupees)) {
    return "N/A";
  }
  if (amountInRupees === 0) return "₹0";

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
  let strVal = String(dateVal).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(strVal)) {
    const [d, m, y] = strVal.split("-");
    strVal = `${y}-${m}-${d}`;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(strVal)) {
    const [d, m, y] = strVal.split("/");
    strVal = `${y}-${m}-${d}`;
  }
  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
    const [y, m, d] = strVal.split("-").map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date(strVal);
  }
  if (isNaN(date.getTime())) return "N/A";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatShortDate(dateVal?: string | number | Date | boolean | null): string {
  if (!dateVal || typeof dateVal === "boolean") return "N/A";
  let strVal = String(dateVal).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(strVal)) {
    const [d, m, y] = strVal.split("-");
    strVal = `${y}-${m}-${d}`;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(strVal)) {
    const [d, m, y] = strVal.split("/");
    strVal = `${y}-${m}-${d}`;
  }
  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
    const [y, m, d] = strVal.split("-").map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date(strVal);
  }
  if (isNaN(date.getTime())) return "N/A";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDayMonth(dateVal?: string | number | Date | boolean | null): string {
  if (!dateVal || typeof dateVal === 'boolean') return 'TBA';
  const strVal = String(dateVal).trim();
  if (!strVal || strVal.toUpperCase() === 'TBA' || strVal.toUpperCase() === 'N/A') return 'TBA';

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(strVal)) {
    const parts = strVal.split(/[-/]/);
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (m >= 0 && m < 12 && !isNaN(d)) {
      return `${String(d).padStart(2, '0')} ${SHORT_MONTHS[m]}`;
    }
  }

  // YYYY-MM-DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(strVal)) {
    const datePart = strVal.split('T')[0];
    const parts = datePart.split(/[-/]/);
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (m >= 0 && m < 12 && !isNaN(d)) {
      return `${String(d).padStart(2, '0')} ${SHORT_MONTHS[m]}`;
    }
  }

  const d = new Date(strVal);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    return `${day} ${SHORT_MONTHS[d.getMonth()]}`;
  }
  return strVal;
}

export function formatPercentage(val?: number | null): string {
  if (val === undefined || val === null || isNaN(val)) return "N/A";
  const rounded = Math.ceil(val);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

export function formatSubscriptionTimes(multiplier?: number | null): string {
  if (multiplier === undefined || multiplier === null || isNaN(multiplier)) return "N/A";
  return `${Math.ceil(multiplier)}x`;
}

export function formatShareCount(shares?: number | null): string {
  if (shares === undefined || shares === null || isNaN(shares)) return "N/A";
  return `${shares.toLocaleString("en-IN")} shares`;
}

export function formatRatio(ratio?: number | null): string {
  if (ratio === undefined || ratio === null || isNaN(ratio)) return "N/A";
  return `${ratio}x`;
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function getResolvedLogoUrl(
  rawLogoUrl?: string | null,
  website?: string | null,
  companyName?: string | null
): string | null {
  if (rawLogoUrl && typeof rawLogoUrl === 'string' && rawLogoUrl.trim().length > 0) {
    return rawLogoUrl.trim();
  }
  return null;
}
