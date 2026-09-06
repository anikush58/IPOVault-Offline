import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';

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

export class AllotmentApiService {
  private apiClient: ApiClient;

  constructor(baseUrl?: string) {
    const defaultUrl =
      process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    this.apiClient = new ApiClient({
      baseUrl: baseUrl || defaultUrl,
      timeoutMs: 15000,
    });
  }

  /**
   * Creates a bulk allotment check job on the backend for an IPO ID.
   * The server loads saved PANs for the authenticated user automatically.
   */
  public async createJob(
    ipoId: string,
    userId?: string,
  ): Promise<BackendJobResponse> {
    const headers: Record<string, string> = {};
    if (userId) {
      headers['x-user-id'] = userId;
    }

    const response = await this.apiClient.post<BackendJobResponse>(
      ENDPOINTS.ALLOTMENT_JOBS,
      { ipoId },
      headers,
    );

    if (!response.data) {
      throw new Error('Failed to create allotment job: Empty response data');
    }

    return response.data;
  }

  /**
   * Fetches current job status, progress, and individual items.
   */
  public async getJob(
    jobId: string,
    userId?: string,
  ): Promise<BackendJobResponse> {
    const headers: Record<string, string> = {};
    if (userId) {
      headers['x-user-id'] = userId;
    }

    const response = await this.apiClient.get<BackendJobResponse>(
      ENDPOINTS.ALLOTMENT_JOB_BY_ID(jobId),
      undefined,
      headers,
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
    userId?: string,
  ): Promise<BackendJobResponse> {
    const headers: Record<string, string> = {};
    if (userId) {
      headers['x-user-id'] = userId;
    }

    const response = await this.apiClient.post<BackendJobResponse>(
      ENDPOINTS.ALLOTMENT_JOB_RETRY(jobId),
      {},
      headers,
    );

    if (!response.data) {
      throw new Error('Failed to retry allotment job: Empty response data');
    }

    return response.data;
  }
}

export const allotmentApiService = new AllotmentApiService();
