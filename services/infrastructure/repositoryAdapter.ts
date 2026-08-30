import { SQLiteDatabase } from 'expo-sqlite';
import { cacheService } from './cacheService';
import { refreshService } from './refreshService';
import { uploadService } from './uploadService';

export interface EntityAdapterConfig {
  sqliteTable: string;
  supabaseTable: string;
  primaryKey?: string;
  defaultOrderBy?: string;
}

export class EntityAdapter<T> {
  constructor(private config: EntityAdapterConfig) {}

  get sqliteTable(): string {
    return this.config.sqliteTable;
  }

  get supabaseTable(): string {
    return this.config.supabaseTable;
  }

  async getAll(db: SQLiteDatabase): Promise<T[]> {
    const cachedRows = await cacheService.getRows<T>(db, this.config.sqliteTable, {
      orderBy: this.config.defaultOrderBy,
    });
    refreshService.refreshTable(db, this.config.sqliteTable).catch((err) => {
      console.error(`[EntityAdapter] Refresh error for ${this.config.sqliteTable}:`, err);
    });
    return cachedRows;
  }

  async insert(db: SQLiteDatabase, row: any): Promise<void> {
    const pk = this.config.primaryKey || 'id';
    const id = row[pk];
    await cacheService.writeLocalMutation(db, this.config.sqliteTable, id, row, 'INSERT');
    uploadService.enqueue(db, this.config.sqliteTable, id).catch((err) => {
      console.error(`[EntityAdapter] Upload enqueue error for ${this.config.sqliteTable}:`, err);
    });
  }

  async update(db: SQLiteDatabase, id: string, row: any): Promise<void> {
    await cacheService.writeLocalMutation(db, this.config.sqliteTable, id, row, 'UPDATE');
    uploadService.enqueue(db, this.config.sqliteTable, id).catch((err) => {
      console.error(`[EntityAdapter] Upload enqueue error for ${this.config.sqliteTable}:`, err);
    });
  }

  async delete(db: SQLiteDatabase, id: string): Promise<void> {
    await cacheService.writeLocalMutation(db, this.config.sqliteTable, id, null, 'DELETE');
    uploadService.enqueue(db, this.config.sqliteTable, id).catch((err) => {
      console.error(`[EntityAdapter] Delete upload enqueue error for ${this.config.sqliteTable}:`, err);
    });
  }
}

export class RepositoryAdapter {
  readonly users = new EntityAdapter<any>({
    sqliteTable: 'users_table',
    supabaseTable: 'users_table',
    defaultOrderBy: 'name',
  });

  readonly banks = new EntityAdapter<any>({
    sqliteTable: 'bank_accounts',
    supabaseTable: 'bank_accounts',
    defaultOrderBy: 'bank_name',
  });

  readonly ipos = new EntityAdapter<any>({
    sqliteTable: 'ipo_listings',
    supabaseTable: 'ipo_listings',
    defaultOrderBy: 'created_at DESC',
  });

  readonly applications = new EntityAdapter<any>({
    sqliteTable: 'ipo_applications',
    supabaseTable: 'ipo_applications',
    defaultOrderBy: 'created_at DESC',
  });

  readonly ipoMaster = new EntityAdapter<any>({
    sqliteTable: 'ipo_master',
    supabaseTable: 'ipo_master',
    defaultOrderBy: 'company_name',
  });
}

export const repositoryAdapter = new RepositoryAdapter();
