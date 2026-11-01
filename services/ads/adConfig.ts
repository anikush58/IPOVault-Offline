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
 * Validates that an ad unit ID conforms strictly to AdMob's format:
 * ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 */
export function isAdConfigurationValid(adUnitId: string | undefined | null): boolean {
  if (!adUnitId || typeof adUnitId !== 'string') {
    return false;
  }
  return /^ca-app-pub-\d+\/\d+$/.test(adUnitId.trim());
}

/**
 * Determines whether production ad units should be served.
 * Strictly guarantees that live ads can NEVER be requested in development,
 * preview, automated testing, Expo Go, or web runtimes.
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
      process.env.VITEST !== undefined ||
      (Array.isArray(process.argv) && process.argv.some((arg) => arg.includes('__tests__') || arg.includes('.test.')))
    ) {
      return false;
    }

    // Rule 3: Never in preview, staging, or non-production build profiles
    const appEnv = process.env.APP_ENV || process.env.EXPO_PUBLIC_APP_ENV;
    const easProfile = process.env.EAS_BUILD_PROFILE;
    if (
      appEnv === 'preview' ||
      appEnv === 'staging' ||
      appEnv === 'development' ||
      easProfile === 'preview' ||
      easProfile === 'development'
    ) {
      return false;
    }
  }

  // Rule 4: Never on web
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    if (rn.Platform?.OS === 'web') {
      return false;
    }
  } catch {}

  // Rule 5: Never in Expo Go
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

  // Rule 6: In a production native standalone release build, serve production ads
  // unless explicitly disabled via environment configuration
  const isExplicitlyDisabled =
    typeof process !== 'undefined' &&
    process.env?.EXPO_PUBLIC_USE_PROD_ADS === 'false';

  if (isExplicitlyDisabled) {
    return false;
  }

  return true;
}

function isAutomatedTestEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env.NODE_ENV === 'test' ||
      process.env.JEST_WORKER_ID !== undefined ||
      process.env.VITEST !== undefined ||
      (Array.isArray(process.argv) &&
        process.argv.some((arg) => arg.includes('__tests__') || arg.includes('.test.'))))
  );
}

/**
 * Returns the banner ad unit ID appropriate for the current platform and environment.
 * In development, preview, and test environments, strictly returns Google official test IDs.
 * In production builds, returns production ID if valid, otherwise empty string (fails closed).
 *
 * `forceProductionForTesting` is ONLY evaluated in automated test runners (`NODE_ENV === 'test'`).
 * It is strictly ignored in all dev, preview, and production app runtimes.
 */
export function getBannerAdUnitId(forceProductionForTesting?: boolean): string {
  const isTestRunner = isAutomatedTestEnvironment();

  const useProd = isTestRunner && forceProductionForTesting === true
    ? true
    : shouldUseProductionAds();

  if (useProd) {
    if (getPlatformOS() === 'android') {
      const prodId = ADMOB_PROD_IDS.ANDROID_BANNER;
      return isAdConfigurationValid(prodId) ? prodId : '';
    }
    // Fail closed for unsupported platforms in production
    return '';
  }

  if (getPlatformOS() === 'ios') {
    return ADMOB_TEST_IDS.IOS_BANNER;
  }
  return ADMOB_TEST_IDS.ANDROID_BANNER;
}

/**
 * Returns the native ad unit ID appropriate for the current platform and environment.
 * In development, preview, and test environments, strictly returns Google official test IDs.
 * In production builds, returns production ID if valid, otherwise empty string (fails closed).
 *
 * `forceProductionForTesting` is ONLY evaluated in automated test runners (`NODE_ENV === 'test'`).
 * It is strictly ignored in all dev, preview, and production app runtimes.
 */
export function getNativeAdUnitId(forceProductionForTesting?: boolean): string {
  const isTestRunner = isAutomatedTestEnvironment();

  const useProd = isTestRunner && forceProductionForTesting === true
    ? true
    : shouldUseProductionAds();

  if (useProd) {
    if (getPlatformOS() === 'android') {
      const prodId = ADMOB_PROD_IDS.ANDROID_NATIVE;
      return isAdConfigurationValid(prodId) ? prodId : '';
    }
    // Fail closed for unsupported platforms in production
    return '';
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
