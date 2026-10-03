import { useFirestoreSync } from './useFirestoreSync';

export function useCloudBackup() {
  const sync = useFirestoreSync();

  return {
    isAuthenticated: sync.isAuthenticated,
    userEmail: sync.userEmail,
    isConnecting: false,
    isBackingUp: sync.isSyncing,
    isRestoring: sync.isRestoring,
    lastBackupTime: sync.lastSyncTime,
    latestMetadata: sync.latestMetadata,
    error: null,
    connect: async () => ({ success: true }),
    disconnect: async () => {},
    backupNow: sync.syncNow,
    restoreNow: sync.restoreNow,
    refreshMetadata: sync.refreshMetadata,
  };
}
