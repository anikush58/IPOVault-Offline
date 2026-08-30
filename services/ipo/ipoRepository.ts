import { SQLiteDatabase } from 'expo-sqlite';
import { IPOMasterRecord } from './types';
import { IPOParser } from './ipoParser';
import { API_BASE_URL } from '@/constants/apiConfig';
import { safeRunAsync, safeGetFirstAsync, safeGetAllAsync } from '@/utils/sqliteDebug';

export class IPORepository {
  constructor(private db: SQLiteDatabase) {}

  async upsertBatch(records: Partial<IPOMasterRecord>[], isAuthoritative: boolean = true): Promise<number> {
    if (!records || records.length === 0) return 0;
    
    let updatedCount = 0;
    
    for (const raw of records) {
      if (!raw) continue;
      const record = IPOParser.parse(raw);
      if (!record || !record.id) continue;
      
      const gmpUpdateSql = isAuthoritative
        ? `gmp_amount=excluded.gmp_amount,
          gmp_percent=excluded.gmp_percent,
          profit_per_lot=excluded.profit_per_lot,
          gmp_updated_at=excluded.gmp_updated_at,`
        : `gmp_amount=COALESCE(excluded.gmp_amount, ipo_master.gmp_amount),
          gmp_percent=COALESCE(excluded.gmp_percent, ipo_master.gmp_percent),
          profit_per_lot=COALESCE(excluded.profit_per_lot, ipo_master.profit_per_lot),
          gmp_updated_at=COALESCE(excluded.gmp_updated_at, ipo_master.gmp_updated_at),`;
      
      const sql = `INSERT INTO ipo_master (
          id, company_name, ipo_name, symbol, exchange, issue_type,
          price_band_min, price_band_max, lot_size, issue_size,
          listing_date, open_date, close_date, allotment_date, refund_date, demat_credit_date,
          registrar, lead_manager, status, logo_url, sector, description, website, prospectus_url,
          retail_sub, qib_sub, nii_sub, employee_sub, shareholder_sub, anchor_sub, total_sub, subscription_timestamp,
          registrar_website, allotment_link,
          listing_price, listing_gain_percent, current_price, current_price_updated_at,
          gmp_amount, gmp_percent, profit_per_lot, gmp_updated_at,
          lifecycle_status, lifecycle_confidence, lifecycle_source, lifecycle_last_verified_at,
          is_favorite, source_type, sync_version, created_at, updated_at, deleted_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          company_name=COALESCE(NULLIF(excluded.company_name, ''), ipo_master.company_name),
          ipo_name=COALESCE(NULLIF(excluded.ipo_name, ''), ipo_master.ipo_name),
          symbol=COALESCE(NULLIF(excluded.symbol, ''), ipo_master.symbol),
          exchange=COALESCE(NULLIF(excluded.exchange, ''), ipo_master.exchange),
          issue_type=COALESCE(NULLIF(excluded.issue_type, ''), ipo_master.issue_type),
          price_band_min=COALESCE(excluded.price_band_min, ipo_master.price_band_min),
          price_band_max=COALESCE(excluded.price_band_max, ipo_master.price_band_max),
          lot_size=COALESCE(excluded.lot_size, ipo_master.lot_size),
          issue_size=COALESCE(excluded.issue_size, ipo_master.issue_size),
          listing_date=COALESCE(NULLIF(excluded.listing_date, ''), ipo_master.listing_date),
          open_date=COALESCE(NULLIF(excluded.open_date, ''), ipo_master.open_date),
          close_date=COALESCE(NULLIF(excluded.close_date, ''), ipo_master.close_date),
          allotment_date=COALESCE(NULLIF(excluded.allotment_date, ''), ipo_master.allotment_date),
          registrar=COALESCE(NULLIF(excluded.registrar, ''), ipo_master.registrar),
          status=COALESCE(NULLIF(excluded.status, ''), ipo_master.status),
          lifecycle_status=COALESCE(NULLIF(excluded.lifecycle_status, ''), ipo_master.lifecycle_status),
          lifecycle_confidence=COALESCE(NULLIF(excluded.lifecycle_confidence, ''), ipo_master.lifecycle_confidence),
          lifecycle_source=COALESCE(NULLIF(excluded.lifecycle_source, ''), ipo_master.lifecycle_source),
          lifecycle_last_verified_at=COALESCE(NULLIF(excluded.lifecycle_last_verified_at, ''), ipo_master.lifecycle_last_verified_at),
          total_sub=COALESCE(excluded.total_sub, ipo_master.total_sub),
          retail_sub=COALESCE(excluded.retail_sub, ipo_master.retail_sub),
          qib_sub=COALESCE(excluded.qib_sub, ipo_master.qib_sub),
          nii_sub=COALESCE(excluded.nii_sub, ipo_master.nii_sub),
          ${gmpUpdateSql}
          listing_gain_percent=COALESCE(excluded.listing_gain_percent, ipo_master.listing_gain_percent),
          updated_at=excluded.updated_at`;

      const params = [
        record.id, record.company_name, record.ipo_name, record.symbol, record.exchange, record.issue_type,
        record.price_band_min, record.price_band_max, record.lot_size, record.issue_size,
        record.listing_date, record.open_date, record.close_date, record.allotment_date, record.refund_date, record.demat_credit_date,
        record.registrar, record.lead_manager, record.status || 'Unknown', record.logo_url, record.sector, record.description, record.website, record.prospectus_url,
        record.retail_sub, record.qib_sub, record.nii_sub, record.employee_sub, record.shareholder_sub, record.anchor_sub, record.total_sub, record.subscription_timestamp,
        record.registrar_website, record.allotment_link,
        record.listing_price, record.listing_gain_percent, record.current_price, record.current_price_updated_at,
        record.gmp_amount ?? null, record.gmp_percent ?? null, record.profit_per_lot ?? null, record.gmp_updated_at ?? null,
        record.lifecycle_status || record.status || 'Unknown', record.lifecycle_confidence || 'Low', record.lifecycle_source || '', record.lifecycle_last_verified_at || null,
        record.is_favorite ?? 0, record.source_type || 'SERVER', record.sync_version ?? 0, record.created_at, record.updated_at, record.deleted_at
      ];

      await safeRunAsync(this.db, sql, params, 'IPORepository.upsertBatch');
      updatedCount++;
    }

    return updatedCount;
  }

  async upsert(record: Partial<IPOMasterRecord>): Promise<boolean> {
    if (!record) return false;
    const count = await this.upsertBatch([record]);
    return count > 0;
  }

  async getFavorites(): Promise<IPOMasterRecord[]> {
    const sql = "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND is_favorite = 1 ORDER BY open_date DESC";
    return safeGetAllAsync<IPOMasterRecord>(this.db, sql, [], 'IPORepository.getFavorites');
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    if (!id) return;
    const sql = "UPDATE ipo_master SET is_favorite = ?, updated_at = ? WHERE id = ?";
    const now = new Date().toISOString();
    await safeRunAsync(this.db, sql, [isFavorite ? 1 : 0, now, id], 'IPORepository.toggleFavorite');
  }

  async getUpcoming(): Promise<IPOMasterRecord[]> {
    const sql = "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (UPPER(status) = 'UPCOMING' OR UPPER(lifecycle_status) = 'UPCOMING' OR open_date > date('now')) ORDER BY open_date ASC";
    return safeGetAllAsync<IPOMasterRecord>(this.db, sql, [], 'IPORepository.getUpcoming');
  }

  async getOpen(): Promise<IPOMasterRecord[]> {
    const sql = "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (UPPER(status) = 'OPEN' OR UPPER(lifecycle_status) = 'OPEN') ORDER BY close_date ASC";
    return safeGetAllAsync<IPOMasterRecord>(this.db, sql, [], 'IPORepository.getOpen');
  }

  async getClosed(): Promise<IPOMasterRecord[]> {
    const sql = "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (UPPER(status) IN ('CLOSED', 'ALLOTTED_PENDING', 'ALLOTTED_AVAILABLE', 'ALLOTMENT') OR UPPER(lifecycle_status) IN ('CLOSED', 'ALLOTTED_PENDING', 'ALLOTTED_AVAILABLE')) ORDER BY close_date DESC";
    return safeGetAllAsync<IPOMasterRecord>(this.db, sql, [], 'IPORepository.getClosed');
  }

  async getListed(): Promise<IPOMasterRecord[]> {
    const sql = "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (UPPER(status) = 'LISTED' OR UPPER(lifecycle_status) = 'LISTED') ORDER BY listing_date DESC";
    return safeGetAllAsync<IPOMasterRecord>(this.db, sql, [], 'IPORepository.getListed');
  }

  async getById(id: string): Promise<IPOMasterRecord | null> {
    if (!id) {
      if (__DEV__) console.warn('[IPORepository.getById] Called with empty or null id');
      return null;
    }
    const sql = "SELECT * FROM ipo_master WHERE id = ?";
    return safeGetFirstAsync<IPOMasterRecord>(this.db, sql, [id], 'IPORepository.getById');
  }

  async search(query: string): Promise<IPOMasterRecord[]> {
    if (query === null || query === undefined) {
      if (__DEV__) console.warn('[IPORepository.search] Called with null or undefined query');
      return [];
    }
    const raw = query.trim();
    if (!raw) return [];

    // Tokenize query for flexible partial matching
    const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const conditions: string[] = [];
    const params: string[] = [];

    for (const token of tokens) {
      const q = `%${token}%`;
      conditions.push('(LOWER(company_name) LIKE ? OR LOWER(ipo_name) LIKE ? OR LOWER(symbol) LIKE ? OR LOWER(sector) LIKE ? OR LOWER(registrar) LIKE ?)');
      params.push(q, q, q, q, q);
    }

    const sql = `SELECT * FROM ipo_master WHERE deleted_at IS NULL AND ${conditions.join(' AND ')} ORDER BY open_date DESC LIMIT 50`;
    return safeGetAllAsync<IPOMasterRecord>(this.db, sql, params, 'IPORepository.search');
  }

  async getLastUpdatedTimestamp(): Promise<string | null> {
    const sql = "SELECT MAX(updated_at) as max_updated FROM ipo_master";
    const row = await safeGetFirstAsync<{ max_updated: string }>(this.db, sql, [], 'IPORepository.getLastUpdatedTimestamp');
    return row?.max_updated || null;
  }

  async findDuplicates(companyName: string, symbol?: string): Promise<IPOMasterRecord[]> {
    if (!companyName.trim()) return [];
    const cName = `%${companyName.trim().toLowerCase()}%`;
    const sym = symbol?.trim() ? `%${symbol.trim().toLowerCase()}%` : null;

    let sql = 'SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (LOWER(company_name) LIKE ? OR LOWER(ipo_name) LIKE ?';
    const params: string[] = [cName, cName];

    if (sym) {
      sql += ' OR LOWER(symbol) LIKE ?';
      params.push(sym);
    }
    sql += ') ORDER BY open_date DESC LIMIT 10';

    return safeGetAllAsync<IPOMasterRecord>(this.db, sql, params, 'IPORepository.findDuplicates');
  }

  async createManual(data: Partial<IPOMasterRecord>): Promise<IPOMasterRecord> {
    const now = new Date().toISOString();
    const id = data.id || `manual-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    // Determine status automatically if not provided
    let status = data.status || 'Upcoming';
    if (!data.status && data.open_date && data.close_date) {
      const today = new Date().toISOString().split('T')[0];
      if (today < data.open_date) status = 'Upcoming';
      else if (today >= data.open_date && today <= data.close_date) status = 'Open';
      else if (data.listing_date && today >= data.listing_date) status = 'Listed';
      else status = 'Closed';
    }

    const record: IPOMasterRecord = {
      id,
      company_name: data.company_name?.trim() || '',
      ipo_name: data.ipo_name?.trim() || data.company_name?.trim() || 'IPO',
      symbol: data.symbol?.trim() || '',
      exchange: data.exchange || 'BSE / NSE',
      issue_type: data.issue_type || 'Mainboard',
      price_band_min: data.price_band_min ?? null,
      price_band_max: data.price_band_max ?? null,
      lot_size: data.lot_size ?? null,
      issue_size: data.issue_size ?? null,
      listing_date: data.listing_date || null,
      open_date: data.open_date || null,
      close_date: data.close_date || null,
      allotment_date: data.allotment_date || null,
      refund_date: data.refund_date || null,
      demat_credit_date: data.demat_credit_date || null,
      registrar: data.registrar?.trim() || '',
      lead_manager: data.lead_manager?.trim() || '',
      status,
      logo_url: data.logo_url || '',
      sector: data.sector?.trim() || 'General',
      description: data.description?.trim() || 'Manually added IPO record.',
      website: data.website?.trim() || '',
      prospectus_url: '',
      retail_sub: null,
      qib_sub: null,
      nii_sub: null,
      employee_sub: null,
      shareholder_sub: null,
      anchor_sub: null,
      total_sub: null,
      subscription_timestamp: null,
      registrar_website: '',
      allotment_link: '',
      listing_price: null,
      listing_gain_percent: null,
      current_price: null,
      current_price_updated_at: null,
      is_favorite: 0,
      source_type: 'LOCAL',
      sync_version: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    await this.upsert(record);
    return record;
  }

  async mergeManualWithOfficial(localId: string, officialIpo: IPOMasterRecord): Promise<void> {
    const existingLocal = await this.getById(localId);
    if (!existingLocal) return;

    // Retain user's custom notes and favorite status if present
    const mergedRecord: IPOMasterRecord = {
      ...officialIpo,
      is_favorite: existingLocal.is_favorite || officialIpo.is_favorite || 0,
      description: existingLocal.description ? `${existingLocal.description}\n\n[Official Details Merged]` : officialIpo.description,
      source_type: 'SERVER',
      updated_at: new Date().toISOString(),
    };

    // Replace local record with official record
    await safeRunAsync(this.db, 'DELETE FROM ipo_master WHERE id = ?', [localId], 'IPORepository.deleteLocalMerged');
    await this.upsert(mergedRecord);

    // Re-link applications from localId to officialIpo.id
    if (localId !== officialIpo.id) {
      await safeRunAsync(
        this.db,
        'UPDATE ipo_applications SET ipo_id = ? WHERE ipo_id = ?',
        [officialIpo.id, localId],
        'IPORepository.relinkApplications'
      );
    }
  }

  async parseDocument(fileUri: string, fileName: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: 'application/pdf',
    } as any);

    const endpoint = `${API_BASE_URL}/api/ipo/parse-document`;
    if (__DEV__) console.log(`[IPORepository] Posting PDF document to ${endpoint} (${fileName})`);

    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server error (${res.status})`);
    }

    return await res.json();
  }

  async getStats(): Promise<{ totalCount: number; lastUpdated: string | null }> {
    const sql = "SELECT COUNT(*) as cnt, MAX(updated_at) as max_updated FROM ipo_master WHERE deleted_at IS NULL";
    const res = await safeGetFirstAsync<{ cnt: number; max_updated: string | null }>(this.db, sql, [], 'IPORepository.getStats');
    return { totalCount: res?.cnt ?? 0, lastUpdated: res?.max_updated ?? null };
  }
}
