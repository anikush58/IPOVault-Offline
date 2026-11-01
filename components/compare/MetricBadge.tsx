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
        return { bg: '#F59E0B', text: '#FFFFFF' };
      case 'success':
        return { bg: '#10B981', text: '#FFFFFF' };
      case 'warning':
        return { bg: '#F59E0B', text: '#FFFFFF' };
      case 'info':
        return { bg: '#2563EB', text: '#FFFFFF' };
      case 'primary':
        return { bg: colors.primary, text: '#FFFFFF' };
      case 'neutral':
      default:
        return { bg: '#64748B', text: '#FFFFFF' };
    }
  };

  const styleConfig = getStyle();

  return (
    <View style={[styles.badge, { backgroundColor: styleConfig.bg }]}>
      <Text style={[styles.text, { color: styleConfig.text }]}>{text}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.2,
  },
});
