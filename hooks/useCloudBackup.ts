import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import {
  createCloudBackup,
  fetchLatestBackupMetadata,
  restoreCloudBackup,
  CloudBackupMetadata,
  CloudBackupResult,
  CloudRestoreResult,
  LAST_CLOUD_BACKUP_KEY,
} from '@/services/cloud/cloudBackupService';

export function useCloudBackup() {
  const { user } = useAuth();
  const { exportJSON, importJSON } = useDB();

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [latestMetadata, setLatestMetadata] = useState<CloudBackupMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load last backup timestamp & latest metadata when user auth state changes
  const refreshMetadata = useCallback(async () => {
    if (!user) {
      setLastBackupTime(null);
      setLatestMetadata(null);
      return;
    }

    try {
      const storedTs = await safeAsyncStorage.getItem(LAST_CLOUD_BACKUP_KEY);
      if (storedTs) setLastBackupTime(storedTs);

      const metadata = await fetchLatestBackupMetadata();
      if (metadata) {
        setLatestMetadata(metadata);
        if (metadata.created_at) {
          setLastBackupTime(metadata.created_at);
          await safeAsyncStorage.setItem(LAST_CLOUD_BACKUP_KEY, metadata.created_at);
        }
      }
    } catch (err) {
      console.warn('[useCloudBackup] Error loading metadata:', err);
    }
  }, [user]);

  useEffect(() => {
    refreshMetadata();
  }, [refreshMetadata]);

  const backupNow = async (): Promise<CloudBackupResult> => {
    if (isBackingUp || isRestoring) {
      return { success: false, imagesUploaded: 0, error: 'Backup or restore operation already in progress' };
    }
    setIsBackingUp(true);
    setError(null);

    try {
      const res = await createCloudBackup(exportJSON);
      if (res.success && res.uploadedAt) {
        setLastBackupTime(res.uploadedAt);
        await refreshMetadata();
      } else if (res.error) {
        setError(res.error);
      }
      return res;
    } catch (err: any) {
      const errMsg = err?.message || 'Cloud backup failed';
      setError(errMsg);
      return { success: false, imagesUploaded: 0, error: errMsg };
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreNow = async (): Promise<CloudRestoreResult> => {
    if (isBackingUp || isRestoring) {
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        error: 'Backup or restore operation already in progress',
      };
    }
    setIsRestoring(true);
    setError(null);

    try {
      const res = await restoreCloudBackup(importJSON);
      if (res.error) {
        setError(res.error);
      } else {
        await refreshMetadata();
      }
      return res;
    } catch (err: any) {
      const errMsg = err?.message || 'Cloud restore failed';
      setError(errMsg);
      return {
        success: false,
        imagesRestored: 0,
        userCount: 0,
        ipoCount: 0,
        applicationCount: 0,
        bankCount: 0,
        error: errMsg,
      };
    } finally {
      setIsRestoring(false);
    }
  };

  return {
    isAuthenticated: !!user,
    userEmail: user?.email ?? null,
    isBackingUp,
    isRestoring,
    lastBackupTime,
    latestMetadata,
    error,
    backupNow,
    restoreNow,
    refreshMetadata,
  };
}
