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
        bg: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
        border: isDark ? 'rgba(251, 191, 36, 0.40)' : 'rgba(217, 119, 6, 0.35)',
        text: isDark ? '#FBBF24' : '#D97706',
        dot: isDark ? '#FBBF24' : '#D97706',
      };
    }
    if (s === 'open' || s === 'live bid' || s === 'live' || s === 'live now') {
      return {
        bg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7',
        border: isDark ? 'rgba(52, 211, 153, 0.40)' : 'rgba(16, 185, 129, 0.35)',
        text: isDark ? '#34D399' : '#059669',
        dot: isDark ? '#34D399' : '#059669',
      };
    }
    if (s === 'pre-apply' || s === 'pre_apply' || s === 'preapply') {
      return {
        bg: isDark ? 'rgba(14, 165, 233, 0.18)' : '#E0F2FE',
        border: isDark ? 'rgba(56, 189, 248, 0.40)' : 'rgba(2, 132, 199, 0.35)',
        text: isDark ? '#38BDF8' : '#0284C7',
        dot: isDark ? '#38BDF8' : '#0284C7',
      };
    }
    if (s === 'upcoming') {
      return {
        bg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
        border: isDark ? 'rgba(96, 165, 250, 0.40)' : 'rgba(37, 99, 235, 0.35)',
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
        bg: isDark ? 'rgba(249, 115, 22, 0.18)' : '#FFEDD5',
        border: isDark ? 'rgba(251, 146, 60, 0.40)' : 'rgba(234, 88, 12, 0.35)',
        text: isDark ? '#FB923C' : '#EA580C',
        dot: isDark ? '#FB923C' : '#EA580C',
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
        bg: isDark ? 'rgba(6, 182, 212, 0.18)' : '#E0F2FE',
        border: isDark ? 'rgba(34, 211, 238, 0.40)' : 'rgba(8, 145, 178, 0.35)',
        text: isDark ? '#22D3EE' : '#0891B2',
        dot: isDark ? '#22D3EE' : '#0891B2',
      };
    }
    if (s === 'closed') {
      return {
        bg: isDark ? 'rgba(100, 116, 139, 0.18)' : '#F1F5F9',
        border: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.25)',
        text: isDark ? '#94A3B8' : '#64748B',
        dot: isDark ? '#94A3B8' : '#64748B',
      };
    }
    if (s === 'sold') {
      return {
        bg: isDark ? 'rgba(217, 70, 239, 0.18)' : '#FAE8FF',
        border: isDark ? 'rgba(232, 121, 249, 0.40)' : 'rgba(162, 28, 175, 0.35)',
        text: isDark ? '#E879F9' : '#A21CAF',
        dot: isDark ? '#E879F9' : '#A21CAF',
      };
    }
    if (s === 'listed') {
      return {
        bg: isDark ? 'rgba(139, 92, 246, 0.18)' : '#F5F3FF',
        border: isDark ? 'rgba(167, 139, 250, 0.40)' : 'rgba(124, 58, 237, 0.35)',
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
