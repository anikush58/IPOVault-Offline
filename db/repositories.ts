import { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { User, IPOListing, ApplicationWithDetails, BankAccount, ApplicationStatus } from '@/context/DBContext';
import { safeGetAllAsync, safeGetFirstAsync, safeRunAsync, runWithTransaction } from '@/utils/sqliteDebug';
import { startPerfTimer } from '@/utils/performanceMetrics';

function getCurrentTime() {
  return new Date().toISOString();
}

export interface IUserRepository {
  getAll(): Promise<User[]>;
  add(user: Omit<User, 'id'>, ownerId?: string | null): Promise<string>;
  update(id: string, user: Omit<User, 'id'>): Promise<void>;
  archive(id: string, isArchived: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IBankRepository {
  getAll(): Promise<BankAccount[]>;
  add(bankName: string, balance: number, upiApp?: string, ownerId?: string | null): Promise<BankAccount>;
  updateBalance(id: string, balance?: number, bankName?: string, upiApp?: string): Promise<void>;
  delete(id: string, ownerId?: string | null): Promise<void>;
}

export interface IIPORepository {
  getAll(): Promise<IPOListing[]>;
  getById(id: string): Promise<IPOListing | null>;
  add(ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>, ownerId?: string | null): Promise<void>;
  update(id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>): Promise<void>;
  updateGmp(id: string, gmpAmount: number | null, gmpPercent: number | null, profitLot: number | null): Promise<void>;
  archive(id: string, isArchived: boolean): Promise<void>;
  toggleFavorite(id: string, isFavorite: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface BulkApplyResult {
  selectedCount: number;
  createdCount: number;
  alreadyExistingCount: number;
  failedCount: number;
  createdAppIds: string[];
  skippedUserIds: string[];
  errors?: Array<{ userId: string; reason: string }>;
}

export interface IApplicationRepository {
  getAll(): Promise<ApplicationWithDetails[]>;
  addBulk(
    ipoId: string,
    userIds: string[],
    bankName?: string | Record<string, string>,
    upiApp?: string | Record<string, string>,
    lotCounts?: Record<string, number> | number,
    ownerId?: string | null,
    categoryMap?: string | Record<string, string>,
  ): Promise<BulkApplyResult>;
  update(
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
    bankName?: string,
    upiApp?: string,
    brokerAccountId?: string | null,
    sharesCount?: number | null,
  ): Promise<void>;
  partialSell(
    id: string,
    soldShares: number,
    totalShares: number,
    sellPrice: number,
    saleDate: string | null,
    tax?: number,
    userCut?: number,
    ownerId?: string | null,
    brokerAccountId?: string | null,
    bankName?: string,
    upiApp?: string
  ): Promise<void>;
  updateBulkStatus(ids: string[], status: ApplicationStatus): Promise<void>;
  toggleFavorite(id: string, isFavorite: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}

export class UserRepository implements IUserRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<User[]> {
    return await safeGetAllAsync<User>(
      this.db,
      'SELECT * FROM users_table WHERE deleted_at IS NULL ORDER BY name',
      [],
      'UserRepository.getAll'
    );
  }

  async add(user: Omit<User, 'id'>, ownerId?: string | null): Promise<string> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const sql = `
      INSERT INTO users_table (
        id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, avatar_url, default_amount_blocked,
        archived, sync_version, sync_status, owner_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
    `;
    const params = [
      id,
      user.name || '',
      user.pan_number || '',
      user.client_id || '',
      user.upi_id || '',
      user.broker || '',
      user.tpin || '',
      user.upi_app || '',
      user.bank_name || '',
      user.avatar_url || user.avatarUrl || '',
      user.default_amount_blocked || 0,
      0,
      0,
      ownerId || null,
      now,
      now,
    ];
    await safeRunAsync(this.db, sql, params, 'UserRepository.add');
    return id;
  }


  async update(id: string, user: Omit<User, 'id'>): Promise<void> {
    if (!id) return;
    const now = getCurrentTime();
    const sql = `
      UPDATE users_table SET
        name = ?, pan_number = ?, client_id = ?, upi_id = ?, broker = ?, tpin = ?,
        upi_app = ?, bank_name = ?, avatar_url = ?, default_amount_blocked = ?,
        updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    const params = [
      user.name || '',
      user.pan_number || '',
      user.client_id || '',
      user.upi_id || '',
      user.broker || '',
      user.tpin || '',
      user.upi_app || '',
      user.bank_name || '',
      user.avatar_url || user.avatarUrl || '',
      user.default_amount_blocked || 0,
      now,
      id,
    ];
    await safeRunAsync(this.db, sql, params, 'UserRepository.update');
  }

  async archive(id: string, isArchived: boolean): Promise<void> {
    if (!id) return;
    const now = getCurrentTime();
    const sql = `
      UPDATE users_table SET
        archived = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [isArchived ? 1 : 0, now, id], 'UserRepository.archive');
  }

  async delete(id: string): Promise<void> {
    if (!id) return;
    const now = getCurrentTime();
    await runWithTransaction(
      this.db,
      async () => {
        // Soft-delete user
        const sqlUser = `
          UPDATE users_table SET
            deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id = ?
        `;
        await safeRunAsync(this.db, sqlUser, [now, now, id], 'UserRepository.delete.user');

        // Cascade soft-delete linked applications to preserve referential integrity
        const sqlApps = `
          UPDATE ipo_applications SET
            deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE user_id = ? AND deleted_at IS NULL
        `;
        await safeRunAsync(this.db, sqlApps, [now, now, id], 'UserRepository.delete.cascadeApps');
      },
      'UserRepository.delete'
    );
  }
}

export class IPORepository implements IIPORepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<IPOListing[]> {
    return await safeGetAllAsync<IPOListing>(
      this.db,
      'SELECT * FROM ipo_listings WHERE deleted_at IS NULL ORDER BY created_at DESC',
      [],
      'IPORepository.getAll'
    );
  }

  async getById(id: string): Promise<IPOListing | null> {
    return await safeGetFirstAsync<IPOListing>(
      this.db,
      'SELECT * FROM ipo_listings WHERE id = ? AND deleted_at IS NULL',
      [id],
      'IPORepository.getById'
    );
  }

  async add(ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>, ownerId?: string | null): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const sql = `
      INSERT INTO ipo_listings (
        id, backend_ipo_id, symbol, company_name, ipo_name, buy_price, quantity,
        open_date, close_date, listing_date, registrar, exchange, issue_type, allotment_date,
        logo_url, gmp_percent, gmp_value, archived, is_favorite, sync_version, sync_status, owner_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'PENDING', ?, ?, ?)
    `;
    const params = [
      id,
      ipo.backend_ipo_id ?? null,
      ipo.symbol ?? '',
      ipo.company_name ?? '',
      ipo.ipo_name,
      ipo.buy_price,
      ipo.quantity,
      ipo.open_date,
      ipo.close_date,
      ipo.listing_date,
      ipo.registrar ?? '',
      ipo.exchange ?? '',
      ipo.issue_type ?? '',
      ipo.allotment_date ?? '',
      ipo.logo_url ?? '',
      ipo.gmp_percent ?? 0,
      ipo.gmp_value ?? 0,
      ownerId || null,
      now,
      now,
    ];
    await safeRunAsync(this.db, sql, params, 'IPORepository.add');
  }


  async update(id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>): Promise<void> {
    if (!id) return;
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_listings SET
        ipo_name = ?, buy_price = ?, quantity = ?, open_date = ?, close_date = ?, listing_date = ?,
        registrar = ?, exchange = ?, issue_type = ?, allotment_date = ?, logo_url = ?,
        gmp_percent = ?, gmp_value = ?,
        backend_ipo_id = COALESCE(?, backend_ipo_id),
        symbol = COALESCE(?, symbol),
        company_name = COALESCE(?, company_name),
        updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    const params = [
      ipo.ipo_name,
      ipo.buy_price,
      ipo.quantity,
      ipo.open_date,
      ipo.close_date,
      ipo.listing_date,
      ipo.registrar ?? '',
      ipo.exchange ?? '',
      ipo.issue_type ?? '',
      ipo.allotment_date ?? '',
      ipo.logo_url ?? '',
      ipo.gmp_percent ?? 0,
      ipo.gmp_value ?? 0,
      ipo.backend_ipo_id !== undefined ? ipo.backend_ipo_id : null,
      ipo.symbol !== undefined ? ipo.symbol : null,
      ipo.company_name !== undefined ? ipo.company_name : null,
      now,
      id,
    ];
    await safeRunAsync(this.db, sql, params, 'IPORepository.update');
  }

  async updateGmp(id: string, gmpAmount: number | null, gmpPercent: number | null, profitLot: number | null): Promise<void> {
    if (!id) return;
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_listings SET
        gmp_value = ?, gmp_percent = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [gmpAmount ?? 0, gmpPercent ?? 0, now, id], 'IPORepository.updateGmp');
  }

  async archive(id: string, isArchived: boolean): Promise<void> {
    if (!id) return;
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_listings SET
        archived = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [isArchived ? 1 : 0, now, id], 'IPORepository.archive');
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    if (!id) return;
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_listings SET
        is_favorite = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [isFavorite ? 1 : 0, now, id], 'IPORepository.toggleFavorite');
  }

  async delete(id: string): Promise<void> {
    if (!id) return;
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_listings SET
        deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [now, now, id], 'IPORepository.delete');
  }
}

export class ApplicationRepository implements IApplicationRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<ApplicationWithDetails[]> {
    return await safeGetAllAsync<ApplicationWithDetails>(
      this.db,
      `
      SELECT a.id, a.user_id, a.ipo_id, a.category, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
             a.shares_count, a.is_favorite, a.created_at, a.broker_account_id,
             u.name        AS user_name,
             u.broker      AS user_broker,
             u.client_id   AS user_client_id,
             u.pan_number  AS user_pan_number,
             u.avatar_url  AS user_avatar_url,
             COALESCE(NULLIF(a.bank_name, ''), u.bank_name, '') AS user_bank_name,
             COALESCE(NULLIF(a.upi_app, ''), u.upi_app, '')   AS user_upi_app,
             COALESCE(NULLIF(i.ipo_name, ''), NULLIF(m.ipo_name, ''), NULLIF(m.company_name, ''), 'IPO') AS ipo_name,
             COALESCE(NULLIF(i.buy_price, 0), NULLIF(m.price_band_max, 0), NULLIF(m.price_band_min, 0), 100) AS buy_price,
             COALESCE(
               CASE
                 WHEN a.status IN ('Allotted', 'Partially Allotted', 'Holding', 'Sold') AND alt.allotted_shares > 0 THEN alt.allotted_shares
                 ELSE a.shares_count
               END,
               NULLIF(i.quantity, 0),
               NULLIF(m.lot_size, 0),
               1
             ) AS quantity,
             alt.allotted_shares,
             alt.allotted_lots,
             alt.allotment_status,
             COALESCE(NULLIF(i.open_date, ''), NULLIF(m.open_date, ''), '') AS open_date,
             COALESCE(NULLIF(i.logo_url, ''), NULLIF(m.logo_url, ''), '') AS ipo_logo_url
      FROM   ipo_applications a
      JOIN   users_table u ON a.user_id = u.id
      LEFT JOIN ipo_listings i ON a.ipo_id = i.id
      LEFT JOIN ipo_master m ON a.ipo_id = m.id
      LEFT JOIN ipo_allotments alt ON a.id = alt.application_id
      WHERE  a.deleted_at IS NULL AND u.deleted_at IS NULL AND (i.deleted_at IS NULL OR i.id IS NULL)
      ORDER  BY a.created_at DESC
      `,
      [],
      'ApplicationRepository.getAll'
    );
  }

  async addBulk(
    ipoId: string,
    userIds: string[],
    bankName?: string | Record<string, string>,
    upiApp?: string | Record<string, string>,
    lotCounts?: Record<string, number> | number,
    ownerId?: string | null,
    categoryMap?: string | Record<string, string>,
  ): Promise<BulkApplyResult> {
    const emptyResult: BulkApplyResult = {
      selectedCount: userIds?.length || 0,
      createdCount: 0,
      alreadyExistingCount: 0,
      failedCount: 0,
      createdAppIds: [],
      skippedUserIds: [],
      errors: [],
    };

    if (!ipoId) {
      if (__DEV__) console.warn('[ApplicationRepository.addBulk] Called with empty ipoId');
      return emptyResult;
    }
    if (!userIds || userIds.length === 0) {
      if (__DEV__) console.warn('[ApplicationRepository.addBulk] Called with empty userIds array');
      return emptyResult;
    }

    const timer = startPerfTimer('ApplicationRepository.addBulk', {
      applicantCount: userIds.length,
    });

    const now = getCurrentTime();
    const existing = await safeGetAllAsync<{ user_id: string; category: string | null }>(
      this.db,
      "SELECT user_id, COALESCE(NULLIF(category, ''), 'RETAIL') as category FROM ipo_applications WHERE ipo_id=? AND status != 'Cancelled' AND (deleted_at IS NULL OR deleted_at = '')",
      [ipoId],
      'ApplicationRepository.addBulk.existing'
    );
    const existingSet = new Set(existing.map((e) => `${e.user_id}_${e.category || 'RETAIL'}`));

    const ipoRow = await safeGetFirstAsync<{ quantity: number; issue_type: string; symbol?: string; company_name?: string }>(
      this.db,
      'SELECT quantity, issue_type, symbol, company_name FROM ipo_listings WHERE id = ?',
      [ipoId],
      'ApplicationRepository.addBulk.ipo'
    );
    let lotSize = ipoRow?.quantity;
    let isSme = (ipoRow?.issue_type || '').toUpperCase() === 'SME';
    if (!lotSize || lotSize <= 1) {
      const masterRow = await safeGetFirstAsync<{ lot_size: number; issue_type: string }>(
        this.db,
        'SELECT lot_size, issue_type FROM ipo_master WHERE id = ? OR (symbol IS NOT NULL AND symbol != "" AND symbol = ?) OR (company_name IS NOT NULL AND company_name != "" AND company_name = ?)',
        [ipoId, ipoRow?.symbol || '', ipoRow?.company_name || ''],
        'ApplicationRepository.addBulk.master'
      );
      if (masterRow?.lot_size && masterRow.lot_size > 0) {
        lotSize = masterRow.lot_size;
      }
      if (!isSme) isSme = (masterRow?.issue_type || '').toUpperCase() === 'SME';
    }
    if (!lotSize || lotSize < 1) lotSize = 1;

    const applicantsToApply: { uid: string; category: string }[] = [];
    const skippedUserIds: string[] = [];
    const seenInBatch = new Set<string>();

    for (const uid of userIds) {
      if (!uid) continue;
      const resolvedCategory =
        typeof categoryMap === 'object' && categoryMap !== null
          ? (categoryMap[uid] || 'RETAIL')
          : typeof categoryMap === 'string' && categoryMap.trim() !== ''
          ? categoryMap.trim()
          : 'RETAIL';
      const key = `${uid}_${resolvedCategory}`;
      if (existingSet.has(key)) {
        skippedUserIds.push(uid);
      } else if (!seenInBatch.has(key)) {
        seenInBatch.add(key);
        applicantsToApply.push({ uid, category: resolvedCategory });
      } else {
        skippedUserIds.push(uid);
      }
    }

    if (applicantsToApply.length === 0) {
      timer({ appliedCount: 0, skippedCount: userIds.length });
      return {
        selectedCount: userIds.length,
        createdCount: 0,
        alreadyExistingCount: skippedUserIds.length,
        failedCount: 0,
        createdAppIds: [],
        skippedUserIds,
        errors: [],
      };
    }

    const uidsToFetch = Array.from(new Set(applicantsToApply.map((a) => a.uid)));
    let userMap = new Map<string, { bank_name: string; upi_app: string }>();
    if (uidsToFetch.length > 0) {
      const placeholders = uidsToFetch.map(() => '?').join(',');
      const usersList = await safeGetAllAsync<{ id: string; bank_name: string; upi_app: string }>(
        this.db,
        `SELECT id, bank_name, upi_app FROM users_table WHERE id IN (${placeholders})`,
        uidsToFetch,
        'ApplicationRepository.addBulk.users'
      );
      userMap = new Map(usersList.map((u) => [u.id, u]));
    }

    // Load bank accounts to auto-bind upi_app if bank_name is provided but upi_app is not
    const allBanks = await safeGetAllAsync<{ bank_name: string; upi_app: string }>(
      this.db,
      'SELECT bank_name, upi_app FROM bank_accounts WHERE deleted_at IS NULL',
      [],
      'ApplicationRepository.addBulk.banks'
    );
    const bankUpiMap = new Map<string, string>();
    for (const b of allBanks) {
      if (b.bank_name && b.upi_app) {
        bankUpiMap.set(b.bank_name.toLowerCase().trim(), b.upi_app.trim());
      }
    }

    const tPrepStart = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

    // Pre-calculate all application rows in memory before entering write transaction
    const insertRows: { id: string; params: any[]; uid: string }[] = [];
    for (const app of applicantsToApply) {
      const { uid, category } = app;
      const id = Crypto.randomUUID();
      const userObj = userMap.get(uid);
      const rawBank = typeof bankName === 'object' && bankName !== null ? bankName[uid] : bankName;
      const rawUpi = typeof upiApp === 'object' && upiApp !== null ? upiApp[uid] : upiApp;

      const resolvedBank = rawBank && rawBank.trim() !== '' ? rawBank.trim() : (userObj?.bank_name || '');
      let resolvedUpi = rawUpi && rawUpi.trim() !== '' ? rawUpi.trim() : (userObj?.upi_app || '');
      if (!resolvedUpi && resolvedBank) {
        resolvedUpi = bankUpiMap.get(resolvedBank.toLowerCase().trim()) || '';
      }

      const userLots =
        typeof lotCounts === 'object' && lotCounts !== null
          ? (lotCounts[uid] ?? (isSme ? 2 : 1))
          : typeof lotCounts === 'number'
          ? lotCounts
          : isSme
          ? 2
          : 1;
      const calculatedShares = userLots > 0 ? userLots * lotSize : (isSme ? 2 * lotSize : lotSize);

      const params = [
        id,
        uid,
        ipoId,
        category,
        resolvedBank,
        resolvedUpi,
        calculatedShares,
        ownerId || null,
        now,
        now,
      ];
      insertRows.push({ id, params, uid });
    }
    const tPrepEnd = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    console.log(`[ApplicationRepository.addBulk] In-memory preparation completed in ${(tPrepEnd - tPrepStart).toFixed(1)}ms (${insertRows.length} applications)`);

    // Execute batch soft-delete and all inserts inside ONE atomic SQLite transaction
    const tTxStart = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const createdAppIds: string[] = [];
    const errors: Array<{ userId: string; reason: string }> = [];

    await runWithTransaction(
      this.db,
      async () => {
        // 1. Soft-delete previous cancelled applications matching uid + category
        for (const app of applicantsToApply) {
          await safeRunAsync(
            this.db,
            `UPDATE ipo_applications SET deleted_at=?, updated_at=? WHERE ipo_id=? AND user_id=? AND COALESCE(NULLIF(category, ''), 'RETAIL')=? AND status='Cancelled'`,
            [now, now, ipoId, app.uid, app.category],
            'ApplicationRepository.addBulk.cancelOldBatch'
          );
        }

        // 2. Insert all application records within the same active transaction
        const insertSql = `
          INSERT INTO ipo_applications (
            id, user_id, ipo_id, category, status, bank_name, upi_app, shares_count, tax, user_cut,
            is_favorite, sync_version, sync_status, owner_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Applied', ?, ?, ?, 0, 0, 0, 0, 'PENDING', ?, ?, ?)
        `;
        for (const row of insertRows) {
          try {
            await safeRunAsync(this.db, insertSql, row.params, 'ApplicationRepository.addBulk.insert');
            createdAppIds.push(row.id);
          } catch (insertErr: any) {
            errors.push({ userId: row.uid, reason: insertErr?.message || 'Database write error' });
            throw insertErr; // Trigger transaction rollback to maintain consistency
          }
        }
      },
      'ApplicationRepository.addBulk'
    );
    const tTxEnd = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    console.log(`[ApplicationRepository.addBulk] Atomic transaction committed in ${(tTxEnd - tTxStart).toFixed(1)}ms`);

    timer({
      appliedCount: createdAppIds.length,
      skippedCount: userIds.length - createdAppIds.length,
      durationMs: tTxEnd - tPrepStart,
    });

    return {
      selectedCount: userIds.length,
      createdCount: createdAppIds.length,
      alreadyExistingCount: skippedUserIds.length,
      failedCount: errors.length,
      createdAppIds,
      skippedUserIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }


  async update(
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
    bankName?: string,
    upiApp?: string,
    brokerAccountId?: string | null,
    sharesCount?: number | null,
  ): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[ApplicationRepository.update] Called with invalid/null id');
      return;
    }
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_applications SET
        status = ?,
        sell_price = ?,
        sale_date = ?,
        tax = ?,
        user_cut = ?,
        bank_name = CASE WHEN ? = 1 THEN ? ELSE bank_name END,
        upi_app = CASE WHEN ? = 1 THEN ? ELSE upi_app END,
        broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
        shares_count = CASE WHEN ? = 1 THEN ? ELSE shares_count END,
        updated_at = ?,
        sync_version = sync_version + 1,
        sync_status = 'PENDING'
      WHERE id = ?
    `;
    const params = [
      status,
      sellPrice ?? null,
      saleDate ?? null,
      tax ?? 0,
      userCut ?? 0,
      bankName !== undefined ? 1 : 0,
      bankName ?? null,
      upiApp !== undefined ? 1 : 0,
      upiApp ?? null,
      brokerAccountId !== undefined ? 1 : 0,
      brokerAccountId ?? null,
      sharesCount !== undefined ? 1 : 0,
      sharesCount ?? null,
      now,
      id,
    ];
    await safeRunAsync(this.db, sql, params, 'ApplicationRepository.update');
  }

  async partialSell(
    id: string,
    soldShares: number,
    totalShares: number,
    sellPrice: number,
    saleDate: string | null,
    tax: number = 0,
    userCut: number = 0,
    ownerId?: string | null,
    brokerAccountId?: string | null,
    bankName?: string,
    upiApp?: string,
  ): Promise<void> {
    if (!id || soldShares <= 0 || totalShares <= 0) return;
    const now = getCurrentTime();

    // Fetch original application details
    const orig = await safeGetFirstAsync<any>(
      this.db,
      'SELECT * FROM ipo_applications WHERE id = ? AND deleted_at IS NULL',
      [id],
      'ApplicationRepository.partialSell.orig'
    );
    if (!orig) return;

    const actualSoldQty = Math.min(soldShares, totalShares);
    const remainingShares = totalShares - actualSoldQty;

    const effectiveBrokerAccountId =
      brokerAccountId !== undefined ? brokerAccountId : (orig.broker_account_id || null);
    const effectiveBankName =
      bankName !== undefined && bankName.trim() !== '' ? bankName.trim() : (orig.bank_name || '');
    const effectiveUpiApp =
      upiApp !== undefined && upiApp.trim() !== '' ? upiApp.trim() : (orig.upi_app || '');
    const effectiveOwnerId = ownerId || orig.owner_id || null;

    // Check if an existing 'Sold' application card exists for the same user & IPO
    const existingSold = await safeGetFirstAsync<any>(
      this.db,
      "SELECT * FROM ipo_applications WHERE user_id = ? AND ipo_id = ? AND status = 'Sold' AND id != ? AND deleted_at IS NULL ORDER BY created_at DESC",
      [orig.user_id, orig.ipo_id, id],
      'ApplicationRepository.partialSell.existingSold'
    );

    if (existingSold) {
      // ── CONSOLIDATE WITH EXISTING SOLD CARD ──
      const prevQty = existingSold.shares_count || 0;
      const prevPrice = existingSold.sell_price || 0;
      const prevTax = existingSold.tax || 0;
      const prevUserCut = existingSold.user_cut || 0;

      const prevVal = prevPrice * prevQty;
      const newVal = sellPrice * actualSoldQty;

      const combinedQty = prevQty + actualSoldQty;
      const combinedVal = prevVal + newVal;
      const weightedAvgPrice = combinedQty > 0 ? combinedVal / combinedQty : sellPrice;

      // Update existing Sold application card
      const updateSoldSql = `
        UPDATE ipo_applications SET
          status = 'Sold', shares_count = ?, sell_price = ?, sale_date = ?, tax = ?, user_cut = ?,
          broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
          bank_name = CASE WHEN ? != '' THEN ? ELSE bank_name END,
          upi_app = CASE WHEN ? != '' THEN ? ELSE upi_app END,
          updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
        WHERE id = ?
      `;
      await safeRunAsync(
        this.db,
        updateSoldSql,
        [
          combinedQty,
          Number(weightedAvgPrice.toFixed(2)),
          saleDate ?? getCurrentTime().slice(0, 10),
          prevTax + tax,
          prevUserCut + userCut,
          effectiveBrokerAccountId !== undefined ? 1 : 0,
          effectiveBrokerAccountId,
          effectiveBankName,
          effectiveBankName,
          effectiveUpiApp,
          effectiveUpiApp,
          now,
          existingSold.id,
        ],
        'ApplicationRepository.partialSell.updateExistingSold'
      );

      if (remainingShares > 0) {
        // Update original holding application with remaining shares
        const updateHoldingSql = `
          UPDATE ipo_applications SET
            status = 'Holding', shares_count = ?,
            broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
            bank_name = CASE WHEN ? != '' THEN ? ELSE bank_name END,
            upi_app = CASE WHEN ? != '' THEN ? ELSE upi_app END,
            updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id = ?
        `;
        await safeRunAsync(
          this.db,
          updateHoldingSql,
          [
            remainingShares,
            effectiveBrokerAccountId !== undefined ? 1 : 0,
            effectiveBrokerAccountId,
            effectiveBankName,
            effectiveBankName,
            effectiveUpiApp,
            effectiveUpiApp,
            now,
            id,
          ],
          'ApplicationRepository.partialSell.updateHolding'
        );
      } else {
        // Soft delete original holding application as 0 shares remain
        const deleteHoldingSql = `
          UPDATE ipo_applications SET
            shares_count = 0, deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id = ?
        `;
        await safeRunAsync(this.db, deleteHoldingSql, [now, now, id], 'ApplicationRepository.partialSell.deleteHolding');
      }
    } else {
      // ── NO EXISTING SOLD CARD FOR THIS USER + IPO ──
      if (remainingShares <= 0) {
        // Full sell - update original record to Sold
        const updateSql = `
          UPDATE ipo_applications SET
            status = 'Sold', shares_count = ?, sell_price = ?, sale_date = ?, tax = ?, user_cut = ?,
            broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
            bank_name = CASE WHEN ? != '' THEN ? ELSE bank_name END,
            upi_app = CASE WHEN ? != '' THEN ? ELSE upi_app END,
            updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id = ?
        `;
        await safeRunAsync(
          this.db,
          updateSql,
          [
            totalShares,
            sellPrice,
            saleDate ?? getCurrentTime().slice(0, 10),
            tax,
            userCut,
            effectiveBrokerAccountId !== undefined ? 1 : 0,
            effectiveBrokerAccountId,
            effectiveBankName,
            effectiveBankName,
            effectiveUpiApp,
            effectiveUpiApp,
            now,
            id,
          ],
          'ApplicationRepository.partialSell.fullSell'
        );
      } else {
        // Partial sell - update original holding with remaining shares
        const updateHoldingSql = `
          UPDATE ipo_applications SET
            status = 'Holding', shares_count = ?,
            broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
            bank_name = CASE WHEN ? != '' THEN ? ELSE bank_name END,
            upi_app = CASE WHEN ? != '' THEN ? ELSE upi_app END,
            updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id = ?
        `;
        await safeRunAsync(
          this.db,
          updateHoldingSql,
          [
            remainingShares,
            effectiveBrokerAccountId !== undefined ? 1 : 0,
            effectiveBrokerAccountId,
            effectiveBankName,
            effectiveBankName,
            effectiveUpiApp,
            effectiveUpiApp,
            now,
            id,
          ],
          'ApplicationRepository.partialSell.updateHolding'
        );

        // Insert new Sold application card for sold shares
        const newId = Crypto.randomUUID();
        const insertSoldSql = `
          INSERT INTO ipo_applications (
            id, user_id, ipo_id, status, shares_count, sell_price, sale_date, tax, user_cut,
            bank_name, upi_app, broker_account_id, is_favorite, sync_version, sync_status, owner_id, created_at, updated_at
          ) VALUES (?, ?, ?, 'Sold', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', ?, ?, ?)
        `;
        const insertSoldParams = [
          newId,
          orig.user_id,
          orig.ipo_id,
          actualSoldQty,
          sellPrice,
          saleDate ?? getCurrentTime().slice(0, 10),
          tax,
          userCut,
          effectiveBankName,
          effectiveUpiApp,
          effectiveBrokerAccountId,
          effectiveOwnerId,
          now,
          now,
        ];
        await safeRunAsync(this.db, insertSoldSql, insertSoldParams, 'ApplicationRepository.partialSell.insertSold');
      }
    }
  }

  async updateBulkStatus(ids: string[], status: ApplicationStatus): Promise<void> {
    if (!ids || ids.length === 0) return;
    const now = getCurrentTime();
    const validIds = ids.filter((id) => Boolean(id));
    if (validIds.length === 0) return;

    await runWithTransaction(
      this.db,
      async () => {
        const placeholders = validIds.map(() => '?').join(',');
        const sql = `
          UPDATE ipo_applications SET
            status = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id IN (${placeholders})
        `;
        await safeRunAsync(this.db, sql, [status, now, ...validIds], 'ApplicationRepository.updateBulkStatus');
      },
      'ApplicationRepository.updateBulkStatus'
    );
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[ApplicationRepository.toggleFavorite] Called with invalid/null id');
      return;
    }
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_applications SET
        is_favorite = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [isFavorite ? 1 : 0, now, id], 'ApplicationRepository.toggleFavorite');
  }

  async delete(id: string): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[ApplicationRepository.delete] Called with invalid/null id');
      return;
    }
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_applications SET
        deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [now, now, id], 'ApplicationRepository.delete');
  }
}

export class BankRepository implements IBankRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<BankAccount[]> {
    return await safeGetAllAsync<BankAccount>(
      this.db,
      'SELECT * FROM bank_accounts WHERE deleted_at IS NULL ORDER BY bank_name',
      [],
      'BankRepository.getAll'
    );
  }

  async add(bankName: string, balance: number, upiApp?: string, ownerId?: string | null): Promise<BankAccount> {
    const trimmedBankName = bankName.trim();
    const trimmedUpiApp = upiApp ? upiApp.trim() : '';
    const now = getCurrentTime();

    // Check if an account for this bank already exists (case-insensitive) for this owner scope
    const existing = await safeGetFirstAsync<BankAccount>(
      this.db,
      ownerId
        ? 'SELECT * FROM bank_accounts WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "") AND LOWER(TRIM(bank_name)) = LOWER(?) AND deleted_at IS NULL'
        : 'SELECT * FROM bank_accounts WHERE (owner_id IS NULL OR owner_id = "") AND LOWER(TRIM(bank_name)) = LOWER(?) AND deleted_at IS NULL',
      ownerId ? [ownerId, trimmedBankName] : [trimmedBankName],
      'BankRepository.add.checkDuplicate'
    );

    if (existing) {
      const updatedBalance = balance !== undefined && balance !== null ? balance : existing.balance;
      const updatedUpiApp = trimmedUpiApp || existing.upi_app || '';
      const sqlUpdate = `
        UPDATE bank_accounts SET
          balance = ?,
          upi_app = ?,
          owner_id = COALESCE(?, owner_id),
          sync_status = 'PENDING',
          updated_at = ?
        WHERE id = ?
      `;
      await safeRunAsync(this.db, sqlUpdate, [updatedBalance, updatedUpiApp, ownerId || null, now, existing.id], 'BankRepository.add.updateExisting');
      return {
        ...existing,
        bank_name: trimmedBankName,
        balance: updatedBalance,
        upi_app: updatedUpiApp,
        owner_id: (ownerId || existing.owner_id) || undefined,
        updated_at: now,
      };
    }

    const id = Crypto.randomUUID();
    const sql = `
      INSERT INTO bank_accounts (
        id, bank_name, balance, upi_app, sync_version, sync_status, owner_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 'PENDING', ?, ?, ?)
    `;
    const params = [
      id,
      trimmedBankName,
      balance,
      trimmedUpiApp,
      ownerId || null,
      now,
      now,
    ];
    await safeRunAsync(this.db, sql, params, 'BankRepository.add');
    return {
      id,
      bank_name: trimmedBankName,
      balance,
      upi_app: trimmedUpiApp,
      owner_id: ownerId || undefined,
      created_at: now,
      updated_at: now,
    };
  }


  async updateBalance(id: string, balance?: number, bankName?: string, upiApp?: string): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[BankRepository.updateBalance] Called with invalid/null id');
      return;
    }
    const now = getCurrentTime();
    const trimmedBankName = (bankName !== undefined && bankName.trim().length > 0) ? bankName.trim() : null;
    const sanitizedBalance = (balance !== undefined && !isNaN(balance)) ? balance : null;

    await runWithTransaction(
      this.db,
      async () => {
        let oldBankName: string | null = null;
        if (trimmedBankName) {
          const oldBank = await safeGetFirstAsync<{ bank_name: string }>(
            this.db,
            'SELECT bank_name FROM bank_accounts WHERE id = ?',
            [id],
            'BankRepository.updateBalance.getOld'
          );
          oldBankName = oldBank?.bank_name ?? null;
        }

        const sql = `
          UPDATE bank_accounts SET
            balance = COALESCE(?, balance),
            bank_name = COALESCE(?, bank_name),
            upi_app = COALESCE(?, upi_app),
            updated_at = ?,
            sync_version = sync_version + 1,
            sync_status = 'PENDING'
          WHERE id = ?
        `;
        const params = [
          sanitizedBalance,
          trimmedBankName,
          typeof upiApp === 'string' ? upiApp.trim() : null,
          now,
          id,
        ];
        await safeRunAsync(this.db, sql, params, 'BankRepository.updateBalance');

        // Cascade rename to users and applications if bank name actually changed
        if (trimmedBankName && oldBankName && trimmedBankName !== oldBankName) {
          await safeRunAsync(
            this.db,
            `UPDATE users_table SET
               bank_name = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
             WHERE bank_name = ? AND deleted_at IS NULL`,
            [trimmedBankName, now, oldBankName],
            'BankRepository.updateBalance.cascadeUserBank'
          );
          await safeRunAsync(
            this.db,
            `UPDATE ipo_applications SET
               bank_name = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
             WHERE bank_name = ? AND deleted_at IS NULL`,
            [trimmedBankName, now, oldBankName],
            'BankRepository.updateBalance.cascadeAppBank'
          );
        }
      },
      'BankRepository.updateBalance'
    );
  }

  async delete(id: string, ownerId?: string | null): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[BankRepository.delete] Called with invalid/null id');
      return;
    }
    const now = getCurrentTime();
    let sql = `
      UPDATE bank_accounts SET
        deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    const params: any[] = [now, now, id];
    if (ownerId) {
      sql += ' AND (owner_id = ? OR owner_id IS NULL OR owner_id = "")';
      params.push(ownerId);
    } else if (ownerId === null || ownerId === '') {
      sql += ' AND (owner_id IS NULL OR owner_id = "")';
    }
    await safeRunAsync(this.db, sql, params, 'BankRepository.delete');
  }
}
