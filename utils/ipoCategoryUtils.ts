import { BackendIpo, BackendOfferCategory } from '@/types/backend-ipo';

export type IpoCategory = 'RETAIL' | 'SHAREHOLDER' | 'HNI';

export interface CategoryInfo {
  key: IpoCategory;
  label: string;
  shortLabel: string;
  description: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
}

export const CATEGORY_OPTIONS: Record<IpoCategory, CategoryInfo> = {
  RETAIL: {
    key: 'RETAIL',
    label: 'Retail Individual (RII)',
    shortLabel: 'Retail',
    description: 'Up to ₹2,00,000 investment. Bidding at cut-off price supported.',
    badgeBg: 'rgba(16, 185, 129, 0.12)',
    badgeBorder: '#10B981',
    badgeText: '#10B981',
  },
  SHAREHOLDER: {
    key: 'SHAREHOLDER',
    label: 'Shareholder Quota',
    shortLabel: 'Shareholder',
    description: 'For eligible shareholders of the listed parent company held as of record date.',
    badgeBg: 'rgba(139, 92, 246, 0.14)',
    badgeBorder: '#8B5CF6',
    badgeText: '#8B5CF6',
  },
  HNI: {
    key: 'HNI',
    label: 'High Net-worth (NII / HNI)',
    shortLabel: 'HNI',
    description: 'Above ₹2,00,000 investment. Bidding at cut-off price is not permitted.',
    badgeBg: 'rgba(245, 158, 11, 0.14)',
    badgeBorder: '#F59E0B',
    badgeText: '#F59E0B',
  },
};

/**
 * Extracts and inspects offerCategories from an IPO record (backend or local).
 */
export function getIpoOfferCategories(ipo: any): BackendOfferCategory[] {
  if (!ipo) return [];
  if (Array.isArray(ipo.offerCategories) && ipo.offerCategories.length > 0) {
    return ipo.offerCategories;
  }
  if (Array.isArray(ipo.categories) && ipo.categories.length > 0) {
    return ipo.categories;
  }
  return [];
}

export interface ShareholderAvailabilityResult {
  available: boolean;
  hasExplicitConfig: boolean;
  categoryConfig?: BackendOfferCategory;
  note: string;
}

/**
 * Evaluates whether Shareholder category is applicable for an IPO.
 * - Reuses existing verified backend offerCategories metadata when present.
 * - Never invents parent companies or hardcodes company names.
 */
export function isShareholderCategoryAvailable(ipo: any): ShareholderAvailabilityResult {
  const categories = getIpoOfferCategories(ipo);

  if (categories.length > 0) {
    const shareholderCat = categories.find((c) => {
      const catUpper = (c.category || '').toUpperCase().trim();
      return (
        catUpper === 'SHAREHOLDER' ||
        catUpper === 'SHAREHOLDERS' ||
        catUpper.includes('SHAREHOLDER')
      );
    });

    if (shareholderCat) {
      return {
        available: true,
        hasExplicitConfig: true,
        categoryConfig: shareholderCat,
        note: 'Official Shareholder Reservation Quota is defined in this IPO prospectus.',
      };
    }

    // Explicit category list exists, but does not include Shareholder
    return {
      available: false,
      hasExplicitConfig: true,
      note: 'The RHP prospectus for this IPO does not define an explicit Shareholder quota.',
    };
  }

  // When offerCategories are not provided by backend, allow selection with parent holding notice
  return {
    available: true,
    hasExplicitConfig: false,
    note: 'Requires equity shares of the parent/promoter company held as of the RHP record date.',
  };
}

/**
 * Resolves the authoritative shares per lot (lot size) for an IPO from its details data.
 * Checks:
 * 1. Explicit categoryConfig object (minShares / minLots, e.g. for SHAREHOLDER or RETAIL).
 * 2. Category-specific configuration in ipo.offerCategories (minShares / minLots).
 * 3. Official lotSize / lot_size on the IPO object.
 * 4. Prospectus / listing quantity (ipo_listings.quantity or ipo_master.lot_size).
 * 5. Any offerCategory with valid minShares / minLots.
 * 6. Falls back to 1 only if absolutely no lot data exists.
 */
export function resolveIpoLotSize(
  ipo?: any,
  category?: string,
  categoryConfig?: BackendOfferCategory
): number {
  const normCat = (category || '').toUpperCase().trim();

  // 1. Direct categoryConfig passed
  if (categoryConfig) {
    if (typeof categoryConfig.minShares === 'number' && categoryConfig.minShares > 0) {
      const minLots =
        typeof categoryConfig.minLots === 'number' && categoryConfig.minLots > 0
          ? categoryConfig.minLots
          : 1;
      const derived = Math.round(categoryConfig.minShares / minLots);
      if (derived > 0) return derived;
    }
  }

  // 2. Offer categories inside the IPO details
  if (ipo) {
    const categories = getIpoOfferCategories(ipo);
    if (categories && categories.length > 0) {
      if (normCat) {
        const catMatch = categories.find((c) => {
          const cUpper = (c.category || '').toUpperCase().trim();
          return cUpper === normCat || cUpper.includes(normCat) || normCat.includes(cUpper);
        });
        if (catMatch && typeof catMatch.minShares === 'number' && catMatch.minShares > 0) {
          const minLots =
            typeof catMatch.minLots === 'number' && catMatch.minLots > 0 ? catMatch.minLots : 1;
          const derived = Math.round(catMatch.minShares / minLots);
          if (derived > 0) return derived;
        }
      }

      // Retail fallback if looking for standard lot size
      const retailMatch = categories.find((c) => {
        const cUpper = (c.category || '').toUpperCase().trim();
        return cUpper === 'RETAIL' || cUpper === 'RII' || cUpper === 'IND';
      });
      if (retailMatch && typeof retailMatch.minShares === 'number' && retailMatch.minShares > 0) {
        const minLots =
          typeof retailMatch.minLots === 'number' && retailMatch.minLots > 0 ? retailMatch.minLots : 1;
        const derived = Math.round(retailMatch.minShares / minLots);
        if (derived > 0) return derived;
      }

      // Any valid category with minShares
      for (const c of categories) {
        if (typeof c.minShares === 'number' && c.minShares > 0) {
          const minLots = typeof c.minLots === 'number' && c.minLots > 0 ? c.minLots : 1;
          const derived = Math.round(c.minShares / minLots);
          if (derived > 0) return derived;
        }
      }
    }

    // 3. Direct lotSize fields on IPO
    const candidates = [
      ipo.lotSize,
      ipo.lot_size,
      ipo.quantity,
      ipo.sharesPerLot,
      ipo.shares_per_lot,
      ipo.company?.lotSize,
    ];

    for (const val of candidates) {
      if (typeof val === 'number' && !isNaN(val) && val > 0) {
        return val;
      }
      if (typeof val === 'string' && val.trim() !== '') {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  }

  return 1;
}

/**
 * Resolves authoritative lot size by checking the current IPO, matching backend IPOs, and local SQLite listings.
 */
export function getAuthoritativeIpoLotSize(
  currentIpo?: any,
  backendIpos?: any[],
  localIpos?: any[],
  category?: string
): number {
  if (currentIpo) {
    const direct = resolveIpoLotSize(currentIpo, category);
    if (direct > 1) return direct;
  }

  const targetId = currentIpo?.id || currentIpo?.backend_ipo_id;
  const targetSymbol = (currentIpo?.symbol || '').toLowerCase().trim();
  const targetName = (currentIpo?.ipo_name || currentIpo?.company_name || '').toLowerCase().trim();

  // Look in backendIpos
  if (Array.isArray(backendIpos) && backendIpos.length > 0) {
    const match = backendIpos.find((b) => {
      if (!b) return false;
      if (targetId && (b.id === targetId || b.id?.toLowerCase() === targetId.toLowerCase())) return true;
      if (targetSymbol && b.symbol && b.symbol.toLowerCase().trim() === targetSymbol) return true;
      const bName = (b.company?.displayName || b.companyName || b.symbol || '').toLowerCase().trim();
      return Boolean(
        targetName &&
          bName &&
          (bName === targetName || bName.includes(targetName) || targetName.includes(bName))
      );
    });
    if (match) {
      const fromBackend = resolveIpoLotSize(match, category);
      if (fromBackend > 1) return fromBackend;
    }
  }

  // Look in local SQLite ipos
  if (Array.isArray(localIpos) && localIpos.length > 0) {
    const match = localIpos.find((i) => {
      if (!i) return false;
      if (targetId && (i.id === targetId || (i as any).backend_ipo_id === targetId)) return true;
      if (targetSymbol && i.symbol && i.symbol.toLowerCase().trim() === targetSymbol) return true;
      const iName = (i.ipo_name || (i as any).company_name || '').toLowerCase().trim();
      return Boolean(
        targetName &&
          iName &&
          (iName === targetName || iName.includes(targetName) || targetName.includes(iName))
      );
    });
    if (match) {
      const fromLocal = resolveIpoLotSize(match, category);
      if (fromLocal > 1) return fromLocal;
    }
  }

  if (currentIpo) {
    return resolveIpoLotSize(currentIpo, category);
  }

  return 1;
}

export interface CategoryValidationParams {
  category: string;
  lots: number;
  unitPrice: number;
  lotSize: number;
  isSme: boolean;
  categoryConfig?: BackendOfferCategory;
}

export interface CategoryValidationResult {
  valid: boolean;
  error?: string;
  maxLots?: number;
  minLots?: number;
  maxAmount?: number;
  minAmount?: number;
}

/**
 * Validates bidding quantity, lots, and amount against category-specific rules.
 */
export function validateCategoryBid({
  category,
  lots,
  unitPrice,
  lotSize,
  isSme,
  categoryConfig,
}: CategoryValidationParams): CategoryValidationResult {
  const normCategory = (category || 'RETAIL').toUpperCase().trim();
  const safeUnitPrice = Number(unitPrice) || 0;
  const configuredLotSize = resolveIpoLotSize(undefined, category, categoryConfig);
  const safeLotSize = configuredLotSize > 1 ? configuredLotSize : (Number(lotSize) || configuredLotSize || 0);
  const minLotsRequired =
    categoryConfig?.minLots && categoryConfig.minLots > 0
      ? categoryConfig.minLots
      : isSme
      ? 2
      : 1;

  if (safeUnitPrice <= 0 || safeLotSize <= 0) {
    return {
      valid: false,
      error: 'Lot size or price is unavailable for this IPO. Applications cannot be submitted.',
      minLots: minLotsRequired,
    };
  }

  const lotCost = safeUnitPrice * safeLotSize;

  // 1. Basic lot count validation
  if (lots <= 0) {
    return {
      valid: false,
      error: 'Every selected applicant must have at least 1 lot.',
      minLots: minLotsRequired,
    };
  }
  if (isSme && lots < 2) {
    return {
      valid: false,
      error: 'SME IPOs require a minimum of 2 lots per application.',
      minLots: 2,
    };
  }

  const bidAmount = lots * lotCost;

  // 2. Retail Validation (Max ₹2,00,000 standard SEBI limit)
  if (normCategory === 'RETAIL') {
    const configuredMaxAmount =
      categoryConfig?.maxAmount != null ? Number(categoryConfig.maxAmount) : 200000;
    const maxLotsAllowed = Math.max(
      minLotsRequired,
      categoryConfig?.maxLots || Math.floor(configuredMaxAmount / lotCost)
    );

    if (bidAmount > configuredMaxAmount) {
      return {
        valid: false,
        error: `Retail applications cannot exceed ₹${configuredMaxAmount.toLocaleString('en-IN')} (maximum ${maxLotsAllowed} lot${maxLotsAllowed > 1 ? 's' : ''}).`,
        maxLots: maxLotsAllowed,
        maxAmount: configuredMaxAmount,
        minLots: minLotsRequired,
      };
    }

    return {
      valid: true,
      maxLots: maxLotsAllowed,
      maxAmount: configuredMaxAmount,
      minLots: minLotsRequired,
    };
  }

  // 3. Shareholder Category Validation
  if (normCategory === 'SHAREHOLDER') {
    // If backend defines maxAmount for shareholder category, use it; otherwise standard SEBI ceiling is ₹2,00,000 for retail shareholder (UPI mandate limit ₹5,00,000)
    const configuredMaxAmount =
      categoryConfig?.maxAmount != null ? Number(categoryConfig.maxAmount) : 200000;
    const configuredMaxLots =
      categoryConfig?.maxLots || Math.max(minLotsRequired, Math.floor(configuredMaxAmount / lotCost));

    if (bidAmount > configuredMaxAmount) {
      return {
        valid: false,
        error: `Shareholder quota applications cannot exceed ₹${configuredMaxAmount.toLocaleString('en-IN')} (maximum ${configuredMaxLots} lot${configuredMaxLots > 1 ? 's' : ''}).`,
        maxLots: configuredMaxLots,
        maxAmount: configuredMaxAmount,
        minLots: minLotsRequired,
      };
    }

    return {
      valid: true,
      maxLots: configuredMaxLots,
      maxAmount: configuredMaxAmount,
      minLots: minLotsRequired,
    };
  }

  // 4. HNI / NII Validation (Must exceed ₹2,00,000)
  if (normCategory === 'HNI' || normCategory === 'NII') {
    const minHniAmount = 200000;
    const minHniFloor = isSme ? 3 : minLotsRequired;
    const minHniLots = Math.max(minHniFloor, Math.floor(minHniAmount / lotCost) + 1);

    if (lots < minHniLots || bidAmount <= minHniAmount) {
      return {
        valid: false,
        error: `HNI applications must exceed ₹2,00,000 (minimum ${minHniLots} lot${minHniLots > 1 ? 's' : ''}).`,
        minLots: minHniLots,
        minAmount: minHniAmount,
      };
    }

    return {
      valid: true,
      minLots: minHniLots,
      minAmount: minHniAmount,
    };
  }

  return { valid: true };
}

export interface CategoryLotLimits {
  minLots: number;
  maxLots: number;
  defaultLots: number;
  lotSize: number;
  unitPrice: number;
  lotCost: number;
  minAmount: number;
  maxAmount: number;
  hasValidLotData: boolean;
  options: number[];
  errorMessage?: string;
}

/**
 * Calculates permissible lot boundaries, defaults, and quick-pick options for an IPO category.
 */
export function getCategoryLotLimits({
  category,
  unitPrice,
  lotSize,
  isSme,
  categoryConfig,
}: {
  category: string;
  unitPrice?: number | null;
  lotSize?: number | null;
  isSme: boolean;
  categoryConfig?: BackendOfferCategory;
}): CategoryLotLimits {
  const normCategory = (category || 'RETAIL').toUpperCase().trim();
  const safeUnitPrice = Number(unitPrice) || 0;
  const configuredLotSize = resolveIpoLotSize(undefined, category, categoryConfig);
  const safeLotSize = configuredLotSize > 1 ? configuredLotSize : (Number(lotSize) || configuredLotSize || 0);
  const minLotsRequired =
    categoryConfig?.minLots && categoryConfig.minLots > 0
      ? categoryConfig.minLots
      : isSme
      ? 2
      : 1;

  if (safeUnitPrice <= 0 || safeLotSize <= 0) {
    return {
      minLots: minLotsRequired,
      maxLots: minLotsRequired,
      defaultLots: minLotsRequired,
      lotSize: Math.max(0, safeLotSize),
      unitPrice: Math.max(0, safeUnitPrice),
      lotCost: 0,
      minAmount: 0,
      maxAmount: 0,
      hasValidLotData: false,
      options: [minLotsRequired],
      errorMessage: 'Lot size or price band is unavailable for this IPO.',
    };
  }

  const lotCost = safeUnitPrice * safeLotSize;

  if (normCategory === 'HNI' || normCategory === 'NII') {
    const minHniAmount = 200000;
    const minHniFloor = isSme ? 3 : minLotsRequired;
    const minHniLots = Math.max(minHniFloor, Math.floor(minHniAmount / lotCost) + 1);
    const configuredMaxAmount =
      categoryConfig?.maxAmount != null ? Number(categoryConfig.maxAmount) : 1000000;
    const configuredMaxLots =
      categoryConfig?.maxLots ||
      Math.max(minHniLots + 10, Math.floor(configuredMaxAmount / lotCost));
    const maxLots = Math.max(minHniLots, configuredMaxLots);

    const options: number[] = [];
    const stepCount = Math.min(20, maxLots - minHniLots + 1);
    for (let i = 0; i < stepCount; i++) {
      options.push(minHniLots + i);
    }
    if (!options.includes(maxLots) && maxLots > minHniLots) {
      options.push(maxLots);
    }

    return {
      minLots: minHniLots,
      maxLots,
      defaultLots: minHniLots,
      lotSize: safeLotSize,
      unitPrice: safeUnitPrice,
      lotCost,
      minAmount: minHniLots * lotCost,
      maxAmount: maxLots * lotCost,
      hasValidLotData: true,
      options,
    };
  }

  if (normCategory === 'SHAREHOLDER') {
    const configuredMaxAmount =
      categoryConfig?.maxAmount != null ? Number(categoryConfig.maxAmount) : 200000;
    const configuredMaxLots =
      categoryConfig?.maxLots ||
      (categoryConfig?.maxShares && safeLotSize > 0
        ? Math.floor(Number(categoryConfig.maxShares) / safeLotSize)
        : Math.max(minLotsRequired, Math.floor(configuredMaxAmount / lotCost)));
    const maxLots = Math.max(minLotsRequired, configuredMaxLots);

    const options: number[] = [];
    for (let l = minLotsRequired; l <= maxLots; l++) {
      options.push(l);
    }

    return {
      minLots: minLotsRequired,
      maxLots,
      defaultLots: minLotsRequired,
      lotSize: safeLotSize,
      unitPrice: safeUnitPrice,
      lotCost,
      minAmount: minLotsRequired * lotCost,
      maxAmount: maxLots * lotCost,
      hasValidLotData: true,
      options: options.length > 0 ? options : [minLotsRequired],
    };
  }

  // RETAIL
  const configuredMaxAmount =
    categoryConfig?.maxAmount != null ? Number(categoryConfig.maxAmount) : 200000;
  const configuredMaxLots =
    categoryConfig?.maxLots ||
    Math.max(minLotsRequired, Math.floor(configuredMaxAmount / lotCost));
  const maxLots = Math.max(minLotsRequired, configuredMaxLots);

  const options: number[] = [];
  for (let l = minLotsRequired; l <= maxLots; l++) {
    options.push(l);
  }

  return {
    minLots: minLotsRequired,
    maxLots,
    defaultLots: minLotsRequired,
    lotSize: safeLotSize,
    unitPrice: safeUnitPrice,
    lotCost,
    minAmount: minLotsRequired * lotCost,
    maxAmount: maxLots * lotCost,
    hasValidLotData: true,
    options: options.length > 0 ? options : [minLotsRequired],
  };
}
