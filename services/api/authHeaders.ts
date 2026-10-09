import { getFirebaseAuthToken } from '../auth/firebaseAuthService';

/**
 * Builds standard Authorization Bearer header from current Firebase session.
 * Never leaks token or throws; returns empty object if unauthenticated or on error.
 */
export async function getAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const token = await getFirebaseAuthToken(forceRefresh);
    if (!token) return {};
    return {
      Authorization: `Bearer ${token}`,
    };
  } catch {
    return {};
  }
}
