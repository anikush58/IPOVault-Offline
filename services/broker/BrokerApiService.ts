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
  public async getMarketQuotes(
    _userId: string | null | undefined,
    instruments: Array<{ symbol?: string | null; isin?: string | null; exchange?: string | null }>,
    brokerAccountId?: string | null,
  ): Promise<MarketQuotesMap> {
    if (!instruments || instruments.length === 0) return {};
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return {};

      const symbols = instruments
        .map((i) => {
          const sym = i.symbol?.trim();
          if (!sym) return '';
          const ex = (i.exchange || 'NSE').trim().toUpperCase();
          return sym.includes(':') ? sym : `${ex}:${sym}`;
        })
        .filter(Boolean)
        .join(',');

      const isins = instruments
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
      const quotesMap: MarketQuotesMap = {};

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
      } else if (data && typeof data === 'object') {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[BrokerApiService] getMarketQuotes failed (${msg}) -> preserving safe offline/stored LTP fallback`);
      }
      return {};
    }
  }
}

/**
 * Finds any available connected broker account that can provide market quotes.
 * LTP is market data, so ANY single connected broker account can provide quotes
 * for all family members' IPOVault holdings.
 */
export function findAvailableQuoteProvider(accounts: BrokerAccountItem[]): BrokerAccountItem | null {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
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

