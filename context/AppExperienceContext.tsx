/**
 * App Experience Context
 * 
 * Provides reactive access to the Pro vs. Non-Pro experience state across the entire app.
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { AppState } from 'react-native';
import {
  appExperienceService,
  AppExperienceMode,
  AppExperienceState,
} from '@/services/experience/appExperienceService';
import {
  userEntitlementService,
  UserEntitlementState,
  UserEntitlementTier,
  EntitlementLifecycleStatus,
} from '@/services/user/userEntitlementService';

export interface AppExperienceContextValue {
  mode: AppExperienceMode;
  tier: UserEntitlementTier;
  isPro: boolean;
  isNonPro: boolean;
  status: EntitlementLifecycleStatus;
  isLoading: boolean;
  isReady: boolean;
  isRefreshing: boolean;
  isPolling: boolean;
  setMode: (mode: AppExperienceMode) => Promise<void>;
  toggleMode: () => Promise<void>;
  refreshEntitlement: () => Promise<UserEntitlementState>;
}

const AppExperienceContext = createContext<AppExperienceContextValue>({
  mode: 'non_pro',
  tier: 'NON_PRO',
  isPro: false,
  isNonPro: true,
  status: 'ready',
  isLoading: true,
  isReady: false,
  isRefreshing: false,
  isPolling: false,
  setMode: async () => {},
  toggleMode: async () => {},
  refreshEntitlement: async () => userEntitlementService.getCurrentState(),
});

export const AppExperienceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entitlementState, setEntitlementState] = useState<UserEntitlementState>(() =>
    userEntitlementService.getCurrentState()
  );
  const [experienceState, setExperienceState] = useState<AppExperienceState>(() => ({
    mode: userEntitlementService.isPro ? 'pro' : 'non_pro',
    updatedAt: Date.now(),
  }));
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Safety fallback timer: unblock startup if experience or entitlement loading stalls
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        setIsInitializing(false);
      }
    }, 2000);

    // Load initial experience state synced with verified backend entitlement
    Promise.all([
      appExperienceService.getExperienceState().catch(() => null),
      userEntitlementService.getEntitlementState().catch(() => null),
    ])
      .then(([exp, ent]) => {
        if (isMounted) {
          clearTimeout(fallbackTimer);
          if (exp) setExperienceState(exp);
          if (ent) setEntitlementState(ent);
          setIsInitializing(false);
        }
      })
      .catch((err) => {
        if (__DEV__) console.warn('[AppExperienceContext] Init error:', err);
        if (isMounted) {
          clearTimeout(fallbackTimer);
          setIsInitializing(false);
        }
      });

    const unsubExp = appExperienceService.subscribe((newExp) => {
      if (isMounted) {
        setExperienceState(newExp);
      }
    });

    const unsubEntitlement = userEntitlementService.subscribe((newEnt) => {
      if (isMounted) {
        setEntitlementState(newEnt);
        const effectiveMode = newEnt.isPro ? 'pro' : 'non_pro';
        setExperienceState((prev) =>
          prev.mode !== effectiveMode ? { mode: effectiveMode, updatedAt: Date.now() } : prev
        );
      }
    });

    const appStateSubscription = userEntitlementService.attachAppStateListener(AppState);

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      unsubExp();
      unsubEntitlement();
      if (appStateSubscription && typeof appStateSubscription.remove === 'function') {
        appStateSubscription.remove();
      }
    };
  }, []);

  const setMode = useCallback(async (newMode: AppExperienceMode) => {
    // Client controls cannot grant Pro without verified server entitlement
    if (newMode === 'pro' && !userEntitlementService.isPro) {
      console.warn('[AppExperienceContext] Pro mode rejected: backend entitlement required');
      return;
    }
    const updated = await appExperienceService.setExperienceMode(newMode);
    setExperienceState(updated);
  }, []);

  const toggleMode = useCallback(async () => {
    if (!userEntitlementService.isPro) {
      console.warn('[AppExperienceContext] Pro mode toggle rejected: backend entitlement required');
      return;
    }
    const updated = await appExperienceService.toggleExperienceMode();
    setExperienceState(updated);
  }, []);

  const refreshEntitlement = useCallback(async () => {
    return userEntitlementService.refreshEntitlement();
  }, []);

  const isPro = entitlementState.tier === 'PRO' && userEntitlementService.isPro;
  const isNonPro = !isPro;
  const status = entitlementState.status;
  const isLoading = isInitializing || status === 'loading';
  const isReady = !isLoading;
  const isRefreshing = status === 'refreshing';
  const isPolling = userEntitlementService.isPolling;

  const value = useMemo<AppExperienceContextValue>(
    () => ({
      mode: isPro ? 'pro' : 'non_pro',
      tier: entitlementState.tier,
      isPro,
      isNonPro,
      status,
      isLoading,
      isReady,
      isRefreshing,
      isPolling,
      setMode,
      toggleMode,
      refreshEntitlement,
    }),
    [isPro, isNonPro, entitlementState.tier, status, isLoading, isReady, isRefreshing, isPolling, setMode, toggleMode, refreshEntitlement]
  );

  return (
    <AppExperienceContext.Provider value={value}>
      {children}
    </AppExperienceContext.Provider>
  );
};

export function useAppExperience(): AppExperienceContextValue {
  return useContext(AppExperienceContext);
}

