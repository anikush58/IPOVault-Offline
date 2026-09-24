import { useState, useEffect, useCallback } from 'react';
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
import {
  getGoogleAuthSession,
  signInWithGoogleDrive,
  disconnectGoogleDrive,
  GoogleAuthUser,
} from '@/services/cloud/googleDriveAuthService';

export function useCloudBackup() {
  const { exportJSON, importJSON } = useDB();

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [latestMetadata, setLatestMetadata] = useState<CloudBackupMetadata | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleAuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMetadata = useCallback(async () => {
    try {
      const session = await getGoogleAuthSession();
      if (!session) {
        setGoogleUser(null);
        setLastBackupTime(null);
        setLatestMetadata(null);
        return;
      }

      setGoogleUser(session.user);

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
      console.warn('[useCloudBackup] Error loading Google Drive metadata:', err);
    }
  }, []);

  useEffect(() => {
    refreshMetadata();
  }, [refreshMetadata]);

  const connect = async (): Promise<{ success: boolean; error?: string }> => {
    setIsConnecting(true);
    setError(null);
    try {
      const res = await signInWithGoogleDrive();
      if (res.success && res.session) {
        setGoogleUser(res.session.user);
        await refreshMetadata();
        return { success: true };
      } else {
        const errMsg = res.error || 'Google connection failed';
        setError(errMsg);
        return { success: false, error: errMsg };
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Google connection failed';
      setError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    try {
      await disconnectGoogleDrive();
      setGoogleUser(null);
      setLastBackupTime(null);
      setLatestMetadata(null);
    } catch (err) {
      console.warn('[useCloudBackup] Error disconnecting Google Drive:', err);
    }
  };

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
      const errMsg = err?.message || 'Google Drive cloud backup failed';
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
      const errMsg = err?.message || 'Google Drive cloud restore failed';
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
    isAuthenticated: Boolean(googleUser),
    isConnected: Boolean(googleUser),
    userEmail: googleUser?.email ?? null,
    userName: googleUser?.name ?? null,
    isConnecting,
    isBackingUp,
    isRestoring,
    lastBackupTime,
    latestMetadata,
    error,
    connect,
    disconnect,
    backupNow,
    restoreNow,
    refreshMetadata,
  };
}
