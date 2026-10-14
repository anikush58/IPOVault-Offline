import { API_BASE_URL } from '@/constants/apiConfig';
import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';
import { BackendIpo } from '@/types/backend-ipo';

export interface BackendIpoListFilter {
  q?: string;
  status?: string | string[];
  marketSegment?: 'MAINBOARD' | 'SME';
  exchange?: 'NSE' | 'BSE' | 'BOTH';
  page?: number;
  limit?: number;
}

export function normalizeBackendIpo(item: BackendIpo): BackendIpo {
  if (!item) return item;
  const lc = item.lifecycle;
  return {
    ...item,
    openDate: item.openDate ?? lc?.openDate ?? null,
    closeDate: item.closeDate ?? lc?.closeDate ?? null,
    listingDate: item.listingDate ?? lc?.listingDate ?? null,
  };
}

export class BackendIpoApiService {
  private apiClient: ApiClient;
  private inFlightListRequest: Promise<BackendIpo[]> | null = null;
  private inMemoryListCache: { data: BackendIpo[]; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60s memory cache

  constructor(baseUrl?: string) {
    this.apiClient = new ApiClient({
      baseUrl: baseUrl || API_BASE_URL,
      timeoutMs: 12000,
    });
  }

  /**
   * Synchronously returns warm in-memory cached IPOs if available.
   */
  public getCachedIpos(): BackendIpo[] | null {
    return this.inMemoryListCache?.data || null;
  }

  public async listBackendIpos(
    filter?: BackendIpoListFilter,
    options?: { forceRefresh?: boolean },
  ): Promise<BackendIpo[]> {
    const isUnfiltered = !filter || Object.keys(filter).length === 0;

    // Fast-path: return warm cache immediately if valid
    if (
      isUnfiltered &&
      !options?.forceRefresh &&
      this.inMemoryListCache &&
      Date.now() - this.inMemoryListCache.timestamp < this.CACHE_TTL_MS
    ) {
      return this.inMemoryListCache.data;
    }

    // Request deduplication for concurrent callers
    if (isUnfiltered && !options?.forceRefresh && this.inFlightListRequest) {
      return this.inFlightListRequest;
    }

    const fetchPromise = (async (): Promise<BackendIpo[]> => {
      try {
        const queryParams: Record<string, string | number> = {
          limit: 100,
          ...(filter as Record<string, string | number>),
        };
        const res = await this.apiClient.get<
          BackendIpo[] | { items: BackendIpo[] }
        >(ENDPOINTS.IPOS, queryParams);

        if (!res.data) {
          return this.inMemoryListCache?.data || [];
        }

        let items: BackendIpo[] = [];

        if (Array.isArray(res.data)) {
          items = [...res.data];
        } else if (
          typeof res.data === 'object' &&
          'items' in res.data &&
          Array.isArray((res.data as any).items)
        ) {
          items = [...(res.data as any).items];
        }

        // If multiple pages exist and no specific page was requested, fetch remaining pages
        if (
          !filter?.page &&
          res.meta &&
          typeof (res.meta as any).totalPages === 'number' &&
          (res.meta as any).totalPages > 1
        ) {
          const totalPages = (res.meta as any).totalPages;
          const pagePromises = [];
          for (let p = 2; p <= totalPages; p++) {
            pagePromises.push(
              this.apiClient.get<BackendIpo[] | { items: BackendIpo[] }>(
                ENDPOINTS.IPOS,
                { ...queryParams, page: p },
              ),
            );
          }
          const pagedResults = await Promise.all(pagePromises);
          for (const pageRes of pagedResults) {
            if (pageRes.data && Array.isArray(pageRes.data)) {
              items.push(...pageRes.data);
            } else if (
              pageRes.data &&
              typeof pageRes.data === 'object' &&
              'items' in pageRes.data &&
              Array.isArray((pageRes.data as any).items)
            ) {
              items.push(...(pageRes.data as any).items);
            }
          }
        }

        // Prevent duplicate IPOs when combining pages
        const seen = new Set<string>();
        const deduplicated: BackendIpo[] = [];
        for (const item of items) {
          const key = item.id || item.symbol;
          if (key && !seen.has(key)) {
            seen.add(key);
            deduplicated.push(item);
          } else if (!key) {
            deduplicated.push(item);
          }
        }

        const normalized = deduplicated.map(normalizeBackendIpo);
        if (isUnfiltered && normalized.length > 0) {
          this.inMemoryListCache = {
            data: normalized,
            timestamp: Date.now(),
          };
        }
        return normalized;
      } catch (err) {
        if (this.inMemoryListCache?.data) {
          return this.inMemoryListCache.data;
        }
        throw err;
      } finally {
        if (isUnfiltered) {
          this.inFlightListRequest = null;
        }
      }
    })();

    if (isUnfiltered) {
      this.inFlightListRequest = fetchPromise;
    }

    return fetchPromise;
  }

  public async listListedIpos(
    filter?: BackendIpoListFilter,
  ): Promise<BackendIpo[]> {
    const queryParams: Record<string, string | number> = {
      limit: 100,
      ...(filter as Record<string, string | number>),
    };
    const res = await this.apiClient.get<
      BackendIpo[] | { items: BackendIpo[] }
    >(ENDPOINTS.LISTED, queryParams);

    if (!res.data) {
      return [];
    }

    let items: BackendIpo[] = [];

    if (Array.isArray(res.data)) {
      items = [...res.data];
    } else if (
      typeof res.data === 'object' &&
      'items' in res.data &&
      Array.isArray((res.data as any).items)
    ) {
      items = [...(res.data as any).items];
    }

    // If multiple pages exist and no specific page was requested, fetch remaining pages
    if (
      !filter?.page &&
      res.meta &&
      typeof (res.meta as any).totalPages === 'number' &&
      (res.meta as any).totalPages > 1
    ) {
      const totalPages = (res.meta as any).totalPages;
      const pagePromises = [];
      for (let p = 2; p <= totalPages; p++) {
        pagePromises.push(
          this.apiClient.get<BackendIpo[] | { items: BackendIpo[] }>(
            ENDPOINTS.LISTED,
            { ...queryParams, page: p },
          ),
        );
      }
      const pagedResults = await Promise.all(pagePromises);
      for (const pageRes of pagedResults) {
        if (pageRes.data && Array.isArray(pageRes.data)) {
          items.push(...pageRes.data);
        } else if (
          pageRes.data &&
          typeof pageRes.data === 'object' &&
          'items' in pageRes.data &&
          Array.isArray((pageRes.data as any).items)
        ) {
          items.push(...(pageRes.data as any).items);
        }
      }
    }

    // Prevent duplicate IPOs when combining pages
    const seen = new Set<string>();
    const deduplicated: BackendIpo[] = [];
    for (const item of items) {
      const key = item.id || item.symbol;
      if (key && !seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      } else if (!key) {
        deduplicated.push(item);
      }
    }

    return deduplicated.map(normalizeBackendIpo);
  }

  public async getBackendIpoDetail(
    idOrSymbol: string,
  ): Promise<BackendIpo | null> {
    const res = await this.apiClient.get<BackendIpo>(
      `${ENDPOINTS.IPOS}/${idOrSymbol}`,
    );
    return res.data ? normalizeBackendIpo(res.data) : null;
  }
}

export const backendIpoApiService = new BackendIpoApiService();
