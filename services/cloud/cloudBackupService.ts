import {
  syncUserDataToFirestore,
  fetchUserDataFromFirestore,
  getCloudSyncMetadata,
  scheduleDebouncedFirestoreSync,
  isCloudSyncBusy,
  LAST_FIRESTORE_SYNC_KEY as LAST_CLOUD_BACKUP_KEY,
  IPOVaultExportData,
  CloudSyncMetadata,
} from './firestoreSyncService';

export { LAST_CLOUD_BACKUP_KEY };

export const BACKUP_FILE_NAME = 'ipovault_backup.json';
export const SUPPORTED_BACKUP_VERSION = 1;
export const CURRENT_SCHEMA_VERSION = 3;
export const CURRENT_APP_VERSION = '2.0.2';

export type CloudBackupMetadata = CloudSyncMetadata;

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

export function isRestoreInProgress(): boolean {
  return isCloudSyncBusy();
}

export function isBackupActive(): boolean {
  return isCloudSyncBusy();
}

export async function createCloudBackup(
  exportJSONFn: () => Promise<string>,
  options?: { isAuto?: boolean; uid?: string }
): Promise<CloudBackupResult> {
  const uid = options?.uid;
  if (!uid) {
    return { success: false, imagesUploaded: 0, error: 'User is not authenticated.' };
  }
  try {
    const jsonStr = await exportJSONFn();
    const data = JSON.parse(jsonStr) as IPOVaultExportData;
    const res = await syncUserDataToFirestore(uid, data);
    return {
      success: res.success,
      uploadedAt: res.syncedAt,
      imagesUploaded: 0,
      error: res.error,
    };
  } catch (err: any) {
    return {
      success: false,
      imagesUploaded: 0,
      error: err?.message || 'Cloud backup failed.',
    };
  }
}

export async function restoreCloudBackup(
  importJSONFn: (jsonString: string, options?: any) => Promise<any>,
  uid?: string
): Promise<CloudRestoreResult> {
  if (!uid) {
    return {
      success: false,
      imagesRestored: 0,
      userCount: 0,
      ipoCount: 0,
      applicationCount: 0,
      bankCount: 0,
      error: 'User is not authenticated.',
    };
  }
  try {
    const res = await fetchUserDataFromFirestore(uid);
    if (!res.success || !res.data) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        error: res.error || 'No cloud data found.',
      };
    }
    const importRes = await importJSONFn(JSON.stringify(res.data), {
      suppressLegacySync: true,
    });
    return {
      success: true,
      restoredAt: res.restoredAt,
      imagesRestored: 0,
      userCount: importRes.users || 0,
      ipoCount: importRes.ipos || 0,
      applicationCount: importRes.applications || 0,
      bankCount: importRes.banks || 0,
      allotmentCount: importRes.allotments || 0,
    };
  } catch (err: any) {
    return {
      success: false,
      imagesRestored: 0,
      userCount: 0,
      ipoCount: 0,
      applicationCount: 0,
      bankCount: 0,
      error: err?.message || 'Restore failed.',
    };
  }
}

export function scheduleDebouncedCloudBackup(
  exportJSONFn: () => Promise<string>,
  delayMs: number = 8000,
  uid?: string
): void {
  scheduleDebouncedFirestoreSync(exportJSONFn, uid, delayMs);
}
