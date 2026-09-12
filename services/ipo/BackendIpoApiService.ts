import { API_BASE_URL } from '@/constants/apiConfig';
import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';
import { BackendIpo } from '@/types/backend-ipo';

export interface BackendIpoListFilter {
  q?: string;
  status?: string;
  marketSegment?: 'MAINBOARD' | 'SME';
  exchange?: 'NSE' | 'BSE' | 'BOTH';
  page?: number;
  limit?: number;
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
    const res = await this.apiClient.get<
      BackendIpo[] | { items: BackendIpo[] }
    >(ENDPOINTS.IPOS, filter as Record<string, string | number>);

    if (!res.data) {
      return [];
    }

    if (Array.isArray(res.data)) {
      return res.data;
    }

    if (
      typeof res.data === 'object' &&
      'items' in res.data &&
      Array.isArray((res.data as any).items)
    ) {
      return (res.data as any).items;
    }

    return [];
  }

  public async getBackendIpoDetail(
    idOrSymbol: string,
  ): Promise<BackendIpo | null> {
    const res = await this.apiClient.get<BackendIpo>(
      `${ENDPOINTS.IPOS}/${idOrSymbol}`,
    );
    return res.data || null;
  }
}

export const backendIpoApiService = new BackendIpoApiService();
