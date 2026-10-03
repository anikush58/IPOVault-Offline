import { UserPortfolioIpoSummary } from '@/services/broker/BrokerApiService';

/**
 * Resolves the authoritative canonical user ID for broker API operations following the hierarchy:
 * 1. Authenticated user ID (from Firebase Auth / Supabase Auth context / session)
 * 2. Authenticated owner_id present on local database user records (from cloud backup or previous session)
 * 3. Returns null if no authenticated user identity exists (never returns dummy 'default-user' or random local SQLite IDs).
 */
export function resolveCanonicalBrokerUserId(
  authUser?: { id?: string; uid?: string } | null,
  users?: Array<{ owner_id?: string; id?: string }> | null,
): string | null {
  const authUid = authUser?.uid || authUser?.id;
  if (authUid && typeof authUid === 'string' && authUid.trim()) {
    return authUid.trim();
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
 * Extracts authoritative LTP from a UserPortfolioIpoSummary record.
 * If targetAccountId is specified, prioritizes the quote from that exact linked broker account holding.
 * Falls back to general currentHoldingPrice or any underlying brokerHoldings lastPrice.
 */
export function extractBrokerLtp(
  inv: UserPortfolioIpoSummary | null | undefined,
  targetAccountId?: string | null,
): number | null {
  if (!inv) return null;

  // 1. Check specific linked broker account holding attribution if requested
  if (targetAccountId && Array.isArray(inv.brokerHoldings) && inv.brokerHoldings.length > 0) {
    const specificHolding = inv.brokerHoldings.find(
      (h) => h.brokerAccountId === targetAccountId,
    );
    if (specificHolding) {
      const p =
        (specificHolding as any).lastPrice ??
        (specificHolding as any).last_price ??
        (specificHolding as any).ltp ??
        (specificHolding as any).currentPrice;
      if (typeof p === 'number' && p > 0) {
        return p;
      }
    }
  }

  // 2. Check general currentHoldingPrice
  if (typeof inv.currentHoldingPrice === 'number' && inv.currentHoldingPrice > 0) {
    return inv.currentHoldingPrice;
  }

  // 3. Fallback: Check any holding attribution
  if (Array.isArray(inv.brokerHoldings) && inv.brokerHoldings.length > 0) {
    for (const h of inv.brokerHoldings) {
      const p =
        (h as any).lastPrice ??
        (h as any).last_price ??
        (h as any).ltp ??
        (h as any).currentPrice;
      if (typeof p === 'number' && p > 0) {
        return p;
      }
    }
  }
  return null;
}

/**
 * Returns ONLY the current broker LTP for a Holding application if available and > 0.
 * Respects application-level brokerAccountId linkage where specified.
 * Never alters application quantity or buy price.
 */
export function getBrokerLtpForApplication(
  app: {
    ipo_name?: string;
    ipo_id?: string;
    sell_price?: number | null;
    buy_price?: number;
    broker_account_id?: string | null;
    brokerAccountId?: string | null;
  },
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
  const targetAccountId = app.broker_account_id || app.brokerAccountId;
  return extractBrokerLtp(match, targetAccountId);
}

/**
 * Resolves the authoritative current price / LTP for a Holding application following the strict priority:
 * 1. Matching connected broker LTP (> 0) (e.g. Zerodha LTP from linked account or market match)
 * 2. Existing stored/manual current price (> 0) as fallback
 * 3. Buy price as final fallback
 */
export function resolveEffectiveHoldingPrice(
  app: {
    ipo_name?: string;
    ipo_id?: string;
    sell_price?: number | null;
    buy_price: number;
    broker_account_id?: string | null;
    brokerAccountId?: string | null;
  },
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
  // Priority 1: Authoritative live Zerodha / broker LTP (> 0)
  const brokerLtp = getBrokerLtpForApplication(app, matchedIpo, brokerInvestments);
  if (brokerLtp != null && brokerLtp > 0) {
    return brokerLtp;
  }
  // Priority 2: Stored / manual SQLite current price fallback (> 0)
  if (app.sell_price != null && app.sell_price > 0) {
    return app.sell_price;
  }
  // Priority 3: Buy / allotment price final fallback
  return app.buy_price || 0;
}

/**
 * Enriches a list of applications with broker data:
 * - Holding applications get authoritative broker LTP as current holding price (Priority 1: Broker LTP > Priority 2: Stored Current Price > Priority 3: Buy Price).
 * - Family Account Isolation: If an application is explicitly linked to a brokerAccountId, check sell trades only for that exact linked account.
 * - Automatic Holding -> Sold transition ONLY occurs when an executed sell trade is verified on the application's explicitly linked broker account.
 * - Applications with NO linked brokerAccountId are NEVER automatically transitioned to Sold.
 * - Sold applications preserve actual executed sell_price (never market LTP).
 * - Existing user_broker attribution is strictly preserved and never overwritten by connected broker names.
 * - Quantity, shares_count, and buy_price are NEVER modified from broker.
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
    broker_account_id?: string | null;
    brokerAccountId?: string | null;
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
  return applications.map((app) => {
    const matchedIpo = ipos.find(
      (i) =>
        i.id === app.ipo_id ||
        (i.backend_ipo_id && i.backend_ipo_id === app.ipo_id) ||
        (app.ipo_name &&
          (i.ipo_name === app.ipo_name || i.company_name === app.ipo_name)),
    );
    const brokerInv = findMatchingBrokerInvestment(
      app,
      matchedIpo,
      brokerInvestments,
    );

    let effectiveStatus = app.status;
    let effectiveSellPrice = app.sell_price;
    // Strictly preserve existing user_broker if already set; only fallback to brokerNames if user_broker is null/empty
    let effectiveBroker = app.user_broker;
    const targetAccountId = app.broker_account_id || app.brokerAccountId || null;

    if (brokerInv) {
      if (!effectiveBroker) {
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
      }
      if (app.status === 'Holding') {
        let isSoldOnLinkedAccount = false;
        let executedAccountSellPrice: number | null = null;

        // Family-Account Isolation: Only check sale trades if the application is explicitly linked to a brokerAccountId
        if (targetAccountId) {
          const accountTrades = (brokerInv.sellTrades || []).filter(
            (t) =>
              t.brokerAccountId === targetAccountId &&
              typeof t.price === 'number' &&
              t.price > 0,
          );
          const accountHolding = (brokerInv.brokerHoldings || []).find(
            (h) => h.brokerAccountId === targetAccountId,
          );

          if (
            accountTrades.length > 0 &&
            (!accountHolding || (accountHolding.quantity ?? 0) === 0)
          ) {
            isSoldOnLinkedAccount = true;
            const totalQty = accountTrades.reduce(
              (sum, t) => sum + (t.quantity || 1),
              0,
            );
            const totalVal = accountTrades.reduce(
              (sum, t) => sum + t.price * (t.quantity || 1),
              0,
            );
            executedAccountSellPrice =
              totalQty > 0
                ? Number((totalVal / totalQty).toFixed(2))
                : accountTrades[0].price;
          }
        }

        if (isSoldOnLinkedAccount && executedAccountSellPrice != null) {
          // Automatic sale detection: Transition Holding -> Sold ONLY for this linked broker account
          effectiveStatus = 'Sold';
          effectiveSellPrice = executedAccountSellPrice;
        } else {
          // Resolve live LTP (Priority 1: Broker LTP > Priority 2: Stored current price > Priority 3: Buy price)
          const brokerLtp = extractBrokerLtp(brokerInv, targetAccountId);
          if (brokerLtp != null && brokerLtp > 0) {
            effectiveSellPrice = brokerLtp;
          } else if (app.sell_price != null && app.sell_price > 0) {
            effectiveSellPrice = app.sell_price;
          } else {
            effectiveSellPrice = app.buy_price || 0;
          }
        }
      } else if (app.status === 'Sold') {
        // For Sold applications: check executed trades from linked account or preserve existing executed sell price
        if (targetAccountId) {
          const accountTrades = (brokerInv.sellTrades || []).filter(
            (t) =>
              t.brokerAccountId === targetAccountId &&
              typeof t.price === 'number' &&
              t.price > 0,
          );
          if (accountTrades.length > 0) {
            const totalQty = accountTrades.reduce(
              (sum, t) => sum + (t.quantity || 1),
              0,
            );
            const totalVal = accountTrades.reduce(
              (sum, t) => sum + t.price * (t.quantity || 1),
              0,
            );
            effectiveSellPrice =
              totalQty > 0
                ? Number((totalVal / totalQty).toFixed(2))
                : accountTrades[0].price;
          } else if (app.sell_price != null && app.sell_price > 0) {
            effectiveSellPrice = app.sell_price;
          }
        } else if (app.sell_price != null && app.sell_price > 0) {
          effectiveSellPrice = app.sell_price;
        } else if (
          typeof brokerInv.weightedSellPrice === 'number' &&
          brokerInv.weightedSellPrice > 0
        ) {
          effectiveSellPrice = brokerInv.weightedSellPrice;
        }
        // Priority 3: Never use current broker LTP for Sold
      }
    } else {
      // When no broker match exists:
      if (app.status === 'Holding') {
        if (app.sell_price != null && app.sell_price > 0) {
          effectiveSellPrice = app.sell_price;
        } else {
          effectiveSellPrice = app.buy_price || 0;
        }
      }
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
 * Persists auto-detected broker sales into SQLite:
 * 1. For 'Holding' applications explicitly linked to a brokerAccountId:
 *    - If fully sold on that exact linked broker account: updates status -> 'Sold' with actual executed sell_price.
 * 2. Never modifies:
 *    - Applications without a linked brokerAccountId (no auto-sell)
 *    - Applications whose linked broker account still holds the stock
 *    - Stored SQLite sell_price for Holding applications (preserves broker LTP purely as runtime data)
 *    - Already 'Sold' applications (executed sale prices are preserved)
 *    - user_broker attribution
 *    - buy_price
 *    - quantity / shares_count
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
    broker_account_id?: string | null;
    brokerAccountId?: string | null;
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
    const targetAccountId = app.broker_account_id || app.brokerAccountId;
    // Only process automatic sale if explicitly linked to a brokerAccountId
    if (!targetAccountId) continue;

    const matchedIpo = ipos.find((i) => i.id === app.ipo_id);
    const brokerInv = findMatchingBrokerInvestment(
      app,
      matchedIpo,
      brokerInvestments,
    );

    if (!brokerInv) continue;

    const accountTrades = (brokerInv.sellTrades || []).filter(
      (t) =>
        t.brokerAccountId === targetAccountId &&
        typeof t.price === 'number' &&
        t.price > 0,
    );
    const accountHolding = (brokerInv.brokerHoldings || []).find(
      (h) => h.brokerAccountId === targetAccountId,
    );

    const isFullySoldOnAccount =
      accountTrades.length > 0 &&
      (!accountHolding || (accountHolding.quantity ?? 0) === 0);

    if (isFullySoldOnAccount) {
      const totalQty = accountTrades.reduce(
        (sum, t) => sum + (t.quantity || 1),
        0,
      );
      const totalVal = accountTrades.reduce(
        (sum, t) => sum + t.price * (t.quantity || 1),
        0,
      );
      const executedSellPrice =
        totalQty > 0
          ? Number((totalVal / totalQty).toFixed(2))
          : accountTrades[0].price;

      try {
        await db.runAsync(
          "UPDATE ipo_applications SET status = 'Sold', sell_price = ?, updated_at = ? WHERE id = ? AND status = 'Holding' AND deleted_at IS NULL",
          [executedSellPrice, now, app.id!],
        );
        updatedCount++;
      } catch {
        // Error on single row should not crash the sync
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
