import { UserPortfolioIpoSummary } from '@/services/broker/BrokerApiService';

/**
 * Resolves the authoritative canonical user ID for broker API operations following the hierarchy:
 * 1. Authenticated user ID (from Supabase Auth context / session)
 * 2. Authenticated owner_id present on local database user records (from cloud backup or previous session)
 * 3. Returns null if no authenticated user identity exists (never returns dummy 'default-user' or random local SQLite IDs).
 */
export function resolveCanonicalBrokerUserId(
  authUser?: { id?: string } | null,
  users?: Array<{ owner_id?: string; id?: string }> | null,
): string | null {
  if (authUser?.id && typeof authUser.id === 'string' && authUser.id.trim()) {
    return authUser.id.trim();
  }

  if (users && users.length > 0) {
    const userWithOwner = users.find(
      (u) => u.owner_id && typeof u.owner_id === 'string' && u.owner_id.trim(),
    );
    if (userWithOwner?.owner_id) {
      return userWithOwner.owner_id.trim();
    }
  }

  return null;
}

/**
 * Normalizes company or IPO names for clean cross-matching with broker symbols and trading names.
 * Strips corporate legal designations, IPO suffixes, punctuation, and extraneous whitespace.
 */
export function normalizeNameForMatching(rawName?: string | null): string {
  if (!rawName) return '';
  return rawName
    .toUpperCase()
    .replace(/&/g, ' AND ')
    // Remove corporate & legal entities
    .replace(/\bPRIVATE\s+LIMITED\b/g, '')
    .replace(/\bPVT\s*\.?\s*LTD\b/g, '')
    .replace(/\bPVT\b/g, '')
    .replace(/\bLIMITED\b/g, '')
    .replace(/\bLTD\b/g, '')
    .replace(/\bLLP\b/g, '')
    .replace(/\bCORP(ORATION)?\b/g, '')
    .replace(/\bINC(ORPORATED)?\b/g, '')
    .replace(/\bINDUSTRIES\b/g, '')
    .replace(/\bHOLDINGS?\b/g, '')
    .replace(/\b(INDIA|GLOBAL|INTERNATIONAL|WORLDWIDE)\b/g, '')
    // Remove IPO lifecycle descriptors
    .replace(/\b(SME\s+)?IPO\b/g, '')
    .replace(/\bFPO\b/g, '')
    .replace(/\bOFFER\b/g, '')
    .replace(/\bRETAIL\b/g, '')
    .replace(/\bMAINBOARD\b/g, '')
    // Remove punctuation & non-alphanumeric (except spaces)
    .replace(/[^A-Z0-9\s]/g, ' ')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compact token representation (no spaces, only alphanumeric)
 * e.g. "BELRISE INDUSTRIES" -> "BELRISE", "CYIENT DLM" -> "CYIENTDLM"
 */
export function getCompactKey(text?: string | null): string {
  if (!text) return '';
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Finds the best matching broker investment for an application.
 * Hierarchy:
 * Priority 1: Exact ISIN match
 * Priority 2: Normalized exchange symbol exact match
 * Priority 3: Normalized company / IPO name exact match
 * Priority 4: Conservative token/compact match (unambiguous)
 */
export function findMatchingBrokerInvestment(
  app: { ipo_name?: string; ipo_id?: string },
  matchedIpo?: {
    id?: string;
    backend_ipo_id?: string | null;
    isin?: string | null;
    symbol?: string | null;
    company_name?: string | null;
    ipo_name?: string | null;
  } | null,
  brokerInvestments?: UserPortfolioIpoSummary[] | null,
): UserPortfolioIpoSummary | null {
  if (!brokerInvestments || brokerInvestments.length === 0) {
    return null;
  }

  // Collect application identifiers
  const appIsin = (matchedIpo as any)?.isin?.trim().toUpperCase();
  const appBackendId = matchedIpo?.backend_ipo_id;
  const appSymbol = (matchedIpo?.symbol || '').trim().toUpperCase();
  const appIpoName = (app.ipo_name || matchedIpo?.ipo_name || '').trim();
  const appCompanyName = (matchedIpo?.company_name || '').trim();

  // ── Priority 1: Exact ISIN match ──────────────────────────────────────
  if (appIsin) {
    const isinMatch = brokerInvestments.find(
      (inv) => inv.isin && inv.isin.trim().toUpperCase() === appIsin,
    );
    if (isinMatch) return isinMatch;
  }

  // ── Priority 1.5: Exact Backend IPO ID match ─────────────────────────
  if (appBackendId) {
    const idMatch = brokerInvestments.find((inv) => inv.ipoId === appBackendId);
    if (idMatch) return idMatch;
  }

  // ── Priority 2: Normalized Exchange Symbol exact match ────────────────
  if (appSymbol) {
    const symMatch = brokerInvestments.find(
      (inv) => inv.symbol && inv.symbol.trim().toUpperCase() === appSymbol,
    );
    if (symMatch) return symMatch;
  }

  // ── Priority 3: Normalized Company / IPO Name exact match ─────────────
  const normAppNames = [
    normalizeNameForMatching(appCompanyName),
    normalizeNameForMatching(appIpoName),
  ].filter(Boolean);

  for (const normAppName of normAppNames) {
    if (!normAppName) continue;
    const nameMatch = brokerInvestments.find((inv) => {
      const normBrokerSym = normalizeNameForMatching(inv.symbol);
      const normBrokerComp = normalizeNameForMatching(inv.companyName);
      return (
        normAppName === normBrokerSym ||
        normAppName === normBrokerComp ||
        (inv.symbol && normAppName === inv.symbol.trim().toUpperCase())
      );
    });
    if (nameMatch) return nameMatch;
  }

  // ── Priority 4: Conservative Compact Token Prefix Match (Unambiguous) ───
  const compactAppKeys = [
    getCompactKey(normalizeNameForMatching(appCompanyName)),
    getCompactKey(normalizeNameForMatching(appIpoName)),
    getCompactKey(appSymbol),
  ].filter((k) => k.length >= 3);

  for (const appKey of compactAppKeys) {
    const candidates = brokerInvestments.filter((inv) => {
      const brokerKeys = [
        getCompactKey(inv.symbol),
        getCompactKey(normalizeNameForMatching(inv.companyName)),
      ].filter((k) => k.length >= 3);

      return brokerKeys.some(
        (bk) => bk === appKey || bk.startsWith(appKey) || appKey.startsWith(bk),
      );
    });

    if (candidates.length === 1) {
      return candidates[0];
    }
  }

  return null;
}

/**
 * Returns ONLY the current broker LTP for a Holding application.
 * Never alters application quantity or buy price.
 */
/**
 * Returns ONLY the current broker LTP for a Holding application if available and > 0.
 * Never alters application quantity or buy price.
 */
export function getBrokerLtpForApplication(
  app: { ipo_name?: string; ipo_id?: string; sell_price?: number | null; buy_price?: number },
  matchedIpo?: {
    id?: string;
    backend_ipo_id?: string | null;
    isin?: string | null;
    symbol?: string | null;
    company_name?: string | null;
    ipo_name?: string | null;
  } | null,
  brokerInvestments?: UserPortfolioIpoSummary[] | null,
): number | null {
  const match = findMatchingBrokerInvestment(app, matchedIpo, brokerInvestments);
  if (match && typeof match.currentHoldingPrice === 'number' && match.currentHoldingPrice > 0) {
    return match.currentHoldingPrice;
  }
  return null;
}

/**
 * Resolves the authoritative current price / LTP for a Holding application following the strict priority:
 * 1. Matching connected broker LTP (> 0)
 * 2. Existing stored/manual current price (> 0) as fallback
 * 3. Buy price as final fallback
 */
export function resolveEffectiveHoldingPrice(
  app: { ipo_name?: string; ipo_id?: string; sell_price?: number | null; buy_price: number },
  matchedIpo?: {
    id?: string;
    backend_ipo_id?: string | null;
    isin?: string | null;
    symbol?: string | null;
    company_name?: string | null;
    ipo_name?: string | null;
  } | null,
  brokerInvestments?: UserPortfolioIpoSummary[] | null,
): number {
  const brokerLtp = getBrokerLtpForApplication(app, matchedIpo, brokerInvestments);
  if (brokerLtp != null && brokerLtp > 0) {
    return brokerLtp;
  }
  if (app.sell_price != null && app.sell_price > 0) {
    return app.sell_price;
  }
  return app.buy_price || 0;
}

/**
 * Enriches a list of applications with broker data:
 * - Holding applications get authoritative broker LTP as current holding price (Priority 1: Broker LTP > Priority 2: Stored Current Price > Priority 3: Buy Price).
 * - If matching broker sale is detected (holding sold on broker), status automatically transitions Holding -> Sold with executed sell_price (never LTP).
 * - Sold applications preserve actual executed sell_price (never market LTP).
 * - Reused identically across Dashboard, Portfolio Details, and Applications/Holdings screens.
 */
export function enrichApplicationsWithBrokerData<
  T extends {
    id?: string;
    ipo_id?: string;
    ipo_name?: string;
    status: string;
    buy_price: number;
    sell_price?: number | null;
    user_broker?: string | null;
    quantity: number;
    shares_count?: number | null;
  },
>(
  applications: T[],
  ipos: Array<{
    id?: string;
    backend_ipo_id?: string | null;
    isin?: string | null;
    symbol?: string | null;
    company_name?: string | null;
    ipo_name?: string | null;
  }>,
  brokerInvestments?: UserPortfolioIpoSummary[] | null,
): T[] {
  if (!brokerInvestments || brokerInvestments.length === 0) {
    return applications;
  }

  return applications.map((app) => {
    const matchedIpo = ipos.find((i) => i.id === app.ipo_id);
    const brokerInv = findMatchingBrokerInvestment(
      app,
      matchedIpo,
      brokerInvestments,
    );

    if (!brokerInv) {
      return app;
    }

    let effectiveStatus = app.status;
    let effectiveSellPrice = app.sell_price;
    let effectiveBroker = app.user_broker;

    const brokerNames = Array.from(
      new Set(
        [
          ...(brokerInv.brokerHoldings || []).map((bh: any) => bh.broker),
          ...(brokerInv.sellTrades || []).map((st: any) => st.broker),
        ].filter(Boolean),
      ),
    ).join(', ');

    if (brokerNames) {
      effectiveBroker = brokerNames;
    }

    if (app.status === 'Holding') {
      const isSoldOnBroker =
        (brokerInv.status === 'FULLY_SOLD' ||
          (brokerInv.totalSoldQuantity > 0 &&
            brokerInv.remainingHoldingQuantity === 0)) &&
        typeof brokerInv.weightedSellPrice === 'number' &&
        brokerInv.weightedSellPrice > 0;

      if (isSoldOnBroker) {
        // Automatic sale detection: Transition Holding -> Sold with executed trade price
        effectiveStatus = 'Sold';
        effectiveSellPrice = brokerInv.weightedSellPrice;
      } else if (
        typeof brokerInv.currentHoldingPrice === 'number' &&
        brokerInv.currentHoldingPrice > 0
      ) {
        // Priority 1: Authoritative LTP whenever available from connected broker (overrides SQLite stored price)
        effectiveSellPrice = brokerInv.currentHoldingPrice;
      } else if (app.sell_price != null && app.sell_price > 0) {
        // Priority 2: Existing stored/manual current price fallback
        effectiveSellPrice = app.sell_price;
      } else {
        // Priority 3: Buy price as final fallback
        effectiveSellPrice = app.buy_price || 0;
      }
    } else if (app.status === 'Sold') {
      // Priority 1: Actual executed broker sell_price
      if (
        typeof brokerInv.weightedSellPrice === 'number' &&
        brokerInv.weightedSellPrice > 0
      ) {
        effectiveSellPrice = brokerInv.weightedSellPrice;
      } else if (app.sell_price != null && app.sell_price > 0) {
        // Priority 2: Existing stored executed sell_price
        effectiveSellPrice = app.sell_price;
      }
      // Priority 3: Never use current broker LTP for Sold
    }

    // Quantity, shares_count, and buy_price are NEVER modified from broker
    return {
      ...app,
      status: effectiveStatus,
      sell_price: effectiveSellPrice,
      user_broker: effectiveBroker,
    };
  });
}

/**
 * Persists broker LTP and auto-detected sales into SQLite:
 * 1. For 'Holding' applications:
 *    - If fully sold on broker: updates status -> 'Sold' with actual executed sell_price (never LTP).
 *    - If still held: updates sell_price to current broker LTP.
 * 2. Never modifies:
 *    - Already 'Sold' applications (executed sale prices are preserved)
 *    - buy_price
 *    - quantity / shares_count
 * 3. Never overwrites a valid manual price with null/failed/0 broker data.
 */
export async function syncBrokerHoldingPricesToLocalDb(
  applications: Array<{
    id?: string;
    ipo_id?: string;
    ipo_name?: string;
    status: string;
    sell_price?: number | null;
    buy_price: number;
    quantity: number;
    user_broker?: string | null;
  }>,
  ipos: Array<{
    id?: string;
    backend_ipo_id?: string | null;
    isin?: string | null;
    symbol?: string | null;
    company_name?: string | null;
    ipo_name?: string | null;
  }>,
  brokerInvestments: UserPortfolioIpoSummary[] | null | undefined,
  db: {
    runAsync: (sql: string, params: any[]) => Promise<any>;
  },
  onUpdated?: () => Promise<void> | void,
): Promise<number> {
  if (!brokerInvestments || brokerInvestments.length === 0 || !db) {
    return 0;
  }

  const holdingApps = applications.filter(
    (a) => a.status === 'Holding' && a.id,
  );
  if (holdingApps.length === 0) {
    return 0;
  }

  let updatedCount = 0;
  const now = new Date().toISOString();

  for (const app of holdingApps) {
    const matchedIpo = ipos.find((i) => i.id === app.ipo_id);
    const brokerInv = findMatchingBrokerInvestment(
      app,
      matchedIpo,
      brokerInvestments,
    );

    if (!brokerInv) continue;

    const isSoldOnBroker =
      (brokerInv.status === 'FULLY_SOLD' ||
        (brokerInv.totalSoldQuantity > 0 &&
          brokerInv.remainingHoldingQuantity === 0)) &&
      typeof brokerInv.weightedSellPrice === 'number' &&
      brokerInv.weightedSellPrice > 0;

    let effectiveBroker: string | null = null;
    const allBrokerHoldings = [
      ...(brokerInv.brokerHoldings || []),
      ...(brokerInv.sellTrades || []),
    ];
    if (allBrokerHoldings.length > 0) {
      const brokerNames = Array.from(
        new Set(allBrokerHoldings.map((b: any) => b.broker).filter(Boolean)),
      ).join(', ');
      if (brokerNames) {
        effectiveBroker = brokerNames;
      }
    }

    if (isSoldOnBroker) {
      // Automatic sale detection: Holding -> Sold with actual executed sell price
      const executedSellPrice = brokerInv.weightedSellPrice!;
      try {
        await db.runAsync(
          "UPDATE ipo_applications SET status = 'Sold', sell_price = ?, user_broker = COALESCE(?, user_broker), updated_at = ? WHERE id = ? AND status = 'Holding' AND deleted_at IS NULL",
          [executedSellPrice, effectiveBroker, now, app.id!],
        );
        updatedCount++;
      } catch {
        // Error on single row should not crash the sync
      }
    } else if (
      typeof brokerInv.currentHoldingPrice === 'number' &&
      brokerInv.currentHoldingPrice > 0
    ) {
      const newLtp = brokerInv.currentHoldingPrice;
      // Only update if sell_price is different
      if (app.sell_price !== newLtp) {
        try {
          await db.runAsync(
            "UPDATE ipo_applications SET sell_price = ?, user_broker = COALESCE(?, user_broker), updated_at = ? WHERE id = ? AND status = 'Holding' AND deleted_at IS NULL",
            [newLtp, effectiveBroker, now, app.id!],
          );
          updatedCount++;
        } catch {
          // Error on single row should not crash the sync
        }
      }
    }
  }

  if (updatedCount > 0 && onUpdated) {
    try {
      await onUpdated();
    } catch {}
  }

  return updatedCount;
}
