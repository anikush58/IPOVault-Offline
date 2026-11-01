/**
 * ProFeatureBanner
 * 
 * Safely handles deep links into hidden Pro screens when the app is in Non-Pro mode.
 * Informs the user of the Pro capability without breaking or throwing errors,
 * and allows instant 1-tap switching to Pro Experience.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useAppExperience } from '@/context/AppExperienceContext';
import { DesignSystem } from '@/constants/DesignSystem';

export interface ProFeatureBannerProps {
  featureName?: string;
  style?: any;
}

export const ProFeatureBanner: React.FC<ProFeatureBannerProps> = ({
  featureName = 'This feature',
  style,
}) => {
  const { isNonPro } = useAppExperience();
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();

  if (!isNonPro) {
    return null;
  }

  const handleBackToHub = () => {
    try {
      Haptics.selectionAsync();
    } catch {}
    if (typeof (router as any).navigate === 'function') {
      (router as any).navigate('/(tabs)/ipos');
    } else {
      router.replace('/(tabs)/ipos');
    }
  };

  return (
    <View
      style={[
        styles.bannerCard,
        {
          backgroundColor: isDark ? '#1C1917' : '#FFFBEB',
          borderColor: isDark ? '#78350F' : '#FCD34D',
        },
        style,
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { backgroundColor: isDark ? '#78350F40' : '#FEF3C7' }]}>
          <Feather name="star" size={16} color={isDark ? '#FBBF24' : '#D97706'} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: isDark ? '#FDE68A' : '#92400E' }]}>
            {featureName} is reserved for Pro members
          </Text>
          <Text style={[styles.desc, { color: isDark ? '#FDE047CC' : '#B45309' }]}>
            This screen is part of the Pro tier. Pro access is managed through administrator User Management.
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={handleBackToHub}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Feather name="arrow-left" size={13} color={colors.primaryForeground} />
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
            Back to IPO Hub
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bannerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 10,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  desc: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  primaryBtnText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  secondaryBtn: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
