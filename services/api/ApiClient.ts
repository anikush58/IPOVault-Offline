import { ApiClientConfig, MobileApiResponse } from "../../types/api";
import { ApiError } from "./ApiError";

export class ApiClient {
  private baseUrl: string;
  private timeoutMs: number;
  private headers: Record<string, string>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs || 10000;
    this.headers = config.headers || {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  public async get<T>(path: string, params?: Record<string, string | number>): Promise<MobileApiResponse<T>> {
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.headers,
        signal: controller.signal,
      });

      const body: MobileApiResponse<T> = await response.json();

      if (!response.ok || !body.success) {
        throw new ApiError(
          body.error?.message || "HTTP Request Failed",
          body.error?.code || "HTTP_ERROR",
          response.status,
          body
        );
      }

      return body;
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        (err as Error).message || "Network error",
        "NETWORK_ERROR",
        0,
        err
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
