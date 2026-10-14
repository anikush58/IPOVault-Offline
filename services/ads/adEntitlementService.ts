/**
 * Ad Entitlement & Premium Subscription Abstraction
 *
 * ARCHITECTURAL CONTRACT:
 * - Provides an abstraction for ad-free premium status across IPOVault.
 * - Current Foundation: Development-only mock toggle state stored via safeAsyncStorage.
 * - Does NOT implement fake purchases, nor does it grant permanent entitlements without payment.
 *
 * FUTURE GOOGLE PLAY BILLING INTEGRATION PLAN:
 * - A future release will integrate Google Play Billing (via `react-native-iap` or RevenueCat).
 * - Target In-App Product / Subscription SKUs:
 *     - `ipovault_ad_free_monthly`
 *     - `ipovault_ad_free_lifetime`
 * - Flow:
 *     1. User initiates purchase in IPOVault Settings / Upgrade Sheet.
 *     2. Google Play Billing purchase flow executes natively.
 *     3. Purchase token is verified server-side with Google Play Developer API.
 *     4. Entitlement state is unlocked with `source: 'google_play_billing'`.
 *     5. Auto-renewals and cancellations are synced with Google Play RTDN (Real-Time Developer Notifications).
 */

import { safeAsyncStorage } from '../../utils/safeAsyncStorage';

const ENTITLEMENT_STORAGE_KEY = '@ipovault_ad_entitlement_v1';

export type EntitlementSource = 'none' | 'dev_mock' | 'google_play_billing';

export interface AdEntitlementState {
  /**
   * Whether the user has an active ad-free entitlement.
   * If true, all banners, native ads, and promotional slots are completely suppressed.
   */
  isPremium: boolean;
  /**
   * Indicates if the premium entitlement originates from a development/testing mock.
   */
  isDevMock: boolean;
  /**
   * Subscription tier identifier.
   */
  tier: 'free' | 'ad_free_premium';
  /**
   * Entitlement verification source.
   */
  source: EntitlementSource;
  /**
   * Unix timestamp of the last state update.
   */
  updatedAt: number;
}

const DEFAULT_ENTITLEMENT_STATE: AdEntitlementState = {
  isPremium: false,
  isDevMock: false,
  tier: 'free',
  source: 'none',
  updatedAt: Date.now(),
};

type EntitlementListener = (state: AdEntitlementState) => void;

class AdEntitlementService {
  private currentState: AdEntitlementState = { ...DEFAULT_ENTITLEMENT_STATE };
  private initialized = false;
  private listeners: Set<EntitlementListener> = new Set();

  /**
   * Initializes and loads the stored mock entitlement state.
   */
  public async getEntitlementState(): Promise<AdEntitlementState> {
    if (this.initialized) {
      return this.currentState;
    }

    try {
      const raw = await safeAsyncStorage.getItem(ENTITLEMENT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Only accept dev_mock states from storage during foundation phase
        if (parsed && typeof parsed.isPremium === 'boolean') {
          this.currentState = {
            isPremium: parsed.isPremium,
            isDevMock: true,
            tier: parsed.isPremium ? 'ad_free_premium' : 'free',
            source: parsed.isPremium ? 'dev_mock' : 'none',
            updatedAt: parsed.updatedAt || Date.now(),
          };
        }
      }
    } catch (err) {
      console.warn('[AdEntitlementService] Error reading entitlement state:', err);
    }

    this.initialized = true;
    return this.currentState;
  }

  /**
   * Sets the development mock premium state.
   * Enables immediate UI/testing verification of ad suppression without purchases.
   */
  public async setDevMockPremium(enabled: boolean): Promise<AdEntitlementState> {
    this.currentState = {
      isPremium: enabled,
      isDevMock: true,
      tier: enabled ? 'ad_free_premium' : 'free',
      source: enabled ? 'dev_mock' : 'none',
      updatedAt: Date.now(),
    };

    try {
      await safeAsyncStorage.setItem(
        ENTITLEMENT_STORAGE_KEY,
        JSON.stringify(this.currentState)
      );
    } catch (err) {
      console.warn('[AdEntitlementService] Error persisting mock entitlement:', err);
    }

    this.notifyListeners();
    return this.currentState;
  }

  /**
   * Toggles the development mock premium state.
   */
  public async toggleDevMockPremium(): Promise<AdEntitlementState> {
    return this.setDevMockPremium(!this.currentState.isPremium);
  }

  /**
   * Resets entitlement back to free tier.
   */
  public async resetEntitlement(): Promise<AdEntitlementState> {
    return this.setDevMockPremium(false);
  }

  /**
   * Subscribes a listener to entitlement updates.
   */
  public subscribe(listener: EntitlementListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState);
      } catch (err) {
        console.error('[AdEntitlementService] Error notifying listener:', err);
      }
    });
  }
}

export const adEntitlementService = new AdEntitlementService();
