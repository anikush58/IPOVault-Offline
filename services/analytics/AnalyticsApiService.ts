import { API_BASE_URL } from '@/constants/apiConfig';
import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';
import {
  AnalyticsFilter,
  AnalyticsSummaryResponseDto,
  DetailedAllotmentAnalyticsResponseDto,
  DetailedAnalyticsQualitySummaryResponseDto,
  DetailedIpoMarketAnalyticsResponseDto,
  DetailedIpoPerformanceAnalyticsResponseDto,
  DetailedSubscriptionDemandAnalyticsResponseDto,
  MetricContract,
} from '@/types/analytics';

export class AnalyticsApiService {
  private apiClient: ApiClient;

  constructor(baseUrl?: string) {
    this.apiClient = new ApiClient({
      baseUrl: baseUrl || API_BASE_URL,
      timeoutMs: 15000,
    });
  }

  public async getAnalyticsSummary(): Promise<AnalyticsSummaryResponseDto> {
    const res = await this.apiClient.get<AnalyticsSummaryResponseDto>(
      ENDPOINTS.ANALYTICS_SUMMARY,
    );
    if (!res.data) {
      throw new Error(res.error?.message || 'Failed to fetch analytics summary');
    }
    return res.data;
  }

  public async getMarketAnalytics(
    filter?: AnalyticsFilter,
  ): Promise<DetailedIpoMarketAnalyticsResponseDto> {
    const res = await this.apiClient.get<DetailedIpoMarketAnalyticsResponseDto>(
      ENDPOINTS.ANALYTICS_MARKET,
      filter as Record<string, string | number>,
    );
    if (!res.data) {
      throw new Error(res.error?.message || 'Failed to fetch market analytics');
    }
    return res.data;
  }

  public async getPerformanceAnalytics(
    filter?: AnalyticsFilter,
  ): Promise<DetailedIpoPerformanceAnalyticsResponseDto> {
    const res = await this.apiClient.get<DetailedIpoPerformanceAnalyticsResponseDto>(
      ENDPOINTS.ANALYTICS_PERFORMANCE,
      filter as Record<string, string | number>,
    );
    if (!res.data) {
      throw new Error(
        res.error?.message || 'Failed to fetch performance analytics',
      );
    }
    return res.data;
  }

  public async getSubscriptionAnalytics(
    filter?: AnalyticsFilter,
  ): Promise<DetailedSubscriptionDemandAnalyticsResponseDto> {
    const res = await this.apiClient.get<DetailedSubscriptionDemandAnalyticsResponseDto>(
      ENDPOINTS.ANALYTICS_SUBSCRIPTION,
      filter as Record<string, string | number>,
    );
    if (!res.data) {
      throw new Error(
        res.error?.message || 'Failed to fetch subscription analytics',
      );
    }
    return res.data;
  }

  public async getAllotmentAnalytics(
    filter?: AnalyticsFilter,
  ): Promise<DetailedAllotmentAnalyticsResponseDto> {
    const res = await this.apiClient.get<DetailedAllotmentAnalyticsResponseDto>(
      ENDPOINTS.ANALYTICS_ALLOTMENT,
      filter as Record<string, string | number>,
    );
    if (!res.data) {
      throw new Error(
        res.error?.message || 'Failed to fetch allotment analytics',
      );
    }
    return res.data;
  }

  public async getQualitySummary(): Promise<DetailedAnalyticsQualitySummaryResponseDto> {
    const res = await this.apiClient.get<DetailedAnalyticsQualitySummaryResponseDto>(
      ENDPOINTS.ANALYTICS_QUALITY,
    );
    if (!res.data) {
      throw new Error(res.error?.message || 'Failed to fetch quality analytics');
    }
    return res.data;
  }

  public async getMetricContracts(): Promise<Record<string, MetricContract>> {
    const res = await this.apiClient.get<Record<string, MetricContract>>(
      ENDPOINTS.ANALYTICS_CONTRACTS,
    );
    if (!res.data) {
      throw new Error(res.error?.message || 'Failed to fetch metric contracts');
    }
    return res.data;
  }
}

export const analyticsApiService = new AnalyticsApiService();
