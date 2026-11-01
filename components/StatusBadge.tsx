import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { ApplicationStatus } from '@/context/DBContext';

type Props = { status: ApplicationStatus; small?: boolean };

export function StatusBadge({ status, small }: Props) {
  const colors = useColors();

  const config: Record<ApplicationStatus, { bg: string; text: string }> = {
    Applied: {
      bg: colors.statusAppliedBg,
      text: '#FFFFFF',
    },
    'Mandate Approved': {
      bg: colors.statusAppliedBg,
      text: '#FFFFFF',
    },
    Allotted: {
      bg: colors.statusAllottedBg,
      text: '#FFFFFF',
    },
    'Partially Allotted': {
      bg: colors.statusAllottedBg,
      text: '#FFFFFF',
    },
    Holding: {
      bg: colors.statusHoldingBg,
      text: '#FFFFFF',
    },
    'Not Allotted': {
      bg: colors.statusNotAllottedBg,
      text: '#FFFFFF',
    },
    Sold: {
      bg: colors.statusSoldBg,
      text: '#FFFFFF',
    },
    Cancelled: {
      bg: colors.statusRefundBg,
      text: '#FFFFFF',
    },
  };

  const { bg, text } = config[status] ?? config['Applied'];

  return (
    <View style={[styles.badge, { backgroundColor: bg }, small && styles.badgeSmall]}>
      <Text style={[styles.text, { color: text }, small && styles.textSmall]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  text: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.1,
  },
  textSmall: {
    fontSize: 8.5,
  },
});

