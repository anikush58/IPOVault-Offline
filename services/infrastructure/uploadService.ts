import { SQLiteDatabase } from 'expo-sqlite';
import { networkService } from './networkService';
import { supabaseClient } from './supabaseClient';
import { cacheService } from './cacheService';
import { eventBus } from './eventBus';
import { safeGetFirstAsync } from '@/utils/sqliteDebug';

export class UploadService {
  private activeUploads: Set<string> = new Set();

  async enqueue(db: SQLiteDatabase, tableName: string, id: string): Promise<void> {
    this.uploadSingleRow(db, tableName, id);
  }

  async uploadSingleRow(db: SQLiteDatabase, tableName: string, id: string): Promise<void> {
    if (!id || !tableName) {
      if (__DEV__) console.warn('[UploadService] uploadSingleRow called with missing id or tableName:', { tableName, id });
      return;
    }
    const key = `${tableName}:${id}`;
    if (this.activeUploads.has(key)) return;

    if (!networkService.isOnline()) {
      await cacheService.markFailed(db, tableName, id);
      return;
    }

    this.activeUploads.add(key);
    eventBus.publish('SYNC_STARTED');

    try {
      const ownerId = await supabaseClient.getUserId();
      if (!ownerId) {
        await cacheService.markFailed(db, tableName, id);
        this.activeUploads.delete(key);
        return;
      }

      const sql = `SELECT * FROM ${tableName} WHERE id = ?`;
      const row = await safeGetFirstAsync<any>(db, sql, [id], `UploadService.uploadSingleRow(${tableName})`);

      if (!row) {
        this.activeUploads.delete(key);
        return;
      }

      if (row.deleted_at) {
        const { error } = await supabaseClient.deleteRow(tableName, id, ownerId);
        if (!error) {
          await cacheService.markSynced(db, tableName, id);
          eventBus.publish('SYNC_FINISHED');
        } else {
          await cacheService.markFailed(db, tableName, id);
          eventBus.publish('SYNC_FAILED', { error: error?.message || 'Remote delete failed' });
        }
      } else {
        const payload = { ...row, owner_id: row.owner_id || ownerId };
        delete payload.sync_status;
        delete payload.last_synced_at;

        const { error } = await supabaseClient.upsertRow(tableName, payload);
        if (!error) {
          await cacheService.markSynced(db, tableName, id);
          eventBus.publish('SYNC_FINISHED');
        } else {
          await cacheService.markFailed(db, tableName, id);
          eventBus.publish('SYNC_FAILED', { error: error?.message || 'Remote upsert failed' });
        }
      }
    } catch (err: any) {
      await cacheService.markFailed(db, tableName, id);
      eventBus.publish('SYNC_FAILED', { error: err?.message || 'Upload exception' });
    } finally {
      this.activeUploads.delete(key);
    }
  }

  async uploadAllPending(db: SQLiteDatabase, tableName: string): Promise<void> {
    if (!networkService.isOnline()) return;

    try {
      const pendingRows = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM ${tableName} WHERE sync_status IN ('PENDING', 'FAILED')`
      );

      for (const row of pendingRows) {
        await this.uploadSingleRow(db, tableName, row.id);
      }
    } catch (err) {
      console.error(`[UploadService] Error uploading pending rows for ${tableName}:`, err);
    }
  }
}

export const uploadService = new UploadService();
