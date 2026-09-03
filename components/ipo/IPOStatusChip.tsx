import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export type IPOStatusType = 'Upcoming' | 'Open' | 'Closed' | 'Allotment' | 'Listed' | string;

export function IPOStatusChip({ status }: { status: IPOStatusType }) {
  const colors = useColors();

  const getStyle = (st: string) => {
    const s = (st || '').toLowerCase();
    if (s === 'closing soon' || s === 'closes today' || s === 'closing') {
      return {
        bg: 'rgba(239, 68, 68, 0.10)',
        border: 'rgba(239, 68, 68, 0.22)',
        text: '#EF4444',
        dot: '#EF4444',
      };
    }
    if (s === 'open' || s === 'live bid' || s === 'live') {
      return {
        bg: 'transparent',
        border: '#10B981',
        text: '#10B981',
        dot: '#10B981',
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
    if (s === 'allotted' || s === 'allotment out' || s === 'allotment') {
      return {
        bg: 'rgba(16, 185, 129, 0.10)',
        border: 'rgba(16, 185, 129, 0.22)',
        text: '#10B981',
        dot: '#10B981',
      };
    }
    if (s === 'sold') {
      return {
        bg: 'rgba(175, 180, 43, 0.15)',
        border: 'rgba(175, 180, 43, 0.3)',
        text: '#AFB42B',
        dot: '#AFB42B',
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

  const styleConfig = getStyle(status);

  return (
    <View style={[styles.chip, { backgroundColor: styleConfig.bg, borderColor: styleConfig.border }]}>
      <Text style={[styles.text, { color: styleConfig.text }]}>
        {status || 'Unknown'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
