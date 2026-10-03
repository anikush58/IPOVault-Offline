import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import type { SQLiteDatabase } from 'expo-sqlite';
import { firestore } from '../auth/firebaseConfig';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { safeRunAsync, runWithTransaction } from '@/utils/sqliteDebug';

export const LAST_FIRESTORE_SYNC_KEY = 'ipovault_last_firestore_sync_ts';
export const FIRESTORE_MIGRATED_KEY_PREFIX = 'ipovault_migrated_to_firestore_';
export const LOCAL_SYNC_CURSOR_PREFIX = 'ipovault_last_synced_at_';

export interface IPOVaultExportData {
  version?: number;
  exported_at?: string;
  banks?: any[];
  users?: any[];
  ipos?: any[];
  master_ipos?: any[];
  applications?: any[];
  allotments?: any[];
}

export interface CloudSyncMetadata {
  last_synced_at: string;
  version: number;
  userCount: number;
  ipoCount: number;
  applicationCount: number;
  bankCount: number;
  allotmentCount: number;
}

export interface SyncResult {
  success: boolean;
  syncedAt?: string;
  userCount?: number;
  ipoCount?: number;
  applicationCount?: number;
  bankCount?: number;
  allotmentCount?: number;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  restoredAt?: string;
  data?: IPOVaultExportData | null;
  userCount?: number;
  ipoCount?: number;
  applicationCount?: number;
  bankCount?: number;
  allotmentCount?: number;
  error?: string;
}

export interface DeltaChanges {
  profiles: any[];
  ipos: any[];
  applications: any[];
  bankAccounts: any[];
  allotments: any[];
}

export interface DeltaSyncResult {
  success: boolean;
  upToDate?: boolean;
  isFullRestore?: boolean;
  syncedAt?: string;
  changesApplied?: number;
  error?: string;
}

// Concurrency mutex lock and in-flight tracking
let isSyncInProgress = false;
let isRestoreInProgress = false;
let suppressCloudSyncFlag = false;
const activeSyncsByUid = new Set<string>();
let autoSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function isCloudSyncBusy(): boolean {
  return isSyncInProgress || isRestoreInProgress;
}

export function isSyncInProgressForUid(uid: string): boolean {
  return activeSyncsByUid.has(uid);
}

export function setSuppressCloudSync(suppress: boolean): void {
  suppressCloudSyncFlag = suppress;
}

export function isSuppressingCloudSync(): boolean {
  return suppressCloudSyncFlag;
}

// ── Local Sync Cursor Helpers ────────────────────────────────────────────────

export async function getLocalSyncCursor(uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    return await safeAsyncStorage.getItem(`${LOCAL_SYNC_CURSOR_PREFIX}${uid}`);
  } catch {
    return null;
  }
}

export async function setLocalSyncCursor(uid: string, timestampIso: string): Promise<void> {
  if (!uid || !timestampIso) return;
  try {
    await safeAsyncStorage.setItem(`${LOCAL_SYNC_CURSOR_PREFIX}${uid}`, timestampIso);
    await safeAsyncStorage.setItem(LAST_FIRESTORE_SYNC_KEY, timestampIso);
  } catch (err) {
    console.warn('[firestoreSyncService] Failed to set local sync cursor:', err);
  }
}

export async function clearLocalSyncCursor(uid: string): Promise<void> {
  if (!uid) return;
  try {
    await safeAsyncStorage.removeItem(`${LOCAL_SYNC_CURSOR_PREFIX}${uid}`);
    await safeAsyncStorage.removeItem(LAST_FIRESTORE_SYNC_KEY);
  } catch (err) {
    console.warn('[firestoreSyncService] Failed to clear local sync cursor:', err);
  }
}

// ── Cloud Metadata & Detection ───────────────────────────────────────────────

/**
 * Checks if user has an existing cloud backup in Firestore
 */
export async function hasCloudData(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const metaRef = doc(firestore, `users/${uid}/metadata/sync_state`);
    const snap = await getDoc(metaRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && (data.userCount > 0 || data.ipoCount > 0 || data.applicationCount > 0 || data.last_synced_at)) {
        return true;
      }
    }
    // Check if subcollections have documents
    const [profilesSnap, legacyProfilesSnap, appsSnap] = await Promise.all([
      getDocs(collection(firestore, `users/${uid}/profiles`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/user_profiles`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/applications`)).catch(() => null),
    ]);

    if (profilesSnap && !profilesSnap.empty) return true;
    if (legacyProfilesSnap && !legacyProfilesSnap.empty) return true;
    if (appsSnap && !appsSnap.empty) return true;

    return false;
  } catch (err) {
    console.warn('[firestoreSyncService] hasCloudData error:', err);
    return false;
  }
}

/**
 * Retrieves latest cloud sync metadata for the user
 */
export async function getCloudSyncMetadata(uid: string): Promise<CloudSyncMetadata | null> {
  if (!uid) return null;
  try {
    const metaRef = doc(firestore, `users/${uid}/metadata/sync_state`);
    const snap = await getDoc(metaRef);
    if (snap.exists()) {
      return snap.data() as CloudSyncMetadata;
    }
    return null;
  } catch (err) {
    console.warn('[firestoreSyncService] getCloudSyncMetadata error:', err);
    return null;
  }
}

// ── Full Synchronization ─────────────────────────────────────────────────────

/**
 * Uploads/Syncs full IPOVault user dataset to Firestore under the authenticated UID.
 * Stores individual entity records in subcollections to guarantee every Firestore
 * document stays safely below the 1 MiB Firestore document size limit.
 */
export async function syncUserDataToFirestore(
  uid: string,
  exportData: IPOVaultExportData,
): Promise<SyncResult> {
  if (!uid) {
    return { success: false, error: 'User is not authenticated.' };
  }

  if (activeSyncsByUid.has(uid) || isSyncInProgress) {
    return { success: false, error: 'A cloud synchronization is already in progress for this account.' };
  }

  activeSyncsByUid.add(uid);
  isSyncInProgress = true;
  try {
    const nowIso = new Date().toISOString();
    const userCount = exportData.users?.length || 0;
    const ipoCount = exportData.ipos?.length || 0;
    const applicationCount = exportData.applications?.length || 0;
    const bankCount = exportData.banks?.length || 0;
    const allotmentCount = exportData.allotments?.length || 0;

    // 1. Write lightweight sync metadata & bootstrap summary (NEVER the full raw payload)
    const metaRef = doc(firestore, `users/${uid}/metadata/sync_state`);
    const metadata: CloudSyncMetadata = {
      last_synced_at: nowIso,
      version: exportData.version || 1,
      userCount,
      ipoCount,
      applicationCount,
      bankCount,
      allotmentCount,
    };
    await setDoc(metaRef, {
      ...metadata,
      owner_id: uid,
      updated_at: serverTimestamp(),
    });

    // Write optional lightweight snapshot header (strictly summary info, only ~200 bytes)
    const snapshotRef = doc(firestore, `users/${uid}/metadata/snapshot`);
    await setDoc(snapshotRef, {
      version: exportData.version || 1,
      owner_id: uid,
      synced_at: nowIso,
      updated_at: serverTimestamp(),
      counts: {
        users: userCount,
        ipos: ipoCount,
        applications: applicationCount,
        banks: bankCount,
        allotments: allotmentCount,
      },
    });

    // 2. Batch write all entity records into subcollections
    // Firestore writeBatch has a limit of 500 operations per batch
    const MAX_OPS_PER_BATCH = 450;
    const batches = [writeBatch(firestore)];
    let opCount = 0;
    let currentBatchIndex = 0;

    const addBatchOp = (setOp: () => void) => {
      if (opCount >= MAX_OPS_PER_BATCH) {
        batches.push(writeBatch(firestore));
        currentBatchIndex++;
        opCount = 0;
      }
      setOp();
      opCount++;
    };

    // Subcollection: profiles (/users/{uid}/profiles/{id})
    for (const u of exportData.users || []) {
      if (!u?.id) continue;
      const dRef = doc(firestore, `users/${uid}/profiles/${u.id}`);
      addBatchOp(() =>
        batches[currentBatchIndex].set(
          dRef,
          { ...u, owner_id: uid, updated_at: nowIso, deleted_at: null },
          { merge: true }
        )
      );
    }

    // Subcollection: ipos (/users/{uid}/ipos/{id})
    for (const ipo of exportData.ipos || []) {
      if (!ipo?.id) continue;
      const dRef = doc(firestore, `users/${uid}/ipos/${ipo.id}`);
      addBatchOp(() =>
        batches[currentBatchIndex].set(
          dRef,
          { ...ipo, owner_id: uid, updated_at: nowIso, deleted_at: null },
          { merge: true }
        )
      );
    }

    // Subcollection: applications (/users/{uid}/applications/{id})
    for (const app of exportData.applications || []) {
      if (!app?.id) continue;
      const dRef = doc(firestore, `users/${uid}/applications/${app.id}`);
      addBatchOp(() =>
        batches[currentBatchIndex].set(
          dRef,
          { ...app, owner_id: uid, updated_at: nowIso, deleted_at: null },
          { merge: true }
        )
      );
    }

    // Subcollection: bankAccounts (/users/{uid}/bankAccounts/{id})
    for (const b of exportData.banks || []) {
      if (!b?.id) continue;
      const dRef = doc(firestore, `users/${uid}/bankAccounts/${b.id}`);
      addBatchOp(() =>
        batches[currentBatchIndex].set(
          dRef,
          { ...b, owner_id: uid, updated_at: nowIso, deleted_at: null },
          { merge: true }
        )
      );
    }

    // Subcollection: allotments (/users/{uid}/allotments/{id})
    for (const alt of exportData.allotments || []) {
      if (!alt?.id) continue;
      const dRef = doc(firestore, `users/${uid}/allotments/${alt.id}`);
      addBatchOp(() =>
        batches[currentBatchIndex].set(
          dRef,
          { ...alt, owner_id: uid, updated_at: nowIso, deleted_at: null },
          { merge: true }
        )
      );
    }

    // Commit all write batches
    for (const b of batches) {
      await b.commit();
    }

    // Record last sync timestamp locally
    await setLocalSyncCursor(uid, nowIso);
    await safeAsyncStorage.setItem(`${FIRESTORE_MIGRATED_KEY_PREFIX}${uid}`, 'true');

    return {
      success: true,
      syncedAt: nowIso,
      userCount,
      ipoCount,
      applicationCount,
      bankCount,
      allotmentCount,
    };
  } catch (err: any) {
    console.error('[firestoreSyncService] syncUserDataToFirestore error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to synchronize data to Firestore.',
    };
  } finally {
    activeSyncsByUid.delete(uid);
    isSyncInProgress = false;
  }
}

/**
 * Fetches all user data from Firestore subcollections for full restoration
 */
export async function fetchUserDataFromFirestore(uid: string): Promise<RestoreResult> {
  if (!uid) {
    return { success: false, error: 'User is not authenticated.' };
  }

  if (isRestoreInProgress) {
    return { success: false, error: 'A restore operation is already in progress.' };
  }

  isRestoreInProgress = true;
  const startTime = Date.now();
  try {
    // 1. Fetch the 5 primary subcollections in parallel
    const [
      profilesSnap,
      iposSnap,
      appsSnap,
      bankAccountsSnap,
      allotmentsSnap,
    ] = await Promise.all([
      getDocs(collection(firestore, `users/${uid}/profiles`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/ipos`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/applications`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/bankAccounts`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/allotments`)).catch(() => null),
    ]);

    // Handle profiles (filtering out deleted tombstones)
    let restoredUsers = profilesSnap ? profilesSnap.docs.map((d) => d.data()).filter((u) => !u.deleted_at) : [];
    if (restoredUsers.length === 0) {
      const legacyProfilesSnap = await getDocs(collection(firestore, `users/${uid}/user_profiles`)).catch(() => null);
      if (legacyProfilesSnap && !legacyProfilesSnap.empty) {
        restoredUsers = legacyProfilesSnap.docs.map((d) => d.data()).filter((u) => !u.deleted_at);
      }
    }

    const restoredIpos = iposSnap ? iposSnap.docs.map((d) => d.data()).filter((i) => !i.deleted_at) : [];
    const restoredApps = appsSnap ? appsSnap.docs.map((d) => d.data()).filter((a) => !a.deleted_at) : [];

    // Handle bankAccounts (filtering out deleted tombstones)
    let restoredBanks = bankAccountsSnap ? bankAccountsSnap.docs.map((d) => d.data()).filter((b) => !b.deleted_at) : [];
    if (restoredBanks.length === 0) {
      const legacyBanksSnap = await getDocs(collection(firestore, `users/${uid}/banks`)).catch(() => null);
      if (legacyBanksSnap && !legacyBanksSnap.empty) {
        restoredBanks = legacyBanksSnap.docs.map((d) => d.data()).filter((b) => !b.deleted_at);
      }
    }

    const restoredAllotments = allotmentsSnap ? allotmentsSnap.docs.map((d) => d.data()).filter((alt) => !alt.deleted_at) : [];

    // Check if cloud has any user-owned data
    const totalRecords =
      restoredUsers.length +
      restoredIpos.length +
      restoredApps.length +
      restoredBanks.length +
      restoredAllotments.length;

    const fetchDuration = Date.now() - startTime;
    console.log(`[firestoreSyncService] Fetched ${totalRecords} cloud documents in ${fetchDuration}ms for user ${uid}`);

    if (totalRecords === 0) {
      // Check if there was an old snapshot document with data
      const snapshotRef = doc(firestore, `users/${uid}/metadata/snapshot`);
      const snapshotSnap = await getDoc(snapshotRef).catch(() => null);
      if (snapshotSnap && snapshotSnap.exists()) {
        const snapData = snapshotSnap.data() as IPOVaultExportData;
        if (snapData?.users?.length || snapData?.applications?.length) {
          return {
            success: true,
            restoredAt: new Date().toISOString(),
            data: snapData,
            userCount: snapData.users?.length || 0,
            ipoCount: snapData.ipos?.length || 0,
            applicationCount: snapData.applications?.length || 0,
            bankCount: snapData.banks?.length || 0,
            allotmentCount: snapData.allotments?.length || 0,
          };
        }
      }

      return {
        success: true,
        data: null,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
      };
    }

    const payload: IPOVaultExportData = {
      version: 1,
      exported_at: new Date().toISOString(),
      banks: restoredBanks,
      users: restoredUsers,
      ipos: restoredIpos,
      applications: restoredApps,
      allotments: restoredAllotments,
    };

    return {
      success: true,
      restoredAt: new Date().toISOString(),
      data: payload,
      userCount: restoredUsers.length,
      ipoCount: restoredIpos.length,
      applicationCount: restoredApps.length,
      bankCount: restoredBanks.length,
      allotmentCount: restoredAllotments.length,
    };
  } catch (err: any) {
    console.error('[firestoreSyncService] fetchUserDataFromFirestore error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch data from Firestore.',
    };
  } finally {
    isRestoreInProgress = false;
  }
}

// ── Incremental Delta Synchronization ────────────────────────────────────────

/**
 * Fetches delta changes (new, updated, or tombstoned records) from Firestore since lastSyncedAt
 */
export async function fetchDeltaFromFirestore(
  uid: string,
  lastSyncedAt: string,
): Promise<{ success: boolean; changes?: DeltaChanges; error?: string }> {
  if (!uid) return { success: false, error: 'User is not authenticated.' };
  try {
    const [profilesSnap, iposSnap, appsSnap, banksSnap, allotmentsSnap] = await Promise.all([
      getDocs(query(collection(firestore, `users/${uid}/profiles`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
      getDocs(query(collection(firestore, `users/${uid}/ipos`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
      getDocs(query(collection(firestore, `users/${uid}/applications`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
      getDocs(query(collection(firestore, `users/${uid}/bankAccounts`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
      getDocs(query(collection(firestore, `users/${uid}/allotments`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
    ]);

    const changes: DeltaChanges = {
      profiles: profilesSnap ? profilesSnap.docs.map((d) => d.data()) : [],
      ipos: iposSnap ? iposSnap.docs.map((d) => d.data()) : [],
      applications: appsSnap ? appsSnap.docs.map((d) => d.data()) : [],
      bankAccounts: banksSnap ? banksSnap.docs.map((d) => d.data()) : [],
      allotments: allotmentsSnap ? allotmentsSnap.docs.map((d) => d.data()) : [],
    };

    return { success: true, changes };
  } catch (err: any) {
    console.error('[firestoreSyncService] fetchDeltaFromFirestore error:', err);
    return { success: false, error: err?.message || 'Failed to query delta changes.' };
  }
}

/**
 * Applies a batch of delta changes to SQLite inside a single atomic transaction
 */
export async function applyDeltaToSQLite(
  db: SQLiteDatabase,
  delta: DeltaChanges,
  uid: string,
): Promise<number> {
  let count = 0;
  const nowIso = new Date().toISOString();

  await runWithTransaction(
    db,
    async () => {
      // 1. Profiles
      for (const u of delta.profiles) {
        if (!u?.id) continue;
        if (u.deleted_at) {
          await safeRunAsync(
            db,
            'UPDATE users_table SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [u.deleted_at, u.updated_at || nowIso, u.id],
            'applyDelta.deleteProfile'
          );
        } else {
          // Check local updated_at for conflict resolution (Last-Write-Wins)
          const local = await db.getFirstAsync<{ updated_at: string }>(
            'SELECT updated_at FROM users_table WHERE id = ?',
            [u.id]
          );
          if (local?.updated_at && u.updated_at && local.updated_at > u.updated_at) {
            // Local is newer, skip
            continue;
          }
          await safeRunAsync(
            db,
            `INSERT INTO users_table (
              id, name, pan_number, client_id, upi_id, broker, tpin, upi_app, bank_name,
              avatar_url, default_amount_blocked, archived, owner_id, created_at, updated_at, deleted_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              pan_number=excluded.pan_number,
              client_id=excluded.client_id,
              upi_id=excluded.upi_id,
              broker=excluded.broker,
              tpin=excluded.tpin,
              upi_app=excluded.upi_app,
              bank_name=excluded.bank_name,
              avatar_url=CASE WHEN excluded.avatar_url != '' THEN excluded.avatar_url ELSE users_table.avatar_url END,
              default_amount_blocked=excluded.default_amount_blocked,
              archived=excluded.archived,
              owner_id=excluded.owner_id,
              updated_at=excluded.updated_at,
              deleted_at=NULL`,
            [
              u.id,
              u.name || '',
              u.pan_number || '',
              u.client_id || '',
              u.upi_id || '',
              u.broker || '',
              u.tpin || '',
              u.upi_app || '',
              u.bank_name || '',
              u.avatar_url || '',
              u.default_amount_blocked || 0,
              u.archived ? 1 : 0,
              uid,
              u.created_at || nowIso,
              u.updated_at || nowIso,
            ],
            'applyDelta.upsertProfile'
          );
        }
        count++;
      }

      // 2. IPOs
      for (const ipo of delta.ipos) {
        if (!ipo?.id) continue;
        if (ipo.deleted_at) {
          await safeRunAsync(
            db,
            'UPDATE ipo_listings SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [ipo.deleted_at, ipo.updated_at || nowIso, ipo.id],
            'applyDelta.deleteIPO'
          );
        } else {
          const local = await db.getFirstAsync<{ updated_at: string }>(
            'SELECT updated_at FROM ipo_listings WHERE id = ?',
            [ipo.id]
          );
          if (local?.updated_at && ipo.updated_at && local.updated_at > ipo.updated_at) {
            continue;
          }
          await safeRunAsync(
            db,
            `INSERT INTO ipo_listings (
              id, backend_ipo_id, symbol, company_name, ipo_name, buy_price, quantity,
              open_date, close_date, listing_date, logo_url, archived, is_favorite, registrar,
              exchange, issue_type, allotment_date, gmp_percent, gmp_value, owner_id, created_at, updated_at, deleted_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
            ON CONFLICT(id) DO UPDATE SET
              backend_ipo_id=excluded.backend_ipo_id,
              symbol=excluded.symbol,
              company_name=excluded.company_name,
              ipo_name=excluded.ipo_name,
              buy_price=excluded.buy_price,
              quantity=excluded.quantity,
              open_date=excluded.open_date,
              close_date=excluded.close_date,
              listing_date=excluded.listing_date,
              logo_url=CASE WHEN excluded.logo_url != '' THEN excluded.logo_url ELSE ipo_listings.logo_url END,
              archived=excluded.archived,
              is_favorite=excluded.is_favorite,
              registrar=excluded.registrar,
              exchange=excluded.exchange,
              issue_type=excluded.issue_type,
              allotment_date=excluded.allotment_date,
              gmp_percent=excluded.gmp_percent,
              gmp_value=excluded.gmp_value,
              owner_id=excluded.owner_id,
              updated_at=excluded.updated_at,
              deleted_at=NULL`,
            [
              ipo.id,
              ipo.backend_ipo_id || null,
              ipo.symbol || '',
              ipo.company_name || ipo.ipo_name || 'IPO',
              ipo.ipo_name || 'IPO',
              ipo.buy_price || 0,
              ipo.quantity || 0,
              ipo.open_date || '',
              ipo.close_date || '',
              ipo.listing_date || '',
              ipo.logo_url || '',
              ipo.archived ? 1 : 0,
              ipo.is_favorite ? 1 : 0,
              ipo.registrar || '',
              ipo.exchange || '',
              ipo.issue_type || '',
              ipo.allotment_date || '',
              ipo.gmp_percent || 0,
              ipo.gmp_value || 0,
              uid,
              ipo.created_at || nowIso,
              ipo.updated_at || nowIso,
            ],
            'applyDelta.upsertIPO'
          );
        }
        count++;
      }

      // 3. Applications
      for (const app of delta.applications) {
        if (!app?.id) continue;
        if (app.deleted_at) {
          await safeRunAsync(
            db,
            'UPDATE ipo_applications SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [app.deleted_at, app.updated_at || nowIso, app.id],
            'applyDelta.deleteApp'
          );
        } else {
          const local = await db.getFirstAsync<{ updated_at: string }>(
            'SELECT updated_at FROM ipo_applications WHERE id = ?',
            [app.id]
          );
          if (local?.updated_at && app.updated_at && local.updated_at > app.updated_at) {
            continue;
          }
          await safeRunAsync(
            db,
            `INSERT INTO ipo_applications (
              id, user_id, ipo_id, status, shares_count, sell_price, sale_date, tax,
              user_cut, is_favorite, bank_name, upi_app, owner_id, created_at, updated_at, deleted_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
            ON CONFLICT(id) DO UPDATE SET
              user_id=excluded.user_id,
              ipo_id=excluded.ipo_id,
              status=excluded.status,
              shares_count=excluded.shares_count,
              sell_price=excluded.sell_price,
              sale_date=excluded.sale_date,
              tax=excluded.tax,
              user_cut=excluded.user_cut,
              is_favorite=excluded.is_favorite,
              bank_name=excluded.bank_name,
              upi_app=excluded.upi_app,
              owner_id=excluded.owner_id,
              updated_at=excluded.updated_at,
              deleted_at=NULL`,
            [
              app.id,
              app.user_id,
              app.ipo_id,
              app.status || 'Applied',
              app.shares_count ?? app.quantity ?? null,
              app.sell_price ?? null,
              app.sale_date ?? null,
              app.tax ?? 0,
              app.user_cut ?? 0,
              app.is_favorite ? 1 : 0,
              app.bank_name || '',
              app.upi_app || '',
              uid,
              app.created_at || nowIso,
              app.updated_at || nowIso,
            ],
            'applyDelta.upsertApp'
          );
        }
        count++;
      }

      // 4. Bank Accounts
      for (const b of delta.bankAccounts) {
        if (!b?.id) continue;
        if (b.deleted_at) {
          await safeRunAsync(
            db,
            'UPDATE bank_accounts SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [b.deleted_at, b.updated_at || nowIso, b.id],
            'applyDelta.deleteBank'
          );
        } else {
          const local = await db.getFirstAsync<{ updated_at: string }>(
            'SELECT updated_at FROM bank_accounts WHERE id = ?',
            [b.id]
          );
          if (local?.updated_at && b.updated_at && local.updated_at > b.updated_at) {
            continue;
          }
          await safeRunAsync(
            db,
            `INSERT INTO bank_accounts (
              id, bank_name, balance, upi_app, owner_id, created_at, updated_at, deleted_at
            ) VALUES (?,?,?,?,?,?,?,NULL)
            ON CONFLICT(id) DO UPDATE SET
              bank_name=excluded.bank_name,
              balance=excluded.balance,
              upi_app=excluded.upi_app,
              owner_id=excluded.owner_id,
              updated_at=excluded.updated_at,
              deleted_at=NULL`,
            [
              b.id,
              b.bank_name || 'Bank',
              b.balance || 0,
              b.upi_app || '',
              uid,
              b.created_at || nowIso,
              b.updated_at || nowIso,
            ],
            'applyDelta.upsertBank'
          );
        }
        count++;
      }

      // 5. Allotments
      for (const alt of delta.allotments) {
        if (!alt?.id) continue;
        if (alt.deleted_at) {
          await safeRunAsync(
            db,
            'DELETE FROM ipo_allotments WHERE id = ?',
            [alt.id],
            'applyDelta.deleteAllotment'
          );
        } else {
          await safeRunAsync(
            db,
            `INSERT INTO ipo_allotments (
              id, application_id, user_id, ipo_id, allotment_status, allotted_lots,
              allotted_shares, allotment_price, application_amount, refund_amount, registrar,
              verification_method, checked_at, error_code, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
              alt.id,
              alt.application_id,
              alt.user_id,
              alt.ipo_id,
              alt.allotment_status || 'UNKNOWN',
              alt.allotted_lots || 0,
              alt.allotted_shares || 0,
              alt.allotment_price || 0,
              alt.application_amount || 0,
              alt.refund_amount || 0,
              alt.registrar || '',
              alt.verification_method || 'AUTOMATED',
              alt.checked_at || nowIso,
              alt.error_code || '',
              alt.created_at || nowIso,
              alt.updated_at || nowIso,
            ],
            'applyDelta.upsertAllotment'
          );
        }
        count++;
      }
    },
    'applyDeltaToSQLite.transaction'
  );

  return count;
}

/**
 * Executes lightweight incremental delta sync from Firestore to local SQLite
 */
export async function syncDeltaFromFirestore(
  uid: string,
  db: SQLiteDatabase,
  importJSONFallback?: (json: string) => Promise<any>,
): Promise<DeltaSyncResult> {
  if (!uid) return { success: false, error: 'User is not authenticated.' };

  if (activeSyncsByUid.has(uid) || isSyncInProgress) {
    console.log(`[firestoreSyncService] Sync already active for user ${uid}, skipping duplicate execution.`);
    return { success: true, upToDate: true, changesApplied: 0 };
  }

  activeSyncsByUid.add(uid);
  isSyncInProgress = true;
  setSuppressCloudSync(true);

  try {
    // 1. Check cloud metadata
    const cloudMeta = await getCloudSyncMetadata(uid);
    if (!cloudMeta || !cloudMeta.last_synced_at) {
      return { success: true, upToDate: true, changesApplied: 0 };
    }

    // 2. Check local sync cursor
    const localCursor = await getLocalSyncCursor(uid);

    // If device has never synced with this UID, do full restore
    if (!localCursor) {
      console.log(`[firestoreSyncService] First sync for user ${uid}, performing full restore.`);
      const fullRestore = await fetchUserDataFromFirestore(uid);
      if (fullRestore.success && fullRestore.data && importJSONFallback) {
        await importJSONFallback(JSON.stringify(fullRestore.data));
      }
      await setLocalSyncCursor(uid, cloudMeta.last_synced_at);
      return {
        success: true,
        isFullRestore: true,
        changesApplied:
          (fullRestore.userCount || 0) +
          (fullRestore.ipoCount || 0) +
          (fullRestore.applicationCount || 0),
        syncedAt: cloudMeta.last_synced_at,
      };
    }

    // 3. Compare cursors
    if (localCursor >= cloudMeta.last_synced_at) {
      // Local database is fully up to date with cloud! Zero document reads.
      return { success: true, upToDate: true, changesApplied: 0, syncedAt: localCursor };
    }

    // 4. Query only changed documents since localCursor
    console.log(`[firestoreSyncService] Syncing delta since ${localCursor} for user ${uid}`);
    const deltaRes = await fetchDeltaFromFirestore(uid, localCursor);
    if (!deltaRes.success || !deltaRes.changes) {
      return { success: false, error: deltaRes.error || 'Failed to fetch delta changes.' };
    }

    const totalChanged =
      deltaRes.changes.profiles.length +
      deltaRes.changes.ipos.length +
      deltaRes.changes.applications.length +
      deltaRes.changes.bankAccounts.length +
      deltaRes.changes.allotments.length;

    if (totalChanged > 0) {
      await applyDeltaToSQLite(db, deltaRes.changes, uid);
    }

    // Advance local cursor to the cloud's last synced timestamp
    await setLocalSyncCursor(uid, cloudMeta.last_synced_at);

    return {
      success: true,
      upToDate: false,
      changesApplied: totalChanged,
      syncedAt: cloudMeta.last_synced_at,
    };
  } catch (err: any) {
    console.error('[firestoreSyncService] syncDeltaFromFirestore error:', err);
    return { success: false, error: err?.message || 'Delta sync error.' };
  } finally {
    setSuppressCloudSync(false);
    activeSyncsByUid.delete(uid);
    isSyncInProgress = false;
  }
}

// ── Real-Time Single Document Synchronization ────────────────────────────────

/**
 * Single document upsert for live offline/online synchronization
 */
export async function syncSingleDocUpsert(
  uid: string,
  collectionName: 'profiles' | 'user_profiles' | 'ipos' | 'applications' | 'bankAccounts' | 'banks' | 'allotments',
  docId: string,
  data: Record<string, any>,
): Promise<void> {
  if (!uid || !docId) return;
  if (isSuppressingCloudSync()) return;

  try {
    const targetColl =
      collectionName === 'user_profiles'
        ? 'profiles'
        : collectionName === 'banks'
        ? 'bankAccounts'
        : collectionName;
    const nowIso = new Date().toISOString();
    const dRef = doc(firestore, `users/${uid}/${targetColl}/${docId}`);
    
    await setDoc(
      dRef,
      {
        ...data,
        id: docId,
        owner_id: uid,
        updated_at: data.updated_at || nowIso,
        deleted_at: null,
      },
      { merge: true }
    );

    // Update metadata sync_state
    const metaRef = doc(firestore, `users/${uid}/metadata/sync_state`);
    await setDoc(
      metaRef,
      {
        last_synced_at: nowIso,
        owner_id: uid,
      },
      { merge: true }
    );

    // Advance local cursor
    await setLocalSyncCursor(uid, nowIso);
  } catch (err) {
    console.warn(`[firestoreSyncService] syncSingleDocUpsert (${collectionName}/${docId}) failed:`, err);
  }
}

/**
 * Single document delete for live synchronization (writes tombstone)
 */
export async function syncSingleDocDelete(
  uid: string,
  collectionName: 'profiles' | 'user_profiles' | 'ipos' | 'applications' | 'bankAccounts' | 'banks' | 'allotments',
  docId: string,
): Promise<void> {
  if (!uid || !docId) return;
  if (isSuppressingCloudSync()) return;

  try {
    const targetColl =
      collectionName === 'user_profiles'
        ? 'profiles'
        : collectionName === 'banks'
        ? 'bankAccounts'
        : collectionName;
    const nowIso = new Date().toISOString();
    const dRef = doc(firestore, `users/${uid}/${targetColl}/${docId}`);
    
    // Write tombstone
    await setDoc(
      dRef,
      {
        id: docId,
        owner_id: uid,
        updated_at: nowIso,
        deleted_at: nowIso,
      },
      { merge: true }
    );

    // Update metadata sync_state
    const metaRef = doc(firestore, `users/${uid}/metadata/sync_state`);
    await setDoc(
      metaRef,
      {
        last_synced_at: nowIso,
        owner_id: uid,
      },
      { merge: true }
    );

    // Advance local cursor
    await setLocalSyncCursor(uid, nowIso);
  } catch (err) {
    console.warn(`[firestoreSyncService] syncSingleDocDelete (${collectionName}/${docId}) failed:`, err);
  }
}

/**
 * Debounced full sync trigger for batch database changes
 */
export function scheduleDebouncedFirestoreSync(
  exportJSONFn: () => Promise<string>,
  uid: string | undefined | null,
  delayMs: number = 8000,
): void {
  if (!uid) return;
  if (isSuppressingCloudSync()) return;

  if (autoSyncDebounceTimer) {
    clearTimeout(autoSyncDebounceTimer);
  }
  autoSyncDebounceTimer = setTimeout(async () => {
    try {
      if (isSuppressingCloudSync() || isCloudSyncBusy()) return;
      const jsonStr = await exportJSONFn();
      if (!jsonStr) return;
      const data = JSON.parse(jsonStr) as IPOVaultExportData;
      await syncUserDataToFirestore(uid, data);
    } catch (err) {
      console.warn('[firestoreSyncService] Debounced sync error:', err);
    }
  }, delayMs);
}

