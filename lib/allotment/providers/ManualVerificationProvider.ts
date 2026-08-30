import { AllotmentProvider } from '../AllotmentProvider';
import { AllotmentRequest, AllotmentResult } from '../types';

/**
 * Fallback provider used in production when no automated API integration
 * is active or authorized. Returns an 'UNAVAILABLE' status instructing the user
 * to perform manual verification via the registrar portal.
 */
export class ManualVerificationProvider implements AllotmentProvider {
  readonly id = 'manual-verification-provider';
  readonly name = 'Manual Registrar Verification';

  isAvailable(_application: AllotmentRequest): boolean {
    return true; // Always available as fallback
  }

  async checkAllotment(
    request: AllotmentRequest,
    signal?: AbortSignal
  ): Promise<AllotmentResult> {
    if (signal?.aborted) {
      const err = new Error('Check canceled');
      err.name = 'AbortError';
      throw err;
    }

    return {
      applicationId: request.applicationId,
      ipoId: request.ipoId,
      userId: request.userId,
      status: 'UNAVAILABLE',
      sharesAllotted: 0,
      checkedAt: new Date().toISOString(),
      providerId: this.id,
      providerName: this.name,
      verificationMethod: 'MANUAL',
      errorMessage: 'Automated verification unavailable. Use official registrar portal for manual verification.',
    };
  }
}
