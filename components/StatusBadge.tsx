import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { ApplicationStatus } from '@/context/DBContext';

type Props = { status: ApplicationStatus; small?: boolean };

export function StatusBadge({ status, small }: Props) {
  const colors = useColors();

  const config: Record<ApplicationStatus, { bg: string; text: string; dot: string }> = {
    Applied: {
      bg: colors.statusAppliedBg,
      text: colors.statusApplied,
      dot: colors.statusApplied,
    },
    'Mandate Approved': {
      bg: '#DBEAFE',
      text: '#2563EB',
      dot: '#2563EB',
    },
    Allotted: {
      bg: colors.statusAllottedBg,
      text: colors.statusAllotted,
      dot: colors.statusAllotted,
    },
    'Partially Allotted': {
      bg: '#D1FAE5',
      text: '#059669',
      dot: '#059669',
    },
    Holding: {
      bg: colors.statusHoldingBg,
      text: colors.statusHolding,
      dot: colors.statusHolding,
    },
    'Not Allotted': {
      bg: colors.statusNotAllottedBg,
      text: colors.statusNotAllotted,
      dot: colors.statusNotAllotted,
    },
    Sold: {
      bg: colors.statusSoldBg,
      text: colors.statusSold,
      dot: colors.statusSold,
    },
  };

  const { bg, text, dot } = config[status] ?? config['Applied'];

  return (
    <View style={[styles.badge, { backgroundColor: bg }, small && styles.badgeSmall]}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.text, { color: text }, small && styles.textSmall]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  text: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.1,
  },
  textSmall: {
    fontSize: 10.5,
  },
});
