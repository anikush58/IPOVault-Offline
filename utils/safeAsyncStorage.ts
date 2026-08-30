import AsyncStorage from '@react-native-async-storage/async-storage';

function isValidKey(key: any): boolean {
  if (typeof key !== 'string' || key.trim() === '') {
    if (__DEV__) {
      console.warn(`[AsyncStorage Warning] Invalid key passed: ${String(key)}`);
    }
    return false;
  }
  return true;
}

export const safeAsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!isValidKey(key)) return null;
    try {
      return await AsyncStorage.getItem(key);
    } catch (err) {
      if (__DEV__) console.warn('[AsyncStorage Error] getItem:', key, err);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!isValidKey(key)) return;
    try {
      const valStr = value === undefined || value === null ? '' : String(value);
      await AsyncStorage.setItem(key, valStr);
    } catch (err) {
      if (__DEV__) console.warn('[AsyncStorage Error] setItem:', key, err);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (!isValidKey(key)) return;
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      if (__DEV__) console.warn('[AsyncStorage Error] removeItem:', key, err);
    }
  },

  async mergeItem(key: string, value: string): Promise<void> {
    if (!isValidKey(key)) return;
    try {
      const valStr = value === undefined || value === null ? '' : String(value);
      await AsyncStorage.mergeItem(key, valStr);
    } catch (err) {
      if (__DEV__) console.warn('[AsyncStorage Error] mergeItem:', key, err);
    }
  },

  async multiGet(keys: string[]): Promise<readonly [string, string | null][]> {
    if (!Array.isArray(keys)) {
      if (__DEV__) console.warn('[AsyncStorage Warning] multiGet passed non-array keys:', keys);
      return [];
    }
    const validKeys = keys.filter(isValidKey);
    if (validKeys.length === 0) return [];
    try {
      return await AsyncStorage.multiGet(validKeys);
    } catch (err) {
      if (__DEV__) console.warn('[AsyncStorage Error] multiGet:', keys, err);
      return [];
    }
  },

  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    if (!Array.isArray(keyValuePairs)) {
      if (__DEV__) console.warn('[AsyncStorage Warning] multiSet passed non-array pairs:', keyValuePairs);
      return;
    }
    const validPairs = keyValuePairs.filter(([k]) => isValidKey(k));
    if (validPairs.length === 0) return;
    try {
      await AsyncStorage.multiSet(validPairs);
    } catch (err) {
      if (__DEV__) console.warn('[AsyncStorage Error] multiSet:', keyValuePairs, err);
    }
  },

  async multiRemove(keys: string[]): Promise<void> {
    if (!Array.isArray(keys)) {
      if (__DEV__) console.warn('[AsyncStorage Warning] multiRemove passed non-array keys:', keys);
      return;
    }
    const validKeys = keys.filter(isValidKey);
    if (validKeys.length === 0) return;
    try {
      await AsyncStorage.multiRemove(validKeys);
    } catch (err) {
      if (__DEV__) console.warn('[AsyncStorage Error] multiRemove:', keys, err);
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (err) {
      if (__DEV__) console.warn('[AsyncStorage Error] clear:', err);
    }
  },
};
