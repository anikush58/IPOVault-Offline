import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';
import { API_BASE_URL } from '@/constants/apiConfig';
import { getAuthHeaders } from '../api/authHeaders';

export interface LocalUserPanRecord {
  userId: string;
  pan: string;
  name?: string;
}

export class PanSyncService {
  private apiClient: ApiClient;

  constructor(baseUrl?: string) {
    const defaultUrl = baseUrl || API_BASE_URL;
    this.apiClient = new ApiClient({
      baseUrl: defaultUrl,
      timeoutMs: 15000,
    });
  }

  /**
   * Synchronizes local saved PANs to backend UserSavedPan storage.
   * Authenticated via Firebase ID token Bearer header (derived UID on server).
   */
  public async syncLocalPans(
    _userId?: string,
    localPans?: LocalUserPanRecord[],
  ): Promise<boolean> {
    if (!localPans || localPans.length === 0) return true;

    try {
      const authHeaders = await getAuthHeaders();
      // If user is guest / signed out, skip backend sync gracefully
      if (!authHeaders.Authorization) {
        return true;
      }

      const validPans = localPans.filter(
        (p) => p.pan && p.pan.trim().length === 10,
      );
      if (validPans.length === 0) return true;

      await this.apiClient.post(
        ENDPOINTS.PAN_SYNC,
        {
          pans: validPans.map((p) => ({
            pan: p.pan.trim().toUpperCase(),
            name: p.name || 'Applicant',
          })),
        },
        authHeaders,
      );
      return true;
    } catch {
      // Non-blocking fallback if sync endpoint is unavailable or unauthenticated
      return false;
    }
  }

  /**
   * Deletes a specific saved PAN on the backend for the authenticated user.
   */
  public async deletePan(panId: string): Promise<boolean> {
    if (!panId) return true;
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return true;
      await this.apiClient.delete(`${ENDPOINTS.PAN_SYNC}/${panId}`, undefined, authHeaders);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes all saved PANs on the backend for the authenticated user.
   */
  public async deleteAllPans(): Promise<boolean> {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return true;
      await this.apiClient.delete(ENDPOINTS.PAN_SYNC, undefined, authHeaders);
      return true;
    } catch {
      return false;
    }
  }
}

export const panSyncService = new PanSyncService();
