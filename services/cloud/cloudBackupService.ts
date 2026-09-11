import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/sync/supabase';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { networkService } from '@/services/infrastructure/networkService';
import {
  ensureBase64DataUrl,
  extractBase64Payload,
  saveBase64ToLocalImage,
} from '@/utils/imageUtils';

export const LAST_CLOUD_BACKUP_KEY = 'ipovault_last_cloud_backup_ts';

export const SUPPORTED_BACKUP_VERSION = 1;
export const CURRENT_SCHEMA_VERSION = 1;
export const CURRENT_APP_VERSION = '2.0.2';

export interface CloudBackupMetadata {
  id: string;
  owner_id: string;
  backup_version: number;
  schema_version: number;
  app_version: string;
  created_at: string;
  updated_at: string;
  userCount?: number;
  ipoCount?: number;
  applicationCount?: number;
  bankCount?: number;
  allotmentCount?: number;
}

export interface CloudBackupResult {
  success: boolean;
  backupId?: string;
  uploadedAt?: string;
  imagesUploaded: number;
  isPending?: boolean;
  error?: string;
}

export interface CloudRestoreResult {
  success: boolean;
  restoredAt?: string;
  imagesRestored: number;
  userCount: number;
  ipoCount: number;
  applicationCount: number;
  bankCount: number;
  allotmentCount?: number;
  error?: string;
}

// Global Service Concurrency Lock & Status Flags
let isBackupInProgress = false;
let isBackupPending = false;
let isRestoringInProgress = false;
let autoBackupDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function isRestoreInProgress(): boolean {
  return isRestoringInProgress;
}

export function isCloudBackupInProgress(): boolean {
  return isBackupInProgress;
}

export function isCloudBackupPending(): boolean {
  return isBackupPending;
}

function getNodeFs(): any {
  try {
    return eval("require")('fs');
  } catch {
    return null;
  }
}

/**
 * Converts a Base64 payload or local file URI into a Uint8Array buffer for Supabase Storage upload
 */
export async function uriToUint8Array(uri: string): Promise<{ buffer: Uint8Array; mimeType: string; ext: string } | null> {
  if (!uri) return null;
  try {
    const base64DataUrl = await ensureBase64DataUrl(uri);
    const payload = extractBase64Payload(base64DataUrl);
    if (!payload || !payload.base64Data) return null;

    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(payload.base64Data, 'base64');
      return {
        buffer: new Uint8Array(buf),
        mimeType: payload.mimeType,
        ext: payload.ext,
      };
    } else if (typeof atob === 'function') {
      const binaryString = atob(payload.base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return {
        buffer: bytes,
        mimeType: payload.mimeType,
        ext: payload.ext,
      };
    } else {
      const nodeFs = getNodeFs();
      if (nodeFs) {
        const buf = Buffer.from(payload.base64Data, 'base64');
        return {
          buffer: new Uint8Array(buf),
          mimeType: payload.mimeType,
          ext: payload.ext,
        };
      }
      return null;
    }
  } catch (err) {
    console.warn('[cloudBackupService] Error converting URI to Uint8Array:', err);
    return null;
  }
}

/**
 * Uploads a single image asset to private Supabase Storage bucket 'user-backups'
 * Uses stable, deterministic Object Paths: <auth_uid>/images/<prefix>_<id>.<ext>
 * ALWAYS returns the relative Storage Object Path (<auth_uid>/images/...), NEVER a public URL.
 */
export async function uploadImageToStorage(
  authUid: string,
  localUri: string,
  prefix: string,
  id: string
): Promise<{ storagePath: string } | null> {
  if (!localUri || !authUid) return null;
  try {
    const converted = await uriToUint8Array(localUri);
    if (!converted) return null;

    // Stable, deterministic object filename
    const filename = `${prefix}_${id}.${converted.ext}`;
    const storagePath = `${authUid}/images/${filename}`;

    const { error } = await supabase.storage
      .from('user-backups')
      .upload(storagePath, converted.buffer, {
        contentType: converted.mimeType,
        upsert: true,
      });

    if (error) {
      console.warn(`[cloudBackupService] Storage upload error for ${storagePath}:`, error.message);
      return null;
    }

    return { storagePath };
  } catch (err) {
    console.warn('[cloudBackupService] Upload image exception:', err);
    return null;
  }
}

/**
 * Downloads a single image from private Supabase Storage using authenticated download API
 * Writes recreated image file locally to FileSystem.documentDirectory + 'images/'
 */
export async function downloadStorageImageToLocal(
  storagePath: string,
  prefix: string,
  id: string
): Promise<string | null> {
  if (!storagePath) return null;
  try {
    let cleanPath = storagePath.trim();
    if (cleanPath.includes('/user-backups/')) {
      cleanPath = cleanPath.split('/user-backups/').pop() || cleanPath;
    }

    const { data, error } = await supabase.storage
      .from('user-backups')
      .download(cleanPath);

    if (error || !data) {
      console.warn(`[cloudBackupService] Authenticated storage download error for ${cleanPath}:`, error?.message);
      return null;
    }

    let base64Data = '';
    if (typeof data.arrayBuffer === 'function') {
      const arrayBuf = await data.arrayBuffer();
      if (typeof Buffer !== 'undefined') {
        base64Data = Buffer.from(arrayBuf).toString('base64');
      } else {
        const bytes = new Uint8Array(arrayBuf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64Data = btoa(binary);
      }
    }

    if (!base64Data) return null;

    const savedLocalPath = await saveBase64ToLocalImage(
      { mimeType: data.type || 'image/jpeg', data: base64Data },
      prefix,
      id
    );

    return savedLocalPath;
  } catch (err) {
    console.warn('[cloudBackupService] Download image exception:', err);
    return null;
  }
}

/**
 * Creates and uploads a full snapshot backup to Supabase PostgreSQL & Storage.
 * Atomicity Enforced: If ANY required image asset fails to upload, the backup aborts completely
 * and the database snapshot is NOT inserted.
 */
export async function createCloudBackup(
  exportJSONFn: () => Promise<string>,
  options?: { isAuto?: boolean }
): Promise<CloudBackupResult> {
  // Service Mutex Check
  if (isBackupInProgress) {
    isBackupPending = true;
    return {
      success: false,
      imagesUploaded: 0,
      isPending: true,
      error: 'Backup already in progress; changes queued for next run.',
    };
  }

  isBackupInProgress = true;
  let imagesUploaded = 0;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user || !user.id) {
      isBackupPending = true;
      return {
        success: false,
        imagesUploaded: 0,
        error: 'Not authenticated with Supabase. Cloud backup skipped.',
      };
    }

    const authUid = user.id;

    // 1. Generate Local Snapshot Payload
    const rawJsonStr = await exportJSONFn();
    const backupObj = JSON.parse(rawJsonStr);

    // 2. Discover and Upload ALL Image Assets with Atomic Failure Check
    if (backupObj.users && Array.isArray(backupObj.users)) {
      for (const u of backupObj.users) {
        const avatarUri = u.avatar_url || u.avatar?.data || (u.avatar_data ? `data:image/png;base64,${u.avatar_data}` : '');
        if (avatarUri && typeof avatarUri === 'string' && !avatarUri.includes('/user-backups/')) {
          const uploadRes = await uploadImageToStorage(authUid, avatarUri, 'avatar', u.id || 'user');
          if (!uploadRes || !uploadRes.storagePath) {
            // ATOMIC FAILURE: Image upload failed, abort backup completely!
            console.error(`[cloudBackupService] Backup failed: Avatar upload failed for user ${u.id}`);
            isBackupPending = true;
            return {
              success: false,
              imagesUploaded,
              error: `Backup failed: Failed to upload required avatar image for user ${u.name || u.id}. Database snapshot not inserted.`,
            };
          }
          // Store canonical Storage Object Path ONLY (never public URL or file:// URI)
          u.avatar_url = uploadRes.storagePath;
          u.storage_path = uploadRes.storagePath;
          delete u.avatar; // Strip embedded Base64 payload
          imagesUploaded++;
        }
      }
    }

    if (backupObj.ipos && Array.isArray(backupObj.ipos)) {
      for (const ipo of backupObj.ipos) {
        const logoUri = ipo.logo_url || ipo.companyLogo?.data || '';
        if (logoUri && typeof logoUri === 'string' && !logoUri.includes('/user-backups/')) {
          const uploadRes = await uploadImageToStorage(authUid, logoUri, 'logo', ipo.id || 'ipo');
          if (!uploadRes || !uploadRes.storagePath) {
            // ATOMIC FAILURE: Image upload failed, abort backup completely!
            console.error(`[cloudBackupService] Backup failed: Logo upload failed for IPO ${ipo.id}`);
            isBackupPending = true;
            return {
              success: false,
              imagesUploaded,
              error: `Backup failed: Failed to upload required logo image for IPO ${ipo.ipo_name || ipo.id}. Database snapshot not inserted.`,
            };
          }
          // Store canonical Storage Object Path ONLY
          ipo.logo_url = uploadRes.storagePath;
          ipo.storage_path = uploadRes.storagePath;
          delete ipo.companyLogo; // Strip embedded Base64 payload
          imagesUploaded++;
        }
      }
    }

    const nowIso = new Date().toISOString();

    // 3. Insert PostgreSQL Snapshot Row
    const { data: insertedRow, error: dbErr } = await supabase
      .from('user_backups')
      .insert({
        owner_id: authUid,
        backup_version: SUPPORTED_BACKUP_VERSION,
        schema_version: CURRENT_SCHEMA_VERSION,
        app_version: CURRENT_APP_VERSION,
        payload: backupObj,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, created_at')
      .single();

    if (dbErr) {
      console.error('[cloudBackupService] Database insert error:', dbErr);
      isBackupPending = true;
      return {
        success: false,
        imagesUploaded,
        error: `Cloud backup failed: ${dbErr.message}`,
      };
    }

    if (!isBackupPending) {
      isBackupPending = false;
    }
    await safeAsyncStorage.setItem(LAST_CLOUD_BACKUP_KEY, nowIso);

    return {
      success: true,
      backupId: insertedRow?.id,
      uploadedAt: nowIso,
      imagesUploaded,
    };
  } catch (err: any) {
    console.error('[cloudBackupService] Exception during createCloudBackup:', err);
    isBackupPending = true;
    return {
      success: false,
      imagesUploaded: 0,
      error: err?.message || 'Unexpected cloud backup failure',
    };
  } finally {
    isBackupInProgress = false;

    // Coalesced queued backup check: if mutations occurred while backup was running, trigger follow-up run
    if (isBackupPending) {
      scheduleDebouncedCloudBackup(exportJSONFn, 10000);
    }
  }
}

/**
 * Fetches latest cloud backup snapshot metadata for the authenticated user
 */
export async function fetchLatestBackupMetadata(): Promise<CloudBackupMetadata | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user || !user.id) return null;

    const { data, error } = await supabase
      .from('user_backups')
      .select('id, owner_id, backup_version, schema_version, app_version, created_at, updated_at, payload')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    const payload = data.payload || {};
    return {
      id: data.id,
      owner_id: data.owner_id,
      backup_version: data.backup_version,
      schema_version: data.schema_version,
      app_version: data.app_version,
      created_at: data.created_at,
      updated_at: data.updated_at,
      userCount: Array.isArray(payload.users) ? payload.users.length : 0,
      ipoCount: Array.isArray(payload.ipos) ? payload.ipos.length : 0,
      applicationCount: Array.isArray(payload.applications) ? payload.applications.length : 0,
      bankCount: Array.isArray(payload.banks) ? payload.banks.length : 0,
      allotmentCount: Array.isArray(payload.allotments) ? payload.allotments.length : 0,
    };
  } catch (err) {
    console.warn('[cloudBackupService] Error fetching latest metadata:', err);
    return null;
  }
}

/**
 * Restores the latest cloud snapshot backup into local SQLite database & local image files.
 * Version & Structure Validation: Validates version compatibility BEFORE modifying local SQLite.
 * Safe Restore: Downloads all images first, then executes transactional import.
 */
export async function restoreCloudBackup(
  importJSONFn: (json: string, options?: { suppressLegacySync?: boolean }) => Promise<any>
): Promise<CloudRestoreResult> {
  if (isRestoringInProgress || isBackupInProgress) {
    return {
      success: false,
      imagesRestored: 0,
      userCount: 0,
      ipoCount: 0,
      applicationCount: 0,
      bankCount: 0,
      allotmentCount: 0,
      error: 'Backup or restore operation already in progress.',
    };
  }

  isRestoringInProgress = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user || !user.id) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: 'Not authenticated with Supabase. Please sign in to restore backups.',
      };
    }

    // 1. Fetch Latest Snapshot Row from PostgreSQL
    const { data: backupRow, error: fetchErr } = await supabase
      .from('user_backups')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchErr || !backupRow || !backupRow.payload) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: fetchErr?.message || 'No cloud backup snapshot found for this user account.',
      };
    }

    // 2. PRE-RESTORE VALIDATION: Check Version Compatibility
    const backupVer = backupRow.backup_version ?? 1;
    const schemaVer = backupRow.schema_version ?? 1;

    if (backupVer > SUPPORTED_BACKUP_VERSION) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: `Cloud backup version (${backupVer}) is not supported by this app (supported: ${SUPPORTED_BACKUP_VERSION}).`,
      };
    }

    if (schemaVer > CURRENT_SCHEMA_VERSION) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: `Cloud backup schema version (${schemaVer}) is higher than local database schema version (${CURRENT_SCHEMA_VERSION}). Please update the app.`,
      };
    }

    const payload = JSON.parse(JSON.stringify(backupRow.payload));
    if (typeof payload !== 'object' || !payload) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: 'Malformed cloud backup payload.',
      };
    }

    let imagesRestored = 0;

    // 3. Download All Required Images BEFORE Modifying Local Database
    if (payload.users && Array.isArray(payload.users)) {
      for (const u of payload.users) {
        const path = u.storage_path || u.avatar_url;
        if (path && typeof path === 'string' && (path.includes('/') || path.includes('avatar_'))) {
          const restoredLocalPath = await downloadStorageImageToLocal(path, 'avatar', u.id || 'user');
          if (restoredLocalPath) {
            u.avatar_url = restoredLocalPath;
            imagesRestored++;
          }
        }
      }
    }

    if (payload.ipos && Array.isArray(payload.ipos)) {
      for (const ipo of payload.ipos) {
        const path = ipo.storage_path || ipo.logo_url;
        if (path && typeof path === 'string' && (path.includes('/') || path.includes('logo_'))) {
          const restoredLocalPath = await downloadStorageImageToLocal(path, 'logo', ipo.id || 'ipo');
          if (restoredLocalPath) {
            ipo.logo_url = restoredLocalPath;
            imagesRestored++;
          }
        }
      }
    }

    // 4. Execute Transactional importJSON (suppressing legacy sync queue)
    const restoreJsonStr = JSON.stringify(payload);
    const importResult = await importJSONFn(restoreJsonStr, { suppressLegacySync: true });

    const nowIso = new Date().toISOString();

    return {
      success: true,
      restoredAt: nowIso,
      imagesRestored,
      userCount: importResult?.users || (payload.users?.length ?? 0),
      ipoCount: importResult?.ipos || (payload.ipos?.length ?? 0),
      applicationCount: importResult?.applications || (payload.applications?.length ?? 0),
      bankCount: importResult?.banks || (payload.banks?.length ?? 0),
      allotmentCount: importResult?.allotments || (payload.allotments?.length ?? 0),
    };
  } catch (err: any) {
    console.error('[cloudBackupService] Restore exception:', err);
    return {
      success: false,
      imagesRestored: 0,
      userCount: 0,
      ipoCount: 0,
      applicationCount: 0,
      bankCount: 0,
      allotmentCount: 0,
      error: err?.message || 'Unexpected failure during cloud restore',
    };
  } finally {
    isRestoringInProgress = false;
  }
}

/**
 * Schedules a debounced auto-backup run (10s delay).
 */
export function scheduleDebouncedCloudBackup(
  exportJSONFn: () => Promise<string>,
  delayMs: number = 10000
) {
  if (isRestoringInProgress) return;
  isBackupPending = true;

  if (autoBackupDebounceTimer) {
    clearTimeout(autoBackupDebounceTimer);
  }

  autoBackupDebounceTimer = setTimeout(() => {
    autoBackupDebounceTimer = null;
    if (networkService.isOnline() && !isRestoringInProgress && !isBackupInProgress) {
      createCloudBackup(exportJSONFn, { isAuto: true }).catch((err) => {
        console.warn('[cloudBackupService] Auto backup error:', err);
      });
    }
  }, delayMs);
}

// ── Register Offline / Reconnect Listener ────────────────────────────────────
networkService.onReconnect(() => {
  if (isBackupPending && !isBackupInProgress && !isRestoringInProgress) {
    console.log('[cloudBackupService] Internet reconnected. Triggering pending cloud backup.');
  }
});
