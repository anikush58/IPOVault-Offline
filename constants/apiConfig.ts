let Constants: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Constants = require('expo-constants').default || require('expo-constants');
} catch {
  Constants = {};
}

let platformOs = 'android';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Platform } = require('react-native');
  platformOs = Platform.OS;
} catch {
  platformOs = 'android';
}

/**
 * Centralized Environment-Aware API Base URL Resolver
 * 
 * Priority order:
 * 1. Explicit EXPO_PUBLIC_API_URL set in environment / .env
 * 2. Expo Host URI (dynamically resolves developer machine LAN IP when using Expo Go on physical device)
 * 3. Platform Emulators (Android: 10.0.2.2:3000, iOS: 127.0.0.1:3000)
 * 4. Fallback development computer LAN IP (http://192.168.1.8:3000)
 */
function getApiBaseUrl(): string {
  // Extract Expo host LAN IP
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.developer?.tool ||
    (Constants as any).experienceUrl ||
    (Constants as any).linkingUri;

  let lanIp: string | null = null;
  if (hostUri && typeof hostUri === 'string') {
    const cleaned = hostUri.replace(/^exp:\/\//, '').replace(/^http:\/\//, '');
    const extracted = cleaned.split(':')[0];
    if (extracted && extracted !== 'localhost' && extracted !== '127.0.0.1') {
      lanIp = extracted;
    }
  }

  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    if (lanIp && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      const resolved = envUrl.replace(/localhost|127\.0\.0\.1/, lanIp);
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[IPOVault Sync Config] Mapped EXPO_PUBLIC_API_URL localhost to LAN IP:', resolved);
      return resolved;
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[IPOVault Sync Config] Using EXPO_PUBLIC_API_URL:', envUrl);
    return envUrl;
  }

  if (lanIp) {
    const resolvedUrl = `http://${lanIp}:3000`;
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[IPOVault Sync Config] Dynamically resolved Expo Go LAN API URL:', resolvedUrl);
    return resolvedUrl;
  }

  // Fallback for Emulators
  if (platformOs === 'android') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[IPOVault Sync Config] Fallback Android Emulator URL: http://10.0.2.2:3000');
    return 'http://10.0.2.2:3000';
  }

  // Default LAN IP of development machine (192.168.1.8)
  const fallbackLan = 'http://192.168.1.8:3000';
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[IPOVault Sync Config] Default LAN API URL:', fallbackLan);
  return fallbackLan;
}

export const API_BASE_URL = getApiBaseUrl();
