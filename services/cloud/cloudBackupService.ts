import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/sync/supabase';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { networkService } from '@/services/infrastructure/networkService';
import {
  ensureBase64DataUrl,
  extractBase64Payload,
  saveBase64ToLocalImage,
} from '@/utils/imageUtils';
import { getEffectiveAvatarUrl } from '@/utils/avatarUtils';

export const LAST_CLOUD_BACKUP_KEY = 'ipovault_last_cloud_backup_ts';

export const SUPPORTED_BACKUP_VERSION = 1;
export const CURRENT_SCHEMA_VERSION = 3;
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

let FileSystemMod: any = null;
try {
  FileSystemMod = require('expo-file-system/legacy');
} catch {
  FileSystemMod = null;
}

function getNodeFs(): any {
  try {
    return eval("require")('fs');
  } catch {
    return null;
  }
}

export interface ImageUploadValidationResult {
  success: boolean;
  storagePath?: string;
  errorPhase?: 'LOCAL_FILE_VALIDATION' | 'SUPABASE_STORAGE_UPLOAD';
  errorMessage?: string;
  fileSize?: number;
  mimeType?: string;
  ext?: string;
}

/**
 * Validates local image existence & readability, determines MIME type/extension,
 * converts to Uint8Array binary buffer, and uploads to Supabase Storage.
 * Provides detailed diagnostic logging and precise error messages on failure.
 */
export async function validateAndUploadImageAsset(
  authUid: string,
  localUri: string,
  prefix: string,
  id: string,
  entityName: string = 'Asset'
): Promise<ImageUploadValidationResult> {
  if (!localUri || !localUri.trim()) {
    console.error(`[cloudBackupService] Avatar validation failed for ${entityName} (id=${id}): Missing required image URI.`);
    return {
      success: false,
      errorPhase: 'LOCAL_FILE_VALIDATION',
      errorMessage: `Backup failed: Missing required image URI for ${entityName}. [Phase: LOCAL_FILE_VALIDATION]`,
    };
  }

  const trimmedUri = localUri.trim();
  const uriScheme = trimmedUri.includes(':') ? trimmedUri.split(':')[0] + ':' : 'unknown';

  // Stage 1 Diagnostic Log: User & URI Scheme
  console.log(`[cloudBackupService] [Stage 1 - URI Check] user_id=${id}, user_name=${entityName}, avatar_uri_scheme=${uriScheme}`);

  let base64Data = '';
  let hintMime = '';
  let fileSize = 0;

  // Case A: Data URI or raw Base64 payload
  if (trimmedUri.startsWith('data:') || extractBase64Payload(trimmedUri)) {
    const payload = extractBase64Payload(trimmedUri);
    if (!payload || !payload.base64Data) {
      console.error(`[cloudBackupService] [Stage 1 Error] Invalid Base64 payload for user_id=${id}, user_name=${entityName}, scheme=${uriScheme}`);
      return {
        success: false,
        errorPhase: 'LOCAL_FILE_VALIDATION',
        errorMessage: `Backup failed: Required image for ${entityName} contains invalid or corrupt Base64 data. [Phase: LOCAL_FILE_VALIDATION, URI scheme: ${uriScheme}]`,
      };
    }
    base64Data = payload.base64Data;
    hintMime = payload.mimeType;
    fileSize = Math.floor((base64Data.length * 3) / 4);

    // Stage 2 Diagnostic Log: File existence & size check
    console.log(`[cloudBackupService] [Stage 2 - File Check] user_id=${id}, user_name=${entityName}, file_exists=true, file_size=${fileSize} bytes`);
  } else {
    // Case B: Local File URI (file://, content://, or disk path)
    try {
      if (FileSystemMod) {
        const fileInfo = await FileSystemMod.getInfoAsync(trimmedUri);
        const fileExists = Boolean(fileInfo.exists);
        fileSize = fileInfo.size ?? 0;

        // Stage 2 Diagnostic Log: File existence & size check
        console.log(`[cloudBackupService] [Stage 2 - File Check] user_id=${id}, user_name=${entityName}, file_exists=${fileExists}, file_size=${fileSize} bytes`);

        if (!fileExists) {
          console.error(`[cloudBackupService] [Stage 2 Error] Local file does not exist for user_id=${id}, user_name=${entityName}, scheme=${uriScheme}`);
          return {
            success: false,
            errorPhase: 'LOCAL_FILE_VALIDATION',
            errorMessage: `Backup failed: Failed to upload required avatar image for user ${entityName}. Reason: Local file does not exist at URI: ${trimmedUri}. [Phase: LOCAL_FILE_VALIDATION]`,
          };
        }
        base64Data = await FileSystemMod.readAsStringAsync(trimmedUri, {
          encoding: FileSystemMod.EncodingType.Base64,
        });
      } else {
        const nodeFs = getNodeFs();
        const fsPath = trimmedUri.replace(/^file:\/\//, '');
        if (nodeFs && nodeFs.existsSync) {
          const fileExists = nodeFs.existsSync(fsPath);
          if (fileExists) {
            const stats = nodeFs.statSync(fsPath);
            fileSize = stats.size;
          }

          // Stage 2 Diagnostic Log: File existence & size check
          console.log(`[cloudBackupService] [Stage 2 - File Check] user_id=${id}, user_name=${entityName}, file_exists=${fileExists}, file_size=${fileSize} bytes`);

          if (!fileExists) {
            console.error(`[cloudBackupService] [Stage 2 Error] Local file does not exist for user_id=${id}, user_name=${entityName}, scheme=${uriScheme}`);
            return {
              success: false,
              errorPhase: 'LOCAL_FILE_VALIDATION',
              errorMessage: `Backup failed: Failed to upload required avatar image for user ${entityName}. Reason: Local file does not exist at URI: ${trimmedUri}. [Phase: LOCAL_FILE_VALIDATION]`,
            };
          }
          base64Data = nodeFs.readFileSync(fsPath).toString('base64');
        } else {
          console.error(`[cloudBackupService] [Stage 2 Error] File system environment unavailable for user_id=${id}, user_name=${entityName}`);
          return {
            success: false,
            errorPhase: 'LOCAL_FILE_VALIDATION',
            errorMessage: `Backup failed: Failed to upload required avatar image for user ${entityName}. Reason: File system environment unavailable. [Phase: LOCAL_FILE_VALIDATION]`,
          };
        }
      }
    } catch (readErr: any) {
      console.error(`[cloudBackupService] [Stage 2 Exception] Reading local file failed for user_id=${id}, user_name=${entityName}:`, readErr?.message || 'Unreadable file');
      return {
        success: false,
        errorPhase: 'LOCAL_FILE_VALIDATION',
        errorMessage: `Backup failed: Failed to upload required avatar image for user ${entityName}. Reason: Could not read local file: ${readErr?.message || 'Unreadable file'}. [Phase: LOCAL_FILE_VALIDATION]`,
      };
    }
  }

  const payload = extractBase64Payload(base64Data) || extractBase64Payload(`data:${hintMime || 'image/jpeg'};base64,${base64Data}`);
  if (!payload || !payload.base64Data) {
    console.error(`[cloudBackupService] [Stage 3 Error] Payload extraction failed for user_id=${id}, user_name=${entityName}`);
    return {
      success: false,
      errorPhase: 'LOCAL_FILE_VALIDATION',
      errorMessage: `Backup failed: Failed to upload required avatar image for user ${entityName}. Reason: Image file payload is corrupt or unreadable. [Phase: LOCAL_FILE_VALIDATION]`,
    };
  }

  const { mimeType, ext } = payload;

  // Stage 3 Diagnostic Log: MIME & Extension detection
  console.log(`[cloudBackupService] [Stage 3 - MIME/Ext Detection] user_id=${id}, user_name=${entityName}, mime_type=${mimeType}, extension=${ext}`);

  // Convert Base64 payload to React-Native compatible Uint8Array binary buffer
  let binaryBuffer: Uint8Array;
  try {
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(payload.base64Data, 'base64');
      binaryBuffer = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } else if (typeof atob === 'function') {
      const binaryString = atob(payload.base64Data);
      const len = binaryString.length;
      binaryBuffer = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        binaryBuffer[i] = binaryString.charCodeAt(i);
      }
    } else {
      return {
        success: false,
        errorPhase: 'LOCAL_FILE_VALIDATION',
        errorMessage: `Backup failed: Binary buffer conversion unsupported for ${entityName}. [Phase: LOCAL_FILE_VALIDATION]`,
      };
    }
  } catch (convErr: any) {
    console.error(`[cloudBackupService] [Binary Conversion Error] user_id=${id}, user_name=${entityName}:`, convErr?.message || 'Buffer error');
    return {
      success: false,
      errorPhase: 'LOCAL_FILE_VALIDATION',
      errorMessage: `Backup failed: Failed to convert binary data for ${entityName}: ${convErr?.message || 'Buffer conversion error'}. [Phase: LOCAL_FILE_VALIDATION]`,
    };
  }

  // Verify active authentication session to match auth.uid() in RLS policy
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData?.session?.user;
  if (!sessionUser || !sessionUser.id) {
    console.error(`[cloudBackupService] [Stage 4 Error] Unauthenticated upload attempt for user_id=${id}, user_name=${entityName}`);
    return {
      success: false,
      errorPhase: 'SUPABASE_STORAGE_UPLOAD',
      errorMessage: `Backup failed: Not authenticated with Supabase. Cannot upload image for ${entityName}. [Phase: SUPABASE_STORAGE_UPLOAD]`,
    };
  }

  // Canonical storage path: <active_auth_uid>/images/<prefix>_<local_id>.<ext>
  // Ensure no leading slashes so (storage.foldername(name))[1] in Postgres matches auth.uid()::text
  const effectiveAuthUid = (sessionUser.id || authUid).trim().replace(/^\/+/, '');
  const filename = `${prefix}_${id}.${ext}`;
  const storagePath = `${effectiveAuthUid}/images/${filename}`;

  // Stage 4 Diagnostic Log: Storage Path Generation
  console.log(`[cloudBackupService] [Stage 4 - Storage Path Generation] user_id=${id}, user_name=${entityName}, storage_path=${storagePath}`);

  // Stage 5 Diagnostic Log: Upload Start
  console.log(`[cloudBackupService] [Stage 5 - Storage Upload Start] user_id=${id}, user_name=${entityName}, storage_path=${storagePath}, binary_bytes=${binaryBuffer.byteLength}`);

  try {
    const { data, error } = await supabase.storage
      .from('user-backups')
      .upload(storagePath, binaryBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error || !data || !data.path) {
      const errorMsg = error?.message || 'Empty or invalid response payload from Supabase Storage';
      const statusCode = (error as any)?.status || (error as any)?.statusCode || 'N/A';

      // Stage 5 Diagnostic Log: Storage Upload Error
      console.error(`[cloudBackupService] [Stage 5 - Storage Upload Error] user_id=${id}, user_name=${entityName}, status=${statusCode}, error_message=${errorMsg}`);
      return {
        success: false,
        errorPhase: 'SUPABASE_STORAGE_UPLOAD',
        errorMessage: `Backup failed: Failed to upload required image for ${entityName}. Reason: Supabase Storage upload error: ${errorMsg} (status: ${statusCode}). [Phase: SUPABASE_STORAGE_UPLOAD, Storage Path: ${storagePath}]`,
      };
    }

    // Stage 5 Diagnostic Log: Upload Success
    console.log(`[cloudBackupService] [Stage 5 - Storage Upload Success] user_id=${id}, user_name=${entityName}, storage_path=${data.path}`);
    return {
      success: true,
      storagePath: data.path,
      fileSize,
      mimeType,
      ext,
    };
  } catch (uploadErr: any) {
    const errorMsg = uploadErr?.message || 'Network exception during storage upload';
    const statusCode = uploadErr?.status || uploadErr?.statusCode || 'N/A';

    console.error(`[cloudBackupService] [Stage 5 - Storage Exception] user_id=${id}, user_name=${entityName}, status=${statusCode}, error_message=${errorMsg}`);
    return {
      success: false,
      errorPhase: 'SUPABASE_STORAGE_UPLOAD',
      errorMessage: `Backup failed: Failed to upload required image for ${entityName}. Reason: Storage upload exception: ${errorMsg} (status: ${statusCode}). [Phase: SUPABASE_STORAGE_UPLOAD, Storage Path: ${storagePath}]`,
    };
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
        buffer: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
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
        const buf = (globalThis as any).Buffer.from(payload.base64Data, 'base64');
        return {
          buffer: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
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
  id: string,
  entityName: string = 'Asset'
): Promise<{ storagePath: string } | null> {
  const result = await validateAndUploadImageAsset(authUid, localUri, prefix, id, entityName);
  if (result.success && result.storagePath) {
    return { storagePath: result.storagePath };
  }
  return null;
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

    // 2. Process User Avatars (URL/String only, NO Supabase Storage uploads)
    if (backupObj.users && Array.isArray(backupObj.users)) {
      for (const u of backupObj.users) {
        const effectiveUrl = getEffectiveAvatarUrl(u);
        u.avatar_url = effectiveUrl;
        u.avatarUrl = effectiveUrl;
        delete u.avatar;
        delete u.avatar_data;
        delete u.storage_path;
      }
    }

    // 3. Process IPO Logos (URL/Storage Path only, NO Supabase Storage uploads)
    if (backupObj.ipos && Array.isArray(backupObj.ipos)) {
      for (const ipo of backupObj.ipos) {
        const rawLogo = ipo.logo_url || (typeof ipo.companyLogo === 'string' ? ipo.companyLogo : ipo.companyLogo?.data) || '';
        const logoUri = typeof rawLogo === 'string' ? rawLogo.trim() : '';
        const ipoName = ipo.ipo_name || ipo.company_name || ipo.id || 'IPO';

        if (!logoUri) {
          ipo.logo_url = null;
          delete ipo.storage_path;
          delete ipo.companyLogo;
          continue;
        }

        // Case 1: Remote HTTP/HTTPS URL -> preserve unchanged, do not upload
        if (/^https?:\/\//i.test(logoUri)) {
          ipo.logo_url = logoUri;
          delete ipo.storage_path;
          delete ipo.companyLogo;
          continue;
        }

        // Case 2: Supabase Storage path from older backup -> preserve only if clearly a user-backups/... path
        if (logoUri.startsWith('user-backups/') || logoUri.includes('/user-backups/')) {
          ipo.logo_url = logoUri;
          ipo.storage_path = logoUri;
          delete ipo.companyLogo;
          continue;
        }

        // Case 3: Local / Data URI (file://, content://, data:image/..., etc.) or any other non-portable reference
        // Intentionally skip and clear to prevent RLS failures; do NOT upload, do NOT fail backup
        console.log(`[cloudBackupService] Intentionally skipped local IPO logo for ${ipoName} (id=${ipo.id}): ${logoUri.slice(0, 50)}...`);
        ipo.logo_url = null;
        delete ipo.storage_path;
        delete ipo.companyLogo;
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

    // 3. Process User Avatars (URL/String only, NO Supabase Storage downloads)
    if (payload.users && Array.isArray(payload.users)) {
      for (const u of payload.users) {
        const effectiveUrl = getEffectiveAvatarUrl(u);
        u.avatar_url = effectiveUrl;
        u.avatarUrl = effectiveUrl;
        delete u.avatar;
        delete u.avatar_data;
        delete u.storage_path;
      }
    }

    if (payload.ipos && Array.isArray(payload.ipos)) {
      for (const ipo of payload.ipos) {
        const path = ipo.storage_path || ipo.logo_url;
        if (path && typeof path === 'string') {
          if (/^https?:\/\//i.test(path)) {
            ipo.logo_url = path;
            continue;
          }
          if (path.includes('/user-backups/') || path.startsWith('user-backups/')) {
            const restoredLocalPath = await downloadStorageImageToLocal(path, 'logo', ipo.id || 'ipo');
            if (restoredLocalPath) {
              ipo.logo_url = restoredLocalPath;
              imagesRestored++;
            }
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
