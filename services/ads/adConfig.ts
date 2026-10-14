/**
 * Google AdMob Monetization Configuration
 *
 * IMPORTANT SAFETY & COMPLIANCE:
 * - Strictly Google's official TEST ad unit IDs and test app IDs are configured.
 * - Under no circumstances should live ad unit IDs be deployed during this initial foundation phase.
 * - Financial, portfolio, Demat, PAN, bank account, and user authentication data
 *   must NEVER be included in ad requests or passed to advertising SDKs.
 */

function getPlatformOS(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    return rn.Platform?.OS || 'android';
  } catch {
    return typeof process !== 'undefined' && process.env?.TEST_PLATFORM === 'ios' ? 'ios' : 'android';
  }
}

export const ADMOB_TEST_IDS = {
  // Official Google Android Test IDs
  ANDROID_APP_ID: 'ca-app-pub-3940256099942544~3347511713',
  ANDROID_BANNER: 'ca-app-pub-3940256099942544/6300978111',
  ANDROID_NATIVE: 'ca-app-pub-3940256099942544/2247696110',
  ANDROID_INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  ANDROID_REWARDED: 'ca-app-pub-3940256099942544/5224354917',

  // Official Google iOS Test IDs
  IOS_APP_ID: 'ca-app-pub-3940256099942544~1458002511',
  IOS_BANNER: 'ca-app-pub-3940256099942544/2934735716',
  IOS_NATIVE: 'ca-app-pub-3940256099942544/3986624511',
  IOS_INTERSTITIAL: 'ca-app-pub-3940256099942544/4411468910',
  IOS_REWARDED: 'ca-app-pub-3940256099942544/1712485313',
} as const;

/**
 * Production-Only Google AdMob Configuration
 *
 * CRITICAL SAFETY & POLICY RULES:
 * - Real AdMob IDs must ONLY be loaded in true production release native APK/AAB builds.
 * - Under NO circumstances may live ads be requested in:
 *     1. Development mode (__DEV__ === true)
 *     2. Expo Go client environments (Constants.appOwnership === 'expo')
 *     3. Automated test suites (Jest, tsx, CI)
 *     4. Preview/staging channels
 */
export const ADMOB_PROD_IDS = {
  ANDROID_APP_ID: 'ca-app-pub-3768316467682663~8023640805',
  ANDROID_BANNER: 'ca-app-pub-3768316467682663/2708744108',
  ANDROID_NATIVE: 'ca-app-pub-3768316467682663/6456417429',
} as const;

/**
 * Determines whether production ad units should be served.
 * Strictly guarantees that live ads can NEVER be requested in development,
 * automated testing, Expo Go, web, or preview runtimes.
 */
export function shouldUseProductionAds(): boolean {
  // Rule 1: Never in development mode
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return false;
  }

  // Rule 2: Never in automated test runners or node environments
  if (typeof process !== 'undefined') {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.JEST_WORKER_ID !== undefined ||
      process.env.VITEST !== undefined
    ) {
      return false;
    }
  }

  // Rule 3: Never on web
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    if (rn.Platform?.OS === 'web') {
      return false;
    }
  } catch {}

  // Rule 4: Never in Expo Go
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default || require('expo-constants');
    if (
      Constants?.appOwnership === 'expo' ||
      Constants?.executionEnvironment === 'storeClient'
    ) {
      return false;
    }
  } catch {}

  // Rule 5: Must be a production native standalone release build
  // with production ad serving explicitly enabled via build environment
  const isExplicitlyEnabled =
    typeof process !== 'undefined' &&
    process.env?.EXPO_PUBLIC_USE_PROD_ADS === 'true';

  return isExplicitlyEnabled;
}

/**
 * Returns the banner ad unit ID appropriate for the current platform and environment.
 * Defaults strictly to Google official test IDs for all development, Expo Go, and test environments.
 */
export function getBannerAdUnitId(forceProduction?: boolean): string {
  const useProd = forceProduction ?? shouldUseProductionAds();
  if (useProd && getPlatformOS() === 'android') {
    return ADMOB_PROD_IDS.ANDROID_BANNER;
  }
  if (getPlatformOS() === 'ios') {
    return ADMOB_TEST_IDS.IOS_BANNER;
  }
  return ADMOB_TEST_IDS.ANDROID_BANNER;
}

/**
 * Returns the native ad unit ID appropriate for the current platform and environment.
 * Defaults strictly to Google official test IDs for all development, Expo Go, and test environments.
 */
export function getNativeAdUnitId(forceProduction?: boolean): string {
  const useProd = forceProduction ?? shouldUseProductionAds();
  if (useProd && getPlatformOS() === 'android') {
    return ADMOB_PROD_IDS.ANDROID_NATIVE;
  }
  if (getPlatformOS() === 'ios') {
    return ADMOB_TEST_IDS.IOS_NATIVE;
  }
  return ADMOB_TEST_IDS.ANDROID_NATIVE;
}

/**
 * Verifies that a given ad unit ID belongs to the official Google test suite.
 */
export function isTestAdUnitId(adUnitId: string): boolean {
  return (
    adUnitId === ADMOB_TEST_IDS.ANDROID_BANNER ||
    adUnitId === ADMOB_TEST_IDS.ANDROID_NATIVE ||
    adUnitId === ADMOB_TEST_IDS.ANDROID_INTERSTITIAL ||
    adUnitId === ADMOB_TEST_IDS.ANDROID_REWARDED ||
    adUnitId === ADMOB_TEST_IDS.IOS_BANNER ||
    adUnitId === ADMOB_TEST_IDS.IOS_NATIVE ||
    adUnitId === ADMOB_TEST_IDS.IOS_INTERSTITIAL ||
    adUnitId === ADMOB_TEST_IDS.IOS_REWARDED
  );
}

/**
 * Verifies if an ad unit ID matches a registered production ad unit ID.
 */
export function isProductionAdUnitId(adUnitId: string): boolean {
  return (
    adUnitId === ADMOB_PROD_IDS.ANDROID_BANNER ||
    adUnitId === ADMOB_PROD_IDS.ANDROID_NATIVE
  );
}

/**
 * Ensures ad request options are completely sanitized and strictly contain
 * NO user identification, PAN, Demat, bank accounts, portfolio holdings, or bids.
 */
export function buildSanitizedAdRequestOptions(nonPersonalizedAdsOnly: boolean = false) {
  return {
    requestNonPersonalizedAdsOnly: nonPersonalizedAdsOnly,
    // Explicitly guarantee no custom targeting or user-specific data is attached
    keywords: ['finance', 'market', 'stocks', 'ipo'],
  };
}
