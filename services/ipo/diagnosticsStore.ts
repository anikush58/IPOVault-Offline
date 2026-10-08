export interface IPODiagnostics {
  lastSuccessfulSync: string | null;
  providerUsed: 'live' | 'mock' | 'demo';
  recordsDownloaded: number;
  recordsUpdated: number;
  totalRowsUpserted: number;
  syncDurationMs: number;
  syncError: string | null;
}

type Listener = (d: IPODiagnostics) => void;

class IPODiagnosticsStore {
  private data: IPODiagnostics = {
    lastSuccessfulSync: null,
    providerUsed: 'live',
    recordsDownloaded: 0,
    recordsUpdated: 0,
    totalRowsUpserted: 0,
    syncDurationMs: 0,
    syncError: null,
  };
  private listeners: Set<Listener> = new Set();

  get() {
    return { ...this.data };
  }

  update(partial: Partial<IPODiagnostics>) {
    this.data = { ...this.data, ...partial };
    this.notify();
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.get());
    return () => this.listeners.delete(l);
  }

  private notify() {
    for (const l of this.listeners) {
      l(this.get());
    }
  }
}

export const ipoDiagnosticsStore = new IPODiagnosticsStore();
