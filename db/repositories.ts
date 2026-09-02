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
  add(ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>): Promise<void>;
  update(id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>): Promise<void>;
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
      avatar_url: user.avatar_url || '',
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
      avatar_url: user.avatar_url || '',
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

  async add(ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const row = {
      id,
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
      archived: 0,
      is_favorite: 0,
      sync_version: 0,
      created_at: now,
      updated_at: now,
    };
    await repositoryAdapter.ipos.insert(this.db, row);
  }

  async update(id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>): Promise<void> {
    const row = {
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
             a.is_favorite,
             u.name    AS user_name,
             u.broker  AS user_broker,
             u.avatar_url AS user_avatar_url,
             COALESCE(NULLIF(a.bank_name, ''), u.bank_name, '') AS user_bank_name,
             COALESCE(NULLIF(a.upi_app, ''), u.upi_app, '')   AS user_upi_app,
             i.ipo_name, i.buy_price, i.quantity, i.open_date, i.logo_url AS ipo_logo_url
      FROM   ipo_applications a
      JOIN   users_table u ON a.user_id = u.id
      JOIN   ipo_listings i ON a.ipo_id = i.id
      WHERE  a.deleted_at IS NULL AND u.deleted_at IS NULL AND i.deleted_at IS NULL
      ORDER  BY a.created_at DESC
    `);
  }

  async addBulk(ipoId: string, userIds: string[], bankName?: string, upiApp?: string): Promise<void> {
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
      'SELECT user_id FROM ipo_applications WHERE ipo_id=? AND deleted_at IS NULL',
      [ipoId]
    );
    const existingSet = new Set(existing.map((e) => e.user_id));

    for (const uid of userIds) {
      if (!uid) {
        if (__DEV__) console.warn('[ApplicationRepository.addBulk] Skipping empty uid');
        continue;
      }
      if (!existingSet.has(uid)) {
        const id = Crypto.randomUUID();
        const appRow: any = {
          id,
          user_id: uid,
          ipo_id: ipoId,
          status: 'Applied',
          bank_name: bankName ?? '',
          upi_app: upiApp ?? '',
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
