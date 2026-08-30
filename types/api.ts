export interface ApiClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface MobileApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  meta?: Record<string, unknown>;
  error: { code: string; message: string } | null;
  timestamp: string;
  requestId: string;
}

export interface MobilePaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
