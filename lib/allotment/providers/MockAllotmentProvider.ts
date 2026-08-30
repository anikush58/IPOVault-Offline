import { AllotmentProvider } from '../AllotmentProvider';
import { AllotmentRequest, AllotmentResult, NormalizedAllotmentStatus } from '../types';

declare const __DEV__: boolean | undefined;

function isDevelopmentMode(): boolean {
  if (typeof __DEV__ !== 'undefined') {
    return Boolean(__DEV__);
  }
  return process.env.NODE_ENV !== 'production';
}

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * DEV-only Mock Allotment Provider.
 * Simulates realistic automatic checking with deterministic outcomes and realistic latency.
 * HARD RUNTIME GUARD: CANNOT be initialized or executed outside development mode.
 */
export class MockAllotmentProvider implements AllotmentProvider {
  readonly id = 'mock-dev-provider';
  readonly name = 'Simulated Automated Provider (DEV)';

  constructor() {
    if (!isDevelopmentMode()) {
      throw new Error('SECURITY: MockAllotmentProvider cannot run outside development mode.');
    }
  }

  isAvailable(_application: AllotmentRequest): boolean {
    // Hard check: Return false immediately outside DEV
    return isDevelopmentMode();
  }

  async checkAllotment(
    request: AllotmentRequest,
    signal?: AbortSignal
  ): Promise<AllotmentResult> {
    if (!isDevelopmentMode()) {
      throw new Error('SECURITY: MockAllotmentProvider cannot run outside development mode.');
    }

    if (signal?.aborted) {
      const err = new Error('Check canceled');
      err.name = 'AbortError';
      throw err;
    }

    // Realistic simulated network delay (600ms to 1200ms)
    const delay = 600 + (stringHash(request.applicationId) % 600);

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        const err = new Error('Check canceled');
        err.name = 'AbortError';
        return reject(err);
      }

      const timer = setTimeout(() => resolve(), delay);

      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          const err = new Error('Check canceled');
          err.name = 'AbortError';
          reject(err);
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });

    if (signal?.aborted) {
      const err = new Error('Check canceled');
      err.name = 'AbortError';
      throw err;
    }

    // Deterministic outcome calculation based on IPO ID + Application ID
    const seedKey = `${request.ipoId}_${request.applicationId}`;
    const hash = stringHash(seedKey);
    const mod = hash % 10;

    let status: NormalizedAllotmentStatus = 'NOT_ALLOTTED';
    let sharesAllotted = 0;
    const price = request.price || 100;
    const appliedQty = request.appliedQuantity || 15;
    const appAmount = price * appliedQty;
    let refundAmount = appAmount;

    if (mod <= 2) {
      // 30% chance Allotted
      status = 'ALLOTTED';
      sharesAllotted = appliedQty;
      refundAmount = 0;
    } else if (mod === 3) {
      // 10% chance Partially Allotted
      status = 'PARTIALLY_ALLOTTED';
      sharesAllotted = Math.max(1, Math.floor(appliedQty / 2));
      refundAmount = Math.max(0, appAmount - sharesAllotted * price);
    } else if (mod <= 7) {
      // 40% chance Not Allotted
      status = 'NOT_ALLOTTED';
      sharesAllotted = 0;
      refundAmount = appAmount;
    } else if (mod === 8) {
      // 10% chance No Record
      status = 'NO_RECORD';
      sharesAllotted = 0;
      refundAmount = appAmount;
    } else {
      // 10% chance Pending
      status = 'PENDING';
      sharesAllotted = 0;
      refundAmount = 0;
    }

    return {
      applicationId: request.applicationId,
      ipoId: request.ipoId,
      userId: request.userId,
      status,
      sharesAllotted,
      refundAmount,
      checkedAt: new Date().toISOString(),
      providerId: this.id,
      providerName: this.name,
      verificationMethod: 'AUTOMATED',
    };
  }
}
