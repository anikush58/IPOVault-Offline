import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { networkService } from '@/services/infrastructure/networkService';
import { getEffectiveAvatarUrl } from '@/utils/avatarUtils';
import {
  getValidAccessToken,
  getGoogleAuthSession,
  disconnectGoogleDrive,
  LAST_CLOUD_BACKUP_KEY,
} from './googleDriveAuthService';

export { LAST_CLOUD_BACKUP_KEY };

export const BACKUP_FILE_NAME = 'ipovault_backup.json';
export const SUPPORTED_BACKUP_VERSION = 1;
export const CURRENT_SCHEMA_VERSION = 3;
export const CURRENT_APP_VERSION = '2.0.2';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

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

/**
 * Legacy compatibility stubs (Supabase Storage image assets are replaced with direct Google Drive AppData JSON)
 */
export async function uploadImageToStorage(
  _authUid: string,
  _localUri: string,
  _prefix: string,
  _id: string,
  _entityName: string = 'Asset'
): Promise<{ storagePath: string } | null> {
  return null;
}

export async function downloadStorageImageToLocal(
  _storagePath: string,
  _prefix: string,
  _id: string
): Promise<string | null> {
  return null;
}

export async function uriToUint8Array(
  _uri: string
): Promise<{ buffer: Uint8Array; mimeType: string; ext: string } | null> {
  return null;
}

export async function validateAndUploadImageAsset(
  _authUid: string,
  _localUri: string,
  _prefix: string,
  _id: string,
  _entityName: string = 'Asset'
): Promise<{ success: boolean; storagePath?: string; errorMessage?: string; errorPhase?: string }> {
  return { success: true };
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

/**
 * Searches the user's private Google Drive AppData folder for the IPOVault backup file.
 */
async function findBackupFileInAppData(
  accessToken: string
): Promise<{ id: string; name: string; modifiedTime?: string; appProperties?: Record<string, string> } | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  const url = `${DRIVE_FILES_API}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime,size,appProperties)&pageSize=1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    throw new Error('AUTH_EXPIRED');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (Array.isArray(data.files) && data.files.length > 0) {
    return data.files[0];
  }

  return null;
}

/**
 * Creates and uploads a full snapshot backup to Google Drive private AppData storage.
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

  try {
    const accessToken = await getValidAccessToken();
    const session = await getGoogleAuthSession();

    if (!accessToken || !session) {
      isBackupPending = true;
      return {
        success: false,
        imagesUploaded: 0,
        error: 'Google Drive is not connected. Please connect your Google account.',
      };
    }

    const authUid = session.user?.email || 'google-drive-user';

    // 1. Generate Local Snapshot Payload
    const rawJsonStr = await exportJSONFn();
    const backupObj = JSON.parse(rawJsonStr);

    // 2. Process User Avatars (URL/String only, ensures portable DiceBear / https avatars)
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

    // 3. Process IPO Logos (preserves remote HTTPS URLs, strips non-portable local cache URIs)
    if (backupObj.ipos && Array.isArray(backupObj.ipos)) {
      for (const ipo of backupObj.ipos) {
        const rawLogo =
          ipo.logo_url ||
          (typeof ipo.companyLogo === 'string'
            ? ipo.companyLogo
            : ipo.companyLogo?.data) ||
          '';
        const logoUri = typeof rawLogo === 'string' ? rawLogo.trim() : '';

        if (!logoUri) {
          ipo.logo_url = null;
          delete ipo.storage_path;
          delete ipo.companyLogo;
          continue;
        }

        // Remote HTTP/HTTPS URL -> preserve unchanged
        if (/^https?:\/\//i.test(logoUri)) {
          ipo.logo_url = logoUri;
          delete ipo.storage_path;
          delete ipo.companyLogo;
          continue;
        }

        // Local / Data URI -> clean to null for portability
        ipo.logo_url = null;
        delete ipo.storage_path;
        delete ipo.companyLogo;
      }
    }

    const nowIso = new Date().toISOString();
    const sanitizedJsonStr = JSON.stringify(backupObj, null, 2);

    // 4. Check for existing backup in appDataFolder
    let existingFile: { id: string } | null = null;
    try {
      existingFile = await findBackupFileInAppData(accessToken);
    } catch (findErr: any) {
      if (findErr?.message === 'AUTH_EXPIRED') {
        await disconnectGoogleDrive();
        return {
          success: false,
          imagesUploaded: 0,
          error: 'Google session expired. Please connect Google Drive again.',
        };
      }
      throw findErr;
    }

    // 5. Construct Multipart Upload Payload for Google Drive API
    const boundary = '-------IPOVaultCloudBackupBoundary' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: BACKUP_FILE_NAME,
      parents: existingFile ? undefined : ['appDataFolder'],
      description: 'IPOVault Private Cloud Backup Snapshot',
      mimeType: 'application/json',
      appProperties: {
        app: 'IPOVault',
        appVersion: CURRENT_APP_VERSION,
        backupVersion: String(SUPPORTED_BACKUP_VERSION),
        schemaVersion: String(CURRENT_SCHEMA_VERSION),
        createdAt: nowIso,
        userCount: String(backupObj.users?.length || 0),
        ipoCount: String(backupObj.ipos?.length || 0),
        applicationCount: String(backupObj.applications?.length || 0),
        bankCount: String(backupObj.banks?.length || 0),
        allotmentCount: String(backupObj.allotments?.length || 0),
      },
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      sanitizedJsonStr +
      closeDelimiter;

    let uploadUrl = `${DRIVE_UPLOAD_API}?uploadType=multipart`;
    let method = 'POST';

    if (existingFile && existingFile.id) {
      uploadUrl = `${DRIVE_UPLOAD_API}/${existingFile.id}?uploadType=multipart`;
      method = 'PATCH';
    }

    const uploadResponse = await fetch(uploadUrl, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        Accept: 'application/json',
      },
      body: multipartRequestBody,
    });

    if (uploadResponse.status === 401) {
      await disconnectGoogleDrive();
      return {
        success: false,
        imagesUploaded: 0,
        error: 'Google session expired or revoked. Please connect Google Drive again.',
      };
    }

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[cloudBackupService] Google Drive upload error:', errorText);
      isBackupPending = true;
      return {
        success: false,
        imagesUploaded: 0,
        error: `Google Drive upload failed (${uploadResponse.status}): ${errorText}`,
      };
    }

    const uploadedFile = await uploadResponse.json();

    if (!isBackupPending) {
      isBackupPending = false;
    }
    await safeAsyncStorage.setItem(LAST_CLOUD_BACKUP_KEY, nowIso);

    return {
      success: true,
      backupId: uploadedFile.id,
      uploadedAt: nowIso,
      imagesUploaded: 0,
    };
  } catch (err: any) {
    console.error('[cloudBackupService] Exception during createCloudBackup:', err);
    isBackupPending = true;
    return {
      success: false,
      imagesUploaded: 0,
      error: err?.message || 'Unexpected Google Drive backup failure',
    };
  } finally {
    isBackupInProgress = false;

    if (isBackupPending) {
      scheduleDebouncedCloudBackup(exportJSONFn, 10000);
    }
  }
}

/**
 * Fetches latest cloud backup snapshot metadata from Google Drive AppData
 */
export async function fetchLatestBackupMetadata(): Promise<CloudBackupMetadata | null> {
  try {
    const accessToken = await getValidAccessToken();
    const session = await getGoogleAuthSession();
    if (!accessToken || !session) return null;

    const file = await findBackupFileInAppData(accessToken);
    if (!file) return null;

    const props = file.appProperties || {};
    const createdAt = props.createdAt || file.modifiedTime || new Date().toISOString();

    return {
      id: file.id,
      owner_id: session.user?.email || 'google-drive-user',
      backup_version: parseInt(props.backupVersion || '1', 10),
      schema_version: parseInt(props.schemaVersion || '3', 10),
      app_version: props.appVersion || CURRENT_APP_VERSION,
      created_at: createdAt,
      updated_at: file.modifiedTime || createdAt,
      userCount: props.userCount ? parseInt(props.userCount, 10) : undefined,
      ipoCount: props.ipoCount ? parseInt(props.ipoCount, 10) : undefined,
      applicationCount: props.applicationCount ? parseInt(props.applicationCount, 10) : undefined,
      bankCount: props.bankCount ? parseInt(props.bankCount, 10) : undefined,
      allotmentCount: props.allotmentCount ? parseInt(props.allotmentCount, 10) : undefined,
    };
  } catch (err: any) {
    if (err?.message === 'AUTH_EXPIRED') {
      await disconnectGoogleDrive();
    }
    console.warn('[cloudBackupService] Error fetching latest metadata:', err);
    return null;
  }
}

/**
 * Restores the latest cloud snapshot backup from Google Drive AppData into local SQLite database.
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
    const accessToken = await getValidAccessToken();
    const session = await getGoogleAuthSession();

    if (!accessToken || !session) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: 'Google Drive is not connected. Please connect your Google account to restore backups.',
      };
    }

    // 1. Find Backup File in Google Drive AppData
    let file: { id: string } | null = null;
    try {
      file = await findBackupFileInAppData(accessToken);
    } catch (findErr: any) {
      if (findErr?.message === 'AUTH_EXPIRED') {
        await disconnectGoogleDrive();
        return {
          success: false,
          imagesRestored: 0,
          userCount: 0,
          ipoCount: 0,
          applicationCount: 0,
          bankCount: 0,
          allotmentCount: 0,
          error: 'Google session expired. Please connect Google Drive again.',
        };
      }
      throw findErr;
    }

    if (!file || !file.id) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: 'No cloud backup snapshot found in your Google Drive.',
      };
    }

    // 2. Download File Content from Google Drive
    const downloadUrl = `${DRIVE_FILES_API}/${file.id}?alt=media`;
    const downloadRes = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (downloadRes.status === 401) {
      await disconnectGoogleDrive();
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: 'Google session expired. Please connect Google Drive again.',
      };
    }

    if (!downloadRes.ok) {
      const errorText = await downloadRes.text();
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: `Failed to download backup from Google Drive (${downloadRes.status}): ${errorText}`,
      };
    }

    const rawJsonStr = await downloadRes.text();
    const payload = JSON.parse(rawJsonStr);

    if (typeof payload !== 'object' || !payload) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        allotmentCount: 0,
        error: 'Malformed cloud backup payload received from Google Drive.',
      };
    }

    // 3. Pre-Restore Version Validation
    const backupVer = payload.version ?? payload.backup_version ?? 1;
    const schemaVer = payload.schema_version ?? 1;

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

    // 4. Process Avatars & URLs
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

    // 5. Execute Transactional importJSON
    const restoreJsonStr = JSON.stringify(payload);
    const importResult = await importJSONFn(restoreJsonStr, { suppressLegacySync: true });

    const nowIso = new Date().toISOString();

    return {
      success: true,
      restoredAt: nowIso,
      imagesRestored: 0,
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
      error: err?.message || 'Unexpected failure during Google Drive cloud restore',
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

// Register Offline / Reconnect Listener
networkService.onReconnect(() => {
  if (isBackupPending && !isBackupInProgress && !isRestoringInProgress) {
    console.log('[cloudBackupService] Internet reconnected. Triggering pending Google Drive backup.');
  }
});
