/**
 * Ad Consent & Privacy Management Service (Google UMP)
 *
 * CRITICAL PRIVACY & SAFETY CONTRACT:
 * - Ads & consent checks must NEVER block app startup, database loading, or core features.
 * - Consent timeouts, offline states, and UMP errors CANNOT bypass consent requirements.
 *   If consent is required but unresolved or denied, ad requests MUST be strictly prevented.
 * - Follows Google's recommended UMP gathering flow:
 *     1. requestInfoUpdate()
 *     2. loadAndShowConsentFormIfRequired() if status is REQUIRED/UNKNOWN and form available.
 *     3. getConsentInfo() to check authoritative `canRequestAds` boolean.
 * - Settings can reopen privacy choices via `showPrivacyOptionsForm()` where supported.
 */

export interface ConsentResult {
  canRequestAds: boolean;
  status: string;
  privacyOptionsRequirementStatus?: string;
}

type ConsentChangeListener = (canRequestAds: boolean) => void;

class AdConsentService {
  private consentReady = false;
  // Default is strictly false: no ads may be requested until consent is confirmed
  private canServeAds = false;
  private listeners: Set<ConsentChangeListener> = new Set();
  private initPromise: Promise<ConsentResult> | null = null;

  /**
   * Safe dynamic accessor for AdsConsent module to prevent runtime crashes in Expo Go or Web.
   */
  private getAdsConsentModule() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rn = require('react-native');
      if (rn.Platform?.OS === 'web') {
        return null;
      }
    } catch {}

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Constants = require('expo-constants').default || require('expo-constants');
      if (Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient') {
        return null;
      }
    } catch {}
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const adsModule = require('react-native-google-mobile-ads');
      return adsModule.AdsConsent || null;
    } catch {
      return null;
    }
  }

  /**
   * Initializes consent in the background following Google's recommended flow.
   * Asynchronously gathers UMP consent without delaying UI rendering.
   * Strictly deduplicates concurrent or in-flight initialization calls.
   */
  public async initializeConsent(): Promise<ConsentResult> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const AdsConsent = this.getAdsConsentModule();

      // In environments without native AdMob (Web, Expo Go, Unit tests)
      if (!AdsConsent) {
        this.consentReady = true;
        // In __DEV__ without native binaries, permit simulated preview cards
        this.canServeAds = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
        this.notifyListeners();
        return {
          canRequestAds: this.canServeAds,
          status: 'NOT_REQUIRED_OR_MOCKED',
        };
      }

      try {
        // 8-second timeout for mobile networks, non-blocking to app initialization
        const consentPromise = (async () => {
          // Step 1: Request info update from Google UMP
          const initialInfo = await AdsConsent.requestInfoUpdate();

          // Step 2: Present form if required
          if (
            initialInfo?.isConsentFormAvailable &&
            (initialInfo?.status === 'REQUIRED' || initialInfo?.status === 'UNKNOWN')
          ) {
            await AdsConsent.loadAndShowConsentFormIfRequired();
          }

          // Step 3: Fetch updated status to check authoritative canRequestAds
          const finalInfo = await AdsConsent.getConsentInfo();
          return finalInfo;
        })();

        // Attach background listener in case UMP resolves after initial timeout
        consentPromise
          .then((bgResult) => {
            if (bgResult && bgResult.canRequestAds !== undefined) {
              const allowed = Boolean(bgResult.canRequestAds);
              if (this.canServeAds !== allowed) {
                this.canServeAds = allowed;
                this.consentReady = true;
                this.notifyListeners();
              }
            }
          })
          .catch(() => {});

        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 8000)
        );

        const result = await Promise.race([consentPromise, timeoutPromise]);

        if (result) {
          // Authoritative decision from Google UMP SDK
          this.canServeAds = Boolean(result.canRequestAds);
          this.consentReady = true;
          this.notifyListeners();

          return {
            canRequestAds: this.canServeAds,
            status: result.status || 'OBTAINED',
            privacyOptionsRequirementStatus: result.privacyOptionsRequirementStatus,
          };
        } else {
          // TIMEOUT FALLBACK:
          // Do NOT bypass consent requirements! Inspect cached session consent.
          console.warn('[AdConsentService] Consent request timed out, inspecting cached consent');
          return this.handleFallbackWithCachedConsent('TIMEOUT_UNRESOLVED');
        }
      } catch (err) {
        // ERROR FALLBACK:
        // Network failure or UMP API error: check cached consent; never bypass.
        console.warn('[AdConsentService] Consent gathering error, inspecting cached consent:', err);
        return this.handleFallbackWithCachedConsent('ERROR_UNRESOLVED');
      }
    })();

    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Inspects cached consent in SharedPreferences / NSUserDefaults.
   * If cached consent allows ads (e.g. returning user who already consented), allows ad serving.
   * If no valid consent is cached, strictly sets canServeAds = false.
   */
  private async handleFallbackWithCachedConsent(fallbackStatus: string): Promise<ConsentResult> {
    const AdsConsent = this.getAdsConsentModule();
    this.consentReady = true;

    if (AdsConsent && typeof AdsConsent.getConsentInfo === 'function') {
      try {
        const cached = await AdsConsent.getConsentInfo();
        if (cached && cached.canRequestAds === true) {
          this.canServeAds = true;
          this.notifyListeners();
          return {
            canRequestAds: true,
            status: cached.status || 'CACHED_ALLOWED',
            privacyOptionsRequirementStatus: cached.privacyOptionsRequirementStatus,
          };
        }
      } catch {}
    }

    // Consent cannot be confirmed: Strictly gate ads off
    this.canServeAds = false;
    this.notifyListeners();
    return {
      canRequestAds: false,
      status: fallbackStatus,
    };
  }

  /**
   * Opens the Google UMP Privacy Options Form for GDPR/privacy review.
   * Can be launched from Settings.
   */
  public async showPrivacyOptionsForm(): Promise<{ opened: boolean; reason?: string }> {
    const AdsConsent = this.getAdsConsentModule();
    if (!AdsConsent) {
      return { opened: false, reason: 'NOT_AVAILABLE' };
    }

    try {
      const consentInfo = await AdsConsent.getConsentInfo();
      // Google requires checking if privacy options are required for this user's geography
      if (
        consentInfo?.privacyOptionsRequirementStatus === 'REQUIRED' &&
        typeof AdsConsent.showPrivacyOptionsForm === 'function'
      ) {
        await AdsConsent.showPrivacyOptionsForm();
        // After user modifies consent in the form, immediately refresh state
        const updated = await AdsConsent.getConsentInfo();
        this.canServeAds = Boolean(updated.canRequestAds);
        this.notifyListeners();
        return { opened: true };
      }

      return {
        opened: false,
        reason: 'NOT_REQUIRED_IN_REGION',
      };
    } catch (err) {
      console.warn('[AdConsentService] Could not display privacy options form:', err);
      return { opened: false, reason: 'ERROR' };
    }
  }

  public isConsentReady(): boolean {
    return this.consentReady;
  }

  public getCanRequestAds(): boolean {
    return this.canServeAds;
  }

  public subscribe(listener: ConsentChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.canServeAds);
      } catch (err) {
        console.error('[AdConsentService] Error notifying consent listener:', err);
      }
    });
  }
}

export const adConsentService = new AdConsentService();
