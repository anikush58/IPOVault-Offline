import { SQLiteDatabase } from 'expo-sqlite';
import { IPODataProvider, IPOFilterOptions, IPODataProviderResult } from '../types/provider';
import { SmartIPORecord } from '../types/smartIpo';
import { evaluateLifecycle } from '@/services/ipo/statusNormalizer';

export class LocalSQLiteProvider implements IPODataProvider {
  readonly id = 'local_sqlite';
  readonly name = 'Local SQLite Database';
  readonly isRemote = false;

  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  async getIPOs(options?: IPOFilterOptions): Promise<IPODataProviderResult> {
    try {
      let query = 'SELECT * FROM ipo_master WHERE deleted_at IS NULL';
      const params: any[] = [];

      if (options?.exchange && options.exchange !== 'ALL') {
        if (options.exchange === 'SME') {
          query += " AND (issue_type = 'SME' OR exchange LIKE '%SME%')";
        } else {
          query += " AND (issue_type = 'Mainboard' AND exchange NOT LIKE '%SME%')";
        }
      }

      if (options?.searchQuery && options.searchQuery.trim()) {
        const term = `%${options.searchQuery.trim()}%`;
        query += ' AND (ipo_name LIKE ? OR company_name LIKE ? OR symbol LIKE ?)';
        params.push(term, term, term);
      }

      if (options?.isFavoriteOnly) {
        query += ' AND is_favorite = 1';
      }

      if (options?.sortBy) {
        if (options.sortBy === 'gmp_desc') {
          query += ' ORDER BY gmp_percent DESC NULLS LAST';
        } else if (options.sortBy === 'open_date_asc') {
          query += ' ORDER BY open_date ASC NULLS LAST';
        } else if (options.sortBy === 'listing_date_asc') {
          query += ' ORDER BY listing_date ASC NULLS LAST';
        } else if (options.sortBy === 'name_asc') {
          query += ' ORDER BY ipo_name ASC';
        }
      } else {
        query += ' ORDER BY open_date DESC NULLS LAST';
      }

      if (options?.limit && options.limit > 0) {
        query += ` LIMIT ${options.limit}`;
      }

      const rows = await this.db.getAllAsync<any>(query, params);

      let records: SmartIPORecord[] = rows.map((r) => {
        const evalRes = evaluateLifecycle(r);
        return {
          ...r,
          lifecycle_status: evalRes.lifecycle_status,
          lifecycle_confidence: evalRes.lifecycle_confidence,
          lifecycle_source: evalRes.lifecycle_source,
          lifecycle_last_verified_at: evalRes.lifecycle_last_verified_at,
        };
      });

      if (options?.lifecycleStatus && options.lifecycleStatus.length > 0) {
        const allowed = new Set(options.lifecycleStatus);
        records = records.filter((rec) => allowed.has(rec.lifecycle_status));
      }

      return {
        success: true,
        data: records,
        totalCount: records.length,
        providerName: this.name,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error('[LocalSQLiteProvider] Query error:', err);
      return {
        success: false,
        data: [],
        totalCount: 0,
        providerName: this.name,
        fetchedAt: new Date().toISOString(),
        error: err?.message || 'Failed to query local SQLite database',
      };
    }
  }

  async getIPOById(id: string): Promise<SmartIPORecord | null> {
    try {
      const row = await this.db.getFirstAsync<any>(
        'SELECT * FROM ipo_master WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
      if (!row) return null;
      const evalRes = evaluateLifecycle(row);
      return {
        ...row,
        lifecycle_status: evalRes.lifecycle_status,
        lifecycle_confidence: evalRes.lifecycle_confidence,
        lifecycle_source: evalRes.lifecycle_source,
        lifecycle_last_verified_at: evalRes.lifecycle_last_verified_at,
      };
    } catch (err) {
      console.error('[LocalSQLiteProvider] getIPOById error:', err);
      return null;
    }
  }

  async refreshIPOs(): Promise<IPODataProviderResult> {
    return this.getIPOs();
  }
}
