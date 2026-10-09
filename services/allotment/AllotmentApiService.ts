import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';
import { API_BASE_URL } from '@/constants/apiConfig';
import { getAuthHeaders } from '../api/authHeaders';
import { ApiError } from '../api/ApiError';

export interface BackendJobItem {
  id: string;
  maskedId: string;
  status: string;
  sharesApplied?: number | null;
  sharesAllotted?: number | null;
  errorMessage?: string | null;
  checkedAt?: string | null;
}

export interface BackendJobResponse {
  id: string;
  userId?: string | null;
  ipoId: string;
  status:
    | 'QUEUED'
    | 'RUNNING'
    | 'COMPLETED'
    | 'COMPLETED_WITH_ERRORS'
    | 'FAILED'
    | 'CANCELLED';
  totalChecks: number;
  processedChecks: number;
  successfulChecks: number;
  failedChecks: number;
  progressMessage: string;
  createdAt: string;
  updatedAt: string;
  items: BackendJobItem[];
}

export interface AllotmentIntelligenceResponse {
  jobId: string;
  ipoId: string;
  status: string;
  summary: {
    totalApplications: number;
    allottedCount: number;
    notAllottedCount: number;
    allotmentRatePercentage: number;
  };
}

export class AllotmentApiService {
  private apiClient: ApiClient;

  constructor(baseUrl?: string) {
    const defaultUrl = baseUrl || API_BASE_URL;
    this.apiClient = new ApiClient({
      baseUrl: defaultUrl,
      timeoutMs: 15000,
    });
  }

  /**
   * Creates a bulk allotment check job on the backend for an IPO ID.
   * Identity is derived exclusively from the verified Firebase token.
   */
  public async createJob(
    ipoId: string,
    _userId?: string,
  ): Promise<BackendJobResponse> {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      throw new ApiError(
        'Authentication required to create allotment check job',
        'UNAUTHORIZED',
        401,
      );
    }

    const response = await this.apiClient.post<BackendJobResponse>(
      ENDPOINTS.ALLOTMENT_JOBS,
      { ipoId },
      authHeaders,
    );

    if (!response.data) {
      throw new Error('Failed to create allotment job: Empty response data');
    }

    return response.data;
  }

  /**
   * Fetches current job status, progress, and individual items.
   * Requires verified token matching the job owner.
   */
  public async getJob(
    jobId: string,
    _userId?: string,
  ): Promise<BackendJobResponse> {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      throw new ApiError(
        'Authentication required to fetch allotment job',
        'UNAUTHORIZED',
        401,
      );
    }

    const response = await this.apiClient.get<BackendJobResponse>(
      ENDPOINTS.ALLOTMENT_JOB_BY_ID(jobId),
      undefined,
      authHeaders,
    );

    if (!response.data) {
      throw new Error('Failed to fetch allotment job status: Empty response data');
    }

    return response.data;
  }

  /**
   * Retries failed items in an existing job.
   */
  public async retryJob(
    jobId: string,
    _userId?: string,
  ): Promise<BackendJobResponse> {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      throw new ApiError(
        'Authentication required to retry allotment job',
        'UNAUTHORIZED',
        401,
      );
    }

    const response = await this.apiClient.post<BackendJobResponse>(
      ENDPOINTS.ALLOTMENT_JOB_RETRY(jobId),
      {},
      authHeaders,
    );

    if (!response.data) {
      throw new Error('Failed to retry allotment job: Empty response data');
    }

    return response.data;
  }

  /**
   * Retrieves aggregated intelligence for an owned allotment job.
   */
  public async getJobIntelligence(
    jobId: string,
  ): Promise<AllotmentIntelligenceResponse> {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      throw new ApiError(
        'Authentication required to fetch job intelligence',
        'UNAUTHORIZED',
        401,
      );
    }

    const response = await this.apiClient.get<AllotmentIntelligenceResponse>(
      `/api/v1/allotment/jobs/${jobId}/intelligence`,
      undefined,
      authHeaders,
    );

    if (!response.data) {
      throw new Error('Failed to fetch allotment job intelligence: Empty response data');
    }

    return response.data;
  }

  /**
   * Fetches backend IPO list to resolve canonical backend IPO IDs (Public).
   */
  public async fetchBackendIpos(): Promise<any[]> {
    const response = await this.apiClient.get<any[]>('/api/v1/ipos');
    return response.data || [];
  }
}

export const allotmentApiService = new AllotmentApiService();
