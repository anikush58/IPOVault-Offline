/**
 * Reusable Banner Ad Component
 *
 * SAFETY & POLICY GUARANTEES:
 * - Completely suppressed when user has ad-free premium entitlement (`isPremium === true`).
 * - Graceful fallback / collapse on no-fill, offline, or network errors (no empty gaps).
 * - Safe for Expo Go / Web / Test environments without native crashes.
 * - In __DEV__ mode on non-native runtimes, displays a clean design-system preview card.
 * - Only uses official Google Test ad unit IDs. Zero financial/portfolio data leaked.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle, StyleProp } from 'react-native';
import { useAdContext } from '@/context/AdContext';
import { getBannerAdUnitId, buildSanitizedAdRequestOptions } from '@/services/ads/adConfig';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { DesignSystem } from '@/constants/DesignSystem';

export interface BannerAdViewProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const BannerAdView: React.FC<BannerAdViewProps> = ({ style, testID = 'banner-ad-view' }) => {
  const { adsEnabled, canRequestAds, isNativeAdMobSupported } = useAdContext();
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. Premium suppression or consent ungranted
  if (!adsEnabled || !canRequestAds) {
    return null;
  }

  // 2. If an error occurred or ad failed to load, collapse completely
  if (hasError) {
    return null;
  }

  // 3. Native AdMob execution (inside standalone APK or Android Development Build)
  if (isNativeAdMobSupported && Platform.OS !== 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BannerAd, BannerAdSize } = require('react-native-google-mobile-ads');
      const adUnitId = getBannerAdUnitId();
      const requestOptions = buildSanitizedAdRequestOptions();

      return (
        <View
          testID={testID}
          style={[
            styles.container,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' },
            style,
          ]}
        >
          <View style={styles.adLabelRow}>
            <View style={[styles.adBadge, { borderColor: colors.border }]}>
              <Text style={[styles.adBadgeText, { color: colors.mutedForeground }]}>Ad</Text>
            </View>
          </View>
          <BannerAd
            unitId={adUnitId}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={requestOptions}
            onAdLoaded={() => setIsLoaded(true)}
            onAdFailedToLoad={(error: unknown) => {
              console.warn('[BannerAdView] Ad failed to load, collapsing view:', error);
              setHasError(true);
            }}
          />
        </View>
      );
    } catch (err) {
      console.warn('[BannerAdView] Native BannerAd threw, falling back:', err);
    }
  }

  // 4. Development & Expo Go preview placeholder (simulates placement without native build crash)
  if (__DEV__) {
    return (
      <View
        testID={testID}
        style={[
          styles.container,
          styles.devPlaceholder,
          {
            backgroundColor: isDark ? '#1A1D24' : '#F1F5F9',
            borderColor: isDark ? '#2D3748' : '#E2E8F0',
          },
          style,
        ]}
      >
        <View style={styles.devPlaceholderContent}>
          <View style={styles.devHeaderRow}>
            <View style={[styles.adBadge, { backgroundColor: isDark ? '#374151' : '#E2E8F0' }]}>
              <Text style={[styles.adBadgeText, { color: isDark ? '#F9FAFB' : '#1F2937' }]}>Ad</Text>
            </View>
            <Text style={[styles.devBadgeText, { color: colors.primary }]}>GOOGLE ADMOB TEST BANNER</Text>
          </View>
          <Text style={[styles.devSubText, { color: colors.mutedForeground }]}>
            Previewing banner placement in Expo Go. Real Google test ads render in native Android dev build.
          </Text>
        </View>
      </View>
    );
  }

  // In production non-native environments (e.g. web fallback), collapse cleanly
  return null;
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: DesignSystem.radius.sm,
    marginVertical: DesignSystem.spacing.sm,
  },
  adLabelRow: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  adBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  adBadgeText: {
    fontSize: 9,
    fontFamily: DesignSystem.typography.fontSemiBold,
    letterSpacing: 0.5,
  },
  devPlaceholder: {
    padding: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    minHeight: 60,
  },
  devPlaceholderContent: {
    width: '100%',
    alignItems: 'center',
  },
  devHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  devBadgeText: {
    fontSize: 11,
    fontFamily: DesignSystem.typography.fontBold,
    letterSpacing: 0.6,
  },
  devSubText: {
    fontSize: 11,
    fontFamily: DesignSystem.typography.fontRegular,
    textAlign: 'center',
  },
});
