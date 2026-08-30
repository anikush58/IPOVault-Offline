import { IPOProvider } from '../types';
import { LiveIPOProvider } from './LiveIPOProvider';
import { DemoSeedProvider } from './DemoSeedProvider';
import { MockIPOProvider } from '../ipoUpdater';

export type ProviderType = 'live' | 'mock' | 'demo';

/**
 * IPOProviderFactory decouples provider selection.
 * Changing or adding new providers later requires editing only this factory or adding a new provider class.
 */
export class IPOProviderFactory {
  static getProvider(overrideType?: ProviderType): IPOProvider {
    const envType = (process.env.EXPO_PUBLIC_IPO_PROVIDER as ProviderType) || 'live';
    const activeType = overrideType || envType;

    switch (activeType) {
      case 'mock':
        return new MockIPOProvider();
      case 'demo':
        return new DemoSeedProvider();
      case 'live':
      default:
        return new LiveIPOProvider();
    }
  }
}
