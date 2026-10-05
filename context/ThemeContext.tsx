import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';
export type AccentKey = 'blue' | 'purple' | 'emerald' | 'amber' | 'rose';

export const ACCENT_COLOR_MAP: Record<AccentKey, string> = {
  blue: '#3B82F6',
  purple: '#8B5CF6',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
};

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** The resolved scheme actually applied — always 'light' or 'dark'. */
  resolvedScheme: 'light' | 'dark';
  /** The active hex accent color. */
  accentColor: string;
  /** The active accent key. */
  accentKey: AccentKey;
  /** Update the active accent color. */
  setAccentColor: (accent: AccentKey) => void;
}

const STORAGE_KEY = '@ipo_tracker/theme';
const ACCENT_STORAGE_KEY = '@ipo_tracker/accent_color';

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'light',
  setPreference: () => {},
  resolvedScheme: 'light',
  accentColor: ACCENT_COLOR_MAP.blue,
  accentKey: 'blue',
  setAccentColor: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  const [accentKey, setAccentKeyState] = useState<AccentKey>('blue');
  const [hydrated, setHydrated] = useState(false);

  // Load saved preference and accent on mount
  useEffect(() => {
    Promise.all([
      safeAsyncStorage.getItem(STORAGE_KEY),
      safeAsyncStorage.getItem(ACCENT_STORAGE_KEY),
    ])
      .then(([savedTheme, savedAccent]) => {
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setPreferenceState(savedTheme);
        } else {
          setPreferenceState('light');
        }

        if (savedAccent && savedAccent in ACCENT_COLOR_MAP) {
          setAccentKeyState(savedAccent as AccentKey);
        } else {
          setAccentKeyState('blue');
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    safeAsyncStorage.setItem(STORAGE_KEY, p);
  }, []);

  const setAccentColor = useCallback((accent: AccentKey) => {
    setAccentKeyState(accent);
    safeAsyncStorage.setItem(ACCENT_STORAGE_KEY, accent);
  }, []);

  const resolvedScheme: 'light' | 'dark' =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const accentColor = ACCENT_COLOR_MAP[accentKey] || ACCENT_COLOR_MAP.blue;

  // Don't render children until we know the saved preference (avoids flash)
  if (!hydrated) return null;

  return (
    <ThemeContext.Provider
      value={{
        preference,
        setPreference,
        resolvedScheme,
        accentColor,
        accentKey,
        setAccentColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
