import { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { User, IPOListing, ApplicationWithDetails, BankAccount, ApplicationStatus } from '@/context/DBContext';

function getCurrentTime() {
  return new Date().toISOString();
}

import { repositoryAdapter } from '@/services/infrastructure';

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
  addBulk(ipoId: string, userIds: string[], bankName?: string, upiApp?: string): Promise<void>;
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
    return await repositoryAdapter.users.getAll(this.db);
  }

  async add(user: Omit<User, 'id'>): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const row = {
      id,
      name: user.name || '',
      pan_number: user.pan_number || '',
      client_id: user.client_id || '',
      upi_id: user.upi_id || '',
      broker: user.broker || '',
      tpin: user.tpin || '',
      upi_app: user.upi_app || '',
      bank_name: user.bank_name || '',
      avatar_url: user.avatar_url || user.avatarUrl || '',
      default_amount_blocked: user.default_amount_blocked || 0,
      archived: 0,
      sync_version: 0,
      created_at: now,
      updated_at: now,
    };
    await repositoryAdapter.users.insert(this.db, row);
  }

  async update(id: string, user: Omit<User, 'id'>): Promise<void> {
    const row = {
      name: user.name || '',
      pan_number: user.pan_number || '',
      client_id: user.client_id || '',
      upi_id: user.upi_id || '',
      broker: user.broker || '',
      tpin: user.tpin || '',
      upi_app: user.upi_app || '',
      bank_name: user.bank_name || '',
      avatar_url: user.avatar_url || user.avatarUrl || '',
      default_amount_blocked: user.default_amount_blocked || 0,
    };
    await repositoryAdapter.users.update(this.db, id, row);
  }

  async archive(id: string, isArchived: boolean): Promise<void> {
    const row = {
      archived: isArchived ? 1 : 0,
    };
    await repositoryAdapter.users.update(this.db, id, row);
  }

  async delete(id: string): Promise<void> {
    await repositoryAdapter.users.delete(this.db, id);
  }
}

export class IPORepository implements IIPORepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<IPOListing[]> {
    return await repositoryAdapter.ipos.getAll(this.db);
  }

  async getById(id: string): Promise<IPOListing | null> {
    const all = await this.getAll();
    return all.find((item) => item.id === id) || null;
  }

  async add(ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const row = {
      id,
      backend_ipo_id: ipo.backend_ipo_id ?? null,
      symbol: ipo.symbol ?? '',
      company_name: ipo.company_name ?? '',
      ipo_name: ipo.ipo_name,
      buy_price: ipo.buy_price,
      quantity: ipo.quantity,
      open_date: ipo.open_date,
      close_date: ipo.close_date,
      listing_date: ipo.listing_date,
      registrar: ipo.registrar ?? '',
      exchange: ipo.exchange ?? '',
      issue_type: ipo.issue_type ?? '',
      allotment_date: ipo.allotment_date ?? '',
      logo_url: ipo.logo_url ?? '',
      gmp_percent: ipo.gmp_percent ?? 0,
      gmp_value: ipo.gmp_value ?? 0,
      archived: 0,
      is_favorite: 0,
      sync_version: 0,
      created_at: now,
      updated_at: now,
    };
    await repositoryAdapter.ipos.insert(this.db, row);
  }

  async update(id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>): Promise<void> {
    const row: any = {
      ipo_name: ipo.ipo_name,
      buy_price: ipo.buy_price,
      quantity: ipo.quantity,
      open_date: ipo.open_date,
      close_date: ipo.close_date,
      listing_date: ipo.listing_date,
      registrar: ipo.registrar ?? '',
      exchange: ipo.exchange ?? '',
      issue_type: ipo.issue_type ?? '',
      allotment_date: ipo.allotment_date ?? '',
      logo_url: ipo.logo_url ?? '',
      gmp_percent: ipo.gmp_percent ?? 0,
      gmp_value: ipo.gmp_value ?? 0,
    };
    if (ipo.backend_ipo_id !== undefined) row.backend_ipo_id = ipo.backend_ipo_id;
    if (ipo.symbol !== undefined) row.symbol = ipo.symbol;
    if (ipo.company_name !== undefined) row.company_name = ipo.company_name;
    await repositoryAdapter.ipos.update(this.db, id, row);
  }

  async updateGmp(id: string, gmpAmount: number | null, gmpPercent: number | null, profitLot: number | null): Promise<void> {
    const row = {
      gmp_value: gmpAmount ?? 0,
      gmp_percent: gmpPercent ?? 0,
      gmp_amount: profitLot ?? 0,
    };
    await repositoryAdapter.ipos.update(this.db, id, row);
  }

  async archive(id: string, isArchived: boolean): Promise<void> {
    const row = {
      archived: isArchived ? 1 : 0,
    };
    await repositoryAdapter.ipos.update(this.db, id, row);
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    const row = {
      is_favorite: isFavorite ? 1 : 0,
    };
    await repositoryAdapter.ipos.update(this.db, id, row);
  }

  async delete(id: string): Promise<void> {
    await repositoryAdapter.ipos.delete(this.db, id);
  }
}

export class ApplicationRepository implements IApplicationRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<ApplicationWithDetails[]> {
    repositoryAdapter.applications.getAll(this.db).catch(() => {});
    return await this.db.getAllAsync<ApplicationWithDetails>(`
      SELECT a.id, a.user_id, a.ipo_id, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
             a.shares_count, a.is_favorite, a.created_at,
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
    `);
  }

  async addBulk(
    ipoId: string,
    userIds: string[],
    bankName?: string | Record<string, string>,
    upiApp?: string | Record<string, string>
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
    const existing = await this.db.getAllAsync<{ user_id: string }>(
      "SELECT user_id FROM ipo_applications WHERE ipo_id=? AND status != 'Cancelled' AND deleted_at IS NULL",
      [ipoId]
    );
    const existingSet = new Set(existing.map((e) => e.user_id));

    const uidsToFetch = userIds.filter((uid) => uid && !existingSet.has(uid));
    let userMap = new Map<string, { bank_name: string; upi_app: string }>();
    if (uidsToFetch.length > 0) {
      const placeholders = uidsToFetch.map(() => '?').join(',');
      const usersList = await this.db.getAllAsync<{ id: string; bank_name: string; upi_app: string }>(
        `SELECT id, bank_name, upi_app FROM users_table WHERE id IN (${placeholders})`,
        uidsToFetch
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
        await this.db.runAsync(
          "UPDATE ipo_applications SET deleted_at=? WHERE ipo_id=? AND user_id=? AND status='Cancelled'",
          [now, ipoId, uid]
        );
        const id = Crypto.randomUUID();
        const userObj = userMap.get(uid);
        const rawBank = typeof bankName === 'object' && bankName !== null ? bankName[uid] : bankName;
        const rawUpi = typeof upiApp === 'object' && upiApp !== null ? upiApp[uid] : upiApp;

        const resolvedBank = rawBank && rawBank.trim() !== '' ? rawBank.trim() : (userObj?.bank_name || '');
        const resolvedUpi = rawUpi && rawUpi.trim() !== '' ? rawUpi.trim() : (userObj?.upi_app || '');

        const appRow: any = {
          id,
          user_id: uid,
          ipo_id: ipoId,
          status: 'Applied',
          bank_name: resolvedBank,
          upi_app: resolvedUpi,
          tax: 0,
          user_cut: 0,
          is_favorite: 0,
          sync_version: 0,
          created_at: now,
          updated_at: now,
        };
        await repositoryAdapter.applications.insert(this.db, appRow);
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
    const row = {
      status,
      sell_price: sellPrice ?? null,
      sale_date: saleDate ?? null,
      tax: tax ?? 0,
      user_cut: userCut ?? 0,
    };
    await repositoryAdapter.applications.update(this.db, id, row);
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
    const remainingShares = totalShares - soldShares;
    const now = getCurrentTime();

    if (remainingShares <= 0) {
      // Full sell
      await repositoryAdapter.applications.update(this.db, id, {
        status: 'Sold',
        shares_count: totalShares,
        sell_price: sellPrice,
        sale_date: saleDate ?? getCurrentTime().slice(0, 10),
        tax,
        user_cut: userCut,
        updated_at: now,
      });
    } else {
      // Fetch original application details to clone
      const rows = await this.db.getAllAsync<any>(
        'SELECT * FROM ipo_applications WHERE id = ?',
        [id]
      );
      const orig = rows?.[0];
      if (!orig) return;

      // Update original holding application with remaining shares
      await repositoryAdapter.applications.update(this.db, id, {
        status: 'Holding',
        shares_count: remainingShares,
        updated_at: now,
      });

      // Insert new sold application for sold shares
      const newId = Crypto.randomUUID();
      const soldRow: any = {
        id: newId,
        user_id: orig.user_id,
        ipo_id: orig.ipo_id,
        status: 'Sold',
        shares_count: soldShares,
        sell_price: sellPrice,
        sale_date: saleDate ?? getCurrentTime().slice(0, 10),
        tax,
        user_cut: userCut,
        bank_name: orig.bank_name || '',
        upi_app: orig.upi_app || '',
        is_favorite: 0,
        sync_version: 0,
        created_at: now,
        updated_at: now,
      };
      await repositoryAdapter.applications.insert(this.db, soldRow);
    }
  }

  async updateBulkStatus(ids: string[], status: ApplicationStatus): Promise<void> {
    if (!ids || ids.length === 0) return;
    const now = getCurrentTime();
    for (const id of ids) {
      if (!id) continue;
      await repositoryAdapter.applications.update(this.db, id, { status, updated_at: now });
    }
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[ApplicationRepository.toggleFavorite] Called with invalid/null id');
      return;
    }
    const row = {
      is_favorite: isFavorite ? 1 : 0,
    };
    await repositoryAdapter.applications.update(this.db, id, row);
  }

  async delete(id: string): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[ApplicationRepository.delete] Called with invalid/null id');
      return;
    }
    await repositoryAdapter.applications.delete(this.db, id);
  }
}

export class BankRepository implements IBankRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<BankAccount[]> {
    return await repositoryAdapter.banks.getAll(this.db);
  }

  async add(bankName: string, balance: number, upiApp?: string): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const row = {
      id,
      bank_name: bankName.trim(),
      balance,
      upi_app: upiApp ? upiApp.trim() : '',
      sync_version: 0,
      created_at: now,
      updated_at: now,
    };
    await repositoryAdapter.banks.insert(this.db, row);
  }

  async updateBalance(id: string, balance: number, bankName?: string, upiApp?: string): Promise<void> {
    if (!id) {
      if (__DEV__) console.warn('[BankRepository.updateBalance] Called with invalid/null id');
      return;
    }
    const row: any = { balance };
    if (bankName !== undefined) {
      row.bank_name = bankName.trim();
    }
    if (upiApp !== undefined) {
      row.upi_app = upiApp.trim();
    }
    await repositoryAdapter.banks.update(this.db, id, row);
  }

  async delete(id: string): Promise<void> {
    await repositoryAdapter.banks.delete(this.db, id);
  }
}
