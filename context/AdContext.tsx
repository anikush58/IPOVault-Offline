/**
 * IPOVault Ad & Entitlement Context
 * Single source of truth for ad suppression, mock premium state, and consent gating.
 */

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { adEntitlementService, AdEntitlementState } from '@/services/ads/adEntitlementService';
import { adConsentService } from '@/services/ads/adConsentService';
import { adInitializationService } from '@/services/ads/adInitializationService';

export interface AdContextType {
  isPremium: boolean;
  adsEnabled: boolean;
  isDevMock: boolean;
  isConsentReady: boolean;
  canRequestAds: boolean;
  isNativeAdMobSupported: boolean;
  toggleDevMockPremium: () => Promise<void>;
  setDevMockPremium: (enabled: boolean) => Promise<void>;
  showPrivacyOptions: () => Promise<boolean>;
}

const AdContext = createContext<AdContextType>({
  isPremium: false,
  adsEnabled: false,
  isDevMock: false,
  isConsentReady: false,
  canRequestAds: false,
  isNativeAdMobSupported: false,
  toggleDevMockPremium: async () => {},
  setDevMockPremium: async () => {},
  showPrivacyOptions: async () => false,
});

export const AdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entitlement, setEntitlement] = useState<AdEntitlementState>({
    isPremium: false,
    isDevMock: false,
    tier: 'free',
    source: 'none',
    updatedAt: Date.now(),
  });
  const [isConsentReady, setIsConsentReady] = useState(false);
  const [canRequestAds, setCanRequestAds] = useState(adConsentService.getCanRequestAds());

  useEffect(() => {
    // 1. Load initial entitlement state
    adEntitlementService.getEntitlementState().then(setEntitlement);

    // 2. Subscribe to entitlement updates
    const unsubscribeEntitlement = adEntitlementService.subscribe((newState) => {
      setEntitlement(newState);
    });

    // 3. Subscribe to consent updates
    const unsubscribeConsent = adConsentService.subscribe((allowed) => {
      setCanRequestAds(allowed);
      if (allowed) {
        adInitializationService.initialize().catch(() => {});
      }
    });

    // 4. Initialize consent in background (non-blocking)
    adConsentService.initializeConsent().then((res) => {
      setIsConsentReady(true);
      setCanRequestAds(res.canRequestAds);

      // 5. Initialize AdMob SDK after consent determination (Google recommendation)
      if (res.canRequestAds) {
        adInitializationService.initialize().catch(() => {});
      }
    }).catch(() => {
      setIsConsentReady(true);
      setCanRequestAds(false);
    });

    return () => {
      unsubscribeEntitlement();
      unsubscribeConsent();
    };
  }, []);

  const toggleDevMockPremium = async () => {
    const updated = await adEntitlementService.toggleDevMockPremium();
    setEntitlement(updated);
  };

  const setDevMockPremium = async (enabled: boolean) => {
    const updated = await adEntitlementService.setDevMockPremium(enabled);
    setEntitlement(updated);
  };

  const showPrivacyOptions = async () => {
    const res = await adConsentService.showPrivacyOptionsForm();
    setCanRequestAds(adConsentService.getCanRequestAds());
    return res.opened;
  };

  const isNativeAdMobSupported = useMemo(() => {
    return adInitializationService.isNativeAdMobSupported();
  }, []);

  // Strict gating: adsEnabled is true ONLY if user is not premium AND consent allows ad requests
  const adsEnabled = useMemo(() => {
    return !entitlement.isPremium && canRequestAds;
  }, [entitlement.isPremium, canRequestAds]);

  const value: AdContextType = useMemo(
    () => ({
      isPremium: entitlement.isPremium,
      adsEnabled,
      isDevMock: entitlement.isDevMock,
      isConsentReady,
      canRequestAds,
      isNativeAdMobSupported,
      toggleDevMockPremium,
      setDevMockPremium,
      showPrivacyOptions,
    }),
    [entitlement, adsEnabled, isConsentReady, canRequestAds, isNativeAdMobSupported]
  );

  return <AdContext.Provider value={value}>{children}</AdContext.Provider>;
};

export function useAdContext(): AdContextType {
  return useContext(AdContext);
}
