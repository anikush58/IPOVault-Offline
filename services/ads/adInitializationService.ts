/**
 * AdMob SDK Initialization & Runtime Environment Detection
 *
 * SAFETY & RESILIENCE:
 * - Completely non-blocking async startup.
 * - Idempotent: multiple or concurrent calls share a single initialization promise.
 * - Detects whether native ads and banner views are supported in the current runtime
 *   (e.g., custom native dev build) vs Expo Go / Web / Jest.
 * - Prevents red screens and native bridge crashes.
 */

class AdInitializationService {
  private isInitialized = false;
  private isNativeModulePresent = false;
  private initSuccess = false;
  private initPromise: Promise<boolean> | null = null;

  constructor() {
    this.checkNativeAvailability();
  }

  private checkNativeAvailability() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rn = require('react-native');
      if (rn.Platform?.OS === 'web') {
        this.isNativeModulePresent = false;
        return;
      }
    } catch {}

    // Expo Go does not contain custom native AdMob code
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Constants = require('expo-constants').default || require('expo-constants');
      const isExpoGo = Constants.appOwnership === 'expo';
      if (isExpoGo) {
        this.isNativeModulePresent = false;
        return;
      }
    } catch {}

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const adsModule = require('react-native-google-mobile-ads');
      this.isNativeModulePresent = !!adsModule.default || !!adsModule.MobileAds;
    } catch {
      this.isNativeModulePresent = false;
    }
  }

  /**
   * Initializes the Google Mobile Ads SDK in the background.
   * Strictly idempotent and concurrent-safe.
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return this.initSuccess;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (!this.isNativeModulePresent) {
        this.isInitialized = true;
        this.initSuccess = false;
        return false;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const adsModule = require('react-native-google-mobile-ads');
        const mobileAds = adsModule.default || adsModule.MobileAds;

        if (typeof mobileAds === 'function') {
          const instance = mobileAds();
          await instance.initialize();
        }

        this.isInitialized = true;
        this.initSuccess = true;
        return true;
      } catch (err) {
        console.warn('[AdInitializationService] AdMob initialization deferred or failed:', err);
        this.isInitialized = true;
        this.initSuccess = false;
        return false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Returns true if native AdMob components can be rendered without crashing
   * (i.e., inside a standalone APK or custom Expo Development Build).
   */
  public isNativeAdMobSupported(): boolean {
    return this.isNativeModulePresent;
  }

  /**
   * Returns true if MobileAds SDK has successfully finished initialization.
   */
  public isAdMobInitialized(): boolean {
    return this.isInitialized && this.initSuccess;
  }
}

export const adInitializationService = new AdInitializationService();
