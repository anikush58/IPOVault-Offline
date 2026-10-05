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
import { saveBase64ToLocalImage } from '@/utils/imageUtils';

export const LAST_FIRESTORE_SYNC_KEY = 'ipovault_last_firestore_sync_ts';
export const FIRESTORE_MIGRATED_KEY_PREFIX = 'ipovault_migrated_to_firestore_';
export const LOCAL_SYNC_CURSOR_PREFIX = 'ipovault_last_synced_at_';

const isDev = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : process.env.NODE_ENV !== 'production';

function logDevTiming(stage: string, durationMs: number, detail?: string) {
  if (isDev) {
    console.log(`[CloudSync Timing] ${stage}: ${durationMs}ms${detail ? ` (${detail})` : ''}`);
  }
}

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

export interface CriticalUserData {
  users?: any[];
  ipos?: any[];
  applications?: any[];
  master_ipos?: any[];
}

export interface SecondaryUserData {
  banks?: any[];
  allotments?: any[];
}

export interface CriticalRestoreResult {
  success: boolean;
  restoredAt?: string;
  data?: CriticalUserData | null;
  metadata?: CloudSyncMetadata | null;
  userCount?: number;
  ipoCount?: number;
  applicationCount?: number;
  error?: string;
}

export interface SecondaryRestoreResult {
  success: boolean;
  restoredAt?: string;
  data?: SecondaryUserData | null;
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

export interface CriticalDeltaChanges {
  profiles: any[];
  ipos: any[];
  applications: any[];
}

export interface SecondaryDeltaChanges {
  bankAccounts: any[];
  allotments: any[];
}

export interface DeltaSyncResult {
  success: boolean;
  upToDate?: boolean;
  isFullRestore?: boolean;
  syncedAt?: string;
  changesApplied?: number;
  stage1DurationMs?: number;
  totalDurationMs?: number;
  error?: string;
}

export interface StagedSyncCallbacks {
  onCriticalDataReady?: (data: CriticalUserData) => Promise<void>;
  onSecondaryDataReady?: (data: SecondaryUserData) => Promise<void>;
  onImageCachingComplete?: (savedCount: number) => void;
  importJSONFallback?: (data: string | IPOVaultExportData) => Promise<any>;
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
    if (isDev) console.warn('[firestoreSyncService] Failed to set local sync cursor:', err);
  }
}

export async function clearLocalSyncCursor(uid: string): Promise<void> {
  if (!uid) return;
  try {
    await safeAsyncStorage.removeItem(`${LOCAL_SYNC_CURSOR_PREFIX}${uid}`);
    await safeAsyncStorage.removeItem(LAST_FIRESTORE_SYNC_KEY);
  } catch (err) {
    if (isDev) console.warn('[firestoreSyncService] Failed to clear local sync cursor:', err);
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
    if (isDev) console.warn('[firestoreSyncService] hasCloudData error:', err);
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
    if (isDev) console.warn('[firestoreSyncService] getCloudSyncMetadata error:', err);
    return null;
  }
}

// ── Stage 1: Critical Dashboard Data Fetch ────────────────────────────────────

/**
 * Stage 1: Concurrently fetches profiles, IPOs, applications, and sync metadata.
 * Designed to return in ~350-500ms under standard network conditions.
 */
export async function fetchCriticalUserDataFromFirestore(uid: string): Promise<CriticalRestoreResult> {
  if (!uid) {
    return { success: false, error: 'User is not authenticated.' };
  }

  const startTime = Date.now();
  try {
    const [profilesSnap, iposSnap, appsSnap, metaSnap] = await Promise.all([
      getDocs(collection(firestore, `users/${uid}/profiles`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/ipos`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/applications`)).catch(() => null),
      getDoc(doc(firestore, `users/${uid}/metadata/sync_state`)).catch(() => null),
    ]);

    let restoredUsers = profilesSnap ? profilesSnap.docs.map((d) => d.data()).filter((u) => !u.deleted_at) : [];
    const restoredIpos = iposSnap ? iposSnap.docs.map((d) => d.data()).filter((i) => !i.deleted_at) : [];
    const restoredApps = appsSnap ? appsSnap.docs.map((d) => d.data()).filter((a) => !a.deleted_at) : [];

    // Fallback to legacy user_profiles if primary profiles collection is empty
    if (restoredUsers.length === 0) {
      const legacyProfilesSnap = await getDocs(collection(firestore, `users/${uid}/user_profiles`)).catch(() => null);
      if (legacyProfilesSnap && !legacyProfilesSnap.empty) {
        restoredUsers = legacyProfilesSnap.docs.map((d) => d.data()).filter((u) => !u.deleted_at);
      }
    }

    const metadata = metaSnap && metaSnap.exists() ? (metaSnap.data() as CloudSyncMetadata) : null;
    const fetchDuration = Date.now() - startTime;
    logDevTiming('Stage 1 Firestore fetch', fetchDuration, `users: ${restoredUsers.length}, ipos: ${restoredIpos.length}, apps: ${restoredApps.length}`);

    return {
      success: true,
      restoredAt: new Date().toISOString(),
      data: {
        users: restoredUsers,
        ipos: restoredIpos,
        applications: restoredApps,
      },
      metadata,
      userCount: restoredUsers.length,
      ipoCount: restoredIpos.length,
      applicationCount: restoredApps.length,
    };
  } catch (err: any) {
    if (isDev) console.error('[firestoreSyncService] fetchCriticalUserDataFromFirestore error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch critical data from Firestore.',
    };
  }
}

// ── Stage 2: Secondary Data Fetch ─────────────────────────────────────────────

/**
 * Stage 2: Concurrently fetches bank accounts and allotments.
 * Runs in background after or alongside Stage 1.
 */
export async function fetchSecondaryUserDataFromFirestore(uid: string): Promise<SecondaryRestoreResult> {
  if (!uid) {
    return { success: false, error: 'User is not authenticated.' };
  }

  const startTime = Date.now();
  try {
    const [bankAccountsSnap, allotmentsSnap] = await Promise.all([
      getDocs(collection(firestore, `users/${uid}/bankAccounts`)).catch(() => null),
      getDocs(collection(firestore, `users/${uid}/allotments`)).catch(() => null),
    ]);

    let restoredBanks = bankAccountsSnap ? bankAccountsSnap.docs.map((d) => d.data()).filter((b) => !b.deleted_at) : [];
    const restoredAllotments = allotmentsSnap ? allotmentsSnap.docs.map((d) => d.data()).filter((alt) => !alt.deleted_at) : [];

    // Fallback to legacy banks collection if primary is empty
    if (restoredBanks.length === 0) {
      const legacyBanksSnap = await getDocs(collection(firestore, `users/${uid}/banks`)).catch(() => null);
      if (legacyBanksSnap && !legacyBanksSnap.empty) {
        restoredBanks = legacyBanksSnap.docs.map((d) => d.data()).filter((b) => !b.deleted_at);
      }
    }

    const fetchDuration = Date.now() - startTime;
    logDevTiming('Stage 2 Firestore fetch', fetchDuration, `banks: ${restoredBanks.length}, allotments: ${restoredAllotments.length}`);

    return {
      success: true,
      restoredAt: new Date().toISOString(),
      data: {
        banks: restoredBanks,
        allotments: restoredAllotments,
      },
      bankCount: restoredBanks.length,
      allotmentCount: restoredAllotments.length,
    };
  } catch (err: any) {
    if (isDev) console.error('[firestoreSyncService] fetchSecondaryUserDataFromFirestore error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch secondary data from Firestore.',
    };
  }
}

// ── Full Synchronization (Upload) ────────────────────────────────────────────

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

    // 1. Write lightweight sync metadata & bootstrap summary
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

    // Write optional lightweight snapshot header (~200 bytes)
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
    if (isDev) console.error('[firestoreSyncService] syncUserDataToFirestore error:', err);
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
 * Fetches all user data from Firestore subcollections for full manual restoration
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
    // Fetch all 5 subcollections in parallel
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

    let restoredUsers = profilesSnap ? profilesSnap.docs.map((d) => d.data()).filter((u) => !u.deleted_at) : [];
    const restoredIpos = iposSnap ? iposSnap.docs.map((d) => d.data()).filter((i) => !i.deleted_at) : [];
    const restoredApps = appsSnap ? appsSnap.docs.map((d) => d.data()).filter((a) => !a.deleted_at) : [];
    let restoredBanks = bankAccountsSnap ? bankAccountsSnap.docs.map((d) => d.data()).filter((b) => !b.deleted_at) : [];
    const restoredAllotments = allotmentsSnap ? allotmentsSnap.docs.map((d) => d.data()).filter((alt) => !alt.deleted_at) : [];

    // Parallel legacy fallbacks only if primary collections returned empty
    const needsLegacyProfiles = restoredUsers.length === 0;
    const needsLegacyBanks = restoredBanks.length === 0;
    if (needsLegacyProfiles || needsLegacyBanks) {
      const [legacyProfilesSnap, legacyBanksSnap] = await Promise.all([
        needsLegacyProfiles
          ? getDocs(collection(firestore, `users/${uid}/user_profiles`)).catch(() => null)
          : Promise.resolve(null),
        needsLegacyBanks
          ? getDocs(collection(firestore, `users/${uid}/banks`)).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (legacyProfilesSnap && !legacyProfilesSnap.empty) {
        restoredUsers = legacyProfilesSnap.docs.map((d) => d.data()).filter((u) => !u.deleted_at);
      }
      if (legacyBanksSnap && !legacyBanksSnap.empty) {
        restoredBanks = legacyBanksSnap.docs.map((d) => d.data()).filter((b) => !b.deleted_at);
      }
    }

    const totalRecords =
      restoredUsers.length +
      restoredIpos.length +
      restoredApps.length +
      restoredBanks.length +
      restoredAllotments.length;

    const fetchDuration = Date.now() - startTime;
    logDevTiming('Full manual Firestore fetch', fetchDuration, `total documents: ${totalRecords}`);

    if (totalRecords === 0) {
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
    if (isDev) console.error('[firestoreSyncService] fetchUserDataFromFirestore error:', err);
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
 * Stage 1: Fetches delta changes for profiles, IPOs, applications since lastSyncedAt
 */
export async function fetchCriticalDeltaFromFirestore(
  uid: string,
  lastSyncedAt: string,
): Promise<{ success: boolean; changes?: CriticalDeltaChanges; error?: string }> {
  if (!uid) return { success: false, error: 'User is not authenticated.' };
  try {
    const [profilesSnap, iposSnap, appsSnap] = await Promise.all([
      getDocs(query(collection(firestore, `users/${uid}/profiles`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
      getDocs(query(collection(firestore, `users/${uid}/ipos`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
      getDocs(query(collection(firestore, `users/${uid}/applications`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
    ]);

    const changes: CriticalDeltaChanges = {
      profiles: profilesSnap ? profilesSnap.docs.map((d) => d.data()) : [],
      ipos: iposSnap ? iposSnap.docs.map((d) => d.data()) : [],
      applications: appsSnap ? appsSnap.docs.map((d) => d.data()) : [],
    };

    return { success: true, changes };
  } catch (err: any) {
    if (isDev) console.error('[firestoreSyncService] fetchCriticalDeltaFromFirestore error:', err);
    return { success: false, error: err?.message || 'Failed to query critical delta changes.' };
  }
}

/**
 * Stage 2: Fetches delta changes for bankAccounts and allotments since lastSyncedAt
 */
export async function fetchSecondaryDeltaFromFirestore(
  uid: string,
  lastSyncedAt: string,
): Promise<{ success: boolean; changes?: SecondaryDeltaChanges; error?: string }> {
  if (!uid) return { success: false, error: 'User is not authenticated.' };
  try {
    const [banksSnap, allotmentsSnap] = await Promise.all([
      getDocs(query(collection(firestore, `users/${uid}/bankAccounts`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
      getDocs(query(collection(firestore, `users/${uid}/allotments`), where('updated_at', '>', lastSyncedAt))).catch(() => null),
    ]);

    const changes: SecondaryDeltaChanges = {
      bankAccounts: banksSnap ? banksSnap.docs.map((d) => d.data()) : [],
      allotments: allotmentsSnap ? allotmentsSnap.docs.map((d) => d.data()) : [],
    };

    return { success: true, changes };
  } catch (err: any) {
    if (isDev) console.error('[firestoreSyncService] fetchSecondaryDeltaFromFirestore error:', err);
    return { success: false, error: err?.message || 'Failed to query secondary delta changes.' };
  }
}

/**
 * Legacy full delta fetch
 */
export async function fetchDeltaFromFirestore(
  uid: string,
  lastSyncedAt: string,
): Promise<{ success: boolean; changes?: DeltaChanges; error?: string }> {
  if (!uid) return { success: false, error: 'User is not authenticated.' };
  try {
    const [criticalRes, secondaryRes] = await Promise.all([
      fetchCriticalDeltaFromFirestore(uid, lastSyncedAt),
      fetchSecondaryDeltaFromFirestore(uid, lastSyncedAt),
    ]);

    if (!criticalRes.success || !criticalRes.changes || !secondaryRes.success || !secondaryRes.changes) {
      return { success: false, error: criticalRes.error || secondaryRes.error || 'Failed to query delta changes.' };
    }

    const changes: DeltaChanges = {
      profiles: criticalRes.changes.profiles,
      ipos: criticalRes.changes.ipos,
      applications: criticalRes.changes.applications,
      bankAccounts: secondaryRes.changes.bankAccounts,
      allotments: secondaryRes.changes.allotments,
    };

    return { success: true, changes };
  } catch (err: any) {
    if (isDev) console.error('[firestoreSyncService] fetchDeltaFromFirestore error:', err);
    return { success: false, error: err?.message || 'Failed to query delta changes.' };
  }
}

/**
 * Stage 1 SQLite Ingestion: Applies critical changes (users, IPOs, applications)
 * inside a single atomic SQLite transaction.
 */
export async function applyCriticalDeltaToSQLite(
  db: SQLiteDatabase,
  delta: { profiles?: any[]; ipos?: any[]; applications?: any[] },
  uid: string,
): Promise<number> {
  const t0 = Date.now();
  let count = 0;
  const nowIso = new Date().toISOString();

  await runWithTransaction(
    db,
    async () => {
      // 1. Profiles / Users
      for (const u of delta.profiles || []) {
        if (!u?.id) continue;
        if (u.deleted_at) {
          await safeRunAsync(
            db,
            'UPDATE users_table SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [u.deleted_at, u.updated_at || nowIso, u.id],
            'applyCriticalDelta.deleteProfile'
          );
        } else {
          const local = await db.getFirstAsync<{ updated_at: string }>(
            'SELECT updated_at FROM users_table WHERE id = ?',
            [u.id]
          );
          if (local?.updated_at && u.updated_at && local.updated_at > u.updated_at) {
            continue; // Local is newer (Last-Write-Wins)
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
            'applyCriticalDelta.upsertProfile'
          );
        }
        count++;
      }

      // 2. IPO Listings
      for (const ipo of delta.ipos || []) {
        if (!ipo?.id) continue;
        if (ipo.deleted_at) {
          await safeRunAsync(
            db,
            'UPDATE ipo_listings SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [ipo.deleted_at, ipo.updated_at || nowIso, ipo.id],
            'applyCriticalDelta.deleteIPO'
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
            'applyCriticalDelta.upsertIPO'
          );
        }
        count++;
      }

      // 3. Applications
      for (const app of delta.applications || []) {
        if (!app?.id) continue;
        if (app.deleted_at) {
          await safeRunAsync(
            db,
            'UPDATE ipo_applications SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [app.deleted_at, app.updated_at || nowIso, app.id],
            'applyCriticalDelta.deleteApp'
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
              user_cut, is_favorite, bank_name, upi_app, broker_account_id, owner_id, created_at, updated_at, deleted_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
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
              broker_account_id=COALESCE(excluded.broker_account_id, ipo_applications.broker_account_id),
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
              app.broker_account_id || app.brokerAccountId || null,
              uid,
              app.created_at || nowIso,
              app.updated_at || nowIso,
            ],
            'applyCriticalDelta.upsertApp'
          );
        }
        count++;
      }
    },
    'applyCriticalDeltaToSQLite.transaction'
  );

  const duration = Date.now() - t0;
  logDevTiming('Stage 1 SQLite transaction', duration, `applied ${count} critical changes`);
  return count;
}

/**
 * Stage 2 SQLite Ingestion: Applies secondary changes (bank accounts, allotments)
 * and self-healing allotment status updates inside an atomic SQLite transaction.
 */
export async function applySecondaryDeltaToSQLite(
  db: SQLiteDatabase,
  delta: { bankAccounts?: any[]; allotments?: any[] },
  uid: string,
): Promise<number> {
  const t0 = Date.now();
  let count = 0;
  const nowIso = new Date().toISOString();

  await runWithTransaction(
    db,
    async () => {
      // 1. Bank Accounts
      for (const b of delta.bankAccounts || []) {
        if (!b?.id) continue;
        if (b.deleted_at) {
          await safeRunAsync(
            db,
            'UPDATE bank_accounts SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [b.deleted_at, b.updated_at || nowIso, b.id],
            'applySecondaryDelta.deleteBank'
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
            'applySecondaryDelta.upsertBank'
          );
        }
        count++;
      }

      // 2. Allotments
      for (const alt of delta.allotments || []) {
        if (!alt?.id) continue;
        if (alt.deleted_at) {
          await safeRunAsync(
            db,
            'DELETE FROM ipo_allotments WHERE id = ?',
            [alt.id],
            'applySecondaryDelta.deleteAllotment'
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
            'applySecondaryDelta.upsertAllotment'
          );
        }
        count++;
      }

      // 3. Self-healing allotment status synchronization for applications
      await safeRunAsync(
        db,
        `UPDATE ipo_applications
         SET status = 'Not Allotted', updated_at = ?
         WHERE status IN ('Applied', 'Mandate Approved')
           AND id IN (
             SELECT application_id FROM ipo_allotments
             WHERE UPPER(TRIM(allotment_status)) IN ('NOT_ALLOTTED', 'NOT ALLOTTED', 'REJECTED')
           )`,
        [nowIso],
        'applySecondaryDelta.healNotAllotted'
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
        [nowIso],
        'applySecondaryDelta.healAllotted'
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
        'applySecondaryDelta.healPartiallyAllotted'
      );
    },
    'applySecondaryDeltaToSQLite.transaction'
  );

  const duration = Date.now() - t0;
  logDevTiming('Stage 2 SQLite transaction', duration, `applied ${count} secondary changes`);
  return count;
}

/**
 * Legacy full delta apply
 */
export async function applyDeltaToSQLite(
  db: SQLiteDatabase,
  delta: DeltaChanges,
  uid: string,
): Promise<number> {
  const c1 = await applyCriticalDeltaToSQLite(db, delta, uid);
  const c2 = await applySecondaryDeltaToSQLite(db, delta, uid);
  return c1 + c2;
}

// ── Stage 3: Image / Asset Background Persistence ────────────────────────────

/**
 * Stage 3: Persists Base64 logos and avatars to local file storage asynchronously
 * completely off the critical rendering path.
 */
export async function persistImagesInBackground(
  db: SQLiteDatabase,
  ipos?: any[],
  users?: any[],
): Promise<number> {
  const startTime = Date.now();
  let savedCount = 0;

  try {
    // 1. Process IPO Logos
    if (ipos && ipos.length > 0) {
      await Promise.all(
        ipos.map(async (ipo) => {
          if (!ipo?.id) return;
          const logoInput =
            ipo.logo_url || (ipo as any).companyLogo || (ipo as any).logo || (ipo as any).logo_data;
          if (!logoInput) return;

          // Only process Base64 data URLs / payloads
          if (
            typeof logoInput === 'string' &&
            (logoInput.startsWith('data:') || (!logoInput.startsWith('http://') && !logoInput.startsWith('https://') && !logoInput.startsWith('file://')))
          ) {
            try {
              const savedPath = await saveBase64ToLocalImage(logoInput, 'logo', ipo.id);
              if (savedPath) {
                await safeRunAsync(
                  db,
                  'UPDATE ipo_listings SET logo_url = ? WHERE id = ?',
                  [savedPath, ipo.id],
                  'persistImagesInBackground.updateIpoLogo'
                );
                savedCount++;
              }
            } catch (err) {
              if (isDev) console.warn(`[firestoreSyncService] Stage 3 logo save failed for IPO ${ipo.id}:`, err);
            }
          }
        })
      );
    }

    // 2. Process User Avatars
    if (users && users.length > 0) {
      await Promise.all(
        users.map(async (u) => {
          if (!u?.id) return;
          const avatarInput = u.avatar_url || (u as any).avatarUrl || (u as any).avatar;
          if (!avatarInput) return;

          if (
            typeof avatarInput === 'string' &&
            (avatarInput.startsWith('data:') || (!avatarInput.startsWith('http://') && !avatarInput.startsWith('https://') && !avatarInput.startsWith('file://')))
          ) {
            try {
              const savedPath = await saveBase64ToLocalImage(avatarInput, 'avatar', u.id);
              if (savedPath) {
                await safeRunAsync(
                  db,
                  'UPDATE users_table SET avatar_url = ? WHERE id = ?',
                  [savedPath, u.id],
                  'persistImagesInBackground.updateUserAvatar'
                );
                savedCount++;
              }
            } catch (err) {
              if (isDev) console.warn(`[firestoreSyncService] Stage 3 avatar save failed for user ${u.id}:`, err);
            }
          }
        })
      );
    }

    const duration = Date.now() - startTime;
    logDevTiming('Stage 3 image persistence', duration, `saved ${savedCount} local image files in background`);
    return savedCount;
  } catch (err) {
    if (isDev) console.warn('[firestoreSyncService] Stage 3 persistImagesInBackground warning:', err);
    return savedCount;
  }
}

// ── 3-Stage / Lazy Cloud Sync Pipeline ────────────────────────────────────────

/**
 * Executes the 3-Stage / Lazy post-login cloud sync:
 * - Stage 1 (Critical Dashboard Data): Profiles, IPOs, Applications, Metadata (~450-650ms target)
 * - Stage 2 (Secondary Data): Bank Accounts, Allotments, Self-Healing (Background)
 * - Stage 3 (Image / File Cache): Background Local File I/O
 */
export async function syncDeltaFromFirestore(
  uid: string,
  db: SQLiteDatabase,
  callbacks?: StagedSyncCallbacks | ((data: string | IPOVaultExportData) => Promise<any>),
): Promise<DeltaSyncResult> {
  if (!uid) return { success: false, error: 'User is not authenticated.' };

  if (activeSyncsByUid.has(uid) || isSyncInProgress) {
    if (isDev) console.log(`[firestoreSyncService] Sync already active for user ${uid}, skipping duplicate execution.`);
    return { success: true, upToDate: true, changesApplied: 0 };
  }

  activeSyncsByUid.add(uid);
  isSyncInProgress = true;
  setSuppressCloudSync(true);

  const totalStartTime = Date.now();
  const stagedCallbacks: StagedSyncCallbacks =
    typeof callbacks === 'function'
      ? { importJSONFallback: callbacks }
      : callbacks || {};

  try {
    // 1. Check local sync cursor & inspect local SQLite active records
    const localCursor = await getLocalSyncCursor(uid);
    let hasLocalData = false;
    try {
      const localCheck = await db.getFirstAsync<{ count: number }>(
        'SELECT (SELECT COUNT(*) FROM users_table WHERE deleted_at IS NULL) + (SELECT COUNT(*) FROM ipo_applications WHERE deleted_at IS NULL) as count'
      );
      hasLocalData = (localCheck?.count || 0) > 0;
    } catch {
      hasLocalData = false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BRANCH A: EMPTY / INITIAL LOCAL DATABASE -> STAGED FULL RESTORE
    // ──────────────────────────────────────────────────────────────────────────
    if (!localCursor || !hasLocalData) {
      if (isDev) {
        console.log(`[firestoreSyncService] Local DB empty/uninitialized, launching Staged Sync for user ${uid}.`);
      }

      // Stage 1 & Stage 2 Network Requests launched concurrently!
      const stage1FetchPromise = fetchCriticalUserDataFromFirestore(uid);
      const stage2FetchPromise = fetchSecondaryUserDataFromFirestore(uid);

      // Await Stage 1 Critical Data
      const stage1Res = await stage1FetchPromise;
      if (!stage1Res.success || !stage1Res.data) {
        return { success: false, error: stage1Res.error || 'Failed to fetch critical data.' };
      }

      const stage1DurationMs = Date.now() - totalStartTime;

      // Ingest Stage 1 Atomically into SQLite
      if (stagedCallbacks.onCriticalDataReady) {
        await stagedCallbacks.onCriticalDataReady(stage1Res.data);
      } else if (stagedCallbacks.importJSONFallback) {
        await stagedCallbacks.importJSONFallback({
          users: stage1Res.data.users,
          ipos: stage1Res.data.ipos,
          applications: stage1Res.data.applications,
        });
      } else {
        await applyCriticalDeltaToSQLite(
          db,
          {
            profiles: stage1Res.data.users,
            ipos: stage1Res.data.ipos,
            applications: stage1Res.data.applications,
          },
          uid
        );
      }

      // STAGE 1 COMPLETE: Dashboard is now populated with critical cloud data!

      // Continue Stage 2 (Secondary Data) in the background
      const stage2Res = await stage2FetchPromise;
      if (stage2Res.success && stage2Res.data) {
        if (stagedCallbacks.onSecondaryDataReady) {
          await stagedCallbacks.onSecondaryDataReady(stage2Res.data);
        } else if (stagedCallbacks.importJSONFallback) {
          await stagedCallbacks.importJSONFallback({
            banks: stage2Res.data.banks,
            allotments: stage2Res.data.allotments,
          });
        } else {
          await applySecondaryDeltaToSQLite(
            db,
            {
              bankAccounts: stage2Res.data.banks,
              allotments: stage2Res.data.allotments,
            },
            uid
          );
        }
      }

      // Continue Stage 3 (Image persistence) asynchronously in background
      persistImagesInBackground(db, stage1Res.data.ipos, stage1Res.data.users).then((count) => {
        stagedCallbacks.onImageCachingComplete?.(count);
      });

      // Advance local cursor
      const syncTs = stage1Res.metadata?.last_synced_at || stage1Res.restoredAt || new Date().toISOString();
      await setLocalSyncCursor(uid, syncTs);

      const totalDurationMs = Date.now() - totalStartTime;
      logDevTiming('Total Staged Initial Sync', totalDurationMs, `Stage 1: ${stage1DurationMs}ms`);

      return {
        success: true,
        isFullRestore: true,
        changesApplied:
          (stage1Res.userCount || 0) +
          (stage1Res.ipoCount || 0) +
          (stage1Res.applicationCount || 0) +
          (stage2Res.bankCount || 0) +
          (stage2Res.allotmentCount || 0),
        syncedAt: syncTs,
        stage1DurationMs,
        totalDurationMs,
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BRANCH B: POPULATED LOCAL DATABASE -> INCREMENTAL OR UP-TO-DATE
    // ──────────────────────────────────────────────────────────────────────────
    const cloudMeta = await getCloudSyncMetadata(uid);

    // If cloud metadata is missing, fall back to full restore
    if (!cloudMeta || !cloudMeta.last_synced_at) {
      if (isDev) console.log(`[firestoreSyncService] Cloud metadata missing, falling back to full restore for user ${uid}.`);
      const fullRestore = await fetchUserDataFromFirestore(uid);
      if (fullRestore.success && fullRestore.data && stagedCallbacks.importJSONFallback) {
        await stagedCallbacks.importJSONFallback(fullRestore.data);
      }
      const syncTs = fullRestore.restoredAt || new Date().toISOString();
      await setLocalSyncCursor(uid, syncTs);
      return {
        success: true,
        isFullRestore: true,
        changesApplied:
          (fullRestore.userCount || 0) +
          (fullRestore.ipoCount || 0) +
          (fullRestore.applicationCount || 0) +
          (fullRestore.bankCount || 0) +
          (fullRestore.allotmentCount || 0),
        syncedAt: syncTs,
      };
    }

    // If local cursor is current with cloud cursor: ZERO document reads!
    if (localCursor >= cloudMeta.last_synced_at) {
      return { success: true, upToDate: true, changesApplied: 0, syncedAt: localCursor };
    }

    // Cloud has newer changes -> Staged Incremental Delta Sync
    if (isDev) console.log(`[firestoreSyncService] Syncing staged delta since ${localCursor} for user ${uid}`);

    // Concurrently query Stage 1 & Stage 2 deltas
    const stage1DeltaPromise = fetchCriticalDeltaFromFirestore(uid, localCursor);
    const stage2DeltaPromise = fetchSecondaryDeltaFromFirestore(uid, localCursor);

    // Process Stage 1 Critical Delta
    const stage1DeltaRes = await stage1DeltaPromise;
    if (!stage1DeltaRes.success || !stage1DeltaRes.changes) {
      return { success: false, error: stage1DeltaRes.error || 'Failed to fetch critical delta changes.' };
    }

    const stage1Changed =
      stage1DeltaRes.changes.profiles.length +
      stage1DeltaRes.changes.ipos.length +
      stage1DeltaRes.changes.applications.length;

    if (stage1Changed > 0) {
      await applyCriticalDeltaToSQLite(db, stage1DeltaRes.changes, uid);
      if (stagedCallbacks.onCriticalDataReady) {
        await stagedCallbacks.onCriticalDataReady({
          users: stage1DeltaRes.changes.profiles,
          ipos: stage1DeltaRes.changes.ipos,
          applications: stage1DeltaRes.changes.applications,
        });
      }
    }

    const stage1DurationMs = Date.now() - totalStartTime;

    // Process Stage 2 Secondary Delta in background
    const stage2DeltaRes = await stage2DeltaPromise;
    let stage2Changed = 0;
    if (stage2DeltaRes.success && stage2DeltaRes.changes) {
      stage2Changed =
        stage2DeltaRes.changes.bankAccounts.length +
        stage2DeltaRes.changes.allotments.length;

      if (stage2Changed > 0) {
        await applySecondaryDeltaToSQLite(db, stage2DeltaRes.changes, uid);
        if (stagedCallbacks.onSecondaryDataReady) {
          await stagedCallbacks.onSecondaryDataReady({
            banks: stage2DeltaRes.changes.bankAccounts,
            allotments: stage2DeltaRes.changes.allotments,
          });
        }
      }
    }

    // Process Stage 3 image persistence for updated records
    if (stage1Changed > 0) {
      persistImagesInBackground(db, stage1DeltaRes.changes.ipos, stage1DeltaRes.changes.profiles).then((count) => {
        stagedCallbacks.onImageCachingComplete?.(count);
      });
    }

    // Advance local cursor to cloud metadata timestamp
    await setLocalSyncCursor(uid, cloudMeta.last_synced_at);

    const totalDurationMs = Date.now() - totalStartTime;
    logDevTiming('Total Incremental Delta Sync', totalDurationMs, `Stage 1: ${stage1DurationMs}ms, changed: ${stage1Changed + stage2Changed}`);

    return {
      success: true,
      upToDate: false,
      changesApplied: stage1Changed + stage2Changed,
      syncedAt: cloudMeta.last_synced_at,
      stage1DurationMs,
      totalDurationMs,
    };
  } catch (err: any) {
    if (isDev) console.error('[firestoreSyncService] syncDeltaFromFirestore error:', err);
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
    if (isDev) console.warn(`[firestoreSyncService] syncSingleDocUpsert (${collectionName}/${docId}) failed:`, err);
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
    if (isDev) console.warn(`[firestoreSyncService] syncSingleDocDelete (${collectionName}/${docId}) failed:`, err);
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
      if (isDev) console.warn('[firestoreSyncService] Debounced sync error:', err);
    }
  }, delayMs);
}
