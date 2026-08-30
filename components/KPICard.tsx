import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  label: string;
  value: string;
  isPositive?: boolean;
  isNegative?: boolean;
  subtitle?: string;
  style?: ViewStyle;
};

export function KPICard({ label, value, isPositive, isNegative, subtitle, style }: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const valueColor = isPositive
    ? colors.positive
    : isNegative
      ? colors.negative
      : colors.foreground;

  const isPercentageSubtitle = subtitle?.includes('%') && (subtitle.includes('return') || subtitle.includes('profit'));
  const subtitleColor = (isPercentageSubtitle && (isPositive || isNegative))
    ? (isPositive ? colors.positive : colors.negative)
    : colors.mutedForeground;

  // Pick gradient stops based on sentiment
  const gradColors: [string, string] = isPositive
    ? isDark
      ? [colors.positiveBg, colors.card]
      : ['#F0FDF4', '#FFFFFF']
    : isNegative
      ? isDark
        ? [colors.negativeBg, colors.card]
        : ['#FEF2F2', '#FFFFFF']
      : isDark
        ? [colors.card, colors.surface]
        : ['#FFFFFF', '#F8F9FA'];

  return (
    <LinearGradient
      colors={gradColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: colors.border }, style]}
    >
      <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: subtitleColor }]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  label: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginBottom: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginTop: 6,
    letterSpacing: 0.1,
  },
});
