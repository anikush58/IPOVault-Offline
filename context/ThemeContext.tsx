import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** The resolved scheme actually applied — always 'light' or 'dark'. */
  resolvedScheme: 'light' | 'dark';
}

const STORAGE_KEY = '@ipo_tracker/theme';

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'light',
  setPreference: () => {},
  resolvedScheme: 'light',
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  const [hydrated, setHydrated] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    safeAsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val === 'light' || val === 'dark' || val === 'system') {
          setPreferenceState(val);
        } else {
          setPreferenceState('light');
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    safeAsyncStorage.setItem(STORAGE_KEY, p);
  }, []);

  const resolvedScheme: 'light' | 'dark' =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  // Don't render children until we know the saved preference (avoids flash)
  if (!hydrated) return null;

  return (
    <ThemeContext.Provider value={{ preference, setPreference, resolvedScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
