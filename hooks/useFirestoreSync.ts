import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import {
  syncUserDataToFirestore,
  fetchUserDataFromFirestore,
  getCloudSyncMetadata,
  CloudSyncMetadata,
  LAST_FIRESTORE_SYNC_KEY,
  IPOVaultExportData,
} from '@/services/cloud/firestoreSyncService';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';

export interface UseFirestoreSyncReturn {
  isAuthenticated: boolean;
  userEmail: string | null;
  userId: string | null;
  isSyncing: boolean;
  isRestoring: boolean;
  lastSyncTime: string | null;
  latestMetadata: CloudSyncMetadata | null;
  syncNow: () => Promise<{ success: boolean; error?: string }>;
  restoreNow: () => Promise<{
    success: boolean;
    userCount?: number;
    ipoCount?: number;
    applicationCount?: number;
    bankCount?: number;
    allotmentCount?: number;
    error?: string;
  }>;
  refreshMetadata: () => Promise<void>;
}

export function useFirestoreSync(): UseFirestoreSyncReturn {
  const { user } = useAuth();
  const { exportJSON, importJSON, refresh } = useDB();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [latestMetadata, setLatestMetadata] = useState<CloudSyncMetadata | null>(null);

  const uid = user?.uid || null;

  const refreshMetadata = useCallback(async () => {
    if (!uid) {
      setLastSyncTime(null);
      setLatestMetadata(null);
      return;
    }

    try {
      const storedTs = await safeAsyncStorage.getItem(LAST_FIRESTORE_SYNC_KEY);
      if (storedTs) {
        setLastSyncTime(storedTs);
      }

      const meta = await getCloudSyncMetadata(uid);
      if (meta) {
        setLatestMetadata(meta);
        if (meta.last_synced_at) {
          setLastSyncTime(meta.last_synced_at);
        }
      }
    } catch (err) {
      console.warn('[useFirestoreSync] refreshMetadata error:', err);
    }
  }, [uid]);

  useEffect(() => {
    refreshMetadata();
  }, [refreshMetadata]);

  const syncNow = useCallback(async () => {
    if (!uid) {
      return { success: false, error: 'Please sign in to sync with cloud.' };
    }

    setIsSyncing(true);
    try {
      const jsonStr = await exportJSON();
      const exportData = JSON.parse(jsonStr) as IPOVaultExportData;
      const res = await syncUserDataToFirestore(uid, exportData);

      if (res.success) {
        if (res.syncedAt) setLastSyncTime(res.syncedAt);
        await refreshMetadata();
        return { success: true };
      }
      return { success: false, error: res.error };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Sync failed.' };
    } finally {
      setIsSyncing(false);
    }
  }, [uid, exportJSON, refreshMetadata]);

  const restoreNow = useCallback(async () => {
    if (!uid) {
      return { success: false, error: 'Please sign in to restore cloud data.' };
    }

    setIsRestoring(true);
    try {
      const res = await fetchUserDataFromFirestore(uid);
      if (!res.success || !res.data) {
        return {
          success: false,
          error: res.error || 'No cloud backup found for this account.',
        };
      }

      const importRes = await importJSON(JSON.stringify(res.data), {
        suppressLegacySync: true,
      });

      await refresh();
      await refreshMetadata();

      return {
        success: true,
        userCount: importRes.users,
        ipoCount: importRes.ipos,
        applicationCount: importRes.applications,
        bankCount: importRes.banks,
        allotmentCount: importRes.allotments,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Restore failed.' };
    } finally {
      setIsRestoring(false);
    }
  }, [uid, importJSON, refresh, refreshMetadata]);

  return {
    isAuthenticated: !!uid,
    userEmail: user?.email || null,
    userId: uid,
    isSyncing,
    isRestoring,
    lastSyncTime,
    latestMetadata,
    syncNow,
    restoreNow,
    refreshMetadata,
  };
}
