type SyncListener = () => void;

class BackendSyncEmitter {
  private listeners = new Set<SyncListener>();

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notifyChange(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.warn('[BackendSyncEmitter] Error in listener:', e);
      }
    });
  }
}

export const backendSyncEmitter = new BackendSyncEmitter();
