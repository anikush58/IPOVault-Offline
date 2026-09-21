import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export type IPOStatusType = 'Upcoming' | 'Open' | 'Closed' | 'Allotment' | 'Listed' | string;

export function IPOStatusChip({ status }: { status: IPOStatusType }) {
  const colors = useColors();

  const getStyle = (st: string) => {
    const s = (st || '').toLowerCase().trim();
    if (s === 'closing_today' || s === 'closing today' || s === 'closes today' || s === 'closing soon' || s === 'closing') {
      return {
        bg: '#FEF3C7',
        border: 'rgba(217, 119, 6, 0.3)',
        text: '#D97706',
        dot: '#D97706',
      };
    }
    if (s === 'open' || s === 'live bid' || s === 'live' || s === 'live now') {
      return {
        bg: '#DCFCE7',
        border: 'rgba(21, 128, 61, 0.3)',
        text: '#15803D',
        dot: '#15803D',
      };
    }
    if (s === 'pre-apply' || s === 'pre_apply' || s === 'preapply') {
      return {
        bg: 'rgba(6, 182, 212, 0.10)',
        border: 'rgba(6, 182, 212, 0.22)',
        text: '#06B6D4',
        dot: '#06B6D4',
      };
    }
    if (s === 'upcoming') {
      return {
        bg: 'rgba(59, 130, 246, 0.10)',
        border: 'rgba(59, 130, 246, 0.22)',
        text: '#3B82F6',
        dot: '#3B82F6',
      };
    }
    if (s === 'awaiting allotment' || s === 'awaiting_allotment' || s === 'closed') {
      return {
        bg: 'rgba(245, 158, 11, 0.10)',
        border: 'rgba(245, 158, 11, 0.22)',
        text: '#F59E0B',
        dot: '#F59E0B',
      };
    }
    if (
      s === 'allotted' ||
      s === 'allotment out' ||
      s === 'allotment_out' ||
      s === 'allotment' ||
      s === 'allotted_available' ||
      s === 'allotment_completed'
    ) {
      return {
        bg: 'rgba(16, 185, 129, 0.10)',
        border: 'rgba(16, 185, 129, 0.22)',
        text: '#10B981',
        dot: '#10B981',
      };
    }
    if (s === 'sold') {
      return {
        bg: 'rgba(245, 158, 11, 0.10)',
        border: 'rgba(245, 158, 11, 0.22)',
        text: '#F59E0B',
        dot: '#F59E0B',
      };
    }
    if (s === 'listed') {
      return {
        bg: 'rgba(139, 92, 246, 0.10)',
        border: 'rgba(139, 92, 246, 0.22)',
        text: '#8B5CF6',
        dot: '#8B5CF6',
      };
    }
    return {
      bg: colors.surface,
      border: colors.border,
      text: colors.mutedForeground,
      dot: colors.mutedForeground,
    };
  };

  const getDisplayText = (st: string) => {
    const s = (st || '').toLowerCase().trim();
    if (s === 'closing_today' || s === 'closing today' || s === 'closes today') {
      return 'Closing Today';
    }
    if (s === 'open' || s === 'live' || s === 'live bid' || s === 'live now') {
      return 'Live Now';
    }
    if (
      s === 'allotted' ||
      s === 'allotment out' ||
      s === 'allotment_out' ||
      s === 'allotment' ||
      s === 'allotted_available' ||
      s === 'allotment_completed'
    ) {
      return 'Allotment Out';
    }
    if (s === 'closed' || s === 'allotment_pending' || s === 'awaiting allotment') {
      return 'Closed';
    }
    if (s === 'upcoming') {
      return 'Upcoming';
    }
    if (s === 'listed') {
      return 'Listed';
    }
    return status || 'Unknown';
  };

  const styleConfig = getStyle(status);

  return (
    <View style={[styles.chip, { backgroundColor: styleConfig.bg, borderColor: styleConfig.border }]}>
      <Text style={[styles.text, { color: styleConfig.text }]}>
        {getDisplayText(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
