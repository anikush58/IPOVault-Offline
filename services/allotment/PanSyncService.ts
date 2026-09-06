import { ApiClient } from '../api/ApiClient';
import { ENDPOINTS } from '../api/Endpoints';

export interface LocalUserPanRecord {
  userId: string;
  pan: string;
  name?: string;
}

export class PanSyncService {
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
   * Synchronizes local saved PANs to backend UserSavedPan storage.
   * Ensures backend can process automated allotment check jobs for the user.
   */
  public async syncLocalPans(
    userId: string,
    localPans: LocalUserPanRecord[],
  ): Promise<boolean> {
    if (!userId || !localPans || localPans.length === 0) return true;

    try {
      const headers: Record<string, string> = { 'x-user-id': userId };
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
        headers,
      );
      return true;
    } catch {
      // Non-blocking fallback if sync endpoint is unavailable or already synced
      return false;
    }
  }
}

export const panSyncService = new PanSyncService();
