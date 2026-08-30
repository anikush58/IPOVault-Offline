import { AllotmentRequest, AllotmentResult } from './types';

/**
 * Interface definition for all Allotment Providers.
 * Future authorized providers (NSEAuthorizedProvider, BrokerProvider, etc.)
 * will implement this interface.
 */
export interface AllotmentProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Evaluates whether this provider can check the given application.
   */
  isAvailable(application: AllotmentRequest): boolean;

  /**
   * Executes the allotment check for a single application request.
   */
  checkAllotment(
    request: AllotmentRequest,
    signal?: AbortSignal
  ): Promise<AllotmentResult>;
}
