import { SQLiteDatabase } from 'expo-sqlite';
import { safeRunAsync, safeGetAllAsync } from '@/utils/sqliteDebug';

export class CacheService {
  async getRows<T>(db: SQLiteDatabase, tableName: string, options?: { orderBy?: string }): Promise<T[]> {
    const orderByClause = options?.orderBy ? `ORDER BY ${options.orderBy}` : '';
    const sql = `SELECT * FROM ${tableName} WHERE deleted_at IS NULL ${orderByClause}`.trim();
    return await safeGetAllAsync<T>(db, sql, [], `CacheService.getRows(${tableName})`);
  }

  async writeLocalMutation(
    db: SQLiteDatabase,
    tableName: string,
    id: string,
    data: any,
    action: 'INSERT' | 'UPDATE' | 'DELETE'
  ): Promise<void> {
    if (!tableName) {
      if (__DEV__) console.warn('[CacheService] writeLocalMutation called without tableName');
      return;
    }
    if (!id) {
      if (__DEV__) console.warn(`[CacheService] writeLocalMutation (${action}) called with invalid/null id for table: ${tableName}`);
      return;
    }
    const now = new Date().toISOString();

    if (action === 'DELETE') {
      const sql = `UPDATE ${tableName} SET deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING' WHERE id = ?`;
      await safeRunAsync(db, sql, [now, now, id], `CacheService.delete(${tableName})`);
      return;
    }

    if (action === 'INSERT') {
      const keys = Object.keys(data);
      const cols = [...keys, 'sync_status', 'last_synced_at'].join(', ');
      const placeholders = keys.map(() => '?').concat(["'PENDING'", 'NULL']).join(', ');
      const rawValues = Object.values(data);
      const values = rawValues.map((v) => (v === undefined ? null : v));
      const sql = `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`;

      await safeRunAsync(db, sql, values, `CacheService.insert(${tableName})`);
      return;
    }

    if (action === 'UPDATE') {
      const keys = Object.keys(data).filter((k) => k !== 'id');
      if (keys.length === 0) return;

      const setClause = keys.map((k) => `${k} = ?`).join(', ') + `, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'`;
      const rawValues = keys.map((k) => data[k]);
      const values: any[] = [...rawValues.map((v) => (v === undefined ? null : v)), now, id];
      const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;

      await safeRunAsync(db, sql, values, `CacheService.update(${tableName})`);
      return;
    }
  }

  async upsertRemoteRows(db: SQLiteDatabase, tableName: string, remoteRows: any[]): Promise<void> {
    if (!tableName) {
      if (__DEV__) console.warn('[CacheService] upsertRemoteRows called without tableName');
      return;
    }
    if (!remoteRows || remoteRows.length === 0) return;

    const now = new Date().toISOString();

    for (const row of remoteRows) {
      if (!row || !row.id) {
        if (__DEV__) console.warn(`[CacheService] Skipping remote row without valid id in table ${tableName}:`, row);
        continue;
      }

      const keys = Object.keys(row);
      const columns = [...keys, 'sync_status', 'last_synced_at'].join(', ');
      const placeholders = keys.map(() => '?').concat(["'SYNCED'", '?']).join(', ');

      const updateAssignments = keys
        .filter((k) => k !== 'id')
        .map((k) => `${k} = excluded.${k}`)
        .join(', ');

      const fullUpdateClause = updateAssignments
        ? `${updateAssignments}, sync_status = 'SYNCED', last_synced_at = excluded.last_synced_at`
        : `sync_status = 'SYNCED', last_synced_at = excluded.last_synced_at`;

      const sql = `
        INSERT INTO ${tableName} (${columns})
        VALUES (${placeholders})
        ON CONFLICT(id) DO UPDATE SET
          ${fullUpdateClause}
        WHERE sync_status != 'PENDING'
      `.trim();

      const rawValues = Object.values(row);
      const values = [...rawValues.map((v) => (v === undefined ? null : v)), row.last_synced_at || now];
      await safeRunAsync(db, sql, values, `CacheService.upsertRemoteRows(${tableName})`);
    }
  }

  async markSynced(db: SQLiteDatabase, tableName: string, id: string): Promise<void> {
    if (!tableName) {
      if (__DEV__) console.warn('[CacheService] markSynced called without tableName');
      return;
    }
    if (!id) {
      if (__DEV__) console.warn(`[CacheService] markSynced called with invalid parameter id: ${id}, table: ${tableName}`);
      return;
    }
    const now = new Date().toISOString();
    const sql = `UPDATE ${tableName} SET sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?`;
    await safeRunAsync(db, sql, [now, id], `CacheService.markSynced(${tableName})`);
  }

  async markFailed(db: SQLiteDatabase, tableName: string, id: string): Promise<void> {
    if (!tableName) {
      if (__DEV__) console.warn('[CacheService] markFailed called without tableName');
      return;
    }
    if (!id) {
      if (__DEV__) console.warn(`[CacheService] markFailed called with invalid parameter id: ${id}, table: ${tableName}`);
      return;
    }
    const sql = `UPDATE ${tableName} SET sync_status = 'FAILED' WHERE id = ?`;
    await safeRunAsync(db, sql, [id], `CacheService.markFailed(${tableName})`);
  }
}

export const cacheService = new CacheService();
