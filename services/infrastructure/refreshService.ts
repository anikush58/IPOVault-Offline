import { SQLiteDatabase } from 'expo-sqlite';
import { supabaseClient } from './supabaseClient';
import { cacheService } from './cacheService';
import { eventBus } from './eventBus';

export class RefreshService {
  private inFlightRefreshes: Map<string, Promise<void>> = new Map();
  private lastRefreshedTimestamps: Map<string, number> = new Map();
  private throttleMs: number = 10000; // 10 seconds throttle

  async refreshTable(db: SQLiteDatabase, tableName: string): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastRefreshedTimestamps.get(tableName) || 0;

    // Check throttle window
    if (now - lastTime < this.throttleMs) {
      return;
    }

    // Check duplicate in-flight refresh lock
    if (this.inFlightRefreshes.has(tableName)) {
      return this.inFlightRefreshes.get(tableName);
    }

    const refreshPromise = (async () => {
      try {
        const ownerId = await supabaseClient.getUserId();
        if (!ownerId) return;

        const { data, error } = await supabaseClient.fetchRows(tableName, ownerId);
        if (error || !data) return;

        await cacheService.upsertRemoteRows(db, tableName, data);
        this.lastRefreshedTimestamps.set(tableName, Date.now());
        eventBus.publish('TABLE_UPDATED', { tableName });
      } catch (err) {
        console.error(`[RefreshService] Error refreshing ${tableName}:`, err);
      } finally {
        this.inFlightRefreshes.delete(tableName);
      }
    })();

    this.inFlightRefreshes.set(tableName, refreshPromise);
    return refreshPromise;
  }
}

export const refreshService = new RefreshService();
