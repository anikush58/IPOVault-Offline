import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = {
  text: string;
  variant?: 'primary' | 'success' | 'warning' | 'info' | 'gold' | 'neutral';
};

export const MetricBadge = React.memo(function MetricBadge({ text, variant = 'neutral' }: Props) {
  const colors = useColors();

  const getStyle = () => {
    switch (variant) {
      case 'gold':
        return { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' };
      case 'success':
        return { bg: colors.positiveBg, border: colors.positive + '40', text: colors.positive };
      case 'warning':
        return { bg: '#FFFBEC', border: '#F59E0B40', text: '#D97706' };
      case 'info':
        return { bg: colors.primary + '12', border: colors.primary + '30', text: colors.primary };
      case 'neutral':
      default:
        return { bg: colors.surface, border: colors.border, text: colors.mutedForeground };
    }
  };

  const styleConfig = getStyle();

  return (
    <View style={[styles.badge, { backgroundColor: styleConfig.bg, borderColor: styleConfig.border }]}>
      <Text style={[styles.text, { color: styleConfig.text }]}>{text}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.2,
  },
});
