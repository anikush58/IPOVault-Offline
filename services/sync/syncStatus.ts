export type SyncState = 'Idle' | 'Syncing' | 'Offline' | 'Error';

export interface SyncStatus {
  state: SyncState;
  lastSyncTimestamp: string | null;
  pendingCount: number;
  authState: 'Connected' | 'Disconnected';
  error: string | null;
  rowsUploaded: number;
  rowsDownloaded: number;
  conflicts: number;
  retryCount: number;
  lastFailedSync: string | null;
  avgSyncDurationMs: number;
  supabaseLatencyMs: number;
  lastAutoSyncTimestamp: string | null;
  nextScheduledSyncTimestamp: string | null;
  lastTriggerSource: string | null;
}

type Listener = (status: SyncStatus) => void;

class SyncStatusStore {
  private status: SyncStatus = {
    state: 'Idle',
    lastSyncTimestamp: null,
    pendingCount: 0,
    authState: 'Disconnected',
    error: null,
    rowsUploaded: 0,
    rowsDownloaded: 0,
    conflicts: 0,
    retryCount: 0,
    lastFailedSync: null,
    avgSyncDurationMs: 0,
    supabaseLatencyMs: 0,
    lastAutoSyncTimestamp: null,
    nextScheduledSyncTimestamp: null,
    lastTriggerSource: null,
  };

  private listeners: Set<Listener> = new Set();

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  update(partial: Partial<SyncStatus>) {
    this.status = { ...this.status, ...partial };
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const current = this.getStatus();
    for (const listener of this.listeners) {
      listener(current);
    }
  }
}

export const syncStore = new SyncStatusStore();
