import { ApiClient } from '../api/ApiClient';
import { API_BASE_URL } from '../../constants/apiConfig';
import { getAuthHeaders } from '../api/authHeaders';

declare const __DEV__: boolean;

export interface BrokerAccountConnection {
  id: string;
  status: 'PENDING' | 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED';
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

export interface BrokerAccountItem {
  id: string;
  profileId: string;
  broker: 'UPSTOX' | 'DHAN' | 'FYERS' | 'ZERODHA' | 'GROWW' | 'MILLIONS' | string;
  accountName: string | null;
  clientId: string | null;
  isActive: boolean;
  connection: BrokerAccountConnection | null;
  createdAt: string;
  updatedAt: string;
}

export interface DerivedInvestmentHolding {
  lastPrice: number | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  asOf: string | null;
}

export interface DerivedInvestmentSummary {
  brokerAccountId: string;
  ipoId: string;
  isin: string;
  exchange: 'NSE' | 'BSE' | string;
  symbol: string | null;
  allottedQuantity: number;
  allotmentPrice: number;
  allotmentDate: string | null;
  totalSoldQuantity: number;
  remainingQuantity: number;
  currentHoldingQuantity: number;
  status: 'HOLDING' | 'PARTIALLY_SOLD' | 'FULLY_SOLD';
  sellTrades: Array<{
    brokerTradeId: string;
    quantity: number;
    price: number;
    tradedAt: string;
  }>;
  holding: DerivedInvestmentHolding | null;
  ipoName?: string;
}

export interface PortfolioHoldingAttribution {
  brokerAccountId: string;
  broker: string;
  quantity: number;
  averagePrice: number | null;
  lastPrice: number | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  asOf: string | null;
}

export interface PortfolioSellTradeAttribution {
  brokerAccountId: string;
  broker: string;
  brokerTradeId: string;
  quantity: number;
  price: number;
  tradedAt: string;
}

export interface UserPortfolioIpoSummary {
  ipoId: string;
  isin: string;
  symbol: string | null;
  companyName: string | null;
  logoUrl: string | null;
  exchange: string;
  status: 'HOLDING' | 'PARTIALLY_SOLD' | 'FULLY_SOLD';
  allottedQuantity: number;
  allotmentPrice: number;
  allotmentDate: string | null;
  totalSoldQuantity: number;
  weightedSellPrice: number | null;
  totalSellValue: number;
  realizedPnl: number;
  remainingHoldingQuantity: number;
  currentHoldingPrice: number;
  priceSource: 'BROKER_HOLDING' | 'IPO_ALLOTMENT_FALLBACK';
  totalHoldingValue: number;
  unrealizedPnl: number;
  totalPnl: number;
  brokerHoldings: PortfolioHoldingAttribution[];
  sellTrades: PortfolioSellTradeAttribution[];
}

export interface UserPortfolioSummaryResponse {
  summary: {
    totalInvested: number;
    totalCurrentHoldingValue: number;
    totalRealizedSellValue: number;
    totalRealizedPnl: number;
    totalUnrealizedPnl: number;
    totalNetPnl: number;
    activeHoldingsCount: number;
    soldHoldingsCount: number;
  };
  investments: UserPortfolioIpoSummary[];
}

export interface MarketQuoteItem {
  symbol?: string;
  isin?: string;
  exchange?: string;
  ltp: number;
  closePrice?: number | null;
  change?: number | null;
  changePercent?: number | null;
  timestamp?: string | null;
  error?: string | null;
}

export type MarketQuotesMap = Record<string, MarketQuoteItem>;

export interface CanonicalBrokerInfo {
  brokerType: 'UPSTOX' | 'DHAN' | 'FYERS' | 'ZERODHA' | 'GROWW' | 'MILLIONS';
  slug: 'upstox' | 'dhan' | 'fyers' | 'zerodha' | 'groww' | 'millions';
  displayName: string;
}

/**
 * Normalizes any user-entered broker string into a supported canonical BrokerType,
 * route slug, and human-readable display name.
 */
export function getCanonicalBroker(rawBroker?: string | null): CanonicalBrokerInfo | null {
  if (!rawBroker) return null;
  const lower = rawBroker.trim().toLowerCase();
  if (lower.includes('upstox')) {
    return { brokerType: 'UPSTOX', slug: 'upstox', displayName: 'Upstox' };
  }
  if (lower.includes('million')) {
    return { brokerType: 'MILLIONS', slug: 'millions', displayName: 'Millions by Dhan' };
  }
  if (lower.includes('dhan')) {
    return { brokerType: 'DHAN', slug: 'dhan', displayName: 'Dhan' };
  }
  if (lower.includes('fyer')) {
    return { brokerType: 'FYERS', slug: 'fyers', displayName: 'FYERS' };
  }
  if (lower.includes('zerodha') || lower.includes('kite')) {
    return { brokerType: 'ZERODHA', slug: 'zerodha', displayName: 'Zerodha Kite' };
  }
  if (lower.includes('groww')) {
    return { brokerType: 'GROWW', slug: 'groww', displayName: 'Groww' };
  }
  return null;
}

/**
 * Parses query parameters from any redirect URL or deep link.
 */
export function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!url) return params;
  try {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return params;
    const queryString = url.slice(queryIndex + 1).split('#')[0];
    const pairs = queryString.split('&');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    }
  } catch (err) {
    console.warn('[parseQueryParams] Failed to parse URL:', err);
  }
  return params;
}

function extractResponseData<T>(response: any): T {
  if (response === null || response === undefined) {
    throw new Error('Empty response from broker service');
  }
  if (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    response.data !== undefined
  ) {
    if (response.data === null && response.success === false) {
      throw new Error(response.message || 'Operation failed');
    }
    return response.data as T;
  }
  return response as T;
}

export type MarketQuoteFailureReason =
  | 'AUTH_REQUIRED'
  | 'NO_ELIGIBLE_BROKER'
  | 'NO_VALID_INSTRUMENTS'
  | 'PROVIDER_EMPTY'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR';

export interface MarketQuotesDetailedResult {
  quotes: MarketQuotesMap;
  success: boolean;
  failureReason?: MarketQuoteFailureReason;
  errorMessage?: string;
  statusCode?: number;
  totalHoldingsCount?: number;
  resolvedQuotesCount?: number;
  unresolvedCount?: number;
}

export const QUOTE_CAPABLE_BROKERS = new Set(['UPSTOX', 'DHAN', 'FYERS', 'GROWW']);

export function findQuoteEligibleAccount(accounts: BrokerAccountItem[]): BrokerAccountItem | null {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  return (
    accounts.find(
      (acc) =>
        acc.connection?.status === 'CONNECTED' &&
        acc.isActive &&
        QUOTE_CAPABLE_BROKERS.has((acc.broker || '').toUpperCase()),
    ) || null
  );
}

export class BrokerApiService {
  private apiClient: ApiClient;

  constructor(baseUrl?: string) {
    this.apiClient = new ApiClient({
      baseUrl: baseUrl || API_BASE_URL,
      timeoutMs: 15000,
    });
  }

  /**
   * Fetches all broker accounts registered for the authenticated user.
   */
  public async getAccounts(_userId?: string | null): Promise<BrokerAccountItem[]> {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return [];
      const response = await this.apiClient.get<BrokerAccountItem[]>(
        '/api/v1/broker-accounts',
        undefined,
        authHeaders,
      );
      const accounts = extractResponseData<BrokerAccountItem[]>(response);
      return Array.isArray(accounts) ? accounts : [];
    } catch (err) {
      console.warn('[BrokerApiService] getAccounts failed:', err);
      return [];
    }
  }

  /**
   * Fetches a specific broker account by ID for the authenticated user.
   */
  public async getAccount(
    _userId: string | null | undefined,
    accountId: string,
  ): Promise<BrokerAccountItem | null> {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization || !accountId) return null;
      const response = await this.apiClient.get<BrokerAccountItem>(
        `/api/v1/broker-accounts/${encodeURIComponent(accountId.trim())}`,
        undefined,
        authHeaders,
      );
      return extractResponseData<BrokerAccountItem>(response);
    } catch (err) {
      console.warn(`[BrokerApiService] getAccount(${accountId}) failed:`, err);
      return null;
    }
  }

  /**
   * Creates a broker account for a profile.
   */
  public async createAccount(
    _userId: string | null | undefined,
    params: {
      profileId: string;
      broker: string;
      accountName?: string | null;
      clientId?: string | null;
    },
  ): Promise<BrokerAccountItem> {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      throw new Error('Authentication required to create broker account');
    }
    const response = await this.apiClient.post<BrokerAccountItem>(
      '/api/v1/broker-accounts',
      {
        profileId: params.profileId,
        broker: params.broker,
        accountName: params.accountName || undefined,
        clientId: params.clientId || undefined,
      },
      authHeaders,
    );
    return extractResponseData<BrokerAccountItem>(response);
  }

  /**
   * Generates broker OAuth authorization URL.
   */
  public async getAuthorizationUrl(
    _userId: string | null | undefined,
    accountId: string,
    brokerSlug: string,
    redirectUri?: string,
  ): Promise<{ authorizationUrl: string }> {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      throw new Error('Authentication required for broker authorization');
    }
    const queryParams: Record<string, string> = {};
    if (redirectUri) queryParams.redirectUri = redirectUri;

    const response = await this.apiClient.get<{ authorizationUrl: string }>(
      `/api/v1/broker-accounts/${accountId}/connect/${brokerSlug}`,
      queryParams,
      authHeaders,
    );
    const data = extractResponseData<{ authorizationUrl: string }>(response);
    if (!data?.authorizationUrl) {
      throw new Error('No authorization URL returned by broker service');
    }
    return data;
  }

  /**
   * Completes OAuth callback by submitting authorization code/token and state to backend.
   */
  public async completeOAuthCallback(
    _userId: string | null | undefined,
    accountId: string,
    brokerSlug: string,
    params: {
      code?: string;
      tokenId?: string;
      authCode?: string;
      requestToken?: string;
      state?: string;
      redirectUri?: string;
    },
  ): Promise<BrokerAccountConnection> {
    const authHeaders = await getAuthHeaders();
    const queryParams: Record<string, string> = {};
    if (params.code) queryParams.code = params.code;
    if (params.tokenId) queryParams.tokenId = params.tokenId;
    if (params.authCode) queryParams.auth_code = params.authCode;
    if (params.requestToken) queryParams.request_token = params.requestToken;
    if (params.state) queryParams.state = params.state;
    if (params.redirectUri) queryParams.redirectUri = params.redirectUri;

    const response = await this.apiClient.get<BrokerAccountConnection>(
      `/api/v1/broker-accounts/${accountId}/connect/${brokerSlug}/callback`,
      queryParams,
      authHeaders,
    );
    return extractResponseData<BrokerAccountConnection>(response);
  }

  /**
   * Soft disconnects the broker account session.
   */
  public async disconnectAccount(
    _userId: string | null | undefined,
    accountId: string,
  ): Promise<BrokerAccountItem> {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      throw new Error('Authentication required to disconnect account');
    }
    const response = await this.apiClient.post<BrokerAccountItem>(
      `/api/v1/broker-accounts/${accountId}/disconnect`,
      {},
      authHeaders,
    );
    return extractResponseData<BrokerAccountItem>(response);
  }

  /**
   * Initiates a manual post-listing sync for the broker account.
   */
  public async syncAccount(
    _userId: string | null | undefined,
    accountId: string,
  ): Promise<{
    brokerAccountId: string;
    syncTimestamp: string;
    syncedInvestmentsCount: number;
  }> {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      throw new Error('Authentication required to sync account');
    }
    const response = await this.apiClient.post<{
      brokerAccountId: string;
      syncTimestamp: string;
      syncedInvestmentsCount: number;
    }>(
      `/api/v1/broker-accounts/${accountId}/sync`,
      {},
      authHeaders,
    );
    return extractResponseData<{
      brokerAccountId: string;
      syncTimestamp: string;
      syncedInvestmentsCount: number;
    }>(response);
  }

  /**
   * Retrieves derived IPO investment summary for a connected broker account and IPO.
   */
  public async getInvestmentSummary(
    _userId: string | null | undefined,
    accountId: string,
    ipoId: string,
  ): Promise<DerivedInvestmentSummary | null> {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return null;
      const response = await this.apiClient.get<DerivedInvestmentSummary>(
        `/api/v1/broker-accounts/${accountId}/investments/${ipoId}`,
        undefined,
        authHeaders,
      );
      return extractResponseData<DerivedInvestmentSummary>(response) || null;
    } catch (err) {
      console.warn(
        `[BrokerApiService] getInvestmentSummary failed for account ${accountId}, ipo ${ipoId}:`,
        err,
      );
      return null;
    }
  }

  /**
   * Syncs and updates derived IPO investment summary for a connected broker account and IPO.
   */
  public async syncInvestment(
    _userId: string | null | undefined,
    accountId: string,
    ipoId: string,
  ): Promise<DerivedInvestmentSummary | null> {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return null;
      const response = await this.apiClient.post<DerivedInvestmentSummary>(
        `/api/v1/broker-accounts/${accountId}/investments/${ipoId}/sync`,
        {},
        authHeaders,
      );
      return extractResponseData<DerivedInvestmentSummary>(response) || null;
    } catch (err) {
      console.warn(
        `[BrokerApiService] syncInvestment failed for account ${accountId}, ipo ${ipoId}:`,
        err,
      );
      return null;
    }
  }

  /**
   * Retrieves live normalized holdings for a connected broker account.
   */
  public async getHoldings(
    _userId: string | null | undefined,
    accountId: string,
  ): Promise<any[]> {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return [];
      const response = await this.apiClient.get<any[]>(
        `/api/v1/broker-accounts/${accountId}/holdings`,
        undefined,
        authHeaders,
      );
      const holdings = extractResponseData<any[]>(response);
      return Array.isArray(holdings) ? holdings : [];
    } catch (err) {
      console.warn(
        `[BrokerApiService] getHoldings failed for account ${accountId}:`,
        err,
      );
      return [];
    }
  }

  /**
   * Retrieves aggregated user portfolio investments and metrics across all connected brokers.
   * Matches holdings and trades primarily by ISIN.
   * Uses broker trade record for historical executed sell price and quantity.
   */
  public async getUserPortfolio(
    _userId?: string | null,
  ): Promise<UserPortfolioSummaryResponse | null> {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return null;
      const response = await this.apiClient.get<UserPortfolioSummaryResponse>(
        '/api/v1/broker-accounts/portfolio',
        undefined,
        authHeaders,
      );
      return extractResponseData<UserPortfolioSummaryResponse>(response) || null;
    } catch (err) {
      console.warn('[BrokerApiService] getUserPortfolio failed:', err);
      return null;
    }
  }

  /**
   * Retrieves real-time market quotes (LTP) in bulk for arbitrary instruments.
   * LTP is purely market data, separate from ownership holdings or trades.
   * Uses any available connected broker's market-quote capability.
   */
  /**
   * Retrieves real-time market quotes (LTP) with detailed error diagnostics.
   * Distinguishes:
   * - AUTH_REQUIRED (unauthenticated or expired session)
   * - NO_ELIGIBLE_BROKER (broker does not support standalone quotes, e.g. Zerodha)
   * - NO_VALID_INSTRUMENTS (missing ISIN or Symbol)
   * - PROVIDER_EMPTY (provider returned no quotes, market closed)
   * - RATE_LIMITED (429 HTTP status)
   * - NETWORK_ERROR (fetch failed or aborted)
   * - SERVER_ERROR (500 HTTP status)
   */
  public async getMarketQuotesDetailed(
    _userId: string | null | undefined,
    instruments: Array<{ symbol?: string | null; isin?: string | null; exchange?: string | null }>,
    brokerAccountId?: string | null,
    connectedAccounts?: BrokerAccountItem[] | null,
  ): Promise<MarketQuotesDetailedResult> {
    if (!instruments || instruments.length === 0) {
      return {
        success: false,
        quotes: {},
        failureReason: 'NO_VALID_INSTRUMENTS',
        errorMessage: 'No instruments provided to quote.',
      };
    }

    const validInstruments = instruments.filter(
      (i) => (i.symbol && i.symbol.trim().length > 0) || (i.isin && i.isin.trim().length > 0),
    );
    if (validInstruments.length === 0) {
      return {
        success: false,
        quotes: {},
        failureReason: 'NO_VALID_INSTRUMENTS',
        errorMessage: 'No trading symbols or ISIN identifiers found for active holdings.',
      };
    }

    if (connectedAccounts && connectedAccounts.length > 0) {
      const specifiedAccount = brokerAccountId
        ? connectedAccounts.find((a) => a.id === brokerAccountId)
        : null;

      if (specifiedAccount && !QUOTE_CAPABLE_BROKERS.has((specifiedAccount.broker || '').toUpperCase())) {
        const eligibleFallback = findQuoteEligibleAccount(connectedAccounts);
        if (eligibleFallback) {
          brokerAccountId = eligibleFallback.id;
        } else {
          return {
            success: false,
            quotes: {},
            failureReason: 'NO_ELIGIBLE_BROKER',
            errorMessage: `Connected broker (${specifiedAccount.broker}) does not support live market quote feeds. Holding prices are updated via broker portfolio sync.`,
          };
        }
      } else if (!brokerAccountId) {
        const eligible = findQuoteEligibleAccount(connectedAccounts);
        if (!eligible) {
          const brokerNames = connectedAccounts.map((a) => a.broker).join(', ');
          return {
            success: false,
            quotes: {},
            failureReason: 'NO_ELIGIBLE_BROKER',
            errorMessage: `Connected broker (${brokerNames}) does not support live market quote feeds. Holding prices are updated via broker portfolio sync.`,
          };
        } else {
          brokerAccountId = eligible.id;
        }
      }
    }

    const activeAccount = brokerAccountId
      ? (connectedAccounts || []).find((a) => a.id === brokerAccountId)
      : findQuoteEligibleAccount(connectedAccounts || []);
    const isUpstox = (activeAccount?.broker || '').toUpperCase() === 'UPSTOX';

    // Upstox API v2 strictly requires instrument_key in the format EXCHANGE_SEGMENT|ISIN (e.g. NSE_EQ|INE848E01016).
    // If raw trading symbols (without ISIN) are sent, Upstox API returns 400 Bad Request: Invalid instrument key for the entire batch.
    // Exclude unresolved instruments from the batch quote request while proceeding with valid ones.
    const isinRegex = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
    const quoteInstruments = isUpstox
      ? validInstruments.filter((i) => Boolean(i.isin && isinRegex.test(i.isin.trim().toUpperCase())))
      : validInstruments;

    if (isUpstox && quoteInstruments.length === 0) {
      return {
        success: false,
        quotes: {},
        failureReason: 'NO_VALID_INSTRUMENTS',
        errorMessage: 'Upstox requires valid ISIN identifiers (e.g. INE...) to fetch market quotes. Please ensure IPO holdings have recognized ISINs.',
        totalHoldingsCount: validInstruments.length,
        resolvedQuotesCount: 0,
        unresolvedCount: validInstruments.length,
      };
    }

    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) {
        return {
          success: false,
          quotes: {},
          failureReason: 'AUTH_REQUIRED',
          errorMessage: 'Authentication required. Please sign in to fetch market quotes.',
          totalHoldingsCount: validInstruments.length,
          resolvedQuotesCount: 0,
          unresolvedCount: validInstruments.length,
        };
      }

      const symbols = quoteInstruments
        .map((i) => {
          let sym = i.symbol?.trim();
          if (!sym) return '';
          if (sym.includes(':')) return sym.toUpperCase();
          const ex = (i.exchange || 'NSE').trim().toUpperCase();
          return `${ex}:${sym.toUpperCase()}`;
        })
        .filter(Boolean)
        .join(',');

      const isins = quoteInstruments
        .map((i) => i.isin?.trim().toUpperCase())
        .filter(Boolean)
        .join(',');

      const queryParams: Record<string, string> = {};
      if (symbols) queryParams.symbols = symbols;
      if (isins) queryParams.isins = isins;

      const endpoint = brokerAccountId
        ? `/api/v1/broker-accounts/${brokerAccountId}/quotes`
        : '/api/v1/broker-accounts/quotes';

      const response = await this.apiClient.get<any>(
        endpoint,
        queryParams,
        authHeaders,
      );

      const data = extractResponseData<any>(response);
      const quotesMap = parseMarketQuotesData(data);
      const unresolvedCount = Math.max(0, validInstruments.length - quoteInstruments.length);

      if (Object.keys(quotesMap).length === 0) {
        return {
          success: true,
          quotes: {},
          failureReason: 'PROVIDER_EMPTY',
          errorMessage: 'Market quote provider returned no live prices for these symbols (market may be closed).',
          totalHoldingsCount: validInstruments.length,
          resolvedQuotesCount: 0,
          unresolvedCount: validInstruments.length,
        };
      }

      return {
        success: true,
        quotes: quotesMap,
        totalHoldingsCount: validInstruments.length,
        resolvedQuotesCount: quoteInstruments.length,
        unresolvedCount,
      };
    } catch (err: unknown) {
      const status = (err as any)?.status ?? (err as any)?.statusCode ?? 0;
      const msg = (err as any)?.message || String(err);
      const code = (err as any)?.code || '';
      const lowerMsg = msg.toLowerCase();

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[BrokerApiService] getMarketQuotesDetailed failed (${msg}) status=${status} code=${code}`);
      }

      // Check for auth / token expiration errors (including Upstox 401 rethrown by backend as 400 Bad Request)
      if (
        status === 401 ||
        status === 403 ||
        code === 'AUTH_REQUIRED' ||
        code === 'UNAUTHORIZED' ||
        lowerMsg.includes('401') ||
        lowerMsg.includes('unauthorized') ||
        lowerMsg.includes('token expired') ||
        lowerMsg.includes('token has expired') ||
        lowerMsg.includes('invalid token') ||
        lowerMsg.includes('access token is required')
      ) {
        return {
          success: false,
          quotes: {},
          failureReason: 'AUTH_REQUIRED',
          statusCode: 401,
          errorMessage: isUpstox
            ? 'Your Upstox session has expired. Please reconnect your Upstox account in Profile.'
            : 'Authentication expired. Please sign in again to fetch market quotes.',
        };
      }

      if (status === 429 || lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
        return {
          success: false,
          quotes: {},
          failureReason: 'RATE_LIMITED',
          statusCode: 429,
          errorMessage: 'Market quote request limit reached. Please wait a moment before trying again.',
        };
      }

      if (status === 400 && lowerMsg.includes('does not support market quotes')) {
        return {
          success: false,
          quotes: {},
          failureReason: 'NO_ELIGIBLE_BROKER',
          statusCode: 400,
          errorMessage: msg || 'Connected broker does not support live market quote feeds.',
        };
      }

      if (status === 400 && (lowerMsg.includes('invalid instrument key') || lowerMsg.includes('failed to find quote'))) {
        return {
          success: false,
          quotes: {},
          failureReason: 'NO_VALID_INSTRUMENTS',
          statusCode: 400,
          errorMessage: 'Upstox requires valid ISIN identifiers (e.g. INE...) to fetch live market quotes.',
        };
      }

      if (status === 0 || code === 'NETWORK_ERROR' || lowerMsg.includes('abort') || lowerMsg.includes('network')) {
        return {
          success: false,
          quotes: {},
          failureReason: 'NETWORK_ERROR',
          statusCode: 0,
          errorMessage: 'Network connection issue. Unable to reach market quote service.',
        };
      }

      if (status >= 500) {
        return {
          success: false,
          quotes: {},
          failureReason: 'SERVER_ERROR',
          statusCode: status,
          errorMessage: 'Market quote service temporarily unavailable. Please try again shortly.',
        };
      }

      return {
        success: false,
        quotes: {},
        failureReason: 'SERVER_ERROR',
        statusCode: status,
        errorMessage: msg || 'Failed to fetch market quotes.',
      };
    }
  }

  /**
   * Retrieves real-time market quotes (LTP) in bulk for arbitrary instruments.
   * LTP is purely market data, separate from ownership holdings or trades.
   * Uses any available connected broker's market-quote capability.
   */
  public async getMarketQuotes(
    userId: string | null | undefined,
    instruments: Array<{ symbol?: string | null; isin?: string | null; exchange?: string | null }>,
    brokerAccountId?: string | null,
  ): Promise<MarketQuotesMap> {
    const res = await this.getMarketQuotesDetailed(userId, instruments, brokerAccountId);
    return res.quotes || {};
  }
}

/**
 * Parses raw quote response (array or object map) into a normalized MarketQuotesMap.
 */
export function parseMarketQuotesData(data: any): MarketQuotesMap {
  const quotesMap: MarketQuotesMap = {};
  if (!data) return quotesMap;

  if (Array.isArray(data)) {
    for (const item of data) {
      const ltpVal = item.ltp ?? item.lastPrice ?? item.last_price ?? item.price;
      if (typeof ltpVal === 'number' && ltpVal > 0) {
        const quote: MarketQuoteItem = {
          symbol: item.symbol,
          isin: item.isin,
          exchange: item.exchange,
          ltp: ltpVal,
          closePrice: item.closePrice ?? item.close,
          change: item.change,
          changePercent: item.changePercent ?? item.change_percent,
          timestamp: item.timestamp ?? item.asOf,
        };
        if (item.isin) quotesMap[item.isin.toUpperCase()] = quote;
        if (item.symbol) quotesMap[item.symbol.toUpperCase()] = quote;
        if (item.symbol && item.exchange) {
          const exUpper = item.exchange.toUpperCase();
          const symUpper = item.symbol.toUpperCase();
          quotesMap[`${exUpper}:${symUpper}`] = quote;
          quotesMap[`${exUpper}_EQ|${symUpper}`] = quote;
          quotesMap[`${exUpper}_SM|${symUpper}`] = quote;
        }
      }
    }
  } else if (typeof data === 'object') {
    for (const [key, val] of Object.entries(data)) {
      const v = val as any;
      const ltpVal = typeof v === 'number' ? v : (v?.ltp ?? v?.lastPrice ?? v?.last_price ?? v?.price);
      if (typeof ltpVal === 'number' && ltpVal > 0) {
        const quote: MarketQuoteItem = {
          symbol: v?.symbol || key,
          isin: v?.isin,
          exchange: v?.exchange,
          ltp: ltpVal,
          closePrice: v?.closePrice ?? v?.close,
          change: v?.change,
          changePercent: v?.changePercent ?? v?.change_percent,
          timestamp: v?.timestamp ?? v?.asOf,
        };
        const upperKey = key.toUpperCase();
        quotesMap[upperKey] = quote;
        if (v?.isin) quotesMap[v.isin.toUpperCase()] = quote;
        if (v?.symbol) quotesMap[v.symbol.toUpperCase()] = quote;
        if (v?.exchange && v?.symbol) {
          const exUpper = v.exchange.toUpperCase();
          const symUpper = v.symbol.toUpperCase();
          quotesMap[`${exUpper}:${symUpper}`] = quote;
          quotesMap[`${exUpper}_EQ|${symUpper}`] = quote;
          quotesMap[`${exUpper}_SM|${symUpper}`] = quote;
        }
        if (upperKey.includes('|') || upperKey.includes(':')) {
          const symbolPart = upperKey.split(/[|:]/)[1];
          if (symbolPart) quotesMap[symbolPart] = quote;
        }
      }
    }
  }
  return quotesMap;
}

/**
 * Finds any available connected broker account that can provide market quotes.
 * Prioritizes quote-capable brokers (Upstox, Dhan, Fyers, Groww).
 */
export function findAvailableQuoteProvider(accounts: BrokerAccountItem[]): BrokerAccountItem | null {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const quoteCapable = findQuoteEligibleAccount(accounts);
  if (quoteCapable) return quoteCapable;
  return (
    accounts.find((acc) => acc.connection?.status === 'CONNECTED' && acc.isActive) ||
    null
  );
}

export interface DashboardIpoHoldingItem {
  ipoId: string;
  companyName: string;
  symbol: string;
  quantityHeld: number;
  currentPrice: number;
  currentHoldingValue: number;
  dayPnl: number;
  dayPnlPercent: number;
}

export const brokerApiService = new BrokerApiService();

