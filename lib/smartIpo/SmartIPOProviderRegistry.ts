import { SQLiteDatabase } from 'expo-sqlite';
import { IPODataProvider } from './types/provider';
import { LocalSQLiteProvider } from './providers/LocalSQLiteProvider';
import { MockSmartIPOProvider } from './providers/MockSmartIPOProvider';
import { RemoteSmartIPOProvider } from './providers/RemoteSmartIPOProvider';

class SmartIPOProviderRegistryClass {
  private providers: Map<string, IPODataProvider> = new Map();
  private activeProviderId: string = 'remote_smart_ipo';

  registerProvider(provider: IPODataProvider): void {
    if (!__DEV__ && provider.id.includes('mock')) {
      console.warn(`[SmartIPOProviderRegistry] Refusing to register mock provider in production: ${provider.id}`);
      return;
    }
    this.providers.set(provider.id, provider);
  }

  setActiveProvider(providerId: string): void {
    if (this.providers.has(providerId)) {
      this.activeProviderId = providerId;
    } else {
      console.warn(`[SmartIPOProviderRegistry] Provider ${providerId} not registered, keeping ${this.activeProviderId}`);
    }
  }

  getActiveProvider(): IPODataProvider {
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      // Fallback to local_sqlite if requested active provider is missing
      const fallback = this.providers.get('local_sqlite');
      if (fallback) return fallback;
      throw new Error(`[SmartIPOProviderRegistry] Active provider ${this.activeProviderId} not found`);
    }
    return provider;
  }

  initDefaultProviders(db: SQLiteDatabase): void {
    const sqliteProvider = new LocalSQLiteProvider(db);
    this.registerProvider(sqliteProvider);

    const remoteProvider = new RemoteSmartIPOProvider(db);
    this.registerProvider(remoteProvider);

    if (__DEV__) {
      const mockProvider = new MockSmartIPOProvider();
      this.registerProvider(mockProvider);
    }

    this.activeProviderId = 'remote_smart_ipo';
  }
}

export const smartIPOProviderRegistry = new SmartIPOProviderRegistryClass();
