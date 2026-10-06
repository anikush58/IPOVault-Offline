import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type IPOStatusType = 'Upcoming' | 'Open' | 'Closed' | 'Allotment' | 'Listed' | string;

export function IPOStatusChip({ status }: { status: IPOStatusType }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const getStyle = (st: string) => {
    const s = (st || '').toLowerCase().trim();
    if (s === 'closing_today' || s === 'closing today' || s === 'closes today' || s === 'closing soon' || s === 'closing') {
      return {
        bg: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7',
        border: isDark ? 'rgba(245, 158, 11, 0.50)' : 'rgba(217, 119, 6, 0.40)',
        text: isDark ? '#FBBF24' : '#D97706',
        dot: isDark ? '#FBBF24' : '#D97706',
      };
    }
    if (s === 'open' || s === 'live bid' || s === 'live' || s === 'live now') {
      return {
        bg: isDark ? 'rgba(16, 185, 129, 0.22)' : '#DCFCE7',
        border: isDark ? 'rgba(16, 185, 129, 0.50)' : 'rgba(21, 128, 61, 0.40)',
        text: isDark ? '#34D399' : '#15803D',
        dot: isDark ? '#34D399' : '#15803D',
      };
    }
    if (s === 'pre-apply' || s === 'pre_apply' || s === 'preapply') {
      return {
        bg: isDark ? 'rgba(6, 182, 212, 0.22)' : 'rgba(6, 182, 212, 0.15)',
        border: isDark ? 'rgba(6, 182, 212, 0.50)' : 'rgba(6, 182, 212, 0.35)',
        text: isDark ? '#22D3EE' : '#0891B2',
        dot: isDark ? '#22D3EE' : '#0891B2',
      };
    }
    if (s === 'upcoming') {
      return {
        bg: isDark ? 'rgba(59, 130, 246, 0.22)' : '#EFF6FF',
        border: isDark ? 'rgba(59, 130, 246, 0.50)' : 'rgba(37, 99, 235, 0.35)',
        text: isDark ? '#60A5FA' : '#2563EB',
        dot: isDark ? '#60A5FA' : '#2563EB',
      };
    }
    if (
      s === 'awaiting allotment' ||
      s === 'awaiting_allotment' ||
      s === 'allotment awaited' ||
      s === 'allotment_awaited' ||
      s === 'allotment awaiting' ||
      s === 'allotment_awaiting' ||
      s === 'allotment pending' ||
      s === 'allotment_pending' ||
      s === 'allotted_pending'
    ) {
      return {
        bg: isDark ? 'rgba(245, 158, 11, 0.24)' : '#FEF3C7',
        border: 'transparent',
        borderWidth: 0,
        text: isDark ? '#FBBF24' : '#D97706',
        dot: isDark ? '#FBBF24' : '#D97706',
      };
    }
    if (s === 'closed') {
      return {
        bg: isDark ? 'rgba(100, 116, 139, 0.20)' : '#F1F5F9',
        border: isDark ? 'rgba(100, 116, 139, 0.40)' : 'rgba(100, 116, 139, 0.30)',
        text: isDark ? '#94A3B8' : '#64748B',
        dot: isDark ? '#94A3B8' : '#64748B',
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
        bg: isDark ? 'rgba(16, 185, 129, 0.24)' : '#DCFCE7',
        border: 'transparent',
        borderWidth: 0,
        text: isDark ? '#34D399' : '#059669',
        dot: isDark ? '#34D399' : '#059669',
      };
    }
    if (s === 'sold') {
      return {
        bg: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7',
        border: isDark ? 'rgba(245, 158, 11, 0.45)' : 'rgba(217, 119, 6, 0.35)',
        text: isDark ? '#FBBF24' : '#D97706',
        dot: isDark ? '#FBBF24' : '#D97706',
      };
    }
    if (s === 'listed') {
      return {
        bg: isDark ? 'rgba(139, 92, 246, 0.22)' : '#F5F3FF',
        border: isDark ? 'rgba(139, 92, 246, 0.50)' : 'rgba(124, 58, 237, 0.35)',
        text: isDark ? '#A78BFA' : '#7C3AED',
        dot: isDark ? '#A78BFA' : '#7C3AED',
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
      s === 'allotment awaited' ||
      s === 'allotment_awaited' ||
      s === 'allotment awaiting' ||
      s === 'allotment_awaiting' ||
      s === 'allotment pending' ||
      s === 'allotment_pending' ||
      s === 'allotted_pending' ||
      s === 'awaiting allotment' ||
      s === 'awaiting_allotment'
    ) {
      return 'Allotment Awaited';
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
    if (s === 'closed') {
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
    <View
      style={[
        styles.chip,
        {
          backgroundColor: styleConfig.bg,
          borderColor: styleConfig.border,
          borderWidth: (styleConfig as any).borderWidth ?? (styleConfig.border === 'transparent' ? 0 : 1),
        },
      ]}
    >
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
