import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { UserRepository, IPORepository, ApplicationRepository, BankRepository } from '@/db/repositories';
import { syncStore } from '@/services/sync/syncStatus';
import { uploadService } from '@/services/infrastructure';
import { safeRunAsync, safeGetFirstAsync } from '@/utils/sqliteDebug';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';

// ── Types ────────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  name: string;
  pan_number: string;
  client_id?: string;
  upi_id?: string;
  broker: string;
  tpin: string;
  upi_app: string;
  bank_name: string;
  default_amount_blocked: number;
  archived?: number;
};

export type IPOListing = {
  id: string;
  ipo_name: string;
  buy_price: number;
  quantity: number;
  open_date: string;
  close_date: string;
  listing_date: string;
  archived: number;    // 0 = active, 1 = archived
  is_favorite: number; // 0 = no, 1 = yes
  registrar?: string;
  exchange?: string;
  issue_type?: string;
  allotment_date?: string;
  logo_url?: string;
  gmp_percent?: number;
  gmp_value?: number;
};

export type ApplicationStatus = 'Applied' | 'Mandate Approved' | 'Allotted' | 'Partially Allotted' | 'Holding' | 'Not Allotted' | 'Sold' | 'Cancelled';

export type ApplicationWithDetails = {
  id: string;
  user_id: string;
  ipo_id: string;
  status: ApplicationStatus;
  sell_price: number | null;
  sale_date: string | null;
  tax: number;
  user_cut: number;
  user_name: string;
  user_broker: string;
  user_bank_name: string;
  user_upi_app: string;
  ipo_name: string;
  buy_price: number;
  quantity: number;
  open_date: string;
  is_favorite: number; // 0 = no, 1 = yes
};

export type BankAccount = {
  id: string;
  bank_name: string;
  balance: number;
};

type ImportResult = { users: number; ipos: number; applications: number };

export type IPOAllotmentRecord = {
  id: string;
  application_id: string;
  user_id: string;
  ipo_id: string;
  allotment_status: string;
  allotted_lots: number;
  allotted_shares: number;
  allotment_price: number;
  application_amount: number;
  refund_amount: number;
  registrar: string;
  verification_method: 'AUTOMATED' | 'USER_VERIFIED';
  checked_at: string;
  error_code?: string;
  created_at: string;
  updated_at: string;
};

export type SaveAllotmentParams = {
  application_id: string;
  user_id: string;
  ipo_id: string;
  allotment_status: string;
  allotted_lots?: number;
  allotted_shares?: number;
  allotment_price?: number;
  application_amount?: number;
  refund_amount?: number;
  registrar?: string;
  verification_method?: 'AUTOMATED' | 'USER_VERIFIED';
  error_code?: string;
};

type DBContextType = {
  users: User[];
  ipos: IPOListing[];
  applications: ApplicationWithDetails[];
  bankAccounts: BankAccount[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  // User CRUD
  addUser: (user: Omit<User, 'id'>) => Promise<void>;
  updateUser: (id: string, user: Omit<User, 'id'>) => Promise<void>;
  archiveUser: (id: string) => Promise<void>;
  unarchiveUser: (id: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  // IPO CRUD
  addIPO: (ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>) => Promise<void>;
  updateIPO: (id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>) => Promise<void>;
  archiveIPO: (id: string) => Promise<void>;
  unarchiveIPO: (id: string) => Promise<void>;
  deleteIPO: (id: string) => Promise<void>;
  toggleIPOFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  // Applications
  addBulkApplications: (ipoId: string, userIds: string[], bankName?: string, upiApp?: string) => Promise<void>;
  updateApplication: (
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
  ) => Promise<void>;
  updateApplicationDetails: (
    id: string,
    details: {
      status: ApplicationStatus;
      lots?: number;
      bid_price?: number;
      category?: string;
      bank_name?: string;
      upi_app?: string;
      mandate_status?: string;
      app_number?: string;
      sellPrice?: number | null;
      saleDate?: string | null;
      tax?: number;
      userCut?: number;
    }
  ) => Promise<void>;
  updateBulkApplications: (ids: string[], status: ApplicationStatus) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
  toggleFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  // Allotments
  getAllotments: () => Promise<IPOAllotmentRecord[]>;
  getAllotmentByAppId: (appId: string) => Promise<IPOAllotmentRecord | null>;
  saveAllotmentResult: (params: SaveAllotmentParams) => Promise<IPOAllotmentRecord>;
  // Bank accounts
  addBankAccount: (bankName: string, balance: number) => Promise<void>;
  updateBankBalance: (id: string, balance: number, bankName?: string) => Promise<void>;
  deleteBankAccount: (id: string) => Promise<void>;
  // Data management
  loadSampleData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  exportCSV: () => string;
  importCSV: (csv: string) => Promise<ImportResult>;
  exportJSON: () => string;
  importJSON: (json: string) => Promise<ImportResult>;
  autoExportEnabled: boolean;
  setAutoExportEnabled: (val: boolean) => Promise<void>;
};

// ── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// ── DB init ──────────────────────────────────────────────────────────────────

import { initDB } from '@/db/schema';

// ── Inner provider (uses useSQLiteContext) ────────────────────────────────────

const DBContext = createContext<DBContextType | null>(null);

function DBProviderInner({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [users, setUsers] = useState<User[]>([]);
  const [ipos, setIPOs] = useState<IPOListing[]>([]);
  const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Repair legacy rows where id is null or empty
    const nullBankRows = await db.getAllAsync<{ rowid: number }>(
      'SELECT rowid FROM bank_accounts WHERE id IS NULL OR id = ""',
    );
    for (const r of nullBankRows) {
      await db.runAsync('UPDATE bank_accounts SET id = ? WHERE rowid = ?', [Crypto.randomUUID(), r.rowid]);
    }

    const userRows = await db.getAllAsync<User>(
      'SELECT * FROM users_table WHERE deleted_at IS NULL ORDER BY name',
    );
    setUsers(userRows);

    const ipoRows = await db.getAllAsync<IPOListing>(
      'SELECT * FROM ipo_listings WHERE deleted_at IS NULL ORDER BY id DESC',
    );

    let masterRows: IPOListing[] = [];
    try {
      const masterIPOs = await db.getAllAsync<any>(
        `SELECT id, ipo_name, company_name, price_band_max AS buy_price, lot_size AS quantity, open_date, close_date, listing_date, allotment_date, registrar, exchange, issue_type, 0 AS archived, is_favorite FROM ipo_master WHERE deleted_at IS NULL AND (status = 'OPEN' OR status = 'UPCOMING' OR is_favorite = 1)`
      );
      const existingIds = new Set(ipoRows.map((r) => r.id));
      masterRows = masterIPOs
        .filter((m) => m && m.id && !existingIds.has(m.id))
        .map((m) => ({
          id: m.id,
          ipo_name: m.ipo_name || m.company_name || 'IPO',
          buy_price: typeof m.buy_price === 'number' && m.buy_price > 0 ? m.buy_price : 100,
          quantity: typeof m.quantity === 'number' && m.quantity > 0 ? m.quantity : 1,
          open_date: m.open_date || '',
          close_date: m.close_date || '',
          listing_date: m.listing_date || '',
          allotment_date: m.allotment_date || '',
          archived: 0,
          is_favorite: m.is_favorite || 0,
          registrar: m.registrar || '',
          exchange: m.exchange || '',
          issue_type: m.issue_type || 'Mainboard',
        }));
    } catch {
      // master table optional
    }

    setIPOs([...ipoRows, ...masterRows]);

    const appRows = await db.getAllAsync<ApplicationWithDetails>(`
      SELECT a.id, a.user_id, a.ipo_id, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
             a.is_favorite,
             u.name    AS user_name,
             u.broker  AS user_broker,
             COALESCE(NULLIF(a.bank_name, ''), u.bank_name, '') AS user_bank_name,
             COALESCE(NULLIF(a.upi_app, ''), u.upi_app, '')   AS user_upi_app,
             i.ipo_name, i.buy_price, i.quantity, i.open_date
      FROM   ipo_applications a
      JOIN   users_table u ON a.user_id = u.id
      JOIN   ipo_listings i ON a.ipo_id = i.id
      WHERE  a.deleted_at IS NULL AND u.deleted_at IS NULL AND i.deleted_at IS NULL
      ORDER  BY a.id DESC
    `);
    setApplications(appRows);

    const bankRows = await db.getAllAsync<BankAccount>(
      'SELECT * FROM bank_accounts WHERE deleted_at IS NULL ORDER BY bank_name',
    );
    setBankAccounts(bankRows);

    setIsLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Automatically refresh UI state when cloud sync pipeline finishes
  useEffect(() => {
    let prevSyncState = syncStore.getStatus().state;
    return syncStore.subscribe((status) => {
      if (prevSyncState === 'Syncing' && status.state === 'Idle') {
        refresh();
      }
      prevSyncState = status.state;
    });
  }, [refresh]);

  // ── User CRUD ──────────────────────────────────────────────────────────────

  const addUser = async (user: Omit<User, 'id'>) => {
    const repo = new UserRepository(db);
    await repo.add(user);
    await refresh();
  };

  const updateUser = async (id: string, user: Omit<User, 'id'>) => {
    const repo = new UserRepository(db);
    await repo.update(id, user);
    await refresh();
  };

  const archiveUser = async (id: string) => {
    const repo = new UserRepository(db);
    await repo.archive(id, true);
    await refresh();
  };

  const unarchiveUser = async (id: string) => {
    const repo = new UserRepository(db);
    await repo.archive(id, false);
    await refresh();
  };

  const deleteUser = async (id: string) => {
    const repo = new UserRepository(db);
    await repo.delete(id);
    await refresh();
  };

  // ── IPO CRUD ───────────────────────────────────────────────────────────────

  const addIPO = async (ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>) => {
    const repo = new IPORepository(db);
    await repo.add(ipo);
    await refresh();
  };

  const updateIPO = async (id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>) => {
    const repo = new IPORepository(db);
    await repo.update(id, ipo);
    await refresh();
  };

  const archiveIPO = async (id: string) => {
    const repo = new IPORepository(db);
    await repo.archive(id, true);
    await refresh();
  };

  const unarchiveIPO = async (id: string) => {
    const repo = new IPORepository(db);
    await repo.archive(id, false);
    await refresh();
  };

  const toggleIPOFavorite = async (id: string, isFavorite: boolean) => {
    const repo = new IPORepository(db);
    await repo.toggleFavorite(id, isFavorite);
    await refresh();
  };

  const deleteIPO = async (id: string) => {
    const repo = new IPORepository(db);
    await repo.delete(id);
    await refresh();
  };

  // ── Applications ───────────────────────────────────────────────────────────

  const addBulkApplications = async (ipoId: string, userIds: string[], bankName?: string, upiApp?: string) => {
    if (!ipoId) return;
    const now = new Date().toISOString();
    let resolvedId = ipoId;

    // 1. Check if record exists in ipo_listings
    const existingInListings = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM ipo_listings WHERE id = ? OR ipo_name = ?',
      [ipoId, ipoId]
    );

    if (existingInListings) {
      resolvedId = existingInListings.id;
    } else {
      // 2. Resolve from ipo_master if selected from Smart IPO Database
      const masterRecord = await db.getFirstAsync<any>(
        'SELECT * FROM ipo_master WHERE id = ? OR company_name = ? OR ipo_name = ?',
        [ipoId, ipoId, ipoId]
      );

      if (masterRecord) {
        resolvedId = masterRecord.id;
        await db.runAsync(
          `INSERT OR IGNORE INTO ipo_listings (
            id, ipo_name, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
            registrar, exchange, issue_type, archived, is_favorite, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            masterRecord.id,
            masterRecord.ipo_name || masterRecord.company_name || 'IPO',
            masterRecord.price_band_max || masterRecord.price_band_min || 100,
            masterRecord.lot_size || 1,
            masterRecord.open_date || '',
            masterRecord.close_date || '',
            masterRecord.listing_date || '',
            masterRecord.allotment_date || '',
            masterRecord.registrar || '',
            masterRecord.exchange || '',
            masterRecord.issue_type || 'Mainboard',
            masterRecord.is_favorite || 0,
            now,
            now,
          ]
        );
      } else {
        // Fallback shadow entry if neither ipo_master nor ipo_listings record exists yet
        await db.runAsync(
          `INSERT OR IGNORE INTO ipo_listings (
            id, ipo_name, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
            registrar, exchange, issue_type, archived, is_favorite, created_at, updated_at
          ) VALUES (?, ?, ?, ?, '', '', '', '', '', 'NSE, BSE', 'Mainboard', 0, 0, ?, ?)`,
          [ipoId, ipoId, 100, 1, now, now]
        );
      }
    }

    const repo = new ApplicationRepository(db);
    await repo.addBulk(resolvedId, userIds, bankName, upiApp);
    await refresh();
  };

  const handleBankAllotmentDebit = async (
    targetDb: any,
    appId: string,
    newStatus: ApplicationStatus,
    details?: Partial<{ lots: number; bid_price: number; bank_name: string }>
  ) => {
    try {
      const app = await targetDb.getFirstAsync(
        `SELECT a.*, l.buy_price as ipo_buy_price, l.quantity as ipo_quantity, u.bank_name as user_bank_name
         FROM ipo_applications a
         LEFT JOIN ipo_listings l ON a.ipo_id = l.id
         LEFT JOIN users_table u ON a.user_id = u.id
         WHERE a.id = ?`,
        [appId]
      );

      if (!app) return;

      const oldStatus = app.status;
      const bankName = (details?.bank_name ?? app.user_bank_name ?? app.bank_name ?? '').trim();
      if (!bankName) return;

      const buyPrice = details?.bid_price ?? app.bid_price ?? app.ipo_buy_price ?? 0;
      const qty = (details?.lots ?? app.lots ?? 1) * (app.ipo_quantity ?? 1);
      const amount = buyPrice * qty;

      if (amount <= 0) return;

      const wasAllotted = oldStatus === 'Allotted' || oldStatus === 'Partially Allotted';
      const isAllotted = newStatus === 'Allotted' || newStatus === 'Partially Allotted';
      const nowIso = new Date().toISOString();

      if (!wasAllotted && isAllotted) {
        // Debiting money from bank account balance when IPO is allotted
        await targetDb.runAsync(
          `UPDATE bank_accounts SET balance = balance - ?, updated_at = ? WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM(?))`,
          [amount, nowIso, bankName]
        );
      } else if (wasAllotted && !isAllotted) {
        // Crediting/Refunding money back to bank account balance if allotment status is reverted
        await targetDb.runAsync(
          `UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM(?))`,
          [amount, nowIso, bankName]
        );
      }
    } catch (err) {
      console.warn('[handleBankAllotmentDebit] Error:', err);
    }
  };

  const updateApplication = async (
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
  ) => {
    await handleBankAllotmentDebit(db, id, status);
    const repo = new ApplicationRepository(db);
    await repo.update(id, status, sellPrice, saleDate, tax, userCut);
    await refresh();
  };

  const updateApplicationDetails = async (
    id: string,
    details: {
      status: ApplicationStatus;
      lots?: number;
      bid_price?: number;
      category?: string;
      bank_name?: string;
      upi_app?: string;
      mandate_status?: string;
      app_number?: string;
      sellPrice?: number | null;
      saleDate?: string | null;
      tax?: number;
      userCut?: number;
    }
  ) => {
    await handleBankAllotmentDebit(db, id, details.status, details);
    const repo = new ApplicationRepository(db);
    await repo.update(id, details.status, details.sellPrice, details.saleDate, details.tax, details.userCut);
    if (details.bank_name || details.upi_app || details.app_number || details.lots || details.bid_price || details.mandate_status || details.category) {
      await db.runAsync(
        `UPDATE ipo_applications SET
          user_bank_name = COALESCE(?, user_bank_name),
          user_upi_app = COALESCE(?, user_upi_app),
          app_number = COALESCE(?, app_number),
          lots = COALESCE(?, lots),
          bid_price = COALESCE(?, bid_price),
          mandate_status = COALESCE(?, mandate_status),
          category = COALESCE(?, category),
          updated_at = ?
         WHERE id = ?`,
        [
          details.bank_name ?? null,
          details.upi_app ?? null,
          details.app_number ?? null,
          details.lots ?? null,
          details.bid_price ?? null,
          details.mandate_status ?? null,
          details.category ?? null,
          new Date().toISOString(),
          id
        ]
      );
    }
    await refresh();
  };

  const updateBulkApplications = async (ids: string[], status: ApplicationStatus) => {
    for (const id of ids) {
      await handleBankAllotmentDebit(db, id, status);
    }
    const repo = new ApplicationRepository(db);
    await repo.updateBulkStatus(ids, status);
    await refresh();
  };

  const deleteApplication = async (id: string) => {
    await handleBankAllotmentDebit(db, id, 'Not Allotted' as ApplicationStatus);
    const repo = new ApplicationRepository(db);
    await repo.delete(id);
    await refresh();
  };

  const toggleFavorite = async (id: string, isFavorite: boolean) => {
    await db.runAsync('UPDATE ipo_applications SET is_favorite=? WHERE id=?', [isFavorite ? 1 : 0, id]);
    await refresh();
  };

  // ── Allotments ─────────────────────────────────────────────────────────────

  const getAllotments = async (): Promise<IPOAllotmentRecord[]> => {
    try {
      const rows = await db.getAllAsync<IPOAllotmentRecord>('SELECT * FROM ipo_allotments ORDER BY checked_at DESC');
      return rows || [];
    } catch {
      return [];
    }
  };

  const getAllotmentByAppId = async (appId: string): Promise<IPOAllotmentRecord | null> => {
    try {
      const row = await db.getFirstAsync<IPOAllotmentRecord>('SELECT * FROM ipo_allotments WHERE application_id = ?', [appId]);
      return row || null;
    } catch {
      return null;
    }
  };

  const saveAllotmentResult = async (params: SaveAllotmentParams): Promise<IPOAllotmentRecord> => {
    const now = new Date().toISOString();
    const existing = await getAllotmentByAppId(params.application_id);
    const id = existing?.id || Crypto.randomUUID();

    const allottedLots = params.allotted_lots ?? (params.allotment_status === 'ALLOTTED' ? 1 : 0);
    const allottedShares = params.allotted_shares ?? 0;
    const allotmentPrice = params.allotment_price ?? 0;
    const applicationAmount = params.application_amount ?? 0;
    const refundAmount = params.refund_amount ?? (
      params.allotment_status === 'NOT_ALLOTTED'
        ? applicationAmount
        : params.allotment_status === 'ALLOTTED'
        ? 0
        : Math.max(0, applicationAmount - (allottedShares * allotmentPrice))
    );
    const registrar = params.registrar || '';
    const verificationMethod = params.verification_method || 'AUTOMATED';
    const errorCode = params.error_code || '';

    await db.runAsync(
      `INSERT INTO ipo_allotments (
        id, application_id, user_id, ipo_id, allotment_status, allotted_lots, allotted_shares,
        allotment_price, application_amount, refund_amount, registrar, verification_method,
        checked_at, error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(application_id) DO UPDATE SET
        allotment_status=excluded.allotment_status,
        allotted_lots=excluded.allotted_lots,
        allotted_shares=excluded.allotted_shares,
        allotment_price=excluded.allotment_price,
        application_amount=excluded.application_amount,
        refund_amount=excluded.refund_amount,
        registrar=excluded.registrar,
        verification_method=excluded.verification_method,
        checked_at=excluded.checked_at,
        error_code=excluded.error_code,
        updated_at=excluded.updated_at`,
      [
        id,
        params.application_id,
        params.user_id,
        params.ipo_id,
        params.allotment_status,
        allottedLots,
        allottedShares,
        allotmentPrice,
        applicationAmount,
        refundAmount,
        registrar,
        verificationMethod,
        now,
        errorCode,
        existing?.created_at || now,
        now,
      ]
    );

    // Task 7: Update application status ONLY for genuine allotment results.
    // Technical errors MUST leave previous application status unchanged.
    if (params.allotment_status === 'ALLOTTED') {
      await updateApplication(params.application_id, 'Allotted');
    } else if (params.allotment_status === 'PARTIALLY_ALLOTTED') {
      await updateApplication(params.application_id, 'Partially Allotted');
    } else if (params.allotment_status === 'NOT_ALLOTTED') {
      await updateApplication(params.application_id, 'Not Allotted');
    }

    // Trigger allotment notification (deduplicated & technical error safe)
    try {
      const { triggerAllotmentNotification } = require('@/services/notifications/notificationEngine');
      const userObj = users.find((u) => u.id === params.user_id);
      const ipoObj = ipos.find((i) => i.id === params.ipo_id);
      await triggerAllotmentNotification(db, {
        applicationId: params.application_id,
        ipoId: params.ipo_id,
        ipoName: ipoObj?.ipo_name || 'IPO',
        userName: userObj?.name || 'Applicant',
        allotmentStatus: params.allotment_status,
        allottedShares: allottedShares,
      });
    } catch {}

    await refresh();

    return {
      id,
      application_id: params.application_id,
      user_id: params.user_id,
      ipo_id: params.ipo_id,
      allotment_status: params.allotment_status,
      allotted_lots: allottedLots,
      allotted_shares: allottedShares,
      allotment_price: allotmentPrice,
      application_amount: applicationAmount,
      refund_amount: refundAmount,
      registrar,
      verification_method: verificationMethod,
      checked_at: now,
      error_code: errorCode,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
  };

  // ── Bank accounts ──────────────────────────────────────────────────────────

  const addBankAccount = async (bankName: string, balance: number) => {
    const repo = new BankRepository(db);
    await repo.add(bankName, balance);
    await refresh();
  };

  const updateBankBalance = async (id: string, balance: number, bankName?: string) => {
    const repo = new BankRepository(db);
    await repo.updateBalance(id, balance, bankName);
    await refresh();
  };

  const deleteBankAccount = async (id: string) => {
    const repo = new BankRepository(db);
    await repo.delete(id);
    await refresh();
  };

  // ── Data management ────────────────────────────────────────────────────────

  const clearAllData = async () => {
    await db.execAsync('DELETE FROM ipo_applications');
    await db.execAsync('DELETE FROM ipo_listings');
    await db.execAsync('DELETE FROM users_table');
    await db.execAsync('DELETE FROM bank_accounts');
    await refresh();
  };

  const loadSampleData = async () => {
    await db.execAsync('DELETE FROM ipo_applications');
    await db.execAsync('DELETE FROM ipo_listings');
    await db.execAsync('DELETE FROM users_table');
    await db.execAsync('DELETE FROM bank_accounts');

    // Users
    const now = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO users_table (id, name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Dhiru', 'AAAPD1234A', 'Dhan', '123456', 'PhonePe', 'Kotak M Bank', 14998, now, now],
    );
    await db.runAsync(
      'INSERT INTO users_table (id, name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Vishal', 'BBBPV5678B', 'Upstox', '234567', 'GPay', 'Axis Bank', 14998, now, now],
    );
    await db.runAsync(
      'INSERT INTO users_table (id, name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Umesh', 'CCCU9012C', 'Groww', '345678', 'BHIM', 'HDFC Bank', 14998, now, now],
    );

    // Bank accounts with sample balances
    await db.runAsync(
      'INSERT INTO bank_accounts (id, bank_name, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [Crypto.randomUUID(), 'Kotak M Bank', 75000, now, now],
    );
    await db.runAsync(
      'INSERT INTO bank_accounts (id, bank_name, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [Crypto.randomUUID(), 'Axis Bank', 50000, now, now],
    );
    await db.runAsync(
      'INSERT INTO bank_accounts (id, bank_name, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [Crypto.randomUUID(), 'HDFC Bank', 90000, now, now],
    );

    // IPOs
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,allotment_date,listing_date,registrar,exchange,issue_type) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['Advit Jewels', 56, 2000, '2025-11-10', '2025-11-12', '2025-11-13', '2025-11-15', 'Bigshare Services', 'BSE SME', 'SME'],
    );
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,allotment_date,listing_date,registrar,exchange,issue_type) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['HDB Financial', 500, 35, '2025-10-28', '2025-10-30', '2025-11-01', '2025-11-04', 'KFin Technologies', 'NSE', 'Mainboard'],
    );
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,allotment_date,listing_date,registrar,exchange,issue_type) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['Ola Electric', 76, 195, '2025-10-15', '2025-10-17', '2025-10-18', '2025-10-20', 'Link Intime India', 'NSE', 'Mainboard'],
    );

    // Get IDs
    const u1 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=?', ['Dhiru']);
    const u2 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=?', ['Vishal']);
    const u3 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=?', ['Umesh']);
    const i1 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=?', ['Advit Jewels']);
    const i2 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=?', ['HDB Financial']);
    const i3 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=?', ['Ola Electric']);

    if (!u1 || !u2 || !u3 || !i1 || !i2 || !i3) return;

    // Applications
    await db.runAsync(
      'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), u1.id, i1.id, 'Sold', 72, '2025-11-15', 150, 500, new Date().toISOString(), new Date().toISOString()],
    );
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i1.id, 'Allotted', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u3.id, i1.id, 'Not Allotted', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync(
      'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), u1.id, i2.id, 'Sold', 620, '2025-11-04', 200, 500, new Date().toISOString(), new Date().toISOString()],
    );
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i2.id, 'Applied', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u3.id, i2.id, 'Applied', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u1.id, i3.id, 'Not Allotted', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i3.id, 'Applied', new Date().toISOString(), new Date().toISOString()]);

    await refresh();
  };

  // ── JSON export / import ─────────────────────────────────────────────────

  const exportJSON = (): string => {
    return JSON.stringify(
      {
        version: 1,
        exported_at: new Date().toISOString(),
        banks: bankAccounts,
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          pan_number: u.pan_number,
          broker: u.broker,
          tpin: u.tpin,
          upi_app: u.upi_app,
          bank_name: u.bank_name,
          default_amount_blocked: u.default_amount_blocked,
          archived: u.archived ?? 0,
        })),
        ipos: ipos.map((i) => ({
          id: i.id,
          ipo_name: i.ipo_name,
          buy_price: i.buy_price,
          quantity: i.quantity,
          open_date: i.open_date,
          close_date: i.close_date,
          listing_date: i.listing_date,
          archived: i.archived ?? 0,
          is_favorite: i.is_favorite ?? 0,
          registrar: i.registrar,
          exchange: i.exchange,
          issue_type: i.issue_type,
          allotment_date: i.allotment_date,
        })),
        applications: applications.map((a) => ({
          id: a.id,
          user_id: a.user_id,
          ipo_id: a.ipo_id,
          status: a.status,
          sell_price: a.sell_price,
          sale_date: a.sale_date,
          tax: a.tax,
          user_cut: a.user_cut,
          is_favorite: a.is_favorite ?? 0,
        })),
      },
      null,
      2,
    );
  };

    const importJSON = async (json: string): Promise<ImportResult> => {
    const data = JSON.parse(json) as {
      version?: number;
      banks?: BankAccount[];
      users?: User[];
      ipos?: IPOListing[];
      applications?: Array<{
        id: string; user_id: string; ipo_id: string; status: ApplicationStatus;
        sell_price: number | null; sale_date: string | null; tax: number; user_cut: number;
        is_favorite?: number;
      }>;
    };

    let bankImported = 0; let userCount = 0; let ipoCount = 0; let appCount = 0;
    let bankQueued = 0; let userQueued = 0; let ipoQueued = 0; let appQueued = 0;
    const userIdMap = new Map<string, string>();
    const ipoIdMap = new Map<string, string>();
    const now = new Date().toISOString();

    for (const bank of data.banks ?? []) {
      if (!bank || !bank.bank_name) continue;
      const existing = await safeGetFirstAsync(db, 'SELECT id FROM bank_accounts WHERE bank_name=?', [bank.bank_name], 'DBContext.importJSON.bank');
      if (!existing) {
        const id = Crypto.randomUUID();
        const balance = bank.balance ?? 0;
        await safeRunAsync(db, 'INSERT INTO bank_accounts (id, bank_name, balance, created_at, updated_at) VALUES (?,?,?,?,?)', [id, bank.bank_name, balance, now, now], 'DBContext.importJSON.insertBank');
        bankImported++;

        await uploadService.enqueue(db, 'bank_accounts', id);
      }
    }

    for (const u of data.users ?? []) {
      if (!u) continue;
      const pan = u.pan_number?.trim() || '';
      const name = u.name?.trim() || 'Unknown User';
      const uId = u.id;

      let existing: { id: string } | null = null;
      if (pan) {
        existing = await safeGetFirstAsync<{ id: string }>(
          db,
          'SELECT id FROM users_table WHERE pan_number = ? OR id = ?',
          [pan, uId],
          'DBContext.importJSON.user'
        );
      } else if (uId) {
        existing = await safeGetFirstAsync<{ id: string }>(
          db,
          'SELECT id FROM users_table WHERE id = ? OR (name = ? AND name != "")',
          [uId, name],
          'DBContext.importJSON.user'
        );
      }

      const archivedVal = u.archived ? 1 : 0;
      if (existing) {
        userIdMap.set(uId, existing.id);
        if (u.archived !== undefined) {
          await safeRunAsync(
            db,
            'UPDATE users_table SET archived = ? WHERE id = ?',
            [archivedVal, existing.id],
            'DBContext.importJSON.updateUserArchived'
          );
        }
      } else {
        const newId = uId || Crypto.randomUUID();
        const defaultAmount = u.default_amount_blocked ?? 0;
        await safeRunAsync(
          db,
          'INSERT INTO users_table (id, name, pan_number, broker, tpin, upi_app, bank_name, default_amount_blocked, archived, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [newId, name, pan, u.broker || '', u.tpin || '', u.upi_app || '', u.bank_name || '', defaultAmount, archivedVal, now, now],
          'DBContext.importJSON.insertUser'
        );
        userIdMap.set(uId, newId);
        userCount++;
        await uploadService.enqueue(db, 'users_table', newId);
      }
    }

    for (const ipo of data.ipos ?? []) {
      if (!ipo) continue;
      const ipoName = ipo.ipo_name?.trim() || 'Unknown IPO';
      const ipoId = ipo.id;

      let existing: { id: string } | null = null;
      if (ipoId) {
        existing = await safeGetFirstAsync<{ id: string }>(
          db,
          'SELECT id FROM ipo_listings WHERE id = ? OR ipo_name = ?',
          [ipoId, ipoName],
          'DBContext.importJSON.ipo'
        );
      } else {
        existing = await safeGetFirstAsync<{ id: string }>(
          db,
          'SELECT id FROM ipo_listings WHERE ipo_name = ?',
          [ipoName],
          'DBContext.importJSON.ipo'
        );
      }

      const archivedVal = ipo.archived ? 1 : 0;
      const isFavVal = ipo.is_favorite ? 1 : 0;

      if (existing) {
        ipoIdMap.set(ipoId, existing.id);
        if (ipo.archived !== undefined || ipo.is_favorite !== undefined) {
          await safeRunAsync(
            db,
            'UPDATE ipo_listings SET archived = COALESCE(?, archived), is_favorite = COALESCE(?, is_favorite) WHERE id = ?',
            [ipo.archived !== undefined ? archivedVal : null, ipo.is_favorite !== undefined ? isFavVal : null, existing.id],
            'DBContext.importJSON.updateIPOArchived'
          );
        }
      } else {
        const newId = ipoId || Crypto.randomUUID();
        await safeRunAsync(
          db,
          'INSERT INTO ipo_listings (id, ipo_name, buy_price, quantity, open_date, close_date, listing_date, archived, is_favorite, registrar, exchange, issue_type, allotment_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [newId, ipoName, ipo.buy_price || 0, ipo.quantity || 0, ipo.open_date || '', ipo.close_date || '', ipo.listing_date || '', archivedVal, isFavVal, ipo.registrar || '', ipo.exchange || '', ipo.issue_type || '', ipo.allotment_date || '', now, now],
          'DBContext.importJSON.insertIPO'
        );
        ipoIdMap.set(ipoId, newId);
        ipoCount++;
        await uploadService.enqueue(db, 'ipo_listings', newId);
      }
    }

    for (const app of data.applications ?? []) {
      if (!app) continue;
      const targetUserId = userIdMap.get(app.user_id) ?? app.user_id;
      const targetIpoId = ipoIdMap.get(app.ipo_id) ?? app.ipo_id;

      if (!targetUserId || !targetIpoId) continue;

      // Verify foreign key constraints before inserting application
      const userExists = await safeGetFirstAsync(
        db,
        'SELECT id FROM users_table WHERE id = ?',
        [targetUserId],
        'DBContext.importJSON.checkUserFK'
      );
      const ipoExists = await safeGetFirstAsync(
        db,
        'SELECT id FROM ipo_listings WHERE id = ?',
        [targetIpoId],
        'DBContext.importJSON.checkIpoFK'
      );

      if (!userExists || !ipoExists) {
        console.warn(`[DBContext.importJSON] Skipping application because user (${targetUserId}) or IPO (${targetIpoId}) does not exist in database.`);
        continue;
      }

      const isFavVal = app.is_favorite ? 1 : 0;
      const dup = await safeGetFirstAsync<{ id: string }>(
        db,
        'SELECT id FROM ipo_applications WHERE user_id = ? AND ipo_id = ? AND deleted_at IS NULL',
        [targetUserId, targetIpoId],
        'DBContext.importJSON.app'
      );
      if (dup) {
        if (app.is_favorite !== undefined) {
          await safeRunAsync(
            db,
            'UPDATE ipo_applications SET is_favorite = COALESCE(?, is_favorite) WHERE id = ?',
            [app.is_favorite !== undefined ? isFavVal : null, dup.id],
            'DBContext.importJSON.updateAppFav'
          );
        }
      } else {
        const id = app.id || Crypto.randomUUID();
        await safeRunAsync(
          db,
          'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, is_favorite, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [id, targetUserId, targetIpoId, app.status || 'Applied', app.sell_price ?? null, app.sale_date ?? null, app.tax ?? 0, app.user_cut ?? 0, isFavVal, now, now],
          'DBContext.importJSON.insertApp'
        );
        appCount++;
        await uploadService.enqueue(db, 'ipo_applications', id);
      }
    }

    console.log(`Imported:\nUsers: ${userCount}\nBanks: ${bankImported}\nIPOs: ${ipoCount}\nApplications: ${appCount}`);
    console.log(`Queued for upload:\nUsers: ${userQueued}\nBanks: ${bankQueued}\nIPOs: ${ipoQueued}\nApplications: ${appQueued}`);

    await refresh();
    return { users: userCount, ipos: ipoCount, applications: appCount };
  };

  const exportCSV = (): string => {
    const userMap = new Map(users.map((u) => [u.id, u]));
    const ipoMap = new Map(ipos.map((i) => [i.id, i]));
    let csv = 'ID,User,PAN,TPIN,Broker,UPI App,Bank,IPO Name,Buy Price,Qty,IPO Open,IPO Close,IPO Listing,Status,Sell Price,Sale Date,Tax,User Cut\n';
    for (const app of applications) {
      const u = userMap.get(app.user_id);
      const ipo = ipoMap.get(app.ipo_id);
      csv += [
        app.id,
        `"${app.user_name}"`,
        `"${u?.pan_number ?? ''}"`,
        `"${u?.tpin ?? ''}"`,
        `"${app.user_broker}"`,
        `"${u?.upi_app ?? ''}"`,
        `"${app.user_bank_name}"`,
        `"${app.ipo_name}"`,
        app.buy_price,
        app.quantity,
        `"${ipo?.open_date ?? ''}"`,
        `"${ipo?.close_date ?? ''}"`,
        `"${ipo?.listing_date ?? ''}"`,
        `"${app.status}"`,
        app.sell_price ?? '',
        `"${app.sale_date ?? ''}"`,
        app.tax ?? 0,
        app.user_cut ?? 0,
      ].join(',') + '\n';
    }
    return csv;
  };

  const importCSV = async (csv: string): Promise<ImportResult> => {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('No data rows found');
    const rows = lines.slice(1).map(parseCSVLine);

    // Collect unique entities
    const userMap = new Map<string, Omit<User, 'id'>>();   // PAN → user data
    const ipoMap  = new Map<string, Omit<IPOListing, 'id'>>();  // name → ipo data
    const bankSet = new Set<string>();

    type PendingApp = {
      pan: string; ipoName: string; status: ApplicationStatus;
      sellPrice: number | null; saleDate: string | null; tax: number; userCut: number;
    };
    const pendingApps: PendingApp[] = [];

    for (const row of rows) {
      if (row.length < 18) continue;
      const [, name, pan, tpin, broker, upiApp, bank, ipoName,
             buyPriceStr, qtyStr, ipoOpen, ipoClose, ipoListing,
             status, sellPriceStr, saleDate, taxStr, userCutStr] = row.map((c) => c.trim());
      if (!pan || !name) continue;

      if (!userMap.has(pan)) {
        userMap.set(pan, {
          name, pan_number: pan, tpin, broker,
          upi_app: upiApp, bank_name: bank, default_amount_blocked: 0,
        });
      }
      if (bank) bankSet.add(bank);
      if (ipoName && !ipoMap.has(ipoName)) {
        ipoMap.set(ipoName, {
          ipo_name: ipoName,
          buy_price: parseFloat(buyPriceStr) || 0,
          quantity: parseInt(qtyStr) || 0,
          open_date: ipoOpen, close_date: ipoClose, listing_date: ipoListing,
          archived: 0,
          is_favorite: 0,
        });
      }
      pendingApps.push({
        pan, ipoName,
        status: status as ApplicationStatus,
        sellPrice: sellPriceStr ? parseFloat(sellPriceStr) : null,
        saleDate: saleDate || null,
        tax: parseFloat(taxStr) || 0,
        userCut: parseFloat(userCutStr) || 0,
      });
    }

    // Insert / upsert users
    const panToId = new Map<string, string>();
    for (const [pan, u] of userMap) {
      if (!pan) continue;
      const existing = await safeGetFirstAsync<{ id: string }>(db, 'SELECT id FROM users_table WHERE pan_number=?', [pan], 'DBContext.importCSV.user');
      if (existing) {
        panToId.set(pan, existing.id);
      } else {
        const newId = Crypto.randomUUID();
        const now = new Date().toISOString();
        await safeRunAsync(
          db,
          'INSERT INTO users_table (id, name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [newId, u.name || '', pan, u.broker || '', u.tpin || '', u.upi_app || '', u.bank_name || '', 0, now, now],
          'DBContext.importCSV.insertUser'
        );
        panToId.set(pan, newId);
      }
    }

    // Insert banks (balance = 0 if new)
    const now = new Date().toISOString();
    for (const bankName of bankSet) {
      if (!bankName) continue;
      const existing = await safeGetFirstAsync(db, 'SELECT id FROM bank_accounts WHERE bank_name=?', [bankName], 'DBContext.importCSV.bank');
      if (!existing) {
        await safeRunAsync(
          db,
          'INSERT INTO bank_accounts (id, bank_name, balance, created_at, updated_at) VALUES (?,?,?,?,?)',
          [Crypto.randomUUID(), bankName, 0, now, now],
          'DBContext.importCSV.insertBank'
        );
      }
    }

    // Insert / upsert IPOs
    const ipoNameToId = new Map<string, string>();
    for (const [name, ipo] of ipoMap) {
      if (!name) continue;
      const existing = await safeGetFirstAsync<{ id: string }>(db, 'SELECT id FROM ipo_listings WHERE ipo_name=?', [name], 'DBContext.importCSV.ipo');
      if (existing) {
        ipoNameToId.set(name, existing.id);
      } else {
        const newId = Crypto.randomUUID();
        await safeRunAsync(
          db,
          'INSERT INTO ipo_listings (id, ipo_name,buy_price,quantity,open_date,close_date,listing_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
          [newId, ipo.ipo_name || name, ipo.buy_price || 0, ipo.quantity || 0, ipo.open_date || '', ipo.close_date || '', ipo.listing_date || '', now, now],
          'DBContext.importCSV.insertIPO'
        );
        ipoNameToId.set(name, newId);
      }
    }

    // Insert applications (skip duplicates)
    let appCount = 0;
    for (const app of pendingApps) {
      const userId = panToId.get(app.pan);
      const ipoId  = ipoNameToId.get(app.ipoName);
      if (!userId || !ipoId) continue;
      const dup = await safeGetFirstAsync(db, 'SELECT id FROM ipo_applications WHERE user_id=? AND ipo_id=? AND deleted_at IS NULL', [userId, ipoId], 'DBContext.importCSV.app');
      if (!dup) {
        await safeRunAsync(
          db,
          'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [Crypto.randomUUID(), userId, ipoId, app.status || 'Applied', app.sellPrice ?? null, app.saleDate ?? null, app.tax ?? 0, app.userCut ?? 0, now, now],
          'DBContext.importCSV.insertApp'
        );
        appCount++;
      }
    }

    await refresh();
    return { users: userMap.size, ipos: ipoMap.size, applications: appCount };
  };

  const [autoExportEnabled, setAutoExportEnabledState] = useState(true);

  // Load auto export toggle from storage
  useEffect(() => {
    safeAsyncStorage.getItem('auto_export_enabled').then((val) => {
      if (val !== null) {
        setAutoExportEnabledState(val === 'true');
      }
    });
  }, []);

  const setAutoExportEnabled = async (val: boolean) => {
    setAutoExportEnabledState(val);
    await safeAsyncStorage.setItem('auto_export_enabled', val ? 'true' : 'false');
  };

  // Run auto-export check
  useEffect(() => {
    if (isLoading) return;
    if (!autoExportEnabled) return;
    // Don't auto-export if there is no data
    if (users.length === 0 && ipos.length === 0 && applications.length === 0 && bankAccounts.length === 0) return;

    const runAutoExport = async () => {
      try {
        const lastExportDate = await safeAsyncStorage.getItem('last_auto_export_date');
        const now = new Date();
        const targetDate = new Date(now);
        if (now.getHours() < 3) {
          targetDate.setDate(targetDate.getDate() - 1);
        }
        const targetDateString = targetDate.toISOString().slice(0, 10);

        if (lastExportDate !== targetDateString) {
          // Perform export
          const backup = exportJSON();
          const autoBackupDir = `${FileSystem.documentDirectory}backups/`;
          const dirInfo = await FileSystem.getInfoAsync(autoBackupDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(autoBackupDir, { intermediates: true });
          }
          const fileUri = `${autoBackupDir}ipovault_auto_backup_${targetDateString}.json`;
          await FileSystem.writeAsStringAsync(fileUri, backup, { encoding: FileSystem.EncodingType.UTF8 });

          // Prune old backups (keep last 7)
          const files = await FileSystem.readDirectoryAsync(autoBackupDir);
          const backupFiles = files.filter((f) => f.startsWith('ipovault_auto_backup_') && f.endsWith('.json')).sort();
          if (backupFiles.length > 7) {
            for (let i = 0; i < backupFiles.length - 7; i++) {
              await FileSystem.deleteAsync(`${autoBackupDir}${backupFiles[i]}`, { idempotent: true });
            }
          }

          await safeAsyncStorage.setItem('last_auto_export_date', targetDateString);
          console.log('[IPOVault] Auto-backup completed for date:', targetDateString);
        }
      } catch (err) {
        console.error('[IPOVault] Auto-backup failed:', err);
      }
    };

    runAutoExport();
  }, [isLoading, autoExportEnabled, users, ipos, applications, bankAccounts, exportJSON]);

  return (
    <DBContext.Provider
      value={{
        users,
        ipos,
        applications,
        bankAccounts,
        isLoading,
        refresh,
        addUser,
        updateUser,
        archiveUser,
        unarchiveUser,
        deleteUser,
        addIPO,
        updateIPO,
        archiveIPO,
        unarchiveIPO,
        toggleIPOFavorite,
        deleteIPO,
        addBulkApplications,
        updateApplication,
        updateApplicationDetails,
        updateBulkApplications,
        deleteApplication,
        toggleFavorite,
        getAllotments,
        getAllotmentByAppId,
        saveAllotmentResult,
        addBankAccount,
        updateBankBalance,
        deleteBankAccount,
        loadSampleData,
        clearAllData,
        exportCSV,
        importCSV,
        exportJSON,
        importJSON,
        autoExportEnabled,
        setAutoExportEnabled,
      }}
    >
      {children}
    </DBContext.Provider>
  );
}

// ── Public provider & hook ────────────────────────────────────────────────────

export function DBProvider({ children }: { children: React.ReactNode }) {
  return (
    <SQLiteProvider databaseName="ipo_tracker.db" onInit={initDB}>
      <DBProviderInner>{children}</DBProviderInner>
    </SQLiteProvider>
  );
}

export function useDB(): DBContextType {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error('useDB must be used within DBProvider');
  return ctx;
}
