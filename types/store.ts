import { ThemeMode } from "./theme";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  accessToken: string | null;
}

export interface WatchlistState {
  symbols: string[];
}

export interface SettingsState {
  currency: string;
  notificationsEnabled: boolean;
  biometricsEnabled: boolean;
}

export interface ThemeState {
  mode: ThemeMode;
}

export interface CachedDataState {
  ipoCache: Record<string, { data: unknown; cachedAt: number }>;
}

export interface AppStoreState {
  auth: AuthState;
  watchlist: WatchlistState;
  settings: SettingsState;
  theme: ThemeState;
  cache: CachedDataState;
}
