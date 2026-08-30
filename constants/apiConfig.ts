import Constants from 'expo-constants';
import { Platform } from 'react-native';

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
  // 1. Explicit env override
  if (process.env.EXPO_PUBLIC_API_URL) {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (__DEV__) console.log('[IPOVault Sync Config] Using EXPO_PUBLIC_API_URL:', envUrl);
    return envUrl;
  }

  // 2. Dynamic Expo LAN IP resolution for physical devices running Expo Go
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.developer?.tool ||
    (Constants as any).experienceUrl ||
    (Constants as any).linkingUri;

  if (hostUri && typeof hostUri === 'string') {
    const cleaned = hostUri.replace(/^exp:\/\//, '').replace(/^http:\/\//, '');
    const lanIp = cleaned.split(':')[0];
    if (lanIp && lanIp !== 'localhost' && lanIp !== '127.0.0.1') {
      const resolvedUrl = `http://${lanIp}:3000`;
      if (__DEV__) console.log('[IPOVault Sync Config] Dynamically resolved Expo Go LAN API URL:', resolvedUrl);
      return resolvedUrl;
    }
  }

  // 3. Fallback for Emulators
  if (Platform.OS === 'android') {
    if (__DEV__) console.log('[IPOVault Sync Config] Fallback Android Emulator URL: http://10.0.2.2:3000');
    return 'http://10.0.2.2:3000';
  }
  if (Platform.OS === 'ios') {
    if (__DEV__) console.log('[IPOVault Sync Config] Fallback iOS Simulator URL: http://127.0.0.1:3000');
    return 'http://127.0.0.1:3000';
  }

  // 4. Default LAN IP of development machine
  const fallbackLan = 'http://192.168.1.8:3000';
  if (__DEV__) console.log('[IPOVault Sync Config] Default LAN API URL:', fallbackLan);
  return fallbackLan;
}

export const API_BASE_URL = getApiBaseUrl();
