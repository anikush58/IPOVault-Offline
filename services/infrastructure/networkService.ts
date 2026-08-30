import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

class NetworkService {
  private online: boolean = true;
  private listeners: Set<(online: boolean) => void> = new Set();
  private reconnectListeners: Set<() => void> = new Set();

  constructor() {
    NetInfo.addEventListener((state: NetInfoState) => {
      const isConnected = !!(state.isConnected && state.isInternetReachable !== false);
      const wasOffline = !this.online;
      this.online = isConnected;

      this.listeners.forEach((listener) => listener(isConnected));

      if (wasOffline && isConnected) {
        this.reconnectListeners.forEach((listener) => listener());
      }
    });
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
