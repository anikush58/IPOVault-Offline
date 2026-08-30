import { IPOProvider, FetchResult } from '../types';

/**
 * DemoSeedProvider - Returns empty dataset.
 * All IPO data is sourced exclusively from the Admin Portal backend.
 */
export class DemoSeedProvider implements IPOProvider {
  readonly name = 'demo' as const;

  async fetchIPOs(since: string | null): Promise<FetchResult> {
    return {
      success: true,
      data: [],
      providerUsed: 'demo',
    };
  }
}
