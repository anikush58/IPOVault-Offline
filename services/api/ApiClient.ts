import { ApiClientConfig, MobileApiResponse } from '../../types/api';
import { ApiError } from './ApiError';

export interface ApiRequestTrace {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status?: number;
  success?: boolean;
  aborted?: boolean;
  errorName?: string;
  errorMessage?: string;
  errorCode?: string;
}

export type ApiRequestListener = (trace: ApiRequestTrace) => void;

export class ApiClient {
  private static listeners: ApiRequestListener[] = [];

  public static onRequest(listener: ApiRequestListener): () => void {
    ApiClient.listeners.push(listener);
    return () => {
      ApiClient.listeners = ApiClient.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyListeners(trace: ApiRequestTrace) {
    ApiClient.listeners.forEach((l) => {
      try {
        l(trace);
      } catch {
        // Ignore listener error
      }
    });
  }

  private baseUrl: string;
  private timeoutMs: number;
  private headers: Record<string, string>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs || 10000;
    this.headers = config.headers || {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  public async get<T>(
    path: string,
    params?: Record<string, string | number>,
    customHeaders?: Record<string, string>,
  ): Promise<MobileApiResponse<T>> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let httpStatus = 0;
    let isAborted = false;
    let errName: string | undefined;
    let errMsg: string | undefined;
    let errCode: string | undefined;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { ...this.headers, ...customHeaders },
        signal: controller.signal,
      });

      httpStatus = response.status;
      const body: MobileApiResponse<T> = await response.json();

      if (!response.ok || body.success === false) {
        errCode = body.error?.code || 'HTTP_ERROR';
        errMsg = body.error?.message || 'HTTP Request Failed';
        throw new ApiError(
          errMsg,
          errCode,
          response.status,
          body,
        );
      }

      return body;
    } catch (err: unknown) {
      isAborted = controller.signal.aborted || (err as Error)?.name === 'AbortError';
      errName = (err as Error)?.name || 'Error';
      errMsg = (err as Error)?.message || String(err);

      if (err instanceof ApiError) {
        httpStatus = err.status;
        errCode = err.code;
        throw err;
      }
      throw new ApiError(
        errMsg,
        'NETWORK_ERROR',
        0,
        err,
      );
    } finally {
      clearTimeout(timer);
      ApiClient.notifyListeners({
        id: requestId,
        method: 'GET',
        path,
        startTime,
        endTime: Date.now(),
        durationMs: Date.now() - startTime,
        status: httpStatus,
        success: httpStatus >= 200 && httpStatus < 300,
        aborted: isAborted,
        errorName: errName,
        errorMessage: errMsg,
        errorCode: errCode,
      });
    }
  }

  public async post<T>(
    path: string,
    bodyData?: unknown,
    customHeaders?: Record<string, string>,
  ): Promise<MobileApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let httpStatus = 0;
    let isAborted = false;
    let errName: string | undefined;
    let errMsg: string | undefined;
    let errCode: string | undefined;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { ...this.headers, ...customHeaders },
        body: bodyData ? JSON.stringify(bodyData) : undefined,
        signal: controller.signal,
      });

      httpStatus = response.status;
      const body: MobileApiResponse<T> = await response.json();

      if (!response.ok || body.success === false) {
        errCode = body.error?.code || 'HTTP_ERROR';
        errMsg = body.error?.message || 'HTTP Request Failed';
        throw new ApiError(
          errMsg,
          errCode,
          response.status,
          body,
        );
      }

      return body;
    } catch (err: unknown) {
      isAborted = controller.signal.aborted || (err as Error)?.name === 'AbortError';
      errName = (err as Error)?.name || 'Error';
      errMsg = (err as Error)?.message || String(err);

      if (err instanceof ApiError) {
        httpStatus = err.status;
        errCode = err.code;
        throw err;
      }
      throw new ApiError(
        errMsg,
        'NETWORK_ERROR',
        0,
        err,
      );
    } finally {
      clearTimeout(timer);
      ApiClient.notifyListeners({
        id: requestId,
        method: 'POST',
        path,
        startTime,
        endTime: Date.now(),
        durationMs: Date.now() - startTime,
        status: httpStatus,
        success: httpStatus >= 200 && httpStatus < 300,
        aborted: isAborted,
        errorName: errName,
        errorMessage: errMsg,
        errorCode: errCode,
      });
    }
  }
}
