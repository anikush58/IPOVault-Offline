import { AllotmentRequest, AllotmentResult, EngineOptions, EngineProgress } from './types';
import { AllotmentProviderRegistry } from './AllotmentProviderRegistry';

/**
 * AllotmentEngine orchestrates batch allotment checks across multiple application requests.
 * Features:
 * - Sequential execution with smooth progress callbacks
 * - Cancellation support via AbortSignal
 * - Automatic DB persistence via saveResultCallback
 * - Safe error handling per application
 */
export class AllotmentEngine {
  private isChecking = false;
  private currentAbortController: AbortController | null = null;

  /**
   * Executes allotment check for a list of application requests.
   */
  public async checkAll(
    requests: AllotmentRequest[],
    options: EngineOptions = {}
  ): Promise<Map<string, AllotmentResult>> {
    if (this.isChecking) {
      throw new Error('Allotment check is already in progress.');
    }

    this.isChecking = true;
    this.currentAbortController = new AbortController();
    const activeSignal = options.signal || this.currentAbortController.signal;

    const results = new Map<string, AllotmentResult>();
    const registry = AllotmentProviderRegistry.getInstance();
    const total = requests.length;

    try {
      for (let i = 0; i < requests.length; i++) {
        if (activeSignal.aborted) {
          break;
        }

        const req = requests[i];

        // Notify progress before starting single request
        options.onProgress?.({
          total,
          completed: i,
          currentApplication: req,
          currentIpoName: req.ipoName,
          results,
        });

        const provider = registry.getProviderForRequest(req);
        let result: AllotmentResult;

        try {
          result = await provider.checkAllotment(req, activeSignal);
        } catch (err: any) {
          if (err?.name === 'AbortError' || activeSignal.aborted) {
            break; // Stop loop on cancellation
          }

          // Safe fallback result on technical error
          result = {
            applicationId: req.applicationId,
            ipoId: req.ipoId,
            userId: req.userId,
            status: 'ERROR',
            sharesAllotted: 0,
            checkedAt: new Date().toISOString(),
            providerId: provider.id,
            providerName: provider.name,
            verificationMethod: 'AUTOMATED',
            errorMessage: err?.message || 'Technical error during verification',
          };
        }

        results.set(req.applicationId, result);

        // Notify result callback
        options.onResult?.(result);

        // Persist to SQLite if callback provided
        if (options.saveResultCallback) {
          try {
            await options.saveResultCallback(result);
          } catch (dbErr) {
            console.warn(`[AllotmentEngine] DB persistence failed for app ${req.applicationId}:`, dbErr);
          }
        }

        // Final progress update for this item
        options.onProgress?.({
          total,
          completed: i + 1,
          currentApplication: req,
          currentIpoName: req.ipoName,
          results,
        });
      }
    } finally {
      this.isChecking = false;
      this.currentAbortController = null;
    }

    return results;
  }

  /**
   * Cancels any currently active allotment check sequence.
   */
  public cancel(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.isChecking = false;
    }
  }

  public getIsChecking(): boolean {
    return this.isChecking;
  }
}

// Global singleton instance
export const allotmentEngine = new AllotmentEngine();
