/**
 * Reusable Native Ad Card Component
 *
 * DESIGN & COMPLIANCE SPECIFICATIONS:
 * - Rendered inside the IPO browsing list (`app/new-ipos.tsx`).
 * - Perfectly mirrors IPOVault's card elevation, border styling, and typography.
 * - Prominently displays an "Ad" badge to strictly satisfy Google AdMob native ad policies.
 * - Suppresses completely when the user has active ad-free entitlement (`isPremium === true`).
 * - In Expo Go / dev environments, renders a stylized preview card explaining the dev build requirement.
 * - Absolutely zero financial, portfolio, or user identity data is leaked.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAdContext } from '@/context/AdContext';
import { getNativeAdUnitId, isAdConfigurationValid, buildSanitizedAdRequestOptions } from '@/services/ads/adConfig';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { DesignSystem } from '@/constants/DesignSystem';

export interface NativeAdCardProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const NativeAdCard: React.FC<NativeAdCardProps> = React.memo(({
  style,
  testID = 'native-ad-card',
}) => {
  const { adsEnabled, canRequestAds, isNativeAdMobSupported } = useAdContext();
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const [nativeAdInstance, setNativeAdInstance] = useState<any>(null);
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Persistent reference to the native ad instance for leak-free lifecycle cleanup
  const adRef = useRef<any>(null);
  const isRequestingRef = useRef(false);

  // Load native ad when native module is supported and consent is active
  useEffect(() => {
    let isMounted = true;

    if (adsEnabled && canRequestAds && isNativeAdMobSupported && Platform.OS !== 'web') {
      const adUnitId = getNativeAdUnitId();

      // Validate ID: collapse safely if configuration is missing or invalid
      if (!isAdConfigurationValid(adUnitId)) {
        setHasError(true);
        return;
      }

      // Prevent duplicate concurrent requests on rerenders
      if (isRequestingRef.current || adRef.current) {
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { NativeAd } = require('react-native-google-mobile-ads');
        const requestOptions = buildSanitizedAdRequestOptions();

        isRequestingRef.current = true;
        setLoading(true);

        NativeAd.createForAdRequest(adUnitId, requestOptions)
          .then((ad: any) => {
            isRequestingRef.current = false;
            if (isMounted) {
              adRef.current = ad;
              setNativeAdInstance(ad);
              setLoading(false);
            } else {
              // Component unmounted while ad request was in-flight: destroy immediately
              try {
                ad?.destroy?.();
              } catch {}
            }
          })
          .catch((err: unknown) => {
            isRequestingRef.current = false;
            console.warn('[NativeAdCard] Failed to load native ad:', err);
            if (isMounted) {
              setHasError(true);
              setLoading(false);
            }
          });
      } catch (err) {
        isRequestingRef.current = false;
        console.warn('[NativeAdCard] NativeAd initialization error:', err);
        setHasError(true);
      }
    }

    return () => {
      isMounted = false;
      if (adRef.current && typeof adRef.current.destroy === 'function') {
        try {
          adRef.current.destroy();
        } catch {}
        adRef.current = null;
      }
    };
  }, [adsEnabled, canRequestAds, isNativeAdMobSupported]);

  // 1. Premium suppression or consent ungranted
  if (!adsEnabled || !canRequestAds) {
    return null;
  }

  // 2. Error collapse
  if (hasError) {
    return null;
  }

  // 4. Render real native ad if loaded and in native build
  if (isNativeAdMobSupported && nativeAdInstance && Platform.OS !== 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NativeAdView, NativeAsset, NativeAssetType } = require('react-native-google-mobile-ads');

      return (
        <NativeAdView
          testID={testID}
          nativeAd={nativeAdInstance}
          style={[
            styles.cardContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
            style,
          ]}
        >
          {/* Header Row with "Ad" badge */}
          <View style={styles.headerRow}>
            <View style={styles.badgeGroup}>
              <View style={[styles.adBadge, { backgroundColor: isDark ? '#D9770630' : '#FEF3C7', borderColor: '#D97706' }]}>
                <Text style={[styles.adBadgeText, { color: isDark ? '#FBBF24' : '#B45309' }]}>Ad</Text>
              </View>
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text style={[styles.advertiserText, { color: colors.mutedForeground }]}>
                  {nativeAdInstance.advertiser || 'Sponsored'}
                </Text>
              </NativeAsset>
            </View>
          </View>

          {/* Headline */}
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={[styles.headlineText, { color: colors.foreground }]} numberOfLines={2}>
              {nativeAdInstance.headline || ''}
            </Text>
          </NativeAsset>

          {/* Body */}
          {nativeAdInstance.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={[styles.bodyText, { color: colors.mutedForeground }]} numberOfLines={3}>
                {nativeAdInstance.body}
              </Text>
            </NativeAsset>
          ) : null}

          {/* CTA Footer */}
          <View style={styles.footerRow}>
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.ctaButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.ctaButtonText}>
                  {nativeAdInstance.callToAction || 'Learn More'}
                </Text>
                <Feather name="arrow-up-right" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </NativeAsset>
          </View>
        </NativeAdView>
      );
    } catch (err) {
      console.warn('[NativeAdCard] Error rendering NativeAdView:', err);
      return null;
    }
  }

  // 5. Development preview in Expo Go / mock mode
  if (__DEV__) {
    return (
      <View
        testID={testID}
        style={[
          styles.cardContainer,
          styles.devBorder,
          {
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : '#F8FAFC',
            borderColor: isDark ? '#334155' : '#E2E8F0',
          },
          style,
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.badgeGroup}>
            <View style={[styles.adBadge, { backgroundColor: isDark ? '#D9770630' : '#FEF3C7', borderColor: '#D97706' }]}>
              <Text style={[styles.adBadgeText, { color: isDark ? '#FBBF24' : '#B45309' }]}>Ad</Text>
            </View>
            <Text style={[styles.advertiserText, { color: colors.mutedForeground }]}>
              Google AdMob Test Partner
            </Text>
          </View>
          <View style={styles.devSimulatedPill}>
            <Text style={[styles.devSimulatedText, { color: colors.primary }]}>TEST AD</Text>
          </View>
        </View>

        <Text style={[styles.headlineText, { color: colors.foreground }]}>
          Test Native Ad Placement
        </Text>
        <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
          Native ad in IPO list previewing typography, margins, and policy badge in Expo Go. Real native ads render via custom Android dev build.
        </Text>

        <View style={styles.footerRow}>
          <View style={[styles.ctaButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.ctaButtonText}>Learn More</Text>
            <Feather name="arrow-up-right" size={14} color="#FFFFFF" />
          </View>
        </View>
      </View>
    );
  }

  return null;
});

NativeAdCard.displayName = 'NativeAdCard';

const styles = StyleSheet.create({
  cardContainer: {
    padding: 16,
    borderRadius: DesignSystem.radius.lg,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  devBorder: {
    borderStyle: 'dashed',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: DesignSystem.radius.xs,
    borderWidth: 1,
  },
  adBadgeText: {
    fontSize: 10,
    fontFamily: DesignSystem.typography.fontBold,
    letterSpacing: 0.5,
  },
  advertiserText: {
    fontSize: 12,
    fontFamily: DesignSystem.typography.fontMedium,
  },
  devSimulatedPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: DesignSystem.radius.pill,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  devSimulatedText: {
    fontSize: 9,
    fontFamily: DesignSystem.typography.fontBold,
    letterSpacing: 0.5,
  },
  headlineText: {
    fontSize: 15,
    fontFamily: DesignSystem.typography.fontBold,
    marginBottom: 6,
    lineHeight: 20,
  },
  bodyText: {
    fontSize: 12,
    fontFamily: DesignSystem.typography.fontRegular,
    lineHeight: 17,
    marginBottom: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: DesignSystem.radius.sm,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: DesignSystem.typography.fontSemiBold,
  },
});
