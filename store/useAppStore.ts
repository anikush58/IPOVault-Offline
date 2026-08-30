import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { AppStoreState, SettingsState, ThemeState, UserProfile } from "../types/store";

export interface AppStoreContextType {
  state: AppStoreState;
  setAuthUser: (user: UserProfile | null, accessToken?: string | null) => void;
  clearAuth: () => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  updateSettings: (partial: Partial<SettingsState>) => void;
  setThemeMode: (mode: ThemeState["mode"]) => void;
  setCacheItem: (key: string, data: unknown) => void;
  clearCache: () => void;
}

const initialStoreState: AppStoreState = {
  auth: {
    user: null,
    isAuthenticated: false,
    accessToken: null,
  },
  watchlist: {
    symbols: [],
  },
  settings: {
    currency: "INR",
    notificationsEnabled: true,
    biometricsEnabled: false,
  },
  theme: {
    mode: "system",
  },
  cache: {
    ipoCache: {},
  },
};

const AppStoreContext = createContext<AppStoreContextType | null>(null);

export const AppStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppStoreState>(initialStoreState);

  const setAuthUser = useCallback((user: UserProfile | null, accessToken: string | null = null) => {
    setState((prev) => ({
      ...prev,
      auth: {
        user,
        isAuthenticated: !!user,
        accessToken,
      },
    }));
  }, []);

  const clearAuth = useCallback(() => {
    setState((prev) => ({
      ...prev,
      auth: {
        user: null,
        isAuthenticated: false,
        accessToken: null,
      },
    }));
  }, []);

  const addToWatchlist = useCallback((symbol: string) => {
    setState((prev) => {
      if (prev.watchlist.symbols.includes(symbol)) return prev;
      return {
        ...prev,
        watchlist: {
          symbols: [...prev.watchlist.symbols, symbol],
        },
      };
    });
  }, []);

  const removeFromWatchlist = useCallback((symbol: string) => {
    setState((prev) => ({
      ...prev,
      watchlist: {
        symbols: prev.watchlist.symbols.filter((s) => s !== symbol),
      },
    }));
  }, []);

  const updateSettings = useCallback((partial: Partial<SettingsState>) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...partial,
      },
    }));
  }, []);

  const setThemeMode = useCallback((mode: ThemeState["mode"]) => {
    setState((prev) => ({
      ...prev,
      theme: { mode },
    }));
  }, []);

  const setCacheItem = useCallback((key: string, data: unknown) => {
    setState((prev) => ({
      ...prev,
      cache: {
        ipoCache: {
          ...prev.cache.ipoCache,
          [key]: { data, cachedAt: Date.now() },
        },
      },
    }));
  }, []);

  const clearCache = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cache: { ipoCache: {} },
    }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      setAuthUser,
      clearAuth,
      addToWatchlist,
      removeFromWatchlist,
      updateSettings,
      setThemeMode,
      setCacheItem,
      clearCache,
    }),
    [state, setAuthUser, clearAuth, addToWatchlist, removeFromWatchlist, updateSettings, setThemeMode, setCacheItem, clearCache]
  );

  return React.createElement(AppStoreContext.Provider, { value }, children);
};

export function useAppStore(): AppStoreContextType {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error("useAppStore must be used within an AppStoreProvider");
  }
  return context;
}
