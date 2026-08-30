import { AllotmentProvider } from './AllotmentProvider';
import { AllotmentRequest } from './types';
import { MockAllotmentProvider } from './providers/MockAllotmentProvider';
import { ManualVerificationProvider } from './providers/ManualVerificationProvider';

declare const __DEV__: boolean | undefined;

function isDevelopmentMode(): boolean {
  if (typeof __DEV__ !== 'undefined') {
    return Boolean(__DEV__);
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * Registry and configuration layer for Allotment Providers.
 * Ensures strict environment separation so DEV-only mock providers can NEVER
 * be initialized, registered, or executed in production builds.
 */
export class AllotmentProviderRegistry {
  private static instance: AllotmentProviderRegistry;
  private providers: AllotmentProvider[] = [];

  private constructor() {
    this.initializeDefaultProviders();
  }

  public static getInstance(): AllotmentProviderRegistry {
    if (!AllotmentProviderRegistry.instance) {
      AllotmentProviderRegistry.instance = new AllotmentProviderRegistry();
    }
    return AllotmentProviderRegistry.instance;
  }

  private initializeDefaultProviders() {
    this.providers = [];

    // Environment Guard: Only register Mock Provider in DEV mode
    if (isDevelopmentMode()) {
      try {
        this.providers.push(new MockAllotmentProvider());
      } catch (err) {
        console.warn('[AllotmentProviderRegistry] Failed to initialize Mock Provider:', err);
      }
    }

    // Always register Manual Fallback Provider for production/unsupported cases
    this.providers.push(new ManualVerificationProvider());
  }

  /**
   * Registers a new custom provider (e.g. future NSEAuthorizedProvider or BrokerProvider).
   */
  public registerProvider(provider: AllotmentProvider): void {
    if (!isDevelopmentMode() && provider.id === 'mock-dev-provider') {
      console.error('[SECURITY ERROR] Cannot register MockAllotmentProvider outside development mode!');
      return;
    }
    this.providers.unshift(provider); // High priority first
  }

  /**
   * Selects the highest-priority provider available for the given application request.
   */
  public getProviderForRequest(request: AllotmentRequest): AllotmentProvider {
    for (const provider of this.providers) {
      if (provider.isAvailable(request)) {
        return provider;
      }
    }
    return new ManualVerificationProvider();
  }

  /**
   * Returns list of currently active provider IDs.
   */
  public getActiveProviderIds(): string[] {
    return this.providers.map((p) => p.id);
  }
}
