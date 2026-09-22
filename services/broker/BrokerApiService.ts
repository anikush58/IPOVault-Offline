import { ApiClient } from '../api/ApiClient';
import { API_BASE_URL } from '@/constants/apiConfig';

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
   * Fetches all broker accounts registered for the given user ID.
   */
  public async getAccounts(userId: string): Promise<BrokerAccountItem[]> {
    if (!userId) return [];
    try {
      const response = await this.apiClient.get<BrokerAccountItem[]>(
        '/api/v1/broker-accounts',
        undefined,
        { 'x-user-id': userId },
      );
      const accounts = extractResponseData<BrokerAccountItem[]>(response);
      return Array.isArray(accounts) ? accounts : [];
    } catch (err) {
      console.warn('[BrokerApiService] getAccounts failed:', err);
      return [];
    }
  }

  /**
   * Creates or retrieves a broker account for a profile.
   */
  public async createAccount(
    userId: string,
    params: {
      profileId: string;
      broker: string;
      accountName?: string | null;
      clientId?: string | null;
    },
  ): Promise<BrokerAccountItem> {
    const response = await this.apiClient.post<BrokerAccountItem>(
      '/api/v1/broker-accounts',
      {
        profileId: params.profileId,
        broker: params.broker,
        accountName: params.accountName || undefined,
        clientId: params.clientId || undefined,
      },
      { 'x-user-id': userId },
    );
    return extractResponseData<BrokerAccountItem>(response);
  }

  /**
   * Generates broker OAuth authorization URL.
   */
  public async getAuthorizationUrl(
    userId: string,
    accountId: string,
    brokerSlug: string,
  ): Promise<{ authorizationUrl: string }> {
    const response = await this.apiClient.get<{ authorizationUrl: string }>(
      `/api/v1/broker-accounts/${accountId}/connect/${brokerSlug}`,
      undefined,
      { 'x-user-id': userId },
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
    userId: string,
    accountId: string,
    brokerSlug: string,
    params: {
      code?: string;
      tokenId?: string;
      authCode?: string;
      requestToken?: string;
      state?: string;
    },
  ): Promise<BrokerAccountConnection> {
    const queryParams: Record<string, string> = {};
    if (params.code) queryParams.code = params.code;
    if (params.tokenId) queryParams.tokenId = params.tokenId;
    if (params.authCode) queryParams.auth_code = params.authCode;
    if (params.requestToken) queryParams.request_token = params.requestToken;
    if (params.state) queryParams.state = params.state;

    const response = await this.apiClient.get<BrokerAccountConnection>(
      `/api/v1/broker-accounts/${accountId}/connect/${brokerSlug}/callback`,
      queryParams,
      { 'x-user-id': userId },
    );
    return extractResponseData<BrokerAccountConnection>(response);
  }

  /**
   * Soft disconnects the broker account session.
   */
  public async disconnectAccount(
    userId: string,
    accountId: string,
  ): Promise<BrokerAccountItem> {
    const response = await this.apiClient.post<BrokerAccountItem>(
      `/api/v1/broker-accounts/${accountId}/disconnect`,
      {},
      { 'x-user-id': userId },
    );
    return extractResponseData<BrokerAccountItem>(response);
  }

  /**
   * Initiates a manual post-listing sync for the broker account.
   */
  public async syncAccount(
    userId: string,
    accountId: string,
  ): Promise<{
    brokerAccountId: string;
    syncTimestamp: string;
    syncedInvestmentsCount: number;
  }> {
    const response = await this.apiClient.post<{
      brokerAccountId: string;
      syncTimestamp: string;
      syncedInvestmentsCount: number;
    }>(
      `/api/v1/broker-accounts/${accountId}/sync`,
      {},
      { 'x-user-id': userId },
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
    userId: string,
    accountId: string,
    ipoId: string,
  ): Promise<DerivedInvestmentSummary | null> {
    try {
      const response = await this.apiClient.get<DerivedInvestmentSummary>(
        `/api/v1/broker-accounts/${accountId}/investments/${ipoId}`,
        undefined,
        { 'x-user-id': userId },
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
    userId: string,
    accountId: string,
    ipoId: string,
  ): Promise<DerivedInvestmentSummary | null> {
    try {
      const response = await this.apiClient.post<DerivedInvestmentSummary>(
        `/api/v1/broker-accounts/${accountId}/investments/${ipoId}/sync`,
        {},
        { 'x-user-id': userId },
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
    userId: string,
    accountId: string,
  ): Promise<any[]> {
    try {
      const response = await this.apiClient.get<any[]>(
        `/api/v1/broker-accounts/${accountId}/holdings`,
        undefined,
        { 'x-user-id': userId },
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
