import { resolveIpoLotSize } from '@/utils/ipoCategoryUtils';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { UserRepository, IPORepository, ApplicationRepository, BankRepository, type BulkApplyResult } from '@/db/repositories';
export type { BulkApplyResult };
import { syncStore } from '@/services/sync/syncStatus';
import { safeRunAsync, safeGetFirstAsync, safeGetAllAsync, runWithTransaction, isClosedResourceError, isDatabaseOpen, markDatabaseOpen } from '@/utils/sqliteDebug';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { ensureBase64DataUrl, extractBase64Payload, saveBase64ToLocalImage } from '@/utils/imageUtils';
import { getEffectiveAvatarUrl, prefetchUserAvatars } from '@/utils/avatarUtils';
import { getRegistrarConfig } from '@/services/allotment/registrarConfig';
import { startPerfTimer } from '@/utils/performanceMetrics';
import {
  cancelDebouncedFirestoreSync,
  syncUserDataToFirestore,
  fetchUserDataFromFirestore,
  syncDeltaFromFirestore,
  syncApplicationsBatch,
  syncSingleDocUpsert,
  syncSingleDocDelete,
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
  category?: string;
  allotted_shares?: number | null;
  allotted_lots?: number | null;
  allotment_status?: string | null;
};

export type BankAccount = {
  id: string;
  bank_name: string;
  balance: number;
  upi_app?: string;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
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
  checked_at?: string;
  error_code?: string;
};

export type ImportResult = {
  users: number;
  ipos: number;
  applications: number;
  banks?: number;
  allotments?: number;
};

export type CloudSyncStatus = 'idle' | 'syncing' | 'restoring' | 'success' | 'error';

export type DBContextType = {
  users: User[];
  ipos: IPOListing[];
  applications: ApplicationWithDetails[];
  bankAccounts: BankAccount[];
  allotments: IPOAllotmentRecord[];
  isLoading: boolean;
  isRestoring: boolean;
  cloudSyncStatus: CloudSyncStatus;
  cloudSyncError: string | null;
  retryCloudSync: () => Promise<boolean>;
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
    lotCounts?: Record<string, number> | number,
    ipoListingData?: any,
    categoryMap?: string | Record<string, string>
  ) => Promise<BulkApplyResult>;
  updateApplication: (
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
    allottedShares?: number | null
  ) => Promise<void>;
  partialSellApplication: (
    id: string,
    soldShares: number,
    totalShares: number,
    sellPrice: number,
    saleDate: string | null,
    tax?: number,
    userCut?: number,
    brokerAccountId?: string | null,
    bankName?: string,
    upiApp?: string
  ) => Promise<void>;
  updateApplicationDetails: (
    id: string,
    details: {
      status: ApplicationStatus;
      lots?: number;
      bid_price?: number;
      category?: string;
  allotted_shares?: number | null;
  allotted_lots?: number | null;
  allotment_status?: string | null;
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
  clearAllData: (targetUid?: string, options?: { skipCloudFlush?: boolean }) => Promise<void>;
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
  useEffect(() => {
    if (db) {
      markDatabaseOpen(db);
    }
  }, [db]);
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [ipos, setIPOs] = useState<IPOListing[]>([]);
  const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [allotments, setAllotments] = useState<IPOAllotmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('idle');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const syncedUidRef = React.useRef<string | null>(null);
  const activeSyncUidRef = React.useRef<string | null>(null);
  const isSyncInProgressRef = React.useRef<boolean>(false);
  const deletingBankIdsRef = React.useRef<Set<string>>(new Set());

  const authUserRef = React.useRef(authUser);
  authUserRef.current = authUser;
  const refreshCriticalRef = React.useRef<() => Promise<void>>(() => Promise.resolve());
  const refreshSecondaryRef = React.useRef<() => Promise<void>>(() => Promise.resolve());
  const refreshRef = React.useRef<() => Promise<void>>(() => Promise.resolve());

  const isDev = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : process.env.NODE_ENV !== 'production';

  const refreshCritical = useCallback(async () => {
    const t0 = Date.now();
    const currentUid = authUser?.uid || authUser?.id || null;

    const userRowsPromise = (currentUid
      ? safeGetAllAsync<User>(
          db,
          'SELECT * FROM users_table WHERE owner_id = ? AND deleted_at IS NULL ORDER BY name',
          [currentUid],
          'DBContext.refreshCritical.users'
        )
      : safeGetAllAsync<User>(
          db,
          'SELECT * FROM users_table WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL ORDER BY name',
          [],
          'DBContext.refreshCritical.users'
        )
    ).catch((err) => {
      if (isClosedResourceError(err)) return [] as User[];
      throw err;
    });

    const ipoRowsPromise = (currentUid
      ? safeGetAllAsync<IPOListing>(
          db,
          'SELECT * FROM ipo_listings WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL ORDER BY id DESC',
          [currentUid],
          'DBContext.refreshCritical.ipos'
        )
      : safeGetAllAsync<IPOListing>(
          db,
          'SELECT * FROM ipo_listings WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL ORDER BY id DESC',
          [],
          'DBContext.refreshCritical.ipos'
        )
    ).catch((err) => {
      if (isClosedResourceError(err)) return [] as IPOListing[];
      throw err;
    });

    const masterIPOsPromise = safeGetAllAsync<any>(
      db,
      `SELECT *, price_band_max AS buy_price, lot_size AS quantity FROM ipo_master WHERE deleted_at IS NULL AND (status = 'OPEN' OR status = 'UPCOMING' OR is_favorite = 1)`,
      [],
      'DBContext.refreshCritical.master'
    ).catch(() => [] as any[]);

    const appRowsPromise = (currentUid
      ? safeGetAllAsync<ApplicationWithDetails>(
          db,
          `SELECT a.id, a.user_id, a.ipo_id, a.category, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
                 a.shares_count, a.is_favorite, a.broker_account_id, a.created_at, a.updated_at,
                 u.name        AS user_name,
                 u.broker      AS user_broker,
                 u.client_id   AS user_client_id,
                 u.pan_number  AS user_pan_number,
                 u.avatar_url  AS user_avatar_url,
                 COALESCE(NULLIF(a.bank_name, ''), u.bank_name, '') AS user_bank_name,
                 COALESCE(NULLIF(a.upi_app, ''), u.upi_app, '')   AS user_upi_app,
                 COALESCE(NULLIF(i.ipo_name, ''), NULLIF(m.ipo_name, ''), NULLIF(m.company_name, ''), 'IPO') AS ipo_name,
                 COALESCE(NULLIF(i.buy_price, 0), NULLIF(m.price_band_max, 0), NULLIF(m.price_band_min, 0), 100) AS buy_price,
                 COALESCE(a.shares_count, NULLIF(i.quantity, 0), NULLIF(m.lot_size, 0), 1) AS quantity,
                 COALESCE(NULLIF(i.open_date, ''), NULLIF(m.open_date, ''), '') AS open_date,
                 COALESCE(NULLIF(i.logo_url, ''), NULLIF(m.logo_url, ''), '') AS ipo_logo_url
          FROM   ipo_applications a
          JOIN   users_table u ON a.user_id = u.id
          LEFT JOIN ipo_listings i ON a.ipo_id = i.id
          LEFT JOIN ipo_master m ON a.ipo_id = m.id
          WHERE  (a.owner_id = ? OR a.owner_id IS NULL OR a.owner_id = '') AND a.deleted_at IS NULL AND u.deleted_at IS NULL AND (i.deleted_at IS NULL OR i.id IS NULL)
          ORDER  BY a.id DESC`,
          [currentUid],
          'DBContext.refreshCritical.apps'
        )
      : safeGetAllAsync<ApplicationWithDetails>(
          db,
          `SELECT a.id, a.user_id, a.ipo_id, a.category, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
                 a.shares_count, a.is_favorite, a.broker_account_id, a.created_at, a.updated_at,
                 u.name        AS user_name,
                 u.broker      AS user_broker,
                 u.client_id   AS user_client_id,
                 u.pan_number  AS user_pan_number,
                 u.avatar_url  AS user_avatar_url,
                 COALESCE(NULLIF(a.bank_name, ''), u.bank_name, '') AS user_bank_name,
                 COALESCE(NULLIF(a.upi_app, ''), u.upi_app, '')   AS user_upi_app,
                 COALESCE(NULLIF(i.ipo_name, ''), NULLIF(m.ipo_name, ''), NULLIF(m.company_name, ''), 'IPO') AS ipo_name,
                 COALESCE(NULLIF(i.buy_price, 0), NULLIF(m.price_band_max, 0), NULLIF(m.price_band_min, 0), 100) AS buy_price,
                 COALESCE(a.shares_count, NULLIF(i.quantity, 0), NULLIF(m.lot_size, 0), 1) AS quantity,
                 COALESCE(NULLIF(i.open_date, ''), NULLIF(m.open_date, ''), '') AS open_date,
                 COALESCE(NULLIF(i.logo_url, ''), NULLIF(m.logo_url, ''), '') AS ipo_logo_url
          FROM   ipo_applications a
          JOIN   users_table u ON a.user_id = u.id
          LEFT JOIN ipo_listings i ON a.ipo_id = i.id
          LEFT JOIN ipo_master m ON a.ipo_id = m.id
          WHERE  (a.owner_id IS NULL OR a.owner_id = '') AND a.deleted_at IS NULL AND u.deleted_at IS NULL AND (i.deleted_at IS NULL OR i.id IS NULL)
          ORDER  BY a.id DESC`,
          [],
          'DBContext.refreshCritical.apps'
        )
    ).catch((err) => {
      if (isClosedResourceError(err)) return [] as ApplicationWithDetails[];
      throw err;
    });

    const [userRows, ipoRows, masterIPOs, appRows] = await Promise.all([
      userRowsPromise,
      ipoRowsPromise,
      masterIPOsPromise,
      appRowsPromise,
    ]);

    setUsers(userRows || []);
    if (userRows && userRows.length > 0) {
      prefetchUserAvatars(userRows);
    }

    let masterRows: IPOListing[] = [];
    let masterById: Map<string, any> = new Map();
    if (masterIPOs && masterIPOs.length > 0) {
      const existingIds = new Set((ipoRows || []).map((r) => r.id));

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
    }

    const enrichedIpoRows = (ipoRows || []).map((row) => {
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
    setApplications(appRows || []);

    setIsLoading(false);
    const duration = Date.now() - t0;
    if (isDev) {
      console.log(`[CloudSync Timing] Stage 1 critical refresh: ${duration}ms (users: ${(userRows || []).length}, ipos: ${enrichedIpoRows.length + masterRows.length}, apps: ${(appRows || []).length})`);
    }
  }, [db, authUser?.uid, authUser?.id]);

  const refreshSecondary = useCallback(async () => {
    const t0 = Date.now();
    const currentUid = authUser?.uid || authUser?.id || null;

    const bankPromise = currentUid
      ? safeGetAllAsync<BankAccount>(
          db,
          'SELECT * FROM bank_accounts WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL ORDER BY bank_name',
          [currentUid],
          'DBContext.refreshSecondary.banks'
        )
      : safeGetAllAsync<BankAccount>(
          db,
          'SELECT * FROM bank_accounts WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL ORDER BY bank_name',
          [],
          'DBContext.refreshSecondary.banks'
        );

    const altPromise = currentUid
      ? safeGetAllAsync<IPOAllotmentRecord>(
          db,
          `SELECT alt.* FROM ipo_allotments alt
           LEFT JOIN ipo_applications a ON alt.application_id = a.id
           WHERE (a.owner_id = ? OR a.owner_id IS NULL OR a.owner_id = '')
           ORDER BY alt.checked_at DESC`,
          [currentUid],
          'DBContext.refreshSecondary.allotments'
        )
      : safeGetAllAsync<IPOAllotmentRecord>(
          db,
          `SELECT alt.* FROM ipo_allotments alt
           LEFT JOIN ipo_applications a ON alt.application_id = a.id
           WHERE (a.owner_id IS NULL OR a.owner_id = '')
           ORDER BY alt.checked_at DESC`,
          [],
          'DBContext.refreshSecondary.allotments'
        );

    const [bankRows, altRows] = await Promise.all([
      bankPromise.catch((err) => {
        if (isClosedResourceError(err)) return [] as BankAccount[];
        throw err;
      }),
      altPromise.catch((err) => {
        if (isClosedResourceError(err)) return [] as IPOAllotmentRecord[];
        throw err;
      }),
    ]);
    const filteredBankRows = deletingBankIdsRef.current.size > 0
      ? (bankRows || []).filter((b) => !deletingBankIdsRef.current.has(b.id))
      : (bankRows || []);

    // Guaranteed deduplication by normalized bank name for UI stability
    const seenBankKeys = new Set<string>();
    const deduplicatedBankRows: BankAccount[] = [];
    for (const b of filteredBankRows) {
      const key = (b.bank_name || '').trim().toLowerCase();
      if (!key) continue;
      if (!seenBankKeys.has(key)) {
        seenBankKeys.add(key);
        deduplicatedBankRows.push(b);
      }
    }

    setBankAccounts(deduplicatedBankRows);
    setAllotments(altRows || []);

    const duration = Date.now() - t0;
    if (isDev) {
      console.log(`[CloudSync Timing] Stage 2 secondary refresh: ${duration}ms (banks: ${filteredBankRows.length}, allotments: ${(altRows || []).length})`);
    }
  }, [db, authUser?.uid, authUser?.id]);


  const inFlightRefreshRef = React.useRef<Promise<void> | null>(null);

  const reconcileAllotmentStatuses = useCallback(async () => {
    // One-time self-healing reconciliation: Synchronize ipo_applications status with ipo_allotments table & repair legacy null bank IDs
    try {
      const nowIso = new Date().toISOString();
      await safeRunAsync(
        db,
        `UPDATE ipo_applications
         SET status = 'Not Allotted', updated_at = ?
         WHERE status IN ('Applied', 'Mandate Approved', 'Allotted')
           AND id IN (
             SELECT application_id FROM ipo_allotments
             WHERE UPPER(TRIM(allotment_status)) IN ('NOT_ALLOTTED', 'NOT ALLOTTED', 'REJECTED')
           )`,
        [nowIso],
        'DBContext.reconcile.notAllotted'
      );
      await safeRunAsync(
        db,
        `UPDATE ipo_applications
         SET status = 'Allotted', updated_at = ?
         WHERE status IN ('Applied', 'Mandate Approved', 'Not Allotted')
           AND id IN (
             SELECT application_id FROM ipo_allotments
             WHERE UPPER(TRIM(allotment_status)) = 'ALLOTTED'
           )`,
        [nowIso],
        'DBContext.reconcile.allotted'
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
        [nowIso],
        'DBContext.reconcile.partiallyAllotted'
      );

      // Repair legacy bank rows where id is null or empty
      const nullBankRows = await safeGetAllAsync<{ rowid: number }>(
        db,
        'SELECT rowid FROM bank_accounts WHERE id IS NULL OR id = ""',
        [],
        'DBContext.reconcile.nullBanks'
      );
      for (const r of nullBankRows) {
        await safeRunAsync(
          db,
          'UPDATE bank_accounts SET id = ? WHERE rowid = ?',
          [Crypto.randomUUID(), r.rowid],
          'DBContext.reconcile.repairBank'
        );
      }

      // Deduplicate active bank accounts: merge any duplicates with identical normalized bank names
      const duplicateBankGroups = await safeGetAllAsync<{ norm_name: string; cnt: number }>(
        db,
        `SELECT LOWER(TRIM(bank_name)) as norm_name, COUNT(*) as cnt
         FROM bank_accounts
         WHERE deleted_at IS NULL
         GROUP BY LOWER(TRIM(bank_name))
         HAVING COUNT(*) > 1`,
        [],
        'DBContext.reconcile.findDuplicateBanks'
      );

      for (const group of duplicateBankGroups || []) {
        if (!group?.norm_name) continue;
        const candidates = await safeGetAllAsync<BankAccount>(
          db,
          `SELECT * FROM bank_accounts
           WHERE LOWER(TRIM(bank_name)) = ? AND deleted_at IS NULL
           ORDER BY
             (CASE WHEN owner_id IS NOT NULL AND owner_id != '' THEN 1 ELSE 0 END) DESC,
             balance DESC,
             updated_at DESC`,
          [group.norm_name],
          'DBContext.reconcile.getDuplicateBankCandidates'
        );

        if (candidates && candidates.length > 1) {
          const canonical = candidates[0];
          const redundant = candidates.slice(1);
          const bestUpi = (canonical.upi_app && canonical.upi_app.trim()) || (redundant.find((r) => r.upi_app && r.upi_app.trim())?.upi_app?.trim() || '');
          if (bestUpi !== canonical.upi_app) {
            await safeRunAsync(
              db,
              'UPDATE bank_accounts SET upi_app = ?, updated_at = ? WHERE id = ?',
              [bestUpi, nowIso, canonical.id],
              'DBContext.reconcile.updateCanonicalBankUpi'
            );
          }

          for (const dup of redundant) {
            await safeRunAsync(
              db,
              'DELETE FROM bank_accounts WHERE id = ?',
              [dup.id],
              'DBContext.reconcile.removeDuplicateBank'
            );
          }
        }
      }

      // Resurrect valid applications that were erroneously soft-deleted by duplicate checks if they have distinct data or non-matching categories
      await safeRunAsync(
        db,
        `UPDATE ipo_applications
         SET deleted_at = NULL, updated_at = ?
         WHERE deleted_at IS NOT NULL
           AND (
             category IN ('SHAREHOLDER', 'HNI', 'SME', 'EMPLOYEE')
             OR id IN (SELECT application_id FROM ipo_allotments WHERE application_id IS NOT NULL)
             OR NOT EXISTS (
               SELECT 1 FROM ipo_applications active
               WHERE active.deleted_at IS NULL
                 AND active.id != ipo_applications.id
                 AND active.user_id = ipo_applications.user_id
                 AND active.ipo_id = ipo_applications.ipo_id
                 AND COALESCE(NULLIF(active.category, ''), 'RETAIL') = COALESCE(NULLIF(ipo_applications.category, ''), 'RETAIL')
             )
           )`,
        [nowIso],
        'DBContext.reconcile.resurrectErroneouslyDeletedApps'
      );

      // Deduplicate applications and allotments: ensure at most 1 active application and 1 allotment per user per IPO per category
      const duplicateAppGroups = await safeGetAllAsync<{ user_id: string; ipo_id: string; category: string; cnt: number }>(
        db,
        `SELECT user_id, ipo_id, COALESCE(NULLIF(category, ''), 'RETAIL') as category, COUNT(*) as cnt
         FROM ipo_applications
         WHERE deleted_at IS NULL OR deleted_at = ''
         GROUP BY user_id, ipo_id, COALESCE(NULLIF(category, ''), 'RETAIL')
         HAVING COUNT(*) > 1`,
        [],
        'DBContext.reconcile.findDuplicateApps'
      );

      for (const group of duplicateAppGroups || []) {
        if (!group?.user_id || !group?.ipo_id) continue;
        const candidates = await safeGetAllAsync<ApplicationWithDetails>(
          db,
          `SELECT * FROM ipo_applications
           WHERE user_id = ? AND ipo_id = ? AND COALESCE(NULLIF(category, ''), 'RETAIL') = ? AND (deleted_at IS NULL OR deleted_at = '')
           ORDER BY
             (CASE WHEN status IN ('Allotted', 'Partially Allotted') THEN 2 WHEN status = 'Applied' THEN 1 ELSE 0 END) DESC,
             (CASE WHEN shares_count IS NOT NULL AND shares_count > 0 THEN shares_count ELSE 0 END) DESC,
             created_at ASC`,
          [group.user_id, group.ipo_id, group.category],
          'DBContext.reconcile.getDuplicateAppCandidates'
        );

        if (candidates && candidates.length > 1) {
          const canonical = candidates[0];
          // Guard: Never delete candidates if their raw categories differ, or if they have distinct bank accounts or shares count
          const redundant = candidates.slice(1).filter((dup) => {
            if (dup.category && canonical.category && dup.category !== canonical.category) return false;
            if (dup.shares_count && canonical.shares_count && dup.shares_count !== canonical.shares_count) return false;
            return true;
          });

          const bestStatus = candidates.find((c) => c.status === 'Allotted' || c.status === 'Partially Allotted')?.status || canonical.status;
          const allottedCandidate = candidates.find((c) => c.status === 'Allotted' || c.status === 'Partially Allotted');
          const bestShares = allottedCandidate?.shares_count && allottedCandidate.shares_count > 0
            ? allottedCandidate.shares_count
            : Math.max(...candidates.map((c) => c.shares_count || 0));

          await safeRunAsync(
            db,
            'UPDATE ipo_applications SET status = ?, shares_count = ?, updated_at = ? WHERE id = ?',
            [bestStatus, bestShares > 0 ? bestShares : canonical.shares_count, nowIso, canonical.id],
            'DBContext.reconcile.updateCanonicalApp'
          );

          for (const dup of redundant) {
            // Soft-delete redundant exact duplicates within the same category to never destroy records
            await safeRunAsync(db, 'UPDATE ipo_allotments SET updated_at = ? WHERE application_id = ?', [nowIso, dup.id]);
            await safeRunAsync(db, 'UPDATE ipo_applications SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso, nowIso, dup.id]);
          }
        }
      }

      // Clean up any remaining duplicate allotments by (user_id, ipo_id, category)
      await safeRunAsync(
        db,
        `DELETE FROM ipo_allotments
         WHERE application_id NOT IN (
           SELECT id FROM ipo_applications WHERE deleted_at IS NULL OR deleted_at = ''
         )
         OR id NOT IN (
           SELECT MIN(alt.id)
           FROM ipo_allotments alt
           JOIN ipo_applications app ON alt.application_id = app.id
           WHERE app.deleted_at IS NULL OR app.deleted_at = ''
           GROUP BY alt.user_id, alt.ipo_id, COALESCE(NULLIF(app.category, ''), 'RETAIL')
         )`,
        [],
        'DBContext.reconcile.cleanDuplicateAllotments'
      );

      // Clean up orphaned local data if previous session terminated during account deletion
      const orphanDeletionUid = await safeAsyncStorage.getItem('@ipovault_pending_account_deletion_uid');
      if (orphanDeletionUid) {
        await safeRunAsync(db, 'DELETE FROM ipo_allotments WHERE application_id IN (SELECT id FROM ipo_applications WHERE owner_id = ?)', [orphanDeletionUid]);
        await safeRunAsync(db, 'DELETE FROM ipo_applications WHERE owner_id = ?', [orphanDeletionUid]);
        await safeRunAsync(db, 'DELETE FROM ipo_listings WHERE owner_id = ?', [orphanDeletionUid]);
        await safeRunAsync(db, 'DELETE FROM users_table WHERE owner_id = ?', [orphanDeletionUid]);
        await safeRunAsync(db, 'DELETE FROM bank_accounts WHERE owner_id = ?', [orphanDeletionUid]);
        await safeAsyncStorage.removeItem('@ipovault_pending_account_deletion_uid');
      }
    } catch {}
  }, [db]);

  const refresh = useCallback(async () => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const promise = (async () => {
      const timer = startPerfTimer('DBContext.refresh');
      try {
        await Promise.all([refreshCritical(), refreshSecondary()]);
        timer();
      } catch (err) {
        if (!isClosedResourceError(err)) {
          throw err;
        }
      } finally {
        inFlightRefreshRef.current = null;
      }
    })();

    inFlightRefreshRef.current = promise;
    return promise;
  }, [refreshCritical, refreshSecondary]);

  refreshCriticalRef.current = refreshCritical;
  refreshSecondaryRef.current = refreshSecondary;
  refreshRef.current = refresh;

  // Initial self-healing reconciliation on mount / DB load
  useEffect(() => {
    reconcileAllotmentStatuses().catch(() => {});
  }, [reconcileAllotmentStatuses]);

  useEffect(() => {
    let isMounted = true;
    const timeout = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 2000);

    refresh()
      .catch((err) => {
        if (isDev) console.warn('[DBContext] Initial refresh error:', err);
      })
      .finally(() => {
        if (isMounted) {
          clearTimeout(timeout);
          setIsLoading(false);
        }
      });

    // Reconcile and schedule advance notifications with OS
    try {
      const { reconcileScheduledNotifications } = require('@/services/notifications/notificationEngine');
      reconcileScheduledNotifications(db).catch(() => {});
    } catch {}

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [refresh, isDev, db]);

  useEffect(() => {
    cancelDebouncedFirestoreSync();
  }, [authUser?.uid]);

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
    const currentUid = authUser?.uid || authUser?.id || null;
    let snapshotUsers: User[] = [];
    setUsers((prev) => {
      snapshotUsers = prev;
      return prev;
    });
    try {
      const repo = new UserRepository(db);
      const newId = await repo.add(user, currentUid);
      const createdUser: User = { ...user, id: newId, owner_id: currentUid || undefined };
      setUsers((prev) => [...prev, createdUser].sort((a, b) => a.name.localeCompare(b.name)));
      if (currentUid) {
        syncSingleDocUpsert(currentUid, 'profiles', newId, createdUser).catch((err) => {
          if (isDev) console.warn('[DBContext.addUser] Live cloud user sync notice:', err);
        });
      }
    } catch (err) {
      if (snapshotUsers.length > 0) setUsers(snapshotUsers);
      throw err;
    }
  };

  const updateUser = async (id: string, user: Omit<User, 'id'>) => {
    const currentUid = authUser?.uid || authUser?.id || null;
    let snapshotUsers: User[] = [];
    let snapshotApps: ApplicationWithDetails[] = [];
    setUsers((prev) => {
      snapshotUsers = prev;
      return prev.map((u) => (u.id === id ? { ...u, ...user } : u));
    });
    setApplications((prev) => {
      snapshotApps = prev;
      return prev.map((a) =>
        a.user_id === id
          ? {
              ...a,
              user_name: user.name || a.user_name,
              user_broker: user.broker || a.user_broker,
              user_client_id: user.client_id !== undefined ? user.client_id : a.user_client_id,
              user_pan_number: user.pan_number !== undefined ? user.pan_number : a.user_pan_number,
              user_bank_name: user.bank_name || a.user_bank_name,
              user_upi_app: user.upi_app || a.user_upi_app,
              user_avatar_url: (user.avatar_url || (user as any).avatarUrl) !== undefined ? (user.avatar_url || (user as any).avatarUrl) : a.user_avatar_url,
            }
          : a
      );
    });
    try {
      const repo = new UserRepository(db);
      await repo.update(id, user);
      if (currentUid) {
        syncSingleDocUpsert(currentUid, 'profiles', id, { ...user, id }).catch((err) => {
          if (isDev) console.warn('[DBContext.updateUser] Live cloud user sync notice:', err);
        });
      }
    } catch (err) {
      if (snapshotUsers.length > 0) setUsers(snapshotUsers);
      if (snapshotApps.length > 0) setApplications(snapshotApps);
      throw err;
    }
  };

  const archiveUser = async (id: string) => {
    let snapshotUsers: User[] = [];
    setUsers((prev) => {
      snapshotUsers = prev;
      return prev.map((u) => (u.id === id ? { ...u, archived: 1 } : u));
    });
    try {
      const repo = new UserRepository(db);
      await repo.archive(id, true);
      const currentUid = authUser?.uid || authUser?.id || null;
      if (currentUid) {
        syncSingleDocUpsert(currentUid, 'profiles', id, { archived: 1, updated_at: new Date().toISOString() }).catch(() => {});
      }
    } catch (err) {
      if (snapshotUsers.length > 0) setUsers(snapshotUsers);
      throw err;
    }
  };

  const unarchiveUser = async (id: string) => {
    let snapshotUsers: User[] = [];
    setUsers((prev) => {
      snapshotUsers = prev;
      return prev.map((u) => (u.id === id ? { ...u, archived: 0 } : u));
    });
    try {
      const repo = new UserRepository(db);
      await repo.archive(id, false);
      const currentUid = authUser?.uid || authUser?.id || null;
      if (currentUid) {
        syncSingleDocUpsert(currentUid, 'profiles', id, { archived: 0, updated_at: new Date().toISOString() }).catch(() => {});
      }
    } catch (err) {
      if (snapshotUsers.length > 0) setUsers(snapshotUsers);
      throw err;
    }
  };

  const deleteUser = async (id: string) => {
    let snapshotUsers: User[] = [];
    let snapshotApps: ApplicationWithDetails[] = [];
    setUsers((prev) => {
      snapshotUsers = prev;
      return prev.filter((u) => u.id !== id);
    });
    setApplications((prev) => {
      snapshotApps = prev;
      return prev.filter((a) => a.user_id !== id);
    });
    try {
      const repo = new UserRepository(db);
      await repo.delete(id);
      const currentUid = authUser?.uid || authUser?.id || null;
      if (currentUid) {
        syncSingleDocDelete(currentUid, 'profiles', id).catch((err) => {
          if (isDev) console.warn('[DBContext.deleteUser] Live cloud delete user notice:', err);
        });
      }
    } catch (err) {
      if (snapshotUsers.length > 0) setUsers(snapshotUsers);
      if (snapshotApps.length > 0) setApplications(snapshotApps);
      throw err;
    }
  };

  // ── IPO CRUD ───────────────────────────────────────────────────────────────

  const addIPO = async (ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>) => {
    const repo = new IPORepository(db);
    const currentUid = authUser?.uid || authUser?.id || null;
    await repo.add(ipo, currentUid);
    await refresh();
    try {
      const { scheduleAdvanceIPONotifications } = require('@/services/notifications/notificationEngine');
      await scheduleAdvanceIPONotifications(db, [ipo as any]);
    } catch {}
  };

  const updateIPO = async (id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>) => {
    const repo = new IPORepository(db);
    await repo.update(id, ipo);
    await refresh();
    try {
      const { scheduleAdvanceIPONotifications } = require('@/services/notifications/notificationEngine');
      await scheduleAdvanceIPONotifications(db, [{ ...ipo, id }]);
    } catch {}
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
    try {
      const { cancelIPONotifications } = require('@/services/notifications/notificationEngine');
      await cancelIPONotifications(id);
    } catch {}
  };

  // ── Applications ───────────────────────────────────────────────────────────

  const addBulkApplications = useCallback(
    async (
      ipoId: string,
      userIds: string[],
      bankName?: string | Record<string, string>,
      upiApp?: string | Record<string, string>,
      lotCounts?: Record<string, number> | number,
      ipoListingData?: any,
      categoryMap?: string | Record<string, string>
    ): Promise<BulkApplyResult> => {
      const emptyResult: BulkApplyResult = {
        selectedCount: userIds?.length || 0,
        createdCount: 0,
        alreadyExistingCount: 0,
        failedCount: 0,
        createdAppIds: [],
        skippedUserIds: [],
        errors: [],
      };
      if (!ipoId) return emptyResult;

      const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const timer = startPerfTimer('DBContext.addBulkApplications', { applicantCount: userIds.length, ipoId });
      const now = new Date().toISOString();
      const currentUid = authUserRef.current?.uid || authUserRef.current?.id || null;
      let resolvedId = ipoId;

    if (ipoListingData) {
      // Upsert provided listing metadata directly in a single statement
      await safeRunAsync(
        db,
        `INSERT INTO ipo_listings (
          id, ipo_name, company_name, symbol, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
          registrar, exchange, issue_type, archived, is_favorite, logo_url, created_at, updated_at,
          sync_version, sync_status, owner_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0, 'PENDING', ?)
        ON CONFLICT(id) DO UPDATE SET
          ipo_name = excluded.ipo_name, company_name = excluded.company_name, symbol = excluded.symbol,
          buy_price = excluded.buy_price, quantity = excluded.quantity, open_date = excluded.open_date,
          close_date = excluded.close_date, listing_date = excluded.listing_date, allotment_date = excluded.allotment_date,
          registrar = excluded.registrar, exchange = excluded.exchange, issue_type = excluded.issue_type,
          logo_url = excluded.logo_url, updated_at = excluded.updated_at,
          owner_id = COALESCE(excluded.owner_id, ipo_listings.owner_id)`,
        [
          ipoListingData.id || ipoId,
          ipoListingData.ipo_name || 'IPO',
          ipoListingData.company_name || ipoListingData.ipo_name || 'IPO',
          ipoListingData.symbol || '',
          ipoListingData.buy_price || 100,
          ipoListingData.quantity || 1,
          ipoListingData.open_date || '',
          ipoListingData.close_date || '',
          ipoListingData.listing_date || '',
          ipoListingData.allotment_date || '',
          ipoListingData.registrar || '',
          'NSE, BSE',
          ipoListingData.issue_type || 'Mainboard',
          ipoListingData.logo_url || '',
          now,
          now,
          currentUid,
        ],
        'DBContext.addBulkApplications.upsertListing'
      );
      resolvedId = ipoListingData.id || ipoId;
      setIPOs((prev) => {
        const existingIdx = prev.findIndex((i) => i.id === resolvedId);
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = { ...copy[existingIdx], ...ipoListingData, id: resolvedId };
          return copy;
        }
        return [{ ...ipoListingData, id: resolvedId, archived: 0, is_favorite: 0 }, ...prev];
      });
      if (currentUid) {
        syncSingleDocUpsert(currentUid, 'ipos', resolvedId, {
          ...ipoListingData,
          id: resolvedId,
          updated_at: now,
        }).catch(() => {});
      }
    } else {
      // 1. Check if record exists in ipo_listings by id, ipo_name, or company_name
      const existingInListings = await safeGetFirstAsync<{ id: string }>(
        db,
        'SELECT id FROM ipo_listings WHERE id = ? OR LOWER(TRIM(ipo_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(company_name)) = LOWER(TRIM(?))',
        [ipoId, ipoId, ipoId],
        'DBContext.addBulkApplications.checkListings'
      );

      if (existingInListings) {
        resolvedId = existingInListings.id;
      } else {
        // 2. Resolve from ipo_master if selected from Smart IPO Database
        const masterRecord = await safeGetFirstAsync<any>(
          db,
          'SELECT * FROM ipo_master WHERE id = ? OR LOWER(TRIM(company_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(ipo_name)) = LOWER(TRIM(?)) OR UPPER(TRIM(symbol)) = UPPER(TRIM(?))',
          [ipoId, ipoId, ipoId, ipoId],
          'DBContext.addBulkApplications.checkMaster'
        );

        if (masterRecord) {
          resolvedId = masterRecord.id;
          await safeRunAsync(
            db,
            `INSERT OR IGNORE INTO ipo_listings (
              id, ipo_name, company_name, symbol, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
              registrar, exchange, issue_type, archived, is_favorite, logo_url, owner_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
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
              currentUid,
              now,
              now,
            ],
            'DBContext.addBulkApplications.insertMasterShadow'
          );
        } else {
          // Fallback shadow entry if neither ipo_master nor ipo_listings record exists yet
          const shadowRegistrar = getRegistrarConfig(ipoId).name;
          await safeRunAsync(
            db,
            `INSERT OR IGNORE INTO ipo_listings (
              id, ipo_name, company_name, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
              registrar, exchange, issue_type, archived, is_favorite, owner_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, '', '', '', '', ?, 'NSE, BSE', 'Mainboard', 0, 0, ?, ?, ?)`,
            [ipoId, ipoId, ipoId, 100, 1, shadowRegistrar, currentUid, now, now],
            'DBContext.addBulkApplications.insertFallbackShadow'
          );
        }
      }
    }

    const repo = new ApplicationRepository(db);
    const result = await repo.addBulk(resolvedId, userIds, bankName, upiApp, lotCounts, currentUid, categoryMap);
    const tCommit = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const durationCommit = tCommit - t0;
    timer({ status: 'committed', durationMs: durationCommit });
    console.log(`[DBContext Trace] ApplicationRepository.addBulk transaction committed to SQLite in ${durationCommit.toFixed(1)}ms (${result.createdCount} created, ${result.alreadyExistingCount} existing)`);

    // Targeted state update: fetch only the newly created rows instead of querying the full database
    if (result.createdAppIds.length > 0) {
      try {
        const placeholders = result.createdAppIds.map(() => '?').join(',');
        const newAppRows = await safeGetAllAsync<ApplicationWithDetails>(
          db,
          `SELECT a.id, a.user_id, a.ipo_id, a.category, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
                  a.shares_count, a.is_favorite, a.broker_account_id, a.created_at, a.updated_at,
                  u.name        AS user_name,
                  u.broker      AS user_broker,
                  u.client_id   AS user_client_id,
                  u.pan_number  AS user_pan_number,
                  u.avatar_url  AS user_avatar_url,
                  COALESCE(NULLIF(a.bank_name, ''), u.bank_name, '') AS user_bank_name,
                  COALESCE(NULLIF(a.upi_app, ''), u.upi_app, '')   AS user_upi_app,
                  COALESCE(NULLIF(i.ipo_name, ''), NULLIF(m.ipo_name, ''), NULLIF(m.company_name, ''), 'IPO') AS ipo_name,
                  COALESCE(NULLIF(i.buy_price, 0), NULLIF(m.price_band_max, 0), NULLIF(m.price_band_min, 0), 100) AS buy_price,
                  COALESCE(a.shares_count, NULLIF(i.quantity, 0), NULLIF(m.lot_size, 0), 1) AS quantity,
                  COALESCE(NULLIF(i.open_date, ''), NULLIF(m.open_date, ''), '') AS open_date,
                  COALESCE(NULLIF(i.logo_url, ''), NULLIF(m.logo_url, ''), '') AS ipo_logo_url
           FROM   ipo_applications a
           JOIN   users_table u ON a.user_id = u.id
           LEFT JOIN ipo_listings i ON a.ipo_id = i.id
           LEFT JOIN ipo_master m ON a.ipo_id = m.id
           WHERE  a.id IN (${placeholders})`,
          result.createdAppIds,
          'DBContext.addBulkApplications.fetchNewRows'
        );

        if (newAppRows && newAppRows.length > 0) {
          const newIds = new Set(newAppRows.map((r) => r.id));
          setApplications((prev) => [
            ...newAppRows,
            ...prev.filter((existing) => !newIds.has(existing.id) && existing.status !== 'Cancelled'),
          ]);
        }
      } catch (err: any) {
        console.warn('[DBContext Trace] Post-apply targeted fetch error, falling back to refreshCritical:', err?.message || err);
        await refreshCritical();
      }
    }

    // Secondary background refresh for allotments
    refreshSecondary().catch(() => {});

    // Instant atomic batch cloud sync for all created applications
    if (currentUid && result.createdAppIds.length > 0) {
      (async () => {
        try {
          const placeholders = result.createdAppIds.map(() => '?').join(',');
          const createdRows = await safeGetAllAsync<any>(
            db,
            `SELECT * FROM ipo_applications WHERE id IN (${placeholders})`,
            result.createdAppIds,
            'DBContext.addBulkApplications.batchFetch'
          );
          if (createdRows && createdRows.length > 0) {
            await syncApplicationsBatch(currentUid, createdRows);
            await safeRunAsync(
              db,
              `UPDATE ipo_applications SET sync_status = 'SYNCED', last_synced_at = ? WHERE id IN (${placeholders})`,
              [now, ...result.createdAppIds],
              'DBContext.addBulkApplications.markSynced'
            );
          }
        } catch (syncErr) {
          console.warn('[addBulkApplications] Batch cloud sync failed:', syncErr);
        }
      })().catch(() => {});
    }

    return result;
  }, [db, refreshCritical, refreshSecondary]);

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
      if (oldStatus === newStatus) return;

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

      const isFinanciallyAllotted = (s: ApplicationStatus) =>
        s === 'Allotted' || s === 'Partially Allotted' || s === 'Holding' || s === 'Sold';

      const wasAllotted = isFinanciallyAllotted(oldStatus);
      const isAllotted = isFinanciallyAllotted(newStatus);
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

  const updateApplication = useCallback(
    async (
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
      allottedShares?: number | null,
    ) => {
      let snapshot: ApplicationWithDetails[] = [];
      setApplications((prev) => {
        snapshot = prev;
        return prev.map((app) => {
          if (app.id !== id) return app;
          const isAllottedState =
            status === 'Allotted' ||
            status === 'Partially Allotted' ||
            status === 'Holding' ||
            status === 'Sold';
          const resolvedAllottedShares =
            allottedShares !== undefined
              ? allottedShares
              : (isAllottedState && sharesCount !== undefined && sharesCount !== null && sharesCount > 0)
              ? sharesCount
              : status === 'Not Allotted'
              ? 0
              : app.allotted_shares;
          const resolvedSharesCount =
            sharesCount !== undefined && sharesCount !== null
              ? (status === 'Not Allotted' && sharesCount === 0 ? app.shares_count : sharesCount)
              : app.shares_count;

          return {
            ...app,
            status,
            sell_price: sellPrice !== undefined ? sellPrice : app.sell_price,
            sale_date: saleDate !== undefined ? saleDate : app.sale_date,
            tax: tax !== undefined ? tax : app.tax,
            user_cut: userCut !== undefined ? userCut : app.user_cut,
            user_bank_name: bankName !== undefined && bankName.trim() !== '' ? bankName.trim() : app.user_bank_name,
            user_upi_app: upiApp !== undefined && upiApp.trim() !== '' ? upiApp.trim() : app.user_upi_app,
            broker_account_id: brokerAccountId !== undefined ? brokerAccountId : app.broker_account_id,
            shares_count: resolvedSharesCount,
            allotted_shares: resolvedAllottedShares,
            quantity:
              isAllottedState
                ? (typeof resolvedAllottedShares === 'number' && resolvedAllottedShares > 0
                    ? resolvedAllottedShares
                    : (resolvedSharesCount || app.quantity || 1))
                : (resolvedSharesCount || app.quantity || 1),
          };
        });
      });

      try {
        await handleBankAllotmentDebit(db, id, status, bankName ? { bank_name: bankName } : undefined);
        const repo = new ApplicationRepository(db);
        await repo.update(id, status, sellPrice, saleDate, tax, userCut, bankName, upiApp, brokerAccountId, sharesCount);
      } catch (err) {
        if (snapshot.length > 0) setApplications(snapshot);
        throw err;
      }

      const currentUid = authUserRef.current?.uid || authUserRef.current?.id || null;
      if (currentUid) {
        try {
          const updateData: Record<string, any> = {
            status,
            updated_at: new Date().toISOString(),
          };
          if (sellPrice !== undefined) updateData.sell_price = sellPrice;
          if (saleDate !== undefined) updateData.sale_date = saleDate;
          if (tax !== undefined) updateData.tax = tax;
          if (userCut !== undefined) updateData.user_cut = userCut;
          if (bankName !== undefined && bankName.trim() !== '') updateData.bank_name = bankName.trim();
          if (upiApp !== undefined && upiApp.trim() !== '') updateData.upi_app = upiApp.trim();
          if (brokerAccountId !== undefined) updateData.broker_account_id = brokerAccountId;
          if (sharesCount !== undefined) updateData.shares_count = sharesCount;
          syncSingleDocUpsert(currentUid, 'applications', id, updateData).catch(() => {});
        } catch (err) {
          console.warn('[updateApplication] syncSingleDocUpsert failed:', err);
        }
      }
    },
    [db]
  );

  const partialSellApplication = async (
    id: string,
    soldShares: number,
    totalShares: number,
    sellPrice: number,
    saleDate: string | null,
    tax?: number,
    userCut?: number,
    brokerAccountId?: string | null,
    bankName?: string,
    upiApp?: string,
  ) => {
    const repo = new ApplicationRepository(db);
    const currentUid = authUser?.uid || authUser?.id || null;
    await repo.partialSell(
      id,
      soldShares,
      totalShares,
      sellPrice,
      saleDate,
      tax,
      userCut,
      currentUid,
      brokerAccountId,
      bankName,
      upiApp
    );
    await refresh();
    if (currentUid) {
      try {
        syncSingleDocUpsert(currentUid, 'applications', id, {
          shares_count: totalShares - soldShares,
          updated_at: new Date().toISOString(),
        }).catch(() => {});
      } catch (err) {
        console.warn('[partialSellApplication] syncSingleDocUpsert failed:', err);
      }
    }
  };

  const updateApplicationDetails = useCallback(
    async (
      id: string,
      details: {
        status: ApplicationStatus;
        lots?: number;
        bid_price?: number;
        category?: string;
  allotted_shares?: number | null;
  allotted_lots?: number | null;
  allotment_status?: string | null;
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
      // 1. In-memory targeted update
      setApplications((prev) =>
        prev.map((app) => {
          if (app.id !== id) return app;
          return {
            ...app,
            status: details.status,
            sell_price: details.sellPrice !== undefined ? details.sellPrice : app.sell_price,
            sale_date: details.saleDate !== undefined ? details.saleDate : app.sale_date,
            tax: details.tax !== undefined ? details.tax : app.tax,
            user_cut: details.userCut !== undefined ? details.userCut : app.user_cut,
            user_bank_name: details.bank_name !== undefined && details.bank_name.trim() !== '' ? details.bank_name.trim() : app.user_bank_name,
            user_upi_app: details.upi_app !== undefined && details.upi_app.trim() !== '' ? details.upi_app.trim() : app.user_upi_app,
            broker_account_id: details.brokerAccountId !== undefined ? details.brokerAccountId : app.broker_account_id,
            category: details.category !== undefined ? details.category : app.category,
          };
        })
      );

      // 2. Persist to SQLite
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

      // 3. Lightweight single-doc Firestore sync
      const currentUid = authUserRef.current?.uid || authUserRef.current?.id || null;
      if (currentUid) {
        try {
          const updateData: Record<string, any> = {
            status: details.status,
            updated_at: new Date().toISOString(),
          };
          if (details.sellPrice !== undefined) updateData.sell_price = details.sellPrice;
          if (details.saleDate !== undefined) updateData.sale_date = details.saleDate;
          if (details.tax !== undefined) updateData.tax = details.tax;
          if (details.userCut !== undefined) updateData.user_cut = details.userCut;
          if (details.bank_name !== undefined) updateData.bank_name = details.bank_name;
          if (details.upi_app !== undefined) updateData.upi_app = details.upi_app;
          if (details.category !== undefined) updateData.category = details.category;
          if (details.brokerAccountId !== undefined) updateData.broker_account_id = details.brokerAccountId;
          syncSingleDocUpsert(currentUid, 'applications', id, updateData).catch(() => {});
        } catch (err) {
          console.warn('[updateApplicationDetails] syncSingleDocUpsert failed:', err);
        }
      }
    },
    [db]
  );

  const updateBulkApplications = useCallback(
    async (ids: string[], status: ApplicationStatus) => {
      // 1. In-memory instant update
      setApplications((prev) =>
        prev.map((app) => (ids.includes(app.id) ? { ...app, status } : app))
      );

      // 2. Persist to SQLite
      for (const id of ids) {
        await handleBankAllotmentDebit(db, id, status);
      }
      const repo = new ApplicationRepository(db);
      await repo.updateBulkStatus(ids, status);

      // 3. Single-doc updates concurrently to Firestore
      const currentUid = authUserRef.current?.uid || authUserRef.current?.id || null;
      if (currentUid) {
        const nowIso = new Date().toISOString();
        for (const id of ids) {
          syncSingleDocUpsert(currentUid, 'applications', id, {
            status,
            updated_at: nowIso,
          }).catch(() => {});
        }
      }
    },
    [db]
  );

  const deleteApplication = useCallback(
    async (id: string) => {
      // 1. In-memory instant update
      setApplications((prev) => prev.filter((app) => app.id !== id));

      // 2. Persist to SQLite
      await handleBankAllotmentDebit(db, id, 'Not Allotted' as ApplicationStatus);
      const repo = new ApplicationRepository(db);
      await repo.delete(id);

      // 3. Single-doc delete to Firestore
      const currentUid = authUserRef.current?.uid || authUserRef.current?.id || null;
      if (currentUid) {
        try {
          syncSingleDocDelete(currentUid, 'applications', id).catch(() => {});
        } catch (err) {
          console.warn('[deleteApplication] cloud sync failed:', err);
        }
      }
    },
    [db]
  );

  const toggleFavorite = useCallback(
    async (id: string, isFavorite: boolean) => {
      // 1. In-memory instant update
      setApplications((prev) =>
        prev.map((app) => (app.id === id ? { ...app, is_favorite: isFavorite ? 1 : 0 } : app))
      );

      // 2. Persist to SQLite
      await db.runAsync('UPDATE ipo_applications SET is_favorite=? WHERE id=?', [isFavorite ? 1 : 0, id]);

      // 3. Single-doc upsert to Firestore
      const currentUid = authUserRef.current?.uid || authUserRef.current?.id || null;
      if (currentUid) {
        try {
          syncSingleDocUpsert(currentUid, 'applications', id, {
            is_favorite: isFavorite ? 1 : 0,
            updated_at: new Date().toISOString(),
          }).catch(() => {});
        } catch (err) {
          console.warn('[toggleFavorite] syncSingleDocUpsert failed:', err);
        }
      }
    },
    [db]
  );

  // ── Allotments ─────────────────────────────────────────────────────────────

  const getAllotments = async (): Promise<IPOAllotmentRecord[]> => {
    try {
      const currentUid = authUser?.uid || authUser?.id || null;
      const rows = currentUid
        ? await safeGetAllAsync<IPOAllotmentRecord>(
            db,
            `SELECT alt.* FROM ipo_allotments alt
             LEFT JOIN ipo_applications a ON alt.application_id = a.id
             WHERE (a.owner_id = ? OR a.owner_id IS NULL OR a.owner_id = '')
             ORDER BY alt.checked_at DESC`,
            [currentUid],
            'DBContext.getAllotments'
          )
        : await safeGetAllAsync<IPOAllotmentRecord>(
            db,
            `SELECT alt.* FROM ipo_allotments alt
             LEFT JOIN ipo_applications a ON alt.application_id = a.id
             WHERE (a.owner_id IS NULL OR a.owner_id = '')
             ORDER BY alt.checked_at DESC`,
            [],
            'DBContext.getAllotments'
          );
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

    const allottedLots = params.allotted_lots ?? (params.allotment_status === 'ALLOTTED' || params.allotment_status === 'PARTIALLY_ALLOTTED' ? 1 : 0);
    const ipoObj = ipos.find((i) => i.id === params.ipo_id);
    const lotSize = resolveIpoLotSize(ipoObj);
    let allottedShares = params.allotted_shares ?? 0;
    if (allottedShares <= 0 && allottedLots > 0) {
      allottedShares = allottedLots * lotSize;
    }
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
        params.checked_at || now,
        errorCode,
        existing?.created_at || now,
        now,
      ]
    );

    // Update application status ONLY for genuine allotment results (case-insensitive)
    const statusUpper = (params.allotment_status || '').trim().toUpperCase();
    if (statusUpper === 'ALLOTTED') {
      await updateApplication(
        params.application_id,
        'Allotted',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        allottedShares > 0 ? allottedShares : undefined,
        allottedShares > 0 ? allottedShares : undefined
      );
    } else if (statusUpper === 'PARTIALLY_ALLOTTED' || statusUpper === 'PARTIALLY ALLOTTED') {
      await updateApplication(
        params.application_id,
        'Partially Allotted',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        allottedShares > 0 ? allottedShares : undefined,
        allottedShares > 0 ? allottedShares : undefined
      );
    } else if (statusUpper === 'NOT_ALLOTTED' || statusUpper === 'NOT ALLOTTED' || statusUpper === 'REJECTED') {
      await updateApplication(
        params.application_id,
        'Not Allotted',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        0
      );
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
    const currentUid = authUser?.uid || authUser?.id || null;
    if (currentUid && params.application_id) {
      try {
        syncSingleDocUpsert(currentUid, 'allotments', id, {
          application_id: params.application_id,
          user_id: params.user_id,
          ipo_id: params.ipo_id,
          allotment_status: params.allotment_status,
          allotted_lots: allottedLots,
          allotted_shares: allottedShares,
          allotment_price: allotmentPrice,
          refund_amount: refundAmount,
          checked_at: now,
          updated_at: now,
        }).catch(() => {});
      } catch (err) {
        console.warn('[saveAllotmentResult] syncSingleDocUpsert failed:', err);
      }
    }

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
    const currentUid = authUser?.uid || authUser?.id || null;
    let snapshotBanks: BankAccount[] = [];
    setBankAccounts((prev) => {
      snapshotBanks = prev;
      return prev;
    });

    try {
      const repo = new BankRepository(db);
      const createdBank = await repo.add(bankName, balance, upiApp, currentUid);

      // Instant targeted state update without blocking UI modal with full refresh()
      if (createdBank) {
        setBankAccounts((prev) => {
          const existingIdx = prev.findIndex((b) => b.id === createdBank.id);
          let next: BankAccount[];
          if (existingIdx >= 0) {
            next = [...prev];
            next[existingIdx] = createdBank;
          } else {
            next = [...prev, createdBank];
          }
          return next.sort((a, b) => (a.bank_name || '').localeCompare(b.bank_name || ''));
        });
      }

      if (currentUid && createdBank?.id) {
        syncSingleDocUpsert(currentUid, 'bankAccounts', createdBank.id, {
          bank_name: createdBank.bank_name,
          balance: createdBank.balance,
          upi_app: createdBank.upi_app || '',
        }).catch((e) => {
          if (isDev) console.warn('[DBContext.addBankAccount] Live cloud upsert warning:', e);
        });
      }
    } catch (err) {
      if (snapshotBanks.length > 0) setBankAccounts(snapshotBanks);
      throw err;
    }
  };

  const updateBankBalance = async (id: string, balance: number, bankName?: string, upiApp?: string) => {
    const trimmedBankName = (bankName !== undefined && bankName.trim().length > 0) ? bankName.trim() : undefined;
    let oldBankName: string | undefined;
    let oldUpiApp: string | undefined;

    let snapshotBanks: BankAccount[] = [];
    let snapshotUsers: User[] = [];
    let snapshotApps: ApplicationWithDetails[] = [];

    // Instant targeted state update for bank accounts
    setBankAccounts((prev) => {
      snapshotBanks = prev;
      return prev.map((b) => {
        if (b.id !== id) return b;
        oldBankName = b.bank_name;
        oldUpiApp = b.upi_app;
        return {
          ...b,
          balance: balance !== undefined ? balance : b.balance,
          bank_name: trimmedBankName || b.bank_name,
          upi_app: upiApp !== undefined ? upiApp.trim() : b.upi_app,
        };
      });
    });

    // If bank was renamed, cascade in-memory to linked users and applications
    const bankRenamed = Boolean(trimmedBankName && oldBankName && trimmedBankName !== oldBankName);
    if (bankRenamed) {
      setUsers((prev) => {
        snapshotUsers = prev;
        return prev.map((u) => (u.bank_name === oldBankName ? { ...u, bank_name: trimmedBankName! } : u));
      });
      setApplications((prev) => {
        snapshotApps = prev;
        return prev.map((a) => (a.user_bank_name === oldBankName ? { ...a, user_bank_name: trimmedBankName! } : a));
      });
    }

    try {
      // Persist to SQLite
      const repo = new BankRepository(db);
      await repo.updateBalance(id, balance, bankName, upiApp);
    } catch (dbErr) {
      if (snapshotBanks.length > 0) setBankAccounts(snapshotBanks);
      if (bankRenamed) {
        if (snapshotUsers.length > 0) setUsers(snapshotUsers);
        if (snapshotApps.length > 0) setApplications(snapshotApps);
      }
      throw dbErr;
    }

    // Live single-doc cloud sync
    const currentUid = authUser?.uid || authUser?.id || null;
    if (currentUid && id) {
      const resolvedUpi = upiApp !== undefined ? upiApp.trim() : (oldUpiApp || '');
      syncSingleDocUpsert(currentUid, 'bankAccounts', id, {
        bank_name: trimmedBankName || oldBankName || '',
        balance: balance,
        upi_app: resolvedUpi,
      }).catch((e) => {
        if (isDev) console.warn('[DBContext.updateBankBalance] Live cloud upsert warning:', e);
      });
    }
  };

  const deleteBankAccount = async (id: string) => {
    if (!id) return;
    if (deletingBankIdsRef.current.has(id)) {
      if (isDev) console.log(`[DBContext.deleteBankAccount] Deletion already in-flight for bank ${id}`);
      return;
    }

    const t0 = Date.now();
    const currentUid = authUser?.uid || authUser?.id || null;

    // Snapshot existing accounts in case local SQLite rollback is needed
    let snapshotBank: BankAccount | undefined;
    setBankAccounts((prev) => {
      snapshotBank = prev.find((b) => b.id === id);
      return prev.filter((b) => b.id !== id);
    });

    deletingBankIdsRef.current.add(id);

    try {
      const repo = new BankRepository(db);
      await repo.delete(id, currentUid);
      if (isDev) {
        console.log(`[DBContext.deleteBankAccount] Fast local deletion completed in ${Date.now() - t0}ms for bank ${id}`);
      }
    } catch (dbError) {
      deletingBankIdsRef.current.delete(id);
      if (snapshotBank) {
        const toRestore = snapshotBank;
        setBankAccounts((prev) => {
          if (prev.some((b) => b.id === id)) return prev;
          return [...prev, toRestore].sort((a, b) => a.bank_name.localeCompare(b.bank_name));
        });
      }
      if (isDev) console.error('[DBContext.deleteBankAccount] Local delete failed, state rolled back:', dbError);
      throw dbError;
    } finally {
      deletingBankIdsRef.current.delete(id);
    }

    // Non-blocking off-critical-path background cloud sync
    if (currentUid && id) {
      syncSingleDocDelete(currentUid, 'bankAccounts', id).catch((e) => {
        if (isDev) console.warn('[DBContext.deleteBankAccount] Live cloud delete warning:', e);
      });
    }
  };

  // ── Data management ────────────────────────────────────────────────────────

  const clearAllData = async (targetUid?: string, options?: { skipCloudFlush?: boolean }) => {
    syncedUidRef.current = null;
    const currentUid = targetUid || authUser?.uid || authUser?.id || null;
    if (currentUid && !options?.skipCloudFlush) {
      try {
        // Ensure all local data (applications, profiles, banks, allotments)
        // is 100% reliably saved in Cloud Firestore BEFORE wiping local SQLite tables!
        const fullJson = await exportJSON();
        const fullData = JSON.parse(fullJson);
        if (fullData?.applications?.length > 0 || fullData?.users?.length > 0) {
          await syncUserDataToFirestore(currentUid, fullData);
        }
      } catch (flushErr) {
        if (isDev) console.warn('[DBContext.clearAllData] Cloud flush before clear warning:', flushErr);
      }
    }
    if (currentUid) {
      await clearLocalSyncCursor(currentUid);
      await db.runAsync('DELETE FROM ipo_allotments WHERE application_id IN (SELECT id FROM ipo_applications WHERE owner_id = ?)', [currentUid]);
      await db.runAsync('DELETE FROM ipo_applications WHERE owner_id = ?', [currentUid]);
      await db.runAsync('DELETE FROM ipo_listings WHERE owner_id = ?', [currentUid]);
      await db.runAsync('DELETE FROM users_table WHERE owner_id = ?', [currentUid]);
      await db.runAsync('DELETE FROM bank_accounts WHERE owner_id = ?', [currentUid]);
    } else {
      await db.runAsync('DELETE FROM ipo_allotments WHERE application_id IN (SELECT id FROM ipo_applications WHERE (owner_id IS NULL OR owner_id = ""))');
      await db.runAsync('DELETE FROM ipo_applications WHERE (owner_id IS NULL OR owner_id = "")');
      await db.runAsync('DELETE FROM ipo_listings WHERE (owner_id IS NULL OR owner_id = "")');
      await db.runAsync('DELETE FROM users_table WHERE (owner_id IS NULL OR owner_id = "")');
      await db.runAsync('DELETE FROM bank_accounts WHERE (owner_id IS NULL OR owner_id = "")');
    }
    await refresh();
  };

  const loadSampleData = async () => {
    const currentUid = authUser?.uid || authUser?.id || null;
    if (currentUid) {
      await db.runAsync('DELETE FROM ipo_allotments WHERE application_id IN (SELECT id FROM ipo_applications WHERE owner_id = ?)', [currentUid]);
      await db.runAsync('DELETE FROM ipo_applications WHERE owner_id = ?', [currentUid]);
      await db.runAsync('DELETE FROM ipo_listings WHERE owner_id = ?', [currentUid]);
      await db.runAsync('DELETE FROM users_table WHERE owner_id = ?', [currentUid]);
      await db.runAsync('DELETE FROM bank_accounts WHERE owner_id = ?', [currentUid]);
    } else {
      await db.runAsync('DELETE FROM ipo_allotments WHERE application_id IN (SELECT id FROM ipo_applications WHERE (owner_id IS NULL OR owner_id = ""))');
      await db.runAsync('DELETE FROM ipo_applications WHERE (owner_id IS NULL OR owner_id = "")');
      await db.runAsync('DELETE FROM ipo_listings WHERE (owner_id IS NULL OR owner_id = "")');
      await db.runAsync('DELETE FROM users_table WHERE (owner_id IS NULL OR owner_id = "")');
      await db.runAsync('DELETE FROM bank_accounts WHERE (owner_id IS NULL OR owner_id = "")');
    }

    // Users
    const now = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, default_amount_blocked, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Dhiru', 'AAAPD1234A', '1208180111845464', 'dhiru@okhdfcbank', 'Dhan', '123456', 'PhonePe', 'Kotak M Bank', 14998, currentUid, now, now],
    );
    await db.runAsync(
      'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, default_amount_blocked, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Vishal', 'BBBPV5678B', '1208180111845465', 'vishal@okaxis', 'Upstox', '234567', 'GPay', 'Axis Bank', 14998, currentUid, now, now],
    );
    await db.runAsync(
      'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, default_amount_blocked, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), 'Umesh', 'CCCU9012C', '1208180111845466', 'umesh@ybl', 'Groww', '345678', 'BHIM', 'HDFC Bank', 14998, currentUid, now, now],
    );

    // Bank accounts with sample balances
    await db.runAsync(
      'INSERT INTO bank_accounts (id, bank_name, balance, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [Crypto.randomUUID(), 'Kotak M Bank', 75000, currentUid, now, now],
    );
    await db.runAsync(
      'INSERT INTO bank_accounts (id, bank_name, balance, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [Crypto.randomUUID(), 'Axis Bank', 50000, currentUid, now, now],
    );
    await db.runAsync(
      'INSERT INTO bank_accounts (id, bank_name, balance, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [Crypto.randomUUID(), 'HDFC Bank', 90000, currentUid, now, now],
    );

    // IPOs
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,allotment_date,listing_date,registrar,exchange,issue_type,owner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ['Advit Jewels', 56, 2000, '2025-11-10', '2025-11-12', '2025-11-13', '2025-11-15', 'Bigshare Services', 'BSE SME', 'SME', currentUid],
    );
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,allotment_date,listing_date,registrar,exchange,issue_type,owner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ['HDB Financial', 500, 35, '2025-10-28', '2025-10-30', '2025-11-01', '2025-11-04', 'KFin Technologies', 'NSE', 'Mainboard', currentUid],
    );
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,allotment_date,listing_date,registrar,exchange,issue_type,owner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ['Ola Electric', 76, 195, '2025-10-15', '2025-10-17', '2025-10-18', '2025-10-20', 'Link Intime India', 'NSE', 'Mainboard', currentUid],
    );

    // Get IDs
    const u1 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=? ORDER BY id DESC', ['Dhiru']);
    const u2 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=? ORDER BY id DESC', ['Vishal']);
    const u3 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=? ORDER BY id DESC', ['Umesh']);
    const i1 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=? ORDER BY id DESC', ['Advit Jewels']);
    const i2 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=? ORDER BY id DESC', ['HDB Financial']);
    const i3 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=? ORDER BY id DESC', ['Ola Electric']);

    if (!u1 || !u2 || !u3 || !i1 || !i2 || !i3) return;

    // Applications
    await db.runAsync(
      'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), u1.id, i1.id, 'Sold', 72, '2025-11-15', 150, 500, currentUid, new Date().toISOString(), new Date().toISOString()],
    );
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i1.id, 'Allotted', currentUid, new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [Crypto.randomUUID(), u3.id, i1.id, 'Not Allotted', currentUid, new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync(
      'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), u1.id, i2.id, 'Sold', 620, '2025-11-04', 200, 500, currentUid, new Date().toISOString(), new Date().toISOString()],
    );
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i2.id, 'Applied', currentUid, new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [Crypto.randomUUID(), u3.id, i2.id, 'Applied', currentUid, new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [Crypto.randomUUID(), u1.id, i3.id, 'Not Allotted', currentUid, new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i3.id, 'Applied', currentUid, new Date().toISOString(), new Date().toISOString()]);

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

    const currentUid = authUser?.uid || authUser?.id || null;
    const rawAllotments = currentUid
      ? await safeGetAllAsync<any>(
          db,
          `SELECT alt.* FROM ipo_allotments alt
           JOIN ipo_applications a ON alt.application_id = a.id
           WHERE a.owner_id = ?`,
          [currentUid],
          'DBContext.exportJSON.allotments'
        )
      : await safeGetAllAsync<any>(
          db,
          `SELECT alt.* FROM ipo_allotments alt
           JOIN ipo_applications a ON alt.application_id = a.id
           WHERE (a.owner_id IS NULL OR a.owner_id = '')`,
          [],
          'DBContext.exportJSON.allotments'
        );

    const rawMasterIpos = await safeGetAllAsync<any>(
      db,
      'SELECT * FROM ipo_master',
      [],
      'DBContext.exportJSON.masterIpos'
    );

    const deletedBanks = currentUid
      ? await safeGetAllAsync<{ id: string; updated_at: string; deleted_at: string }>(
          db,
          'SELECT id, updated_at, deleted_at FROM bank_accounts WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "") AND deleted_at IS NOT NULL',
          [currentUid],
          'DBContext.exportJSON.deletedBanks'
        )
      : [];

    const deletedApps = currentUid
      ? await safeGetAllAsync<{ id: string; updated_at: string; deleted_at: string }>(
          db,
          'SELECT id, updated_at, deleted_at FROM ipo_applications WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "") AND deleted_at IS NOT NULL',
          [currentUid],
          'DBContext.exportJSON.deletedApps'
        )
      : await safeGetAllAsync<{ id: string; updated_at: string; deleted_at: string }>(
          db,
          'SELECT id, updated_at, deleted_at FROM ipo_applications WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NOT NULL',
          [],
          'DBContext.exportJSON.deletedApps'
        );

    return JSON.stringify(
      {
        version: 1,
        exported_at: new Date().toISOString(),
        banks: bankAccounts,
        deleted_banks: deletedBanks || [],
        users: processedUsers,
        ipos: processedIpos,
        master_ipos: rawMasterIpos || [],
        applications: applications.map((a) => ({
          id: a.id,
          user_id: a.user_id,
          ipo_id: a.ipo_id,
          category: a.category || 'RETAIL',
          status: a.status,
          sell_price: a.sell_price ?? null,
          sale_date: a.sale_date ?? null,
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
        deleted_applications: deletedApps || [],
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

      if (db) {
        markDatabaseOpen(db);
      }

      // Prefetch existing users, ipos, apps for O(1) lookup
      const currentUid = authUser?.uid || null;
      const [existingUsersList, existingIposList, existingListingsList, existingAppsList] = await Promise.all([
        safeGetAllAsync<{ id: string; pan_number: string; name: string }>(
          db,
          'SELECT id, pan_number, name FROM users_table',
          [],
          'importCriticalData.prefetchUsers'
        ),
        safeGetAllAsync<{ id: string; ipo_name: string }>(
          db,
          currentUid
            ? `SELECT id, ipo_name FROM ipo_listings WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "")
               UNION
               SELECT id, ipo_name FROM ipo_master WHERE deleted_at IS NULL`
            : `SELECT id, ipo_name FROM ipo_listings WHERE (owner_id IS NULL OR owner_id = "")
               UNION
               SELECT id, ipo_name FROM ipo_master WHERE deleted_at IS NULL`,
          currentUid ? [currentUid] : [],
          'importCriticalData.prefetchIPOs'
        ),
        safeGetAllAsync<{ id: string }>(
          db,
          'SELECT id FROM ipo_listings',
          [],
          'importCriticalData.prefetchListingIds'
        ),
        safeGetAllAsync<{ id: string; user_id: string; ipo_id: string; category?: string; status: string; updated_at?: string; sync_status?: string }>(
          db,
          currentUid
            ? 'SELECT id, user_id, ipo_id, category, status, updated_at, sync_status FROM ipo_applications WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "")'
            : 'SELECT id, user_id, ipo_id, category, status, updated_at, sync_status FROM ipo_applications WHERE (owner_id IS NULL OR owner_id = "")',
          currentUid ? [currentUid] : [],
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

      const existingListingsById = new Set<string>();
      for (const l of existingListingsList || []) {
        if (l.id) existingListingsById.add(l.id);
      }

      const existingIposById = new Map<string, { id: string; ipo_name: string }>();
      const existingIposByName = new Map<string, { id: string; ipo_name: string }>();
      for (const i of existingIposList || []) {
        if (i.id) existingIposById.set(i.id, i);
        if (i.ipo_name) existingIposByName.set(i.ipo_name.trim().toLowerCase(), i);
      }

      const existingAppsById = new Map<string, { id: string; user_id: string; ipo_id: string; category?: string; status: string; updated_at?: string; sync_status?: string }>();
      const existingAppsByCandidateKey = new Map<string, { id: string; user_id: string; ipo_id: string; category?: string; status: string; updated_at?: string; sync_status?: string }>();
      for (const a of existingAppsList || []) {
        if (a.id) existingAppsById.set(a.id, a);
        const candKey = `${a.user_id}_${a.ipo_id}_${a.category || 'RETAIL'}_${a.status}`;
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
              existingListingsById.add(existing.id);
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
              existingListingsById.add(newId);
              if (ipoId) existingListingsById.add(ipoId);
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
            if (m.id) {
              const mName = m.ipo_name || m.company_name || 'IPO';
              existingIposById.set(m.id, { id: m.id, ipo_name: mName });
              existingIposByName.set(mName.trim().toLowerCase(), { id: m.id, ipo_name: mName });
            }
          }

          // 3. Process IPO Applications
          for (const app of data.applications ?? []) {
            if (!app) continue;
            const targetUserId = userIdMap.get(app.user_id) ?? app.user_id;
            const targetIpoId = ipoIdMap.get(app.ipo_id) ?? app.ipo_id;

            if (!targetUserId || !targetIpoId) continue;

            let userExists = existingUsersById.has(targetUserId);
            if (!userExists) {
              const uRow = await safeGetFirstAsync<{ id: string; name: string }>(
                db,
                'SELECT id, name FROM users_table WHERE id = ?',
                [targetUserId],
                'importCriticalData.checkFallbackUser'
              );
              if (uRow) {
                existingUsersById.set(uRow.id, { id: uRow.id, pan_number: '', name: uRow.name });
                userExists = true;
              } else {
                const fallbackUserName = (app as any).user_name || 'Applicant';
                await safeRunAsync(
                  db,
                  'INSERT OR IGNORE INTO users_table (id, name, pan_number, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                  [targetUserId, fallbackUserName, '', authUser?.uid || null, now, now],
                  'importCriticalData.autoCreateUser'
                );
                existingUsersById.set(targetUserId, { id: targetUserId, pan_number: '', name: fallbackUserName });
                userExists = true;
              }
            }

            let ipoExists = existingListingsById.has(targetIpoId);
            if (!ipoExists) {
              const mRow = await safeGetFirstAsync<{ id: string; ipo_name: string; company_name: string; buy_price?: number; quantity?: number }>(
                db,
                'SELECT id, ipo_name, company_name, buy_price, quantity FROM ipo_master WHERE id = ?',
                [targetIpoId],
                'importCriticalData.checkMaster'
              );
              const resolvedName = mRow?.ipo_name || mRow?.company_name || (app as any).ipo_name || 'IPO';
              await safeRunAsync(
                db,
                `INSERT OR IGNORE INTO ipo_listings (id, ipo_name, company_name, buy_price, quantity, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [targetIpoId, resolvedName, resolvedName, mRow?.buy_price || 100, mRow?.quantity || 1, authUser?.uid || null, now, now],
                'importCriticalData.autoCreateShadowListing'
              );
              existingListingsById.add(targetIpoId);
              existingIposById.set(targetIpoId, { id: targetIpoId, ipo_name: resolvedName });
              ipoExists = true;
            }

            if (!userExists || !ipoExists) {
              if (isDev) {
                console.warn(`[importCriticalData] Skipping app ${app.id}: parent user (${targetUserId}) or listing (${targetIpoId}) missing.`);
              }
              continue;
            }

            const isFavVal = app.is_favorite ? 1 : 0;
            const targetSharesCount = app.shares_count ?? (app as any).quantity ?? null;

            const appCategory = (app as any).category || 'RETAIL';
            // Only match by exact app.id when present to avoid collapsing distinct applications!
            let existing = (app.id && !usedAppIds.has(app.id) && existingAppsById.get(app.id)) || null;

            if (!existing && !app.id) {
              const candKey = `${targetUserId}_${targetIpoId}_${appCategory}_${app.status}`;
              const candidate = existingAppsByCandidateKey.get(candKey);
              if (candidate && !usedAppIds.has(candidate.id)) {
                existing = candidate;
              }
            }

            if (existing) {
              usedAppIds.add(existing.id);
              appIdMap.set(app.id, existing.id);

              const localTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
              const cloudTs = app.updated_at ? new Date(app.updated_at).getTime() : 0;
              const isLocalPending = existing.sync_status === 'PENDING';

              // Prevent stale cloud data from overwriting newer local edits:
              // 1. If local is strictly newer than cloud, preserve local.
              // 2. If local is PENDING and cloud is missing timestamp or equal/older, preserve local.
              if (
                (localTs > 0 && cloudTs > 0 && localTs > cloudTs) ||
                (isLocalPending && (cloudTs === 0 || localTs >= cloudTs))
              ) {
                continue;
              }

              await safeRunAsync(
                db,
                `UPDATE ipo_applications SET
                  category = COALESCE(?, category),
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
                  sync_status = 'SYNCED',
                  last_synced_at = ?,
                  updated_at = ?,
                  deleted_at = NULL
                WHERE id = ?`,
                [
                  appCategory,
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
                  now,
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
                'INSERT INTO ipo_applications (id, user_id, ipo_id, category, status, shares_count, sell_price, sale_date, tax, user_cut, is_favorite, bank_name, upi_app, broker_account_id, sync_status, last_synced_at, owner_id, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,\'SYNCED\',?,?,?,NULL)',
                [
                  id,
                  targetUserId,
                  targetIpoId,
                  appCategory,
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
                  now,
                  authUser?.uid || null,
                  app.created_at || now,
                  app.updated_at || now,
                ],
                'importCriticalData.insertApp'
              );
              const appObj = { id, user_id: targetUserId, ipo_id: targetIpoId, category: appCategory, status: app.status || 'Applied' };
              existingAppsById.set(id, appObj);
              appIdMap.set(app.id, id);
              appCount++;
            }
          }
        },
        'importCriticalData.transaction'
      );

      if (data.users && data.users.length > 0) {
      prefetchUserAvatars(data.users);
    }
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

      const currentUid = authUser?.uid || null;
      const [existingBanksList, existingAppsList, existingAllotmentsList] = await Promise.all([
        safeGetAllAsync<BankAccount>(
          db,
          currentUid
            ? 'SELECT id, bank_name, balance, upi_app, owner_id, updated_at FROM bank_accounts WHERE (owner_id = ? OR owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL'
            : 'SELECT id, bank_name, balance, upi_app, owner_id, updated_at FROM bank_accounts WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
          currentUid ? [currentUid] : [],
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
          currentUid
            ? 'SELECT alt.id, alt.application_id FROM ipo_allotments alt JOIN ipo_applications a ON alt.application_id = a.id WHERE a.owner_id = ?'
            : 'SELECT alt.id, alt.application_id FROM ipo_allotments alt JOIN ipo_applications a ON alt.application_id = a.id WHERE (a.owner_id IS NULL OR a.owner_id = "")',
          currentUid ? [currentUid] : [],
          'importSecondaryData.prefetchAllotments'
        ),
      ]);

      const existingBanksById = new Map<string, BankAccount>();
      const existingBanksByCompositeKey = new Map<string, BankAccount>();
      const existingBanksByName = new Map<string, BankAccount>();
      for (const b of existingBanksList || []) {
        if (b.id) existingBanksById.set(b.id, b);
        if (b.bank_name) {
          const normName = b.bank_name.trim().toLowerCase();
          const compKey = `${normName}:::${(b.upi_app || '').trim().toLowerCase()}`;
          if (!existingBanksByCompositeKey.has(compKey)) {
            existingBanksByCompositeKey.set(compKey, b);
          }
          if (!existingBanksByName.has(normName)) {
            existingBanksByName.set(normName, b);
          }
        }
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
            const bankName = bank.bank_name.trim();
            const normBankName = bankName.toLowerCase();
            const upiApp = (bank.upi_app || '').trim();
            const compKey = `${normBankName}:::${upiApp.toLowerCase()}`;

            // Match 1: Stable Account ID
            let existing = bank.id ? existingBanksById.get(bank.id) : null;

            // Match 2: Composite identity (bank_name + upi_app) for offline adoption or ID-less imports
            if (!existing) {
              existing = existingBanksByCompositeKey.get(compKey) || null;
            }

            // Match 3: Normalized Bank Name (prevents duplicate banks when UPI app is omitted/blank)
            if (!existing) {
              if (!upiApp) {
                existing = existingBanksByName.get(normBankName) || null;
              } else {
                const blankCompKey = `${normBankName}:::`;
                existing = existingBanksByCompositeKey.get(blankCompKey) || null;
              }
            }

            if (existing) {
              const newBalance = bank.balance !== undefined && bank.balance !== null ? bank.balance : existing.balance;
              const incomingUpi = (bank.upi_app && typeof bank.upi_app === 'string') ? bank.upi_app.trim() : '';
              const newUpiApp = incomingUpi || (existing.upi_app || '');
              const newOwnerId = authUser?.uid || existing.owner_id || null;

              await safeRunAsync(
                db,
                `UPDATE bank_accounts SET
                  bank_name = ?,
                  balance = ?,
                  upi_app = ?,
                  owner_id = ?,
                  updated_at = ?
                WHERE id = ?`,
                [bankName, newBalance, newUpiApp, newOwnerId, now, existing.id],
                'importSecondaryData.updateBank'
              );

              const updatedObj: BankAccount = {
                ...existing,
                bank_name: bankName,
                balance: newBalance,
                upi_app: newUpiApp,
                owner_id: newOwnerId || undefined,
                updated_at: now,
              };
              existingBanksById.set(existing.id, updatedObj);
              existingBanksByCompositeKey.set(compKey, updatedObj);
            } else {
              const id = bank.id || Crypto.randomUUID();
              const balance = bank.balance ?? 0;
              await safeRunAsync(
                db,
                'INSERT INTO bank_accounts (id, bank_name, balance, upi_app, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
                [id, bankName, balance, upiApp, authUser?.uid || null, bank.created_at || now, bank.updated_at || now],
                'importSecondaryData.insertBank'
              );
              const createdObj: BankAccount = {
                id,
                bank_name: bankName,
                balance,
                upi_app: upiApp,
                owner_id: authUser?.uid || undefined,
                created_at: bank.created_at || now,
                updated_at: bank.updated_at || now,
              };
              existingBanksById.set(id, createdObj);
              existingBanksByCompositeKey.set(compKey, createdObj);
              bankImported++;
            }
          }

          // 2. Process Allotments
          for (const alt of data.allotments ?? []) {
            if (!alt || !alt.application_id) continue;
            let appExists = existingAppsById.has(alt.application_id);
            if (!appExists) {
              const aRow = await safeGetFirstAsync<{ id: string }>(
                db,
                'SELECT id FROM ipo_applications WHERE id = ?',
                [alt.application_id],
                'importSecondaryData.checkAppExists'
              );
              if (aRow) {
                existingAppsById.add(aRow.id);
                appExists = true;
              }
            }
            if (!appExists) {
              if (isDev) {
                console.warn(`[importSecondaryData] Skipping allotment ${alt.id}: parent application ${alt.application_id} not found.`);
              }
              continue;
            }

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

    try {
      const { reconcileScheduledNotifications } = require('@/services/notifications/notificationEngine');
      reconcileScheduledNotifications(db).catch(() => {});
    } catch {}

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
    const currentUid = authUser?.uid || authUser?.id || null;
    const userToId = new Map<string, string>();
    for (const [key, u] of userMap) {
      let existing: { id: string } | null = null;
      if (u.pan_number) {
        existing = await safeGetFirstAsync<{ id: string }>(
          db,
          currentUid
            ? 'SELECT id FROM users_table WHERE pan_number=? AND owner_id=?'
            : 'SELECT id FROM users_table WHERE pan_number=? AND (owner_id IS NULL OR owner_id="")',
          currentUid ? [u.pan_number, currentUid] : [u.pan_number],
          'DBContext.importCSV.user'
        );
      }
      if (!existing && u.name) {
        existing = await safeGetFirstAsync<{ id: string }>(
          db,
          currentUid
            ? 'SELECT id FROM users_table WHERE name=? AND name!="" AND owner_id=?'
            : 'SELECT id FROM users_table WHERE name=? AND name!="" AND (owner_id IS NULL OR owner_id="")',
          currentUid ? [u.name, currentUid] : [u.name],
          'DBContext.importCSV.userByName'
        );
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
          'INSERT INTO users_table (id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name, avatar_url, default_amount_blocked, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [newId, u.name || '', u.pan_number || '', (u as any).client_id || (u as any).demat || '', (u as any).upi_id || '', u.broker || '', u.tpin || '', u.upi_app || '', u.bank_name || '', u.avatar_url || '', 0, currentUid, now, now],
          'DBContext.importCSV.insertUser'
        );
        userToId.set(key, newId);
      }
    }

    // Insert banks (balance = 0 if new)
    const now = new Date().toISOString();
    for (const bankName of bankSet) {
      if (!bankName) continue;
      const existing = await safeGetFirstAsync<{ id: string }>(
        db,
        currentUid
          ? 'SELECT id FROM bank_accounts WHERE LOWER(TRIM(bank_name))=LOWER(TRIM(?)) AND (owner_id=? OR owner_id IS NULL OR owner_id="") AND deleted_at IS NULL'
          : 'SELECT id FROM bank_accounts WHERE LOWER(TRIM(bank_name))=LOWER(TRIM(?)) AND (owner_id IS NULL OR owner_id="") AND deleted_at IS NULL',
        currentUid ? [bankName, currentUid] : [bankName],
        'DBContext.importCSV.bank'
      );
      if (existing) {
        if (currentUid) {
          await safeRunAsync(
            db,
            'UPDATE bank_accounts SET owner_id = COALESCE(owner_id, ?) WHERE id = ?',
            [currentUid, existing.id],
            'DBContext.importCSV.adoptBank'
          );
        }
      } else {
        await safeRunAsync(
          db,
          'INSERT INTO bank_accounts (id, bank_name, balance, upi_app, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
          [Crypto.randomUUID(), bankName, 0, '', currentUid, now, now],
          'DBContext.importCSV.insertBank'
        );
      }
    }

    // Insert / upsert IPOs
    const ipoNameToId = new Map<string, string>();
    for (const [name, ipo] of ipoMap) {
      if (!name) continue;
      const existing = await safeGetFirstAsync<{ id: string }>(
        db,
        currentUid
          ? 'SELECT id FROM ipo_listings WHERE ipo_name=? AND (owner_id=? OR owner_id IS NULL OR owner_id="")'
          : 'SELECT id FROM ipo_listings WHERE ipo_name=? AND (owner_id IS NULL OR owner_id="")',
        currentUid ? [name, currentUid] : [name],
        'DBContext.importCSV.ipo'
      );
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
          'INSERT INTO ipo_listings (id, ipo_name, buy_price, quantity, open_date, close_date, listing_date, logo_url, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [newId, ipo.ipo_name || name, ipo.buy_price || 0, ipo.quantity || 0, ipo.open_date || '', ipo.close_date || '', ipo.listing_date || '', ipo.logo_url || '', currentUid, now, now],
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
          currentUid
            ? 'SELECT id FROM ipo_applications WHERE id = ? AND owner_id = ? AND deleted_at IS NULL'
            : 'SELECT id FROM ipo_applications WHERE id = ? AND (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
          currentUid ? [app.id, currentUid] : [app.id],
          'DBContext.importCSV.appById'
        );
      }

      if (!existing) {
        const candidates = await safeGetAllAsync<{ id: string; status: string }>(
          db,
          currentUid
            ? 'SELECT id, status FROM ipo_applications WHERE user_id = ? AND ipo_id = ? AND owner_id = ? AND deleted_at IS NULL'
            : 'SELECT id, status FROM ipo_applications WHERE user_id = ? AND ipo_id = ? AND (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
          currentUid ? [userId, ipoId, currentUid] : [userId, ipoId],
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
          'INSERT INTO ipo_applications (id, user_id, ipo_id, status, shares_count, sell_price, sale_date, tax, user_cut, bank_name, upi_app, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
            currentUid,
            now,
            now,
          ],
          'DBContext.importCSV.insertApp'
        );
        appCount++;
      }
    }

    await refresh();
    try {
      const { reconcileScheduledNotifications } = require('@/services/notifications/notificationEngine');
      reconcileScheduledNotifications(db).catch(() => {});
    } catch {}
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

  const performAutomaticCloudSync = useCallback(
    async (targetUid: string, isManualRetry = false): Promise<boolean> => {
      if (!targetUid || !db) return false;

      // Prevent concurrent duplicate sync executions for the same user
      if (isSyncInProgressRef.current) {
        if (activeSyncUidRef.current === targetUid) {
          if (isDev) console.log(`[DBContext] Sync already in progress, skipping duplicate call for ${targetUid}`);
          return false;
        }
        // If an earlier sync for a different user account is winding down, wait for it to exit
        while (isSyncInProgressRef.current) {
          await new Promise((r) => setTimeout(r, 20));
        }
        if (authUserRef.current?.uid !== targetUid) return false;
      }

      isSyncInProgressRef.current = true;
      activeSyncUidRef.current = targetUid;
      setIsRestoring(true);
      setCloudSyncStatus(isManualRetry ? 'restoring' : 'syncing');
      setCloudSyncError(null);

      try {
        if (db) {
          markDatabaseOpen(db);
        }
        if (isDev) console.log(`[DBContext] Starting cloud sync pipeline for UID: ${targetUid} (manual: ${isManualRetry})`);

        // 1. Reconcile/claim any unassigned offline records created prior to authentication
        try {
          await db.runAsync(
            'UPDATE users_table SET owner_id = ? WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
            [targetUid]
          );
          await db.runAsync(
            'UPDATE ipo_listings SET owner_id = ? WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
            [targetUid]
          );
          await db.runAsync(
            'UPDATE ipo_applications SET owner_id = ? WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
            [targetUid]
          );
          await db.runAsync(
            'UPDATE bank_accounts SET owner_id = ? WHERE (owner_id IS NULL OR owner_id = "") AND deleted_at IS NULL',
            [targetUid]
          );
        } catch (claimErr) {
          if (isDev) console.warn('[DBContext] Unassigned local data claiming warning:', claimErr);
        }

        // 2. Run staged cloud delta/full restore
        const deltaRes = await syncDeltaFromFirestore(targetUid, db, {
          onCriticalDataReady: async (criticalData) => {
            // Guard: user session must still match targetUid
            if (authUserRef.current?.uid !== targetUid) return;
            if (db) {
              markDatabaseOpen(db);
            }
            await importCriticalData(criticalData, { suppressLegacySync: true, skipRefresh: true });
            await refreshCriticalRef.current();
          },
          onSecondaryDataReady: async (secondaryData) => {
            if (authUserRef.current?.uid !== targetUid) return;
            await importSecondaryData(secondaryData, { suppressLegacySync: true, skipRefresh: true });
            await refreshSecondaryRef.current();
          },
          importJSONFallback: async (data) => {
            if (authUserRef.current?.uid !== targetUid) return;
            await importJSON(data, { suppressLegacySync: true, skipRefresh: true });
            await refreshRef.current();
          },
        });

        // Guard: check again after network/database operations complete
        if (authUserRef.current?.uid !== targetUid) {
          if (isDev) console.log('[DBContext] Active user switched during cloud sync, aborting commit.');
          return false;
        }

        if (deltaRes.success) {
          syncedUidRef.current = targetUid;
          setCloudSyncStatus('success');
          setCloudSyncError(null);
          await refreshRef.current();
          if (isDev) console.log(`[DBContext] Automatic cloud sync completed successfully for ${targetUid}`);
          return true;
        } else {
          throw new Error(deltaRes.error || 'Cloud synchronization failed');
        }
      } catch (err: any) {
        if (authUserRef.current?.uid !== targetUid) return false;
        if (isDev) console.warn('[DBContext] Post-login cloud sync error:', err);
        const errMsg = err?.message || 'Cloud sync failed. Tap to retry.';
        setCloudSyncStatus('error');
        setCloudSyncError(errMsg);
        return false;
      } finally {
        isSyncInProgressRef.current = false;
        activeSyncUidRef.current = null;
        setIsRestoring(false);
      }
    },
    [db, importCriticalData, importSecondaryData, importJSON, isDev]
  );

  const retryCloudSync = useCallback(async (): Promise<boolean> => {
    const uid = authUser?.uid;
    if (!uid) return false;
    syncedUidRef.current = null;
    return performAutomaticCloudSync(uid, true);
  }, [authUser?.uid, performAutomaticCloudSync]);

  const restoreCloudData = useCallback(
    async (targetUid?: string): Promise<boolean> => {
      const uid = targetUid || authUser?.uid;
      if (!uid) return false;
      syncedUidRef.current = null;
      return performAutomaticCloudSync(uid, true);
    },
    [authUser?.uid, performAutomaticCloudSync]
  );

  // Automatic background cloud sync/restore on login or startup
  useEffect(() => {
    const currentUid = authUser?.uid;

    if (!currentUid) {
      syncedUidRef.current = null;
      setCloudSyncStatus('idle');
      setCloudSyncError(null);
      return;
    }

    if (isLoading) {
      // Wait for SQLite database to complete initialization
      return;
    }

    if (syncedUidRef.current === currentUid) {
      // Already successfully synced for this session
      return;
    }

    performAutomaticCloudSync(currentUid);
  }, [authUser?.uid, isLoading, performAutomaticCloudSync]);

  const contextValue = React.useMemo<DBContextType>(
    () => ({
      users,
      ipos,
      applications,
      bankAccounts,
      allotments,
      isLoading,
      isRestoring,
      cloudSyncStatus,
      cloudSyncError,
      retryCloudSync,
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
    }),
    [
      users,
      ipos,
      applications,
      bankAccounts,
      allotments,
      isLoading,
      isRestoring,
      cloudSyncStatus,
      cloudSyncError,
      retryCloudSync,
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
    ]
  );

  return (
    <DBContext.Provider value={contextValue}>
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
