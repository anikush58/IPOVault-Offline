export type SyncEventType = 'applications' | 'ipos' | 'allotments' | 'general';

export type SyncListener = (event?: SyncEventType) => void;

class BackendSyncEmitter {
  private listeners = new Set<SyncListener>();

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notifyChange(event: SyncEventType = 'general'): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.warn('[BackendSyncEmitter] Error in listener:', e);
      }
    });
  }

  public notifyApplicationChange(): void {
    this.notifyChange('applications');
  }

  public notifyIpoChange(): void {
    this.notifyChange('ipos');
  }

  public notifyAllotmentChange(): void {
    this.notifyChange('allotments');
  }
}

export const backendSyncEmitter = new BackendSyncEmitter();
