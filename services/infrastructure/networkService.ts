let NetInfoModule: any = null;
try {
  NetInfoModule = require('@react-native-community/netinfo');
} catch {}

class NetworkService {
  private online: boolean = true;
  private listeners: Set<(online: boolean) => void> = new Set();
  private reconnectListeners: Set<() => void> = new Set();

  constructor() {
    try {
      const netInfo = NetInfoModule?.default || NetInfoModule;
      if (netInfo && typeof netInfo.addEventListener === 'function') {
        netInfo.addEventListener((state: any) => {
          const isConnected = !!(state.isConnected && state.isInternetReachable !== false);
          const wasOffline = !this.online;
          this.online = isConnected;

          this.listeners.forEach((listener: (online: boolean) => void) => listener(isConnected));

          if (wasOffline && isConnected) {
            this.reconnectListeners.forEach((listener: () => void) => listener());
          }
        });
      }
    } catch {}
  }

  setOnline(online: boolean) {
    const wasOffline = !this.online;
    this.online = online;
    this.listeners.forEach((listener) => listener(online));
    if (wasOffline && online) {
      this.reconnectListeners.forEach((listener) => listener());
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  async waitForConnection(): Promise<void> {
    if (this.online) return;
    return new Promise((resolve) => {
      const unsubscribe = this.onReconnect(() => {
        unsubscribe();
        resolve();
      });
    });
  }

  onReconnect(callback: () => void): () => void {
    this.reconnectListeners.add(callback);
    return () => {
      this.reconnectListeners.delete(callback);
    };
  }
}

export const networkService = new NetworkService();

