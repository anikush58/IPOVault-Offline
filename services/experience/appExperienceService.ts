/**
 * App Experience Service
 * 
 * Manages persistent Pro vs. Non-Pro user interface and workflow modes in IPOVault.
 * 
 * ARCHITECTURAL SPECIFICATION:
 * - Independent from Purchase / Ad Entitlements:
 *   Switching to Pro mode does NOT grant ad-free premium access or alter purchase state.
 *   Ad suppression remains strictly governed by `adEntitlementService`.
 * - Persistence:
 *   Stored via `safeAsyncStorage` under `@ipovault_app_experience_v1`.
 *   Survives app restarts and account changes (logout only clears SQLite user tables).
 * - Navigation mapping:
 *   - Non-Pro: exactly 4 primary navigation items: IPO Hub, Allotment Checker, Users, Settings.
 *   - Pro: complete existing navigation (Home, IPO Hub, Applications, Settings, plus Center FAB).
 */

import { safeAsyncStorage } from '../../utils/safeAsyncStorage';

export type AppExperienceMode = 'pro' | 'non_pro';

export const APP_EXPERIENCE_STORAGE_KEY = '@ipovault_app_experience_v1';

export interface AppExperienceState {
  mode: AppExperienceMode;
  updatedAt: number;
}

export type AppExperienceListener = (state: AppExperienceState) => void;

class AppExperienceService {
  private currentState: AppExperienceState = {
    mode: 'non_pro',
    updatedAt: Date.now(),
  };
  private initialized = false;
  private listeners: Set<AppExperienceListener> = new Set();

  /**
   * Initializes and loads the stored experience mode.
   * Defaults to 'non_pro' if no preference has been saved yet.
   */
  public async getExperienceState(): Promise<AppExperienceState> {
    if (this.initialized) {
      return this.currentState;
    }

    try {
      const raw = await safeAsyncStorage.getItem(APP_EXPERIENCE_STORAGE_KEY);
      if (raw) {
        if (raw === 'pro' || raw === 'non_pro') {
          this.currentState = {
            mode: raw as AppExperienceMode,
            updatedAt: Date.now(),
          };
        } else {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.mode === 'pro' || parsed.mode === 'non_pro')) {
            this.currentState = {
              mode: parsed.mode,
              updatedAt: parsed.updatedAt || Date.now(),
            };
          }
        }
      }
    } catch (err) {
      console.warn('[AppExperienceService] Error reading experience mode:', err);
    }

    this.initialized = true;
    return this.currentState;
  }

  /**
   * Returns current mode synchronously if already initialized, otherwise fallback.
   */
  public getCurrentMode(): AppExperienceMode {
    return this.currentState.mode;
  }

  /**
   * Persists a new experience mode and notifies listeners immediately.
   */
  public async setExperienceMode(mode: AppExperienceMode): Promise<AppExperienceState> {
    this.currentState = {
      mode,
      updatedAt: Date.now(),
    };

    try {
      await safeAsyncStorage.setItem(
        APP_EXPERIENCE_STORAGE_KEY,
        JSON.stringify(this.currentState)
      );
    } catch (err) {
      console.warn('[AppExperienceService] Error persisting experience mode:', err);
    }

    this.notifyListeners();
    return this.currentState;
  }

  /**
   * Toggles between Pro and Non-Pro modes.
   */
  public async toggleExperienceMode(): Promise<AppExperienceState> {
    const nextMode = this.currentState.mode === 'pro' ? 'non_pro' : 'pro';
    return this.setExperienceMode(nextMode);
  }

  /**
   * Subscribes a listener to experience mode updates.
   */
  public subscribe(listener: AppExperienceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState);
      } catch (err) {
        console.error('[AppExperienceService] Error notifying listener:', err);
      }
    });
  }
}

export const appExperienceService = new AppExperienceService();
