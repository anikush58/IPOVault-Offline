import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { UserRepository, IPORepository, ApplicationRepository, BankRepository } from '@/db/repositories';
import { syncStore } from '@/services/sync/syncStatus';
import { safeRunAsync, safeGetFirstAsync, safeGetAllAsync, runWithTransaction } from '@/utils/sqliteDebug';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { ensureBase64DataUrl, extractBase64Payload, saveBase64ToLocalImage } from '@/utils/imageUtils';
import { getEffectiveAvatarUrl } from '@/utils/avatarUtils';
import { getRegistrarConfig } from '@/services/allotment/registrarConfig';
import {
  scheduleDebouncedFirestoreSync,
  syncUserDataToFirestore,
  fetchUserDataFromFirestore,
  syncDeltaFromFirestore,
  clearLocalSyncCursor,
  isCloudSyncBusy,
  persistImagesInBackground,
  IPOVaultExportData,
  CriticalUserData,
  SecondaryUserData,
} from '@/services/cloud/firestoreSyncService';

import { useAuth } from '@/context/AuthContext';

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
  avatar_url?: string;
  avatarUrl?: string;
  default_amount_blocked: number;
  archived?: number;
  owner_id?: string;
};

export type IPOListing = {
  id: string;
  backend_ipo_id?: string | null;
  symbol?: string;
  company_name?: string;
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
  gmp_amount?: number;
  price_band_min?: number;
  price_band_max?: number;
  lot_size?: number;
  total_sub?: number;
  qib_sub?: number;
  // Enriched from ipo_master when available (so applied backend IPOs retain OPEN status on dashboard)
  status?: string;
  lifecycle_status?: string;
};

export type ApplicationStatus = 'Applied' | 'Mandate Approved' | 'Allotted' | 'Partially Allotted' | 'Holding' | 'Not Allotted' | 'Sold' | 'Cancelled';

export type ApplicationWithDetails = {
  id: string;
  user_id: string;
  ipo_id: string;
  status: ApplicationStatus;
  shares_count?: number | null;
  sell_price: number | null;
  sale_date: string | null;
  tax: number;
  user_cut: number;
  user_name: string;
  user_broker: string;
  user_client_id?: string;
  user_pan_number?: string;
  user_bank_name: string;
  user_upi_app: string;
  user_avatar_url?: string;
  ipo_name: string;
  buy_price: number;
  quantity: number;
  open_date: string;
  created_at?: string;
  updated_at?: string;
  ipo_logo_url?: string;
  is_favorite: number; // 0 = no, 1 = yes
  broker_account_id?: string | null;
  brokerAccountId?: string | null;
};

export type BankAccount = {
  id: string;
  bank_name: string;
  balance: number;
  upi_app?: string;
};


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

export type ImportResult = {
  users: number;
  ipos: number;
  applications: number;
  banks?: number;
  allotments?: number;
};

type DBContextType = {
  users: User[];
  ipos: IPOListing[];
  applications: ApplicationWithDetails[];
  bankAccounts: BankAccount[];
  isLoading: boolean;
  isRestoring: boolean;
  restoreCloudData: (targetUid?: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  refreshCritical: () => Promise<void>;
  refreshSecondary: () => Promise<void>;
  importCriticalData: (
    data: CriticalUserData,
    options?: { suppressLegacySync?: boolean; skipRefresh?: boolean }
  ) => Promise<ImportResult>;
  importSecondaryData: (
    data: SecondaryUserData,
    options?: { suppressLegacySync?: boolean; skipRefresh?: boolean }
  ) => Promise<ImportResult>;
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
  addBulkApplications: (
    ipoId: string,
    userIds: string[],
    bankName?: string | Record<string, string>,
    upiApp?: string | Record<string, string>,
    lotCounts?: Record<string, number> | number
  ) => Promise<void>;
  updateApplication: (
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
    bankName?: string,
    upiApp?: string,
    brokerAccountId?: string | null
  ) => Promise<void>;
  partialSellApplication: (
    id: string,
    soldShares: number,
    totalShares: number,
    sellPrice: number,
    saleDate: string | null,
    tax?: number,
    userCut?: number
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
      brokerAccountId?: string | null;
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
  addBankAccount: (bankName: string, balance: number, upiApp?: string) => Promise<void>;
  updateBankBalance: (id: string, balance: number, bankName?: string, upiApp?: string) => Promise<void>;
  deleteBankAccount: (id: string) => Promise<void>;
  // Data management
  loadSampleData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  exportCSV: () => Promise<Record<string, string>>;
  importCSV: (csv: string) => Promise<ImportResult>;
  exportJSON: () => Promise<string>;
  importJSON: (data: string | IPOVaultExportData, options?: { suppressLegacySync?: boolean; skipRefresh?: boolean }) => Promise<ImportResult>;
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
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [ipos, setIPOs] = useState<IPOListing[]>([]);
  const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const syncedUidRef = React.useRef<string | null>(null);

  const isDev = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : process.env.NODE_ENV !== 'production';

  const refreshCritical = useCallback(async () => {
    const t0 = Date.now();
    // Sync authenticated user ID to local users_table owner_id column
    if (authUser?.id) {
      try {
        await db.runAsync(
          'UPDATE users_table SET owner_id = ? WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
          [authUser.id],
        );
      } catch {}
    }

    const userRows = await db.getAllAsync<User>(
      'SELECT * FROM users_table WHERE deleted_at IS NULL ORDER BY name',
    );
    setUsers(userRows);

    const ipoRows = await db.getAllAsync<IPOListing>(
      'SELECT * FROM ipo_listings WHERE deleted_at IS NULL ORDER BY id DESC',
    );

    let masterRows: IPOListing[] = [];
    let masterById: Map<string, any> = new Map();
    try {
      const masterIPOs = await db.getAllAsync<any>(
        `SELECT *, price_band_max AS buy_price, lot_size AS quantity FROM ipo_master WHERE deleted_at IS NULL AND (status = 'OPEN' OR status = 'UPCOMING' OR is_favorite = 1)`
      );
      const existingIds = new Set(ipoRows.map((r) => r.id));

      for (const m of masterIPOs) {
        if (m && m.id) masterById.set(m.id, m);
      }

      masterRows = masterIPOs
        .filter((m) => m && m.id && !existingIds.has(m.id))
        .map((m) => ({
          ...m,
          id: m.id,
          company_name: m.company_name || m.ipo_name || 'IPO',
          ipo_name: m.ipo_name || m.company_name || 'IPO',
          buy_price: typeof m.buy_price === 'number' && m.buy_price > 0 ? m.buy_price : (m.price_band_max || 100),
          quantity: typeof m.quantity === 'number' && m.quantity > 0 ? m.quantity : (m.lot_size || 1),
          open_date: m.open_date || '',
          close_date: m.close_date || '',
          listing_date: m.listing_date || '',
          allotment_date: m.allotment_date || '',
          archived: 0,
          is_favorite: m.is_favorite || 0,
          registrar: m.registrar || '',
          exchange: m.exchange || '',
          issue_type: m.issue_type || 'Mainboard',
          logo_url: m.logo_url || '',
          gmp_amount: m.gmp_amount ?? null,
          gmp_percent: m.gmp_percent ?? null,
          price_band_min: m.price_band_min ?? null,
          price_band_max: m.price_band_max ?? null,
          lot_size: m.lot_size ?? null,
          total_sub: m.total_sub ?? null,
        }));
    } catch {
      // master table optional
    }

    const enrichedIpoRows = ipoRows.map((row) => {
      const master = masterById.get(row.id);
      if (!master) return row;
      return {
        ...row,
        status: master.status || row.status || '',
        lifecycle_status: master.lifecycle_status || row.lifecycle_status || '',
        company_name: row.company_name || master.company_name || master.ipo_name || row.ipo_name,
        ipo_name: row.ipo_name || master.ipo_name || master.company_name || '',
        logo_url: row.logo_url || master.logo_url || '',
        open_date: row.open_date || master.open_date || '',
        close_date: row.close_date || master.close_date || '',
        listing_date: row.listing_date || master.listing_date || '',
        allotment_date: row.allotment_date || master.allotment_date || '',
        price_band_min: row.price_band_min ?? master.price_band_min ?? null,
        price_band_max: row.price_band_max ?? master.price_band_max ?? null,
        lot_size: row.lot_size ?? master.lot_size ?? null,
        gmp_amount: row.gmp_amount ?? master.gmp_amount ?? null,
        gmp_percent: row.gmp_percent ?? master.gmp_percent ?? null,
        total_sub: row.total_sub ?? master.total_sub ?? null,
        buy_price: row.buy_price > 0 ? row.buy_price : (master.price_band_max || master.price_band_min || row.buy_price),
        quantity: row.quantity > 0 ? row.quantity : (master.lot_size || row.quantity),
      };
    });

    setIPOs([...enrichedIpoRows, ...masterRows]);

    const appRows = await db.getAllAsync<ApplicationWithDetails>(`
      SELECT a.id, a.user_id, a.ipo_id, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
             a.shares_count, a.is_favorite, a.broker_account_id, a.created_at, a.updated_at,
             u.name        AS user_name,
             u.broker      AS user_broker,
             u.client_id   AS user_client_id,
             u.pan_number  AS user_pan_number,
             u.avatar_url  AS user_avatar_url,
             COALESCE(NULLIF(a.bank_name, ''), u.bank_name, '') AS user_bank_name,
             COALESCE(NULLIF(a.upi_app, ''), u.upi_app, '')   AS user_upi_app,
             i.ipo_name,
             i.buy_price,
             COALESCE(a.shares_count, i.quantity) AS quantity,
             i.open_date,
             i.logo_url AS ipo_logo_url
      FROM   ipo_applications a
      JOIN   users_table u ON a.user_id = u.id
      JOIN   ipo_listings i ON a.ipo_id = i.id
      WHERE  a.deleted_at IS NULL AND u.deleted_at IS NULL AND i.deleted_at IS NULL
      ORDER  BY a.id DESC
    `);
    setApplications(appRows);

    setIsLoading(false);
    const duration = Date.now() - t0;
    if (isDev) {
      console.log(`[CloudSync Timing] Stage 1 critical refresh: ${duration}ms (users: ${userRows.length}, ipos: ${enrichedIpoRows.length + masterRows.length}, apps: ${appRows.length})`);
    }
  }, [db, authUser?.id]);

  const refreshSecondary = useCallback(async () => {
    const t0 = Date.now();
    // Repair legacy rows where id is null or empty
    const nullBankRows = await db.getAllAsync<{ rowid: number }>(
      'SELECT rowid FROM bank_accounts WHERE id IS NULL OR id = ""',
    );
    for (const r of nullBankRows) {
      await db.runAsync('UPDATE bank_accounts SET id = ? WHERE rowid = ?', [Crypto.randomUUID(), r.rowid]);
    }

    const bankRows = await db.getAllAsync<BankAccount>(
      'SELECT * FROM bank_accounts WHERE deleted_at IS NULL ORDER BY bank_name',
    );
    setBankAccounts(bankRows);
    const duration = Date.now() - t0;
    if (isDev) {
      console.log(`[CloudSync Timing] Stage 2 secondary refresh: ${duration}ms (banks: ${bankRows.length})`);
    }
  }, [db]);

  const refresh = useCallback(async () => {
    // Self-healing migration: Synchronize ipo_applications status with ipo_allotments table
    try {
      const nowIso = new Date().toISOString();
      await db.runAsync(
        `UPDATE ipo_applications
         SET status = 'Not Allotted', updated_at = ?
         WHERE status IN ('Applied', 'Mandate Approved')
           AND id IN (
             SELECT application_id FROM ipo_allotments
             WHERE UPPER(TRIM(allotment_status)) IN ('NOT_ALLOTTED', 'NOT ALLOTTED', 'REJECTED')
           )`,
        [nowIso]
      );
      await db.runAsync(
        `UPDATE ipo_applications
         SET status = 'Allotted', updated_at = ?
         WHERE status IN ('Applied', 'Mandate Approved')
           AND id IN (
             SELECT application_id FROM ipo_allotments
             WHERE UPPER(TRIM(allotment_status)) = 'ALLOTTED'
           )`,
        [nowIso]
      );
      await db.runAsync(
        `UPDATE ipo_applications
         SET status = 'Partially Allotted', updated_at = ?
         WHERE status IN ('Applied', 'Mandate Approved')
           AND id IN (
             SELECT application_id FROM ipo_allotments
             WHERE UPPER(TRIM(allotment_status)) IN ('PARTIALLY_ALLOTTED', 'PARTIALLY ALLOTTED')
           )`,
        [nowIso]
      );
    } catch {}

    await refreshCritical();
    await refreshSecondary();
  }, [db, refreshCritical, refreshSecondary]);

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

  const addBulkApplications = async (
    ipoId: string,
    userIds: string[],
    bankName?: string | Record<string, string>,
    upiApp?: string | Record<string, string>,
    lotCounts?: Record<string, number> | number
  ) => {
    if (!ipoId) return;
    const now = new Date().toISOString();
    let resolvedId = ipoId;

    // 1. Check if record exists in ipo_listings by id, ipo_name, or company_name
    const existingInListings = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM ipo_listings WHERE id = ? OR LOWER(TRIM(ipo_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(company_name)) = LOWER(TRIM(?))',
      [ipoId, ipoId, ipoId]
    );

    if (existingInListings) {
      resolvedId = existingInListings.id;
    } else {
      // 2. Resolve from ipo_master if selected from Smart IPO Database
      const masterRecord = await db.getFirstAsync<any>(
        'SELECT * FROM ipo_master WHERE id = ? OR LOWER(TRIM(company_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(ipo_name)) = LOWER(TRIM(?)) OR UPPER(TRIM(symbol)) = UPPER(TRIM(?))',
        [ipoId, ipoId, ipoId, ipoId]
      );

      if (masterRecord) {
        resolvedId = masterRecord.id;
        await db.runAsync(
          `INSERT OR IGNORE INTO ipo_listings (
            id, ipo_name, company_name, symbol, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
            registrar, exchange, issue_type, archived, is_favorite, logo_url, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [
            masterRecord.id,
            masterRecord.ipo_name || masterRecord.company_name || 'IPO',
            masterRecord.company_name || masterRecord.ipo_name || 'IPO',
            masterRecord.symbol || '',
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
            masterRecord.logo_url || '',
            now,
            now,
          ]
        );
      } else {
        // Fallback shadow entry if neither ipo_master nor ipo_listings record exists yet
        const shadowRegistrar = getRegistrarConfig(ipoId).name;
        await db.runAsync(
          `INSERT OR IGNORE INTO ipo_listings (
            id, ipo_name, company_name, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
            registrar, exchange, issue_type, archived, is_favorite, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, '', '', '', '', ?, 'NSE, BSE', 'Mainboard', 0, 0, ?, ?)`,
          [ipoId, ipoId, ipoId, 100, 1, shadowRegistrar, now, now]
        );
      }
    }

    const repo = new ApplicationRepository(db);
    await repo.addBulk(resolvedId, userIds, bankName, upiApp, lotCounts);
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
      const bankName = (
        details?.bank_name ||
        (app.bank_name && app.bank_name.trim() !== '' ? app.bank_name : app.user_bank_name) ||
        ''
      ).trim();
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
    bankName?: string,
    upiApp?: string,
    brokerAccountId?: string | null,
  ) => {
    await handleBankAllotmentDebit(db, id, status, bankName ? { bank_name: bankName } : undefined);
    const repo = new ApplicationRepository(db);
    await repo.update(id, status, sellPrice, saleDate, tax, userCut);
    if (bankName !== undefined || upiApp !== undefined || brokerAccountId !== undefined) {
      await db.runAsync(
        `UPDATE ipo_applications SET
          bank_name = COALESCE(?, bank_name),
          upi_app = COALESCE(?, upi_app),
          broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
          updated_at = ?
         WHERE id = ?`,
        [
          bankName ?? null,
          upiApp ?? null,
          brokerAccountId !== undefined ? 1 : 0,
          brokerAccountId ?? null,
          new Date().toISOString(),
          id,
        ]
      );
    }
    await refresh();
  };

  const partialSellApplication = async (
    id: string,
    soldShares: number,
    totalShares: number,
    sellPrice: number,
    saleDate: string | null,
    tax?: number,
    userCut?: number
  ) => {
    const repo = new ApplicationRepository(db);
    await repo.partialSell(id, soldShares, totalShares, sellPrice, saleDate, tax, userCut);
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
      brokerAccountId?: string | null;
    }
  ) => {
    await handleBankAllotmentDebit(db, id, details.status, details);
    const repo = new ApplicationRepository(db);
    await repo.update(id, details.status, details.sellPrice, details.saleDate, details.tax, details.userCut);
    if (details.bank_name || details.upi_app || details.app_number || details.lots || details.bid_price || details.mandate_status || details.category || details.brokerAccountId !== undefined) {
      await db.runAsync(
        `UPDATE ipo_applications SET
          bank_name = COALESCE(?, bank_name),
          upi_app = COALESCE(?, upi_app),
          app_number = COALESCE(?, app_number),
          lots = COALESCE(?, lots),
          bid_price = COALESCE(?, bid_price),
          mandate_status = COALESCE(?, mandate_status),
          category = COALESCE(?, category),
          broker_account_id = CASE WHEN ? = 1 THEN ? ELSE broker_account_id END,
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
          details.brokerAccountId !== undefined ? 1 : 0,
          details.brokerAccountId ?? null,
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

    // Update application status ONLY for genuine allotment results (case-insensitive)
    const statusUpper = (params.allotment_status || '').trim().toUpperCase();
    if (statusUpper === 'ALLOTTED') {
      await updateApplication(params.application_id, 'Allotted');
    } else if (statusUpper === 'PARTIALLY_ALLOTTED' || statusUpper === 'PARTIALLY ALLOTTED') {
      await updateApplication(params.application_id, 'Partially Allotted');
    } else if (statusUpper === 'NOT_ALLOTTED' || statusUpper === 'NOT ALLOTTED' || statusUpper === 'REJECTED') {
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
    scheduleDebouncedFirestoreSync(exportJSON, authUser?.uid, 5000);

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

  const addBankAccount = async (bankName: string, balance: number, upiApp?: string) => {
    const repo = new BankRepository(db);
    await repo.add(bankName, balance, upiApp);
    await refresh();
  };

  const updateBankBalance = async (id: string, balance: number, bankName?: string, upiApp?: string) => {
    const repo = new BankRepository(db);
    await repo.updateBalance(id, balance, bankName, upiApp);
    await refresh();
  };

  const deleteBankAccount = async (id: string) => {
    const repo = new BankRepository(db);
    await repo.delete(id);
    await refresh();
  };

  // ── Data management ────────────────────────────────────────────────────────

  const clearAllData = async () => {
    syncedUidRef.current = null;
    if (authUser?.uid) {
      await clearLocalSyncCursor(authUser.uid);
    }
    await db.execAsync('DELETE FROM ipo_allotments');
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
      'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, default_amount_blocked, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Dhiru', 'AAAPD1234A', '1208180111845464', 'dhiru@okhdfcbank', 'Dhan', '123456', 'PhonePe', 'Kotak M Bank', 14998, now, now],
    );
    await db.runAsync(
      'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, default_amount_blocked, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Vishal', 'BBBPV5678B', '1208180111845465', 'vishal@okaxis', 'Upstox', '234567', 'GPay', 'Axis Bank', 14998, now, now],
    );
    await db.runAsync(
      'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, default_amount_blocked, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Umesh', 'CCCU9012C', '1208180111845466', 'umesh@ybl', 'Groww', '345678', 'BHIM', 'HDFC Bank', 14998, now, now],
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

  const exportJSON = async (): Promise<string> => {
    const processedUsers = users.map((u) => {
      const effectiveUrl = getEffectiveAvatarUrl(u);
      return {
        id: u.id,
        name: u.name,
        pan_number: u.pan_number,
        client_id: u.client_id || '',
        upi_id: u.upi_id || '',
        broker: u.broker,
        tpin: u.tpin,
        upi_app: u.upi_app,
        bank_name: u.bank_name,
        avatar_url: effectiveUrl,
        avatarUrl: effectiveUrl,
        default_amount_blocked: u.default_amount_blocked,
        archived: u.archived ?? 0,
      };
    });

    const processedIpos = await Promise.all(
      ipos.map(async (i) => {
        const logoBase64 = i.logo_url ? await ensureBase64DataUrl(i.logo_url) : '';
        const payload = extractBase64Payload(logoBase64);
        return {
          id: i.id,
          backend_ipo_id: i.backend_ipo_id || null,
          symbol: i.symbol || '',
          company_name: i.company_name || '',
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
          gmp_percent: i.gmp_percent ?? 0,
          gmp_value: i.gmp_value ?? 0,
          logo_url: logoBase64 || null,
          companyLogo: payload ? { mimeType: payload.mimeType, data: payload.base64Data } : null,
        };
      })
    );

    const rawAllotments = await safeGetAllAsync<any>(
      db,
      'SELECT * FROM ipo_allotments',
      [],
      'DBContext.exportJSON.allotments'
    );

    const rawMasterIpos = await safeGetAllAsync<any>(
      db,
      'SELECT * FROM ipo_master',
      [],
      'DBContext.exportJSON.masterIpos'
    );

    return JSON.stringify(
      {
        version: 1,
        exported_at: new Date().toISOString(),
        banks: bankAccounts,
        users: processedUsers,
        ipos: processedIpos,
        master_ipos: rawMasterIpos || [],
        applications: applications.map((a) => ({
          id: a.id,
          user_id: a.user_id,
          ipo_id: a.ipo_id,
          status: a.status,
          shares_count: (a as any).shares_count ?? a.quantity ?? null,
          quantity: a.quantity ?? (a as any).shares_count ?? null,
          tax: a.tax,
          user_cut: a.user_cut,
          is_favorite: a.is_favorite ?? 0,
          bank_name: (a as any).bank_name ?? (a as any).user_bank_name ?? '',
          upi_app: (a as any).upi_app ?? (a as any).user_upi_app ?? '',
          broker_account_id: a.broker_account_id ?? (a as any).brokerAccountId ?? null,
          created_at: (a as any).created_at,
          updated_at: (a as any).updated_at,
        })),
        allotments: (rawAllotments || []).map((alt) => ({
          id: alt.id,
          application_id: alt.application_id,
          user_id: alt.user_id,
          ipo_id: alt.ipo_id,
          allotment_status: alt.allotment_status,
          allotted_lots: alt.allotted_lots ?? 0,
          allotted_shares: alt.allotted_shares ?? 0,
          allotment_price: alt.allotment_price ?? 0,
          application_amount: alt.application_amount ?? 0,
          refund_amount: alt.refund_amount ?? 0,
          registrar: alt.registrar || '',
          verification_method: alt.verification_method || 'AUTOMATED',
          checked_at: alt.checked_at || new Date().toISOString(),
          error_code: alt.error_code || '',
          created_at: alt.created_at,
          updated_at: alt.updated_at,
        })),
      },
      null,
      2,
    );
  };

  const importCriticalData = useCallback(
    async (
      data: CriticalUserData,
      options?: { suppressLegacySync?: boolean; skipRefresh?: boolean }
    ): Promise<ImportResult> => {
      let userCount = 0;
      let ipoCount = 0;
      let appCount = 0;
      const userIdMap = new Map<string, string>();
      const ipoIdMap = new Map<string, string>();
      const appIdMap = new Map<string, string>();
      const usedAppIds = new Set<string>();
      const now = new Date().toISOString();
      const startTime = Date.now();

      // Prefetch existing users, ipos, apps for O(1) lookup
      const [existingUsersList, existingIposList, existingAppsList] = await Promise.all([
        safeGetAllAsync<{ id: string; pan_number: string; name: string }>(
          db,
          'SELECT id, pan_number, name FROM users_table',
          [],
          'importCriticalData.prefetchUsers'
        ),
        safeGetAllAsync<{ id: string; ipo_name: string }>(
          db,
          'SELECT id, ipo_name FROM ipo_listings',
          [],
          'importCriticalData.prefetchIPOs'
        ),
        safeGetAllAsync<{ id: string; user_id: string; ipo_id: string; status: string }>(
          db,
          'SELECT id, user_id, ipo_id, status FROM ipo_applications',
          [],
          'importCriticalData.prefetchApps'
        ),
      ]);

      const existingUsersById = new Map<string, { id: string; pan_number: string; name: string }>();
      const existingUsersByPan = new Map<string, { id: string; pan_number: string; name: string }>();
      const existingUsersByName = new Map<string, { id: string; pan_number: string; name: string }>();
      for (const u of existingUsersList || []) {
        if (u.id) existingUsersById.set(u.id, u);
        if (u.pan_number) existingUsersByPan.set(u.pan_number.trim().toUpperCase(), u);
        if (u.name) existingUsersByName.set(u.name.trim().toLowerCase(), u);
      }

      const existingIposById = new Map<string, { id: string; ipo_name: string }>();
      const existingIposByName = new Map<string, { id: string; ipo_name: string }>();
      for (const i of existingIposList || []) {
        if (i.id) existingIposById.set(i.id, i);
        if (i.ipo_name) existingIposByName.set(i.ipo_name.trim().toLowerCase(), i);
      }

      const existingAppsById = new Map<string, { id: string; user_id: string; ipo_id: string; status: string }>();
      const existingAppsByCandidateKey = new Map<string, { id: string; user_id: string; ipo_id: string; status: string }>();
      for (const a of existingAppsList || []) {
        if (a.id) existingAppsById.set(a.id, a);
        const candKey = `${a.user_id}_${a.ipo_id}_${a.status}`;
        if (!existingAppsByCandidateKey.has(candKey)) {
          existingAppsByCandidateKey.set(candKey, a);
        }
      }

      // Execute Stage 1 Critical SQLite Transaction (Zero blocking image I/O!)
      await runWithTransaction(
        db,
        async () => {
          // 1. Process Users
          for (const u of data.users ?? []) {
            if (!u) continue;
            const pan = u.pan_number?.trim() || '';
            const panKey = pan.toUpperCase();
            const name = u.name?.trim() || 'Unknown User';
            const nameKey = name.toLowerCase();
            const uId = u.id;

            const existing =
              (uId && existingUsersById.get(uId)) ||
              (panKey && existingUsersByPan.get(panKey)) ||
              (nameKey && existingUsersByName.get(nameKey)) ||
              null;

            const restoredAvatarUrl = getEffectiveAvatarUrl({
              id: uId,
              name: name,
              avatar_url:
                u.avatar_url ||
                (u as any).avatarUrl ||
                (typeof (u as any).avatar === 'string' ? (u as any).avatar : null),
            });

            const archivedVal = u.archived ? 1 : 0;
            if (existing) {
              userIdMap.set(uId, existing.id);
              if (u.archived !== undefined || restoredAvatarUrl) {
                await safeRunAsync(
                  db,
                  'UPDATE users_table SET archived = COALESCE(?, archived), avatar_url = CASE WHEN ? != "" THEN ? ELSE avatar_url END WHERE id = ?',
                  [u.archived !== undefined ? archivedVal : null, restoredAvatarUrl, restoredAvatarUrl, existing.id],
                  'importCriticalData.updateUser'
                );
              }
            } else {
              const newId = uId || Crypto.randomUUID();
              const defaultAmount = u.default_amount_blocked ?? 0;
              await safeRunAsync(
                db,
                'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, avatar_url, default_amount_blocked, archived, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [newId, name, pan, u.client_id || '', u.upi_id || '', u.broker || '', u.tpin || '', u.upi_app || '', u.bank_name || '', restoredAvatarUrl, defaultAmount, archivedVal, authUser?.uid || null, now, now],
                'importCriticalData.insertUser'
              );
              const userObj = { id: newId, pan_number: pan, name };
              if (uId) existingUsersById.set(uId, userObj);
              existingUsersById.set(newId, userObj);
              if (panKey) existingUsersByPan.set(panKey, userObj);
              existingUsersByName.set(nameKey, userObj);
              userIdMap.set(uId, newId);
              userCount++;
            }
          }

          // 2. Process IPO Listings
          for (let ipoIdx = 0; ipoIdx < (data.ipos ?? []).length; ipoIdx++) {
            const ipo = (data.ipos ?? [])[ipoIdx];
            if (!ipo) continue;
            const ipoName = ipo.ipo_name?.trim() || 'Unknown IPO';
            const ipoNameKey = ipoName.toLowerCase();
            const ipoId = ipo.id;

            const existing =
              (ipoId && existingIposById.get(ipoId)) ||
              existingIposByName.get(ipoNameKey) ||
              null;

            const logoUrlVal = ipo.logo_url || (ipo as any).companyLogo || '';
            const archivedVal = ipo.archived ? 1 : 0;
            const isFavVal = ipo.is_favorite ? 1 : 0;

            if (existing) {
              ipoIdMap.set(ipoId, existing.id);
              await safeRunAsync(
                db,
                `UPDATE ipo_listings SET
                  buy_price = CASE WHEN ? > 0 THEN ? ELSE buy_price END,
                  quantity = CASE WHEN ? > 0 THEN ? ELSE quantity END,
                  gmp_percent = COALESCE(?, gmp_percent),
                  gmp_value = COALESCE(?, gmp_value),
                  symbol = CASE WHEN ? != '' THEN ? ELSE symbol END,
                  company_name = CASE WHEN ? != '' THEN ? ELSE company_name END,
                  backend_ipo_id = CASE WHEN ? != '' THEN ? ELSE backend_ipo_id END,
                  open_date = CASE WHEN ? != '' THEN ? ELSE open_date END,
                  close_date = CASE WHEN ? != '' THEN ? ELSE close_date END,
                  listing_date = CASE WHEN ? != '' THEN ? ELSE listing_date END,
                  allotment_date = CASE WHEN ? != '' THEN ? ELSE allotment_date END,
                  registrar = CASE WHEN ? != '' THEN ? ELSE registrar END,
                  exchange = CASE WHEN ? != '' THEN ? ELSE exchange END,
                  issue_type = CASE WHEN ? != '' THEN ? ELSE issue_type END,
                  archived = COALESCE(?, archived),
                  is_favorite = COALESCE(?, is_favorite),
                  logo_url = CASE WHEN ? != '' THEN ? ELSE logo_url END
                WHERE id = ?`,
                [
                  ipo.buy_price || 0,
                  ipo.buy_price || 0,
                  ipo.quantity || 0,
                  ipo.quantity || 0,
                  ipo.gmp_percent ?? null,
                  ipo.gmp_value ?? null,
                  ipo.symbol || '',
                  ipo.symbol || '',
                  ipo.company_name || '',
                  ipo.company_name || '',
                  ipo.backend_ipo_id || '',
                  ipo.backend_ipo_id || '',
                  ipo.open_date || '',
                  ipo.open_date || '',
                  ipo.close_date || '',
                  ipo.close_date || '',
                  ipo.listing_date || '',
                  ipo.listing_date || '',
                  ipo.allotment_date || '',
                  ipo.allotment_date || '',
                  ipo.registrar || '',
                  ipo.registrar || '',
                  ipo.exchange || '',
                  ipo.exchange || '',
                  ipo.issue_type || '',
                  ipo.issue_type || '',
                  ipo.archived !== undefined ? archivedVal : null,
                  ipo.is_favorite !== undefined ? isFavVal : null,
                  logoUrlVal,
                  logoUrlVal,
                  existing.id,
                ],
                'importCriticalData.updateIPO'
              );
            } else {
              const newId = ipoId || Crypto.randomUUID();
              await safeRunAsync(
                db,
                'INSERT INTO ipo_listings (id, backend_ipo_id, symbol, company_name, ipo_name, buy_price, quantity, open_date, close_date, listing_date, logo_url, archived, is_favorite, registrar, exchange, issue_type, allotment_date, gmp_percent, gmp_value, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [
                  newId,
                  ipo.backend_ipo_id || null,
                  ipo.symbol || '',
                  ipo.company_name || ipoName,
                  ipoName,
                  ipo.buy_price || 0,
                  ipo.quantity || 0,
                  ipo.open_date || '',
                  ipo.close_date || '',
                  ipo.listing_date || '',
                  logoUrlVal,
                  archivedVal,
                  isFavVal,
                  ipo.registrar || '',
                  ipo.exchange || '',
                  ipo.issue_type || '',
                  ipo.allotment_date || '',
                  ipo.gmp_percent || 0,
                  ipo.gmp_value || 0,
                  authUser?.uid || null,
                  now,
                  now,
                ],
                'importCriticalData.insertIPO'
              );
              const ipoObj = { id: newId, ipo_name: ipoName };
              if (ipoId) existingIposById.set(ipoId, ipoObj);
              existingIposById.set(newId, ipoObj);
              existingIposByName.set(ipoNameKey, ipoObj);
              ipoIdMap.set(ipoId, newId);
              ipoCount++;
            }
          }

          // 2b. Process IPO Master Records
          for (const m of data.master_ipos ?? (data as any).ipo_master ?? []) {
            if (!m || !m.id) continue;
            await safeRunAsync(
              db,
              `INSERT INTO ipo_master (
                id, company_name, ipo_name, symbol, exchange, issue_type, price_band_min, price_band_max, lot_size, issue_size,
                listing_date, open_date, close_date, allotment_date, refund_date, demat_credit_date, registrar, lead_manager,
                status, lifecycle_status, lifecycle_confidence, lifecycle_source, lifecycle_last_verified_at, logo_url, sector,
                description, website, prospectus_url, retail_sub, qib_sub, nii_sub, employee_sub, shareholder_sub, anchor_sub,
                total_sub, subscription_timestamp, registrar_website, allotment_link, listing_price, listing_gain_percent,
                current_price, current_price_updated_at, gmp_amount, gmp_percent, profit_per_lot, gmp_updated_at, is_favorite,
                source_type, sync_version, sync_status, last_synced_at, created_at, updated_at
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                company_name=excluded.company_name,
                ipo_name=excluded.ipo_name,
                symbol=excluded.symbol,
                exchange=excluded.exchange,
                issue_type=excluded.issue_type,
                price_band_min=excluded.price_band_min,
                price_band_max=excluded.price_band_max,
                lot_size=excluded.lot_size,
                issue_size=excluded.issue_size,
                listing_date=excluded.listing_date,
                open_date=excluded.open_date,
                close_date=excluded.close_date,
                allotment_date=excluded.allotment_date,
                refund_date=excluded.refund_date,
                demat_credit_date=excluded.demat_credit_date,
                registrar=excluded.registrar,
                lead_manager=excluded.lead_manager,
                status=excluded.status,
                lifecycle_status=excluded.lifecycle_status,
                listing_price=COALESCE(excluded.listing_price, ipo_master.listing_price),
                listing_gain_percent=COALESCE(excluded.listing_gain_percent, ipo_master.listing_gain_percent),
                current_price=COALESCE(excluded.current_price, ipo_master.current_price),
                current_price_updated_at=COALESCE(excluded.current_price_updated_at, ipo_master.current_price_updated_at),
                gmp_amount=COALESCE(excluded.gmp_amount, ipo_master.gmp_amount),
                gmp_percent=COALESCE(excluded.gmp_percent, ipo_master.gmp_percent),
                profit_per_lot=COALESCE(excluded.profit_per_lot, ipo_master.profit_per_lot),
                is_favorite=COALESCE(excluded.is_favorite, ipo_master.is_favorite),
                updated_at=excluded.updated_at`,
              [
                m.id,
                m.company_name || '',
                m.ipo_name || '',
                m.symbol || '',
                m.exchange || '',
                m.issue_type || '',
                m.price_band_min ?? null,
                m.price_band_max ?? null,
                m.lot_size ?? null,
                m.issue_size ?? null,
                m.listing_date || '',
                m.open_date || '',
                m.close_date || '',
                m.allotment_date || '',
                m.refund_date || '',
                m.demat_credit_date || '',
                m.registrar || '',
                m.lead_manager || '',
                m.status || 'Unknown',
                m.lifecycle_status || 'Unknown',
                m.lifecycle_confidence || 'Low',
                m.lifecycle_source || '',
                m.lifecycle_last_verified_at || null,
                m.logo_url || '',
                m.sector || '',
                m.description || '',
                m.website || '',
                m.prospectus_url || '',
                m.retail_sub ?? null,
                m.qib_sub ?? null,
                m.nii_sub ?? null,
                m.employee_sub ?? null,
                m.shareholder_sub ?? null,
                m.anchor_sub ?? null,
                m.total_sub ?? null,
                m.subscription_timestamp || null,
                m.registrar_website || '',
                m.allotment_link || '',
                m.listing_price ?? null,
                m.listing_gain_percent ?? null,
                m.current_price ?? null,
                m.current_price_updated_at || null,
                m.gmp_amount ?? null,
                m.gmp_percent ?? null,
                m.profit_per_lot ?? null,
                m.gmp_updated_at || null,
                m.is_favorite ?? 0,
                m.source_type || 'SERVER',
                m.sync_version ?? 0,
                m.sync_status || 'SYNCED',
                m.last_synced_at || now,
                m.created_at || now,
                m.updated_at || now,
              ],
              'importCriticalData.masterIpo'
            );
          }

          // 3. Process IPO Applications
          for (const app of data.applications ?? []) {
            if (!app) continue;
            const targetUserId = userIdMap.get(app.user_id) ?? app.user_id;
            const targetIpoId = ipoIdMap.get(app.ipo_id) ?? app.ipo_id;

            if (!targetUserId || !targetIpoId) continue;

            const userExists = existingUsersById.has(targetUserId);
            const ipoExists = existingIposById.has(targetIpoId);

            if (!userExists || !ipoExists) {
              continue;
            }

            const isFavVal = app.is_favorite ? 1 : 0;
            const targetSharesCount = app.shares_count ?? (app as any).quantity ?? null;

            let existing = (app.id && !usedAppIds.has(app.id) && existingAppsById.get(app.id)) || null;

            if (!existing) {
              const candKey = `${targetUserId}_${targetIpoId}_${app.status}`;
              const candidate = existingAppsByCandidateKey.get(candKey);
              if (candidate && !usedAppIds.has(candidate.id)) {
                existing = candidate;
              }
            }

            if (existing) {
              usedAppIds.add(existing.id);
              appIdMap.set(app.id, existing.id);
              await safeRunAsync(
                db,
                `UPDATE ipo_applications SET
                  status = COALESCE(?, status),
                  shares_count = CASE WHEN ? IS NOT NULL THEN ? ELSE shares_count END,
                  sell_price = CASE WHEN ? IS NOT NULL THEN ? ELSE sell_price END,
                  sale_date = CASE WHEN ? IS NOT NULL AND ? != "" THEN ? ELSE sale_date END,
                  tax = COALESCE(?, tax),
                  user_cut = COALESCE(?, user_cut),
                  is_favorite = COALESCE(?, is_favorite),
                  bank_name = CASE WHEN ? IS NOT NULL AND ? != "" THEN ? ELSE bank_name END,
                  upi_app = CASE WHEN ? IS NOT NULL AND ? != "" THEN ? ELSE upi_app END,
                  broker_account_id = CASE WHEN ? IS NOT NULL AND ? != "" THEN ? ELSE broker_account_id END,
                  updated_at = ?
                WHERE id = ?`,
                [
                  app.status || null,
                  targetSharesCount,
                  targetSharesCount,
                  app.sell_price !== undefined ? app.sell_price : null,
                  app.sell_price ?? null,
                  app.sale_date || null,
                  app.sale_date || '',
                  app.sale_date || null,
                  app.tax !== undefined ? app.tax : null,
                  app.user_cut !== undefined ? app.user_cut : null,
                  app.is_favorite !== undefined ? isFavVal : null,
                  app.bank_name || null,
                  app.bank_name || '',
                  app.bank_name || null,
                  app.upi_app || null,
                  app.upi_app || '',
                  app.upi_app || null,
                  (app as any).broker_account_id || (app as any).brokerAccountId || null,
                  (app as any).broker_account_id || (app as any).brokerAccountId || '',
                  (app as any).broker_account_id || (app as any).brokerAccountId || null,
                  app.updated_at || now,
                  existing.id,
                ],
                'importCriticalData.updateApp'
              );
            } else {
              const id = app.id || Crypto.randomUUID();
              usedAppIds.add(id);
              await safeRunAsync(
                db,
                'INSERT INTO ipo_applications (id, user_id, ipo_id, status, shares_count, sell_price, sale_date, tax, user_cut, is_favorite, bank_name, upi_app, broker_account_id, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [
                  id,
                  targetUserId,
                  targetIpoId,
                  app.status || 'Applied',
                  targetSharesCount,
                  app.sell_price ?? null,
                  app.sale_date ?? null,
                  app.tax ?? 0,
                  app.user_cut ?? 0,
                  isFavVal,
                  app.bank_name || '',
                  app.upi_app || '',
                  (app as any).broker_account_id || (app as any).brokerAccountId || null,
                  authUser?.uid || null,
                  app.created_at || now,
                  app.updated_at || now,
                ],
                'importCriticalData.insertApp'
              );
              const appObj = { id, user_id: targetUserId, ipo_id: targetIpoId, status: app.status || 'Applied' };
              existingAppsById.set(id, appObj);
              appIdMap.set(app.id, id);
              appCount++;
            }
          }
        },
        'importCriticalData.transaction'
      );

      const duration = Date.now() - startTime;
      if (isDev) {
        console.log(`[DBContext.importCriticalData] Completed in ${duration}ms (Users: ${userCount}, IPOs: ${ipoCount}, Applications: ${appCount})`);
      }

      // Stage 1 Targeted Critical Refresh
      if (!options?.skipRefresh) {
        await refreshCritical();
      }

      // Stage 3 Background Image Persistence
      persistImagesInBackground(db, data.ipos, data.users);

      return { users: userCount, ipos: ipoCount, applications: appCount };
    },
    [db, authUser?.uid, refreshCritical, isDev]
  );

  const importSecondaryData = useCallback(
    async (
      data: SecondaryUserData,
      options?: { suppressLegacySync?: boolean; skipRefresh?: boolean }
    ): Promise<ImportResult> => {
      let bankImported = 0;
      let allotmentCount = 0;
      const now = new Date().toISOString();
      const startTime = Date.now();

      const [existingBanksList, existingAppsList, existingAllotmentsList] = await Promise.all([
        safeGetAllAsync<{ id: string; bank_name: string }>(
          db,
          'SELECT id, bank_name FROM bank_accounts',
          [],
          'importSecondaryData.prefetchBanks'
        ),
        safeGetAllAsync<{ id: string }>(
          db,
          'SELECT id FROM ipo_applications',
          [],
          'importSecondaryData.prefetchApps'
        ),
        safeGetAllAsync<{ id: string; application_id: string }>(
          db,
          'SELECT id, application_id FROM ipo_allotments',
          [],
          'importSecondaryData.prefetchAllotments'
        ),
      ]);

      const existingBanksByName = new Map<string, string>();
      for (const b of existingBanksList || []) {
        if (b.bank_name) existingBanksByName.set(b.bank_name.trim().toLowerCase(), b.id);
      }

      const existingAppsById = new Set<string>();
      for (const a of existingAppsList || []) {
        if (a.id) existingAppsById.add(a.id);
      }

      const existingAllotmentsByAppId = new Map<string, { id: string; application_id: string }>();
      for (const alt of existingAllotmentsList || []) {
        if (alt.application_id) existingAllotmentsByAppId.set(alt.application_id, alt);
      }

      await runWithTransaction(
        db,
        async () => {
          // 1. Process Banks
          for (const bank of data.banks ?? []) {
            if (!bank || !bank.bank_name) continue;
            const bankNameKey = bank.bank_name.trim().toLowerCase();
            const existingId = existingBanksByName.get(bankNameKey);
            if (!existingId) {
              const id = Crypto.randomUUID();
              const balance = bank.balance ?? 0;
              await safeRunAsync(
                db,
                'INSERT INTO bank_accounts (id, bank_name, balance, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?)',
                [id, bank.bank_name, balance, authUser?.uid || null, now, now],
                'importSecondaryData.insertBank'
              );
              existingBanksByName.set(bankNameKey, id);
              bankImported++;
            }
          }

          // 2. Process Allotments
          for (const alt of data.allotments ?? []) {
            if (!alt || !alt.application_id) continue;
            if (!existingAppsById.has(alt.application_id)) continue;

            const existingAlt = existingAllotmentsByAppId.get(alt.application_id);
            if (existingAlt) {
              await safeRunAsync(
                db,
                'UPDATE ipo_allotments SET allotment_status = ?, allotted_lots = ?, allotted_shares = ?, allotment_price = ?, application_amount = ?, refund_amount = ?, checked_at = ?, updated_at = ? WHERE id = ?',
                [
                  alt.allotment_status || 'UNKNOWN',
                  alt.allotted_lots ?? 0,
                  alt.allotted_shares ?? 0,
                  alt.allotment_price ?? 0,
                  alt.application_amount ?? 0,
                  alt.refund_amount ?? 0,
                  alt.checked_at || now,
                  now,
                  existingAlt.id,
                ],
                'importSecondaryData.updateAlt'
              );
            } else {
              const altId = alt.id || Crypto.randomUUID();
              await safeRunAsync(
                db,
                'INSERT INTO ipo_allotments (id, application_id, user_id, ipo_id, allotment_status, allotted_lots, allotted_shares, allotment_price, application_amount, refund_amount, registrar, verification_method, checked_at, error_code, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [
                  altId,
                  alt.application_id,
                  alt.user_id,
                  alt.ipo_id,
                  alt.allotment_status || 'UNKNOWN',
                  alt.allotted_lots ?? 0,
                  alt.allotted_shares ?? 0,
                  alt.allotment_price ?? 0,
                  alt.application_amount ?? 0,
                  alt.refund_amount ?? 0,
                  alt.registrar || '',
                  alt.verification_method || 'AUTOMATED',
                  alt.checked_at || now,
                  alt.error_code || '',
                  alt.created_at || now,
                  now,
                ],
                'importSecondaryData.insertAlt'
              );
              existingAllotmentsByAppId.set(alt.application_id, { id: altId, application_id: alt.application_id });
              allotmentCount++;
            }
          }

          // 3. Self-healing allotment status updates on applications
          await safeRunAsync(
            db,
            `UPDATE ipo_applications
             SET status = 'Not Allotted', updated_at = ?
             WHERE status IN ('Applied', 'Mandate Approved')
               AND id IN (
                 SELECT application_id FROM ipo_allotments
                 WHERE UPPER(TRIM(allotment_status)) IN ('NOT_ALLOTTED', 'NOT ALLOTTED', 'REJECTED')
               )`,
            [now],
            'importSecondaryData.healNotAllotted'
          );
          await safeRunAsync(
            db,
            `UPDATE ipo_applications
             SET status = 'Allotted', updated_at = ?
             WHERE status IN ('Applied', 'Mandate Approved')
               AND id IN (
                 SELECT application_id FROM ipo_allotments
                 WHERE UPPER(TRIM(allotment_status)) = 'ALLOTTED'
               )`,
            [now],
            'importSecondaryData.healAllotted'
          );
          await safeRunAsync(
            db,
            `UPDATE ipo_applications
             SET status = 'Partially Allotted', updated_at = ?
             WHERE status IN ('Applied', 'Mandate Approved')
               AND id IN (
                 SELECT application_id FROM ipo_allotments
                 WHERE UPPER(TRIM(allotment_status)) IN ('PARTIALLY_ALLOTTED', 'PARTIALLY ALLOTTED')
               )`,
            [now],
            'importSecondaryData.healPartiallyAllotted'
          );
        },
        'importSecondaryData.transaction'
      );

      const duration = Date.now() - startTime;
      if (isDev) {
        console.log(`[DBContext.importSecondaryData] Completed in ${duration}ms (Banks: ${bankImported}, Allotments: ${allotmentCount})`);
      }

      // Stage 2 Targeted Secondary Refresh
      if (!options?.skipRefresh) {
        await refreshSecondary();
      }

      return { users: 0, ipos: 0, applications: 0, banks: bankImported, allotments: allotmentCount };
    },
    [db, authUser?.uid, refreshSecondary, isDev]
  );

  const importJSON = async (
    input: string | IPOVaultExportData,
    options?: { suppressLegacySync?: boolean; skipRefresh?: boolean }
  ): Promise<ImportResult> => {
    const data = (typeof input === 'string' ? JSON.parse(input) : input) as IPOVaultExportData;
    const criticalRes = await importCriticalData(
      {
        users: data.users || [],
        ipos: data.ipos || [],
        master_ipos: data.master_ipos || (data as any).ipo_master || [],
        applications: data.applications || [],
      },
      { suppressLegacySync: options?.suppressLegacySync, skipRefresh: true }
    );

    const secondaryRes = await importSecondaryData(
      {
        banks: data.banks || [],
        allotments: data.allotments || (data as any).ipo_allotments || [],
      },
      { suppressLegacySync: options?.suppressLegacySync, skipRefresh: true }
    );

    if (!options?.skipRefresh) {
      await refresh();
    }

    if (authUser?.uid && !options?.suppressLegacySync) {
      try {
        const fullJson = await exportJSON();
        const fullData = JSON.parse(fullJson);
        await syncUserDataToFirestore(authUser.uid, fullData);
        if (isDev) console.log('[DBContext.importJSON] Successfully synced imported data to Cloud Firestore.');
      } catch (err) {
        if (isDev) console.warn('[DBContext.importJSON] Firestore sync after import warning:', err);
      }
    }

    return {
      users: criticalRes.users,
      ipos: criticalRes.ipos,
      applications: criticalRes.applications,
      banks: secondaryRes.banks,
      allotments: secondaryRes.allotments,
    };
  };

  const exportCSV = async (): Promise<Record<string, string>> => {
    const userMap = new Map(users.map((u) => [u.id, u]));
    const ipoMap = new Map(ipos.map((i) => [i.id, i]));

    // 1. Users CSV
    let usersCsv = 'ID,Name,PAN,Broker,TPIN,UPI App,Bank Name,Avatar URL,Default Amount Blocked,Archived\n';
    for (const u of users) {
      const avatarBase64 = await ensureBase64DataUrl(u.avatar_url);
      usersCsv += [
        u.id,
        `"${u.name || ''}"`,
        `"${u.pan_number || ''}"`,
        `"${u.broker || ''}"`,
        `"${u.tpin || ''}"`,
        `"${u.upi_app || ''}"`,
        `"${u.bank_name || ''}"`,
        `"${avatarBase64 || ''}"`,
        u.default_amount_blocked ?? 0,
        u.archived ?? 0,
      ].join(',') + '\n';
    }

    // 2. IPOs CSV
    let iposCsv = 'ID,IPO Name,Buy Price,Qty,Open Date,Close Date,Listing Date,Logo URL,Registrar,Exchange,Issue Type,Allotment Date,Archived,Is Favorite\n';
    for (const i of ipos) {
      const logoBase64 = await ensureBase64DataUrl(i.logo_url);
      iposCsv += [
        i.id,
        `"${i.ipo_name || ''}"`,
        i.buy_price ?? 0,
        i.quantity ?? 0,
        `"${i.open_date || ''}"`,
        `"${i.close_date || ''}"`,
        `"${i.listing_date || ''}"`,
        `"${logoBase64 || ''}"`,
        `"${i.registrar || ''}"`,
        `"${i.exchange || ''}"`,
        `"${i.issue_type || ''}"`,
        `"${i.allotment_date || ''}"`,
        i.archived ?? 0,
        i.is_favorite ?? 0,
      ].join(',') + '\n';
    }

    // 3. Applications (Combined) CSV
    let appsCsv = 'ID,User,PAN,TPIN,Broker,UPI App,Bank,Avatar URL,IPO Name,Buy Price,Qty,IPO Open,IPO Close,IPO Listing,Logo URL,Status,Sell Price,Sale Date,Tax,User Cut\n';
    for (const app of applications) {
      const u = userMap.get(app.user_id);
      const ipo = ipoMap.get(app.ipo_id);
      const avatarBase64 = await ensureBase64DataUrl(u?.avatar_url || app.user_avatar_url);
      const logoBase64 = await ensureBase64DataUrl(ipo?.logo_url || app.ipo_logo_url);
      appsCsv += [
        app.id,
        `"${app.user_name || ''}"`,
        `"${u?.pan_number ?? ''}"`,
        `"${u?.tpin ?? ''}"`,
        `"${app.user_broker || ''}"`,
        `"${u?.upi_app ?? ''}"`,
        `"${app.user_bank_name || ''}"`,
        `"${avatarBase64 || ''}"`,
        `"${app.ipo_name || ''}"`,
        app.buy_price ?? 0,
        app.quantity ?? (app as any).shares_count ?? 0,
        `"${ipo?.open_date ?? ''}"`,
        `"${ipo?.close_date ?? ''}"`,
        `"${ipo?.listing_date ?? ''}"`,
        `"${logoBase64 || ''}"`,
        `"${app.status}"`,
        app.sell_price ?? '',
        `"${app.sale_date ?? ''}"`,
        app.tax ?? 0,
        app.user_cut ?? 0,
      ].join(',') + '\n';
    }

    // 4. Banks CSV
    let banksCsv = 'ID,Bank Name,Balance\n';
    for (const b of bankAccounts) {
      banksCsv += [
        b.id,
        `"${b.bank_name || ''}"`,
        b.balance ?? 0,
      ].join(',') + '\n';
    }

    return {
      users: usersCsv,
      ipos: iposCsv,
      applications: appsCsv,
      banks: banksCsv,
    };
  };

  const importCSV = async (csv: string): Promise<ImportResult> => {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('No data rows found');
    const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map(parseCSVLine);

    // Dynamic column index lookup helper
    const getIdx = (candidates: string[]): number => {
      for (const cand of candidates) {
        const i = headers.findIndex((h) => h === cand || h.includes(cand));
        if (i !== -1) return i;
      }
      return -1;
    };

    const idxId = getIdx(['id', 'app_id', 'application_id', 'application id']);
    const idxPan = getIdx(['pan', 'pan_number', 'pan number']);
    const idxName = getIdx(['name', 'user', 'user_name', 'user name']);
    const idxAvatar = getIdx(['avatar_url', 'avatar url', 'avatar', 'user image']);
    const idxBroker = getIdx(['broker', 'user_broker']);
    const idxTpin = getIdx(['tpin']);
    const idxUpi = getIdx(['upi_app', 'upi app', 'upi']);
    const idxBank = getIdx(['bank_name', 'bank name', 'bank']);

    const idxIpoName = getIdx(['ipo_name', 'ipo name', 'ipo']);
    const idxLogo = getIdx(['logo_url', 'logo url', 'logo', 'company logo']);
    const idxBuyPrice = getIdx(['buy_price', 'buy price']);
    const idxQty = getIdx(['qty', 'quantity', 'shares_count', 'shares']);
    const idxIpoOpen = getIdx(['ipo open', 'open_date', 'open date']);
    const idxIpoClose = getIdx(['ipo close', 'close_date', 'close date']);
    const idxIpoListing = getIdx(['ipo listing', 'listing_date', 'listing date']);

    const idxStatus = getIdx(['status']);
    const idxSellPrice = getIdx(['sell_price', 'sell price']);
    const idxSaleDate = getIdx(['sale_date', 'sale date']);
    const idxTax = getIdx(['tax']);
    const idxUserCut = getIdx(['user_cut', 'user cut']);

    // Collect unique entities
    const userMap = new Map<string, Omit<User, 'id'>>();   // PAN or Name -> user data
    const ipoMap  = new Map<string, Omit<IPOListing, 'id'>>();  // name -> ipo data
    const bankSet = new Set<string>();

    type PendingApp = {
      id?: string;
      pan: string;
      name: string;
      ipoName: string;
      status: ApplicationStatus;
      qty: number;
      sellPrice: number | null;
      saleDate: string | null;
      tax: number;
      userCut: number;
      bank?: string;
      upiApp?: string;
    };
    const pendingApps: PendingApp[] = [];

    for (const row of rows) {
      if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;
      const getVal = (i: number) => (i >= 0 && i < row.length ? row[i].trim() : '');

      const appId = getVal(idxId);
      const name = getVal(idxName);
      const pan = getVal(idxPan);
      const avatarUrl = getVal(idxAvatar);
      const tpin = getVal(idxTpin);
      const broker = getVal(idxBroker);
      const upiApp = getVal(idxUpi);
      const bank = getVal(idxBank);

      const ipoName = getVal(idxIpoName);
      const logoUrl = getVal(idxLogo);
      const buyPriceStr = getVal(idxBuyPrice);
      const qtyStr = getVal(idxQty);
      const ipoOpen = getVal(idxIpoOpen);
      const ipoClose = getVal(idxIpoClose);
      const ipoListing = getVal(idxIpoListing);

      const status = getVal(idxStatus);
      const sellPriceStr = getVal(idxSellPrice);
      const saleDate = getVal(idxSaleDate);
      const taxStr = getVal(idxTax);
      const userCutStr = getVal(idxUserCut);

      const userKey = pan || name;
      if (userKey && !userMap.has(userKey)) {
        userMap.set(userKey, {
          name: name || 'Unknown User',
          pan_number: pan,
          tpin,
          broker,
          upi_app: upiApp,
          bank_name: bank,
          avatar_url: avatarUrl,
          default_amount_blocked: 0,
        });
      } else if (userKey && avatarUrl) {
        const existingU = userMap.get(userKey);
        if (existingU && !existingU.avatar_url) {
          existingU.avatar_url = avatarUrl;
        }
      }

      if (bank) bankSet.add(bank);

      if (ipoName && !ipoMap.has(ipoName)) {
        ipoMap.set(ipoName, {
          ipo_name: ipoName,
          buy_price: parseFloat(buyPriceStr) || 0,
          quantity: parseInt(qtyStr, 10) || 0,
          open_date: ipoOpen,
          close_date: ipoClose,
          listing_date: ipoListing,
          logo_url: logoUrl,
          archived: 0,
          is_favorite: 0,
        });
      } else if (ipoName && logoUrl) {
        const existingI = ipoMap.get(ipoName);
        if (existingI && !existingI.logo_url) {
          existingI.logo_url = logoUrl;
        }
      }

      if (userKey && ipoName && status) {
        pendingApps.push({
          id: appId || undefined,
          pan,
          name,
          ipoName,
          status: status as ApplicationStatus,
          qty: parseInt(qtyStr, 10) || 0,
          sellPrice: sellPriceStr ? parseFloat(sellPriceStr) : null,
          saleDate: saleDate || null,
          tax: parseFloat(taxStr) || 0,
          userCut: parseFloat(userCutStr) || 0,
          bank,
          upiApp,
        });
      }
    }

    // Insert / upsert users
    const userToId = new Map<string, string>();
    for (const [key, u] of userMap) {
      let existing: { id: string } | null = null;
      if (u.pan_number) {
        existing = await safeGetFirstAsync<{ id: string }>(db, 'SELECT id FROM users_table WHERE pan_number=?', [u.pan_number], 'DBContext.importCSV.user');
      }
      if (!existing && u.name) {
        existing = await safeGetFirstAsync<{ id: string }>(db, 'SELECT id FROM users_table WHERE name=? AND name!=""', [u.name], 'DBContext.importCSV.userByName');
      }

      if (existing) {
        userToId.set(key, existing.id);
        if (u.avatar_url) {
          await safeRunAsync(
            db,
            'UPDATE users_table SET avatar_url = CASE WHEN ? != "" THEN ? ELSE avatar_url END WHERE id = ?',
            [u.avatar_url, u.avatar_url, existing.id],
            'DBContext.importCSV.updateUserAvatar'
          );
        }
      } else {
        const newId = Crypto.randomUUID();
        const now = new Date().toISOString();
        await safeRunAsync(
          db,
          'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, avatar_url, default_amount_blocked, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [newId, u.name || '', u.pan_number || '', (u as any).client_id || (u as any).demat || '', (u as any).upi_id || '', u.broker || '', u.tpin || '', u.upi_app || '', u.bank_name || '', u.avatar_url || '', 0, now, now],
          'DBContext.importCSV.insertUser'
        );
        userToId.set(key, newId);
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
        if (ipo.logo_url) {
          await safeRunAsync(
            db,
            'UPDATE ipo_listings SET logo_url = CASE WHEN ? != "" THEN ? ELSE logo_url END WHERE id = ?',
            [ipo.logo_url, ipo.logo_url, existing.id],
            'DBContext.importCSV.updateIPOLogo'
          );
        }
      } else {
        const newId = Crypto.randomUUID();
        await safeRunAsync(
          db,
          'INSERT INTO ipo_listings (id, ipo_name, buy_price, quantity, open_date, close_date, listing_date, logo_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [newId, ipo.ipo_name || name, ipo.buy_price || 0, ipo.quantity || 0, ipo.open_date || '', ipo.close_date || '', ipo.listing_date || '', ipo.logo_url || '', now, now],
          'DBContext.importCSV.insertIPO'
        );
        ipoNameToId.set(name, newId);
      }
    }

    // Insert applications (preserving separate cards / split applications)
    let appCount = 0;
    const usedCsvAppIds = new Set<string>();

    for (const app of pendingApps) {
      const userId = userToId.get(app.pan) || userToId.get(app.name);
      const ipoId  = ipoNameToId.get(app.ipoName);
      if (!userId || !ipoId) continue;

      let existing: { id: string } | null = null;
      if (app.id && !usedCsvAppIds.has(app.id)) {
        existing = await safeGetFirstAsync<{ id: string }>(
          db,
          'SELECT id FROM ipo_applications WHERE id = ? AND deleted_at IS NULL',
          [app.id],
          'DBContext.importCSV.appById'
        );
      }

      if (!existing) {
        const candidates = await safeGetAllAsync<{ id: string; status: string }>(
          db,
          'SELECT id, status FROM ipo_applications WHERE user_id = ? AND ipo_id = ? AND deleted_at IS NULL',
          [userId, ipoId],
          'DBContext.importCSV.appCandidates'
        );
        const statusMatch = candidates.find((c) => !usedCsvAppIds.has(c.id) && c.status === app.status);
        if (statusMatch) {
          existing = statusMatch;
        } else if (
          candidates.length === 1 &&
          !usedCsvAppIds.has(candidates[0].id) &&
          pendingApps.filter((p) => (userToId.get(p.pan) || userToId.get(p.name)) === userId && ipoNameToId.get(p.ipoName) === ipoId).length === 1
        ) {
          existing = candidates[0];
        }
      }

      const targetQty = app.qty > 0 ? app.qty : null;

      if (existing) {
        usedCsvAppIds.add(existing.id);
        await safeRunAsync(
          db,
          `UPDATE ipo_applications SET
            status = COALESCE(?, status),
            shares_count = CASE WHEN ? IS NOT NULL THEN ? ELSE shares_count END,
            sell_price = CASE WHEN ? IS NOT NULL THEN ? ELSE sell_price END,
            sale_date = CASE WHEN ? IS NOT NULL AND ? != "" THEN ? ELSE sale_date END,
            tax = COALESCE(?, tax),
            user_cut = COALESCE(?, user_cut),
            bank_name = CASE WHEN ? IS NOT NULL AND ? != "" THEN ? ELSE bank_name END,
            upi_app = CASE WHEN ? IS NOT NULL AND ? != "" THEN ? ELSE upi_app END,
            updated_at = ?
          WHERE id = ?`,
          [
            app.status || null,
            targetQty,
            targetQty,
            app.sellPrice !== undefined ? app.sellPrice : null,
            app.sellPrice ?? null,
            app.saleDate || null,
            app.saleDate || '',
            app.saleDate || null,
            app.tax !== undefined ? app.tax : null,
            app.userCut !== undefined ? app.userCut : null,
            app.bank || null,
            app.bank || '',
            app.bank || null,
            app.upiApp || null,
            app.upiApp || '',
            app.upiApp || null,
            now,
            existing.id,
          ],
          'DBContext.importCSV.updateApp'
        );
      } else {
        const newId = app.id || Crypto.randomUUID();
        usedCsvAppIds.add(newId);
        await safeRunAsync(
          db,
          'INSERT INTO ipo_applications (id, user_id, ipo_id, status, shares_count, sell_price, sale_date, tax, user_cut, bank_name, upi_app, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            newId,
            userId,
            ipoId,
            app.status || 'Applied',
            targetQty,
            app.sellPrice ?? null,
            app.saleDate ?? null,
            app.tax ?? 0,
            app.userCut ?? 0,
            app.bank || '',
            app.upiApp || '',
            now,
            now,
          ],
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
          const backup = await exportJSON();
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

  const restoreCloudData = useCallback(
    async (targetUid?: string): Promise<boolean> => {
      const uid = targetUid || authUser?.uid;
      if (!uid) return false;
      setIsRestoring(true);
      const startTime = Date.now();
      try {
        if (isDev) console.log(`[DBContext] Starting full cloud restore for user: ${uid}`);
        const fullRestore = await fetchUserDataFromFirestore(uid);
        if (fullRestore.success && fullRestore.data) {
          await importJSON(fullRestore.data, { suppressLegacySync: true });
          syncedUidRef.current = uid;
          const duration = Date.now() - startTime;
          if (isDev) console.log(`[DBContext] Full cloud restore completed in ${duration}ms.`);
          return true;
        }

        const deltaRes = await syncDeltaFromFirestore(uid, db, {
          onCriticalDataReady: async (criticalData) => {
            await importCriticalData(criticalData, { suppressLegacySync: true });
          },
          onSecondaryDataReady: async (secondaryData) => {
            await importSecondaryData(secondaryData, { suppressLegacySync: true });
          },
          importJSONFallback: async (data) => {
            await importJSON(data, { suppressLegacySync: true });
          },
        });

        if (deltaRes.success) {
          syncedUidRef.current = uid;
          await refresh();
          return true;
        }
        return false;
      } catch (err) {
        if (isDev) console.warn('[DBContext] restoreCloudData error:', err);
        return false;
      } finally {
        setIsRestoring(false);
      }
    },
    [authUser?.uid, db, importCriticalData, importSecondaryData, importJSON, refresh, isDev]
  );

  // Automatic background cloud sync/restore on login or startup
  useEffect(() => {
    if (isLoading || !authUser?.uid) {
      if (!authUser?.uid) {
        syncedUidRef.current = null;
      }
      return;
    }

    if (syncedUidRef.current === authUser.uid) {
      return;
    }

    let isMounted = true;
    const checkAndSyncDelta = async () => {
      try {
        setIsRestoring(true);
        syncedUidRef.current = authUser.uid;
        if (isDev) console.log('[DBContext] Checking cloud sync state for authenticated user:', authUser.uid);
        
        const deltaRes = await syncDeltaFromFirestore(authUser.uid, db, {
          onCriticalDataReady: async (criticalData) => {
            if (isMounted) {
              await importCriticalData(criticalData, { suppressLegacySync: true });
            }
          },
          onSecondaryDataReady: async (secondaryData) => {
            if (isMounted) {
              await importSecondaryData(secondaryData, { suppressLegacySync: true });
            }
          },
          importJSONFallback: async (data) => {
            if (isMounted) {
              await importJSON(data, { suppressLegacySync: true });
            }
          },
        });

        if (isMounted) {
          await refresh();
        }
      } catch (err) {
        if (isDev) console.warn('[DBContext] Delta sync check warning, falling back to restore:', err);
        if (isMounted && authUser?.uid) {
          try {
            await restoreCloudData(authUser.uid);
          } catch {}
        }
      } finally {
        if (isMounted) {
          setIsRestoring(false);
        }
      }
    };

    checkAndSyncDelta();
    return () => {
      isMounted = false;
    };
  }, [authUser?.uid, isLoading, db, importCriticalData, importSecondaryData, importJSON, refresh, restoreCloudData, isDev]);

  return (
    <DBContext.Provider
      value={{
        users,
        ipos,
        applications,
        bankAccounts,
        isLoading,
        isRestoring,
        restoreCloudData,
        refresh,
        refreshCritical,
        refreshSecondary,
        importCriticalData,
        importSecondaryData,
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
        partialSellApplication,
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
