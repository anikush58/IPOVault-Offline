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

  constructor(baseUrl?: string) {
    this.apiClient = new ApiClient({
      baseUrl: baseUrl || API_BASE_URL,
      timeoutMs: 12000,
    });
  }

  public async listBackendIpos(
    filter?: BackendIpoListFilter,
  ): Promise<BackendIpo[]> {
    const queryParams: Record<string, string | number> = {
      limit: 100,
      ...(filter as Record<string, string | number>),
    };
    const res = await this.apiClient.get<
      BackendIpo[] | { items: BackendIpo[] }
    >(ENDPOINTS.IPOS, queryParams);

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

    return items.map(normalizeBackendIpo);
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
