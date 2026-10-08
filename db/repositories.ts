import { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { User, IPOListing, ApplicationWithDetails, BankAccount, ApplicationStatus } from '@/context/DBContext';
import { safeGetAllAsync, safeGetFirstAsync, safeRunAsync } from '@/utils/sqliteDebug';

function getCurrentTime() {
  return new Date().toISOString();
}

export interface IUserRepository {
  getAll(): Promise<User[]>;
  add(user: Omit<User, 'id'>): Promise<void>;
  update(id: string, user: Omit<User, 'id'>): Promise<void>;
  archive(id: string, isArchived: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IBankRepository {
  getAll(): Promise<BankAccount[]>;
  add(bankName: string, balance: number, upiApp?: string): Promise<void>;
  updateBalance(id: string, balance: number, bankName?: string, upiApp?: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IIPORepository {
  getAll(): Promise<IPOListing[]>;
  getById(id: string): Promise<IPOListing | null>;
  add(ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>): Promise<void>;
  update(id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>): Promise<void>;
  updateGmp(id: string, gmpAmount: number | null, gmpPercent: number | null, profitLot: number | null): Promise<void>;
  archive(id: string, isArchived: boolean): Promise<void>;
  toggleFavorite(id: string, isFavorite: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IApplicationRepository {
  getAll(): Promise<ApplicationWithDetails[]>;
  addBulk(
    ipoId: string,
    userIds: string[],
    bankName?: string | Record<string, string>,
    upiApp?: string | Record<string, string>,
    lotCounts?: Record<string, number> | number
  ): Promise<void>;
  update(
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number
  ): Promise<void>;
  partialSell(
    id: string,
    soldShares: number,
    totalShares: number,
    sellPrice: number,
    saleDate: string | null,
    tax?: number,
    userCut?: number
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

  async add(user: Omit<User, 'id'>): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const sql = `
      INSERT INTO users_table (
        id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, avatar_url, default_amount_blocked,
        archived, sync_version, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
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
      now,
      now,
    ];
    await safeRunAsync(this.db, sql, params, 'UserRepository.add');
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
    const sql = `
      UPDATE users_table SET
        deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [now, now, id], 'UserRepository.delete');
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

  async add(ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const sql = `
      INSERT INTO ipo_listings (
        id, backend_ipo_id, symbol, company_name, ipo_name, buy_price, quantity,
        open_date, close_date, listing_date, registrar, exchange, issue_type, allotment_date,
        logo_url, gmp_percent, gmp_value, archived, is_favorite, sync_version, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'PENDING', ?, ?)
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
      SELECT a.id, a.user_id, a.ipo_id, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
             a.shares_count, a.is_favorite, a.created_at, a.broker_account_id,
             u.name        AS user_name,
             u.broker      AS user_broker,
             u.client_id   AS user_client_id,
             u.pan_number  AS user_pan_number,
             u.avatar_url  AS user_avatar_url,
             COALESCE(NULLIF(a.bank_name, ''), u.bank_name, '') AS user_bank_name,
             COALESCE(NULLIF(a.upi_app, ''), u.upi_app, '')   AS user_upi_app,
             i.ipo_name, i.buy_price, COALESCE(a.shares_count, i.quantity) AS quantity, i.open_date, i.logo_url AS ipo_logo_url
      FROM   ipo_applications a
      JOIN   users_table u ON a.user_id = u.id
      JOIN   ipo_listings i ON a.ipo_id = i.id
      WHERE  a.deleted_at IS NULL AND u.deleted_at IS NULL AND i.deleted_at IS NULL
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
    lotCounts?: Record<string, number> | number
  ): Promise<void> {
    if (!ipoId) {
      if (__DEV__) console.warn('[ApplicationRepository.addBulk] Called with empty ipoId');
      return;
    }
    if (!userIds || userIds.length === 0) {
      if (__DEV__) console.warn('[ApplicationRepository.addBulk] Called with empty userIds array');
      return;
    }
    const now = getCurrentTime();
    const existing = await safeGetAllAsync<{ user_id: string }>(
      this.db,
      "SELECT user_id FROM ipo_applications WHERE ipo_id=? AND status != 'Cancelled' AND deleted_at IS NULL",
      [ipoId],
      'ApplicationRepository.addBulk.existing'
    );
    const existingSet = new Set(existing.map((e) => e.user_id));

    const ipoRow = await safeGetFirstAsync<{ quantity: number; issue_type: string }>(
      this.db,
      'SELECT quantity, issue_type FROM ipo_listings WHERE id = ?',
      [ipoId],
      'ApplicationRepository.addBulk.ipo'
    );
    const lotSize = ipoRow?.quantity || 1;
    const isSme = (ipoRow?.issue_type || '').toUpperCase() === 'SME';

    const uidsToFetch = userIds.filter((uid) => uid && !existingSet.has(uid));
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

    for (const uid of userIds) {
      if (!uid) {
        if (__DEV__) console.warn('[ApplicationRepository.addBulk] Skipping empty uid');
        continue;
      }
      if (!existingSet.has(uid)) {
        // Soft delete any previous cancelled application for this user and IPO
        await safeRunAsync(
          this.db,
          "UPDATE ipo_applications SET deleted_at=? WHERE ipo_id=? AND user_id=? AND status='Cancelled'",
          [now, ipoId, uid],
          'ApplicationRepository.addBulk.cancelOld'
        );
        const id = Crypto.randomUUID();
        const userObj = userMap.get(uid);
        const rawBank = typeof bankName === 'object' && bankName !== null ? bankName[uid] : bankName;
        const rawUpi = typeof upiApp === 'object' && upiApp !== null ? upiApp[uid] : upiApp;

        const resolvedBank = rawBank && rawBank.trim() !== '' ? rawBank.trim() : (userObj?.bank_name || '');
        const resolvedUpi = rawUpi && rawUpi.trim() !== '' ? rawUpi.trim() : (userObj?.upi_app || '');

        const userLots =
          typeof lotCounts === 'object' && lotCounts !== null
            ? (lotCounts[uid] ?? (isSme ? 2 : 1))
            : typeof lotCounts === 'number'
            ? lotCounts
            : isSme
            ? 2
            : 1;
        const calculatedShares = userLots > 0 ? userLots * lotSize : (isSme ? 2 * lotSize : lotSize);

        const sql = `
          INSERT INTO ipo_applications (
            id, user_id, ipo_id, status, bank_name, upi_app, shares_count, tax, user_cut,
            is_favorite, sync_version, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, 'Applied', ?, ?, ?, 0, 0, 0, 0, 'PENDING', ?, ?)
        `;
        const params = [
          id,
          uid,
          ipoId,
          resolvedBank,
          resolvedUpi,
          calculatedShares,
          now,
          now,
        ];
        await safeRunAsync(this.db, sql, params, 'ApplicationRepository.addBulk.insert');
      }
    }
  }

  async update(
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
  ): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[ApplicationRepository.update] Called with invalid/null id');
      return;
    }
    const now = getCurrentTime();
    const sql = `
      UPDATE ipo_applications SET
        status = ?, sell_price = ?, sale_date = ?, tax = ?, user_cut = ?,
        updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    const params = [
      status,
      sellPrice ?? null,
      saleDate ?? null,
      tax ?? 0,
      userCut ?? 0,
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
          now,
          existingSold.id,
        ],
        'ApplicationRepository.partialSell.updateExistingSold'
      );

      if (remainingShares > 0) {
        // Update original holding application with remaining shares
        const updateHoldingSql = `
          UPDATE ipo_applications SET
            status = 'Holding', shares_count = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id = ?
        `;
        await safeRunAsync(this.db, updateHoldingSql, [remainingShares, now, id], 'ApplicationRepository.partialSell.updateHolding');
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
            updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id = ?
        `;
        await safeRunAsync(
          this.db,
          updateSql,
          [totalShares, sellPrice, saleDate ?? getCurrentTime().slice(0, 10), tax, userCut, now, id],
          'ApplicationRepository.partialSell.fullSell'
        );
      } else {
        // Partial sell - update original holding with remaining shares
        const updateHoldingSql = `
          UPDATE ipo_applications SET
            status = 'Holding', shares_count = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
          WHERE id = ?
        `;
        await safeRunAsync(this.db, updateHoldingSql, [remainingShares, now, id], 'ApplicationRepository.partialSell.updateHolding');

        // Insert new Sold application card for sold shares
        const newId = Crypto.randomUUID();
        const insertSoldSql = `
          INSERT INTO ipo_applications (
            id, user_id, ipo_id, status, shares_count, sell_price, sale_date, tax, user_cut,
            bank_name, upi_app, is_favorite, sync_version, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, 'Sold', ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', ?, ?)
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
          orig.bank_name || '',
          orig.upi_app || '',
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
    for (const id of ids) {
      if (!id) continue;
      const sql = `
        UPDATE ipo_applications SET
          status = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
        WHERE id = ?
      `;
      await safeRunAsync(this.db, sql, [status, now, id], 'ApplicationRepository.updateBulkStatus');
    }
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

  async add(bankName: string, balance: number, upiApp?: string): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const sql = `
      INSERT INTO bank_accounts (
        id, bank_name, balance, upi_app, sync_version, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 'PENDING', ?, ?)
    `;
    const params = [
      id,
      bankName.trim(),
      balance,
      upiApp ? upiApp.trim() : '',
      now,
      now,
    ];
    await safeRunAsync(this.db, sql, params, 'BankRepository.add');
  }

  async updateBalance(id: string, balance: number, bankName?: string, upiApp?: string): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[BankRepository.updateBalance] Called with invalid/null id');
      return;
    }
    const now = getCurrentTime();
    const sql = `
      UPDATE bank_accounts SET
        balance = ?,
        bank_name = COALESCE(?, bank_name),
        upi_app = COALESCE(?, upi_app),
        updated_at = ?,
        sync_version = sync_version + 1,
        sync_status = 'PENDING'
      WHERE id = ?
    `;
    const params = [
      balance,
      bankName !== undefined ? bankName.trim() : null,
      upiApp !== undefined ? upiApp.trim() : null,
      now,
      id,
    ];
    await safeRunAsync(this.db, sql, params, 'BankRepository.updateBalance');
  }

  async delete(id: string): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[BankRepository.delete] Called with invalid/null id');
      return;
    }
    const now = getCurrentTime();
    const sql = `
      UPDATE bank_accounts SET
        deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, sync_status = 'PENDING'
      WHERE id = ?
    `;
    await safeRunAsync(this.db, sql, [now, now, id], 'BankRepository.delete');
  }
}
