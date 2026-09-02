import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import type { ApplicationWithDetails } from '@/context/DBContext';

type Props = {
  applications: ApplicationWithDetails[];
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
};

const PERIOD_OPTIONS = ['All Time', 'This Year', 'This Month', 'Last Month'];

export function ApplicationsOverviewCard({
  applications,
  selectedPeriod = 'All Time',
  onPeriodChange,
}: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const [period, setPeriod] = useState(selectedPeriod);
  const [showPeriodModal, setShowPeriodModal] = useState(false);

  const handleSelectPeriod = (opt: string) => {
    setPeriod(opt);
    onPeriodChange?.(opt);
    setShowPeriodModal(false);
  };

  // Filter applications by selected period
  const filteredApps = useMemo(() => {
    if (period === 'This Month') {
      const now = new Date();
      return applications.filter((a) => {
        if (!a.open_date) return false;
        const d = new Date(a.open_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }
    if (period === 'Last Month') {
      const now = new Date();
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return applications.filter((a) => {
        if (!a.open_date) return false;
        const d = new Date(a.open_date);
        return d.getMonth() === last.getMonth() && d.getFullYear() === last.getFullYear();
      });
    }
    if (period === 'This Year') {
      const now = new Date();
      return applications.filter((a) => {
        if (!a.open_date) return false;
        return new Date(a.open_date).getFullYear() === now.getFullYear();
      });
    }
    return applications;
  }, [applications, period]);

  // Compute status counts & percentages (including Waiting Allotment)
  const stats = useMemo(() => {
    const waiting = filteredApps.filter((a) => a.status === 'Applied' || a.status === 'Mandate Approved').length;
    const allotted = filteredApps.filter((a) => a.status === 'Allotted' || a.status === 'Partially Allotted').length;
    const sold = filteredApps.filter((a) => a.status === 'Sold').length;
    const holding = filteredApps.filter((a) => a.status === 'Holding').length;
    const notAllotted = filteredApps.filter((a) => a.status === 'Not Allotted' || a.status === 'Cancelled').length;

    const total = waiting + allotted + sold + holding + notAllotted;

    const calcPct = (cnt: number) => (total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0');

    return [
      { key: 'Waiting Allotment', label: 'Waiting Allotment', count: waiting,     pct: calcPct(waiting),     color: colors.statusApplied },
      { key: 'Allotted',          label: 'Allotted',          count: allotted,    pct: calcPct(allotted),    color: colors.statusAllotted },
      { key: 'Sold',              label: 'Sold',              count: sold,        pct: calcPct(sold),        color: colors.statusSold },
      { key: 'Holding',           label: 'Holding',           count: holding,     pct: calcPct(holding),     color: colors.statusHolding },
      { key: 'Not Allotted',      label: 'Not Allotted',      count: notAllotted, pct: calcPct(notAllotted), color: colors.statusNotAllotted },
    ];
  }, [filteredApps, colors]);

  const totalCount = useMemo(() => stats.reduce((sum, s) => sum + s.count, 0), [stats]);

  // SVG Donut Segments Math
  const donutSegments = useMemo(() => {
    const R = 64;
    const C = 2 * Math.PI * R;
    let accumulatedAngle = -90; // Start at 12 o'clock

    if (totalCount === 0) {
      return [{ key: 'empty', color: isDark ? '#334155' : '#E2E8F0', dashArray: `${C} 0`, strokeOffset: 0 }];
    }

    return stats
      .filter((s) => s.count > 0)
      .map((s) => {
        const fraction = s.count / totalCount;
        const dashLength = fraction * C;
        const gapLength = C - dashLength;
        const strokeOffset = -((accumulatedAngle + 90) / 360) * C;
        accumulatedAngle += fraction * 360;

        return {
          key: s.key,
          color: s.color,
          dashArray: `${dashLength} ${gapLength}`,
          strokeOffset,
        };
      });
  }, [stats, totalCount, isDark]);

  return (
    <View
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>APPLICATIONS OVERVIEW</Text>

        <TouchableOpacity
          onPress={() => setShowPeriodModal(true)}
          style={[styles.periodPill, { borderColor: colors.border, backgroundColor: isDark ? '#27272A' : '#F8FAFC' }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.periodPillText, { color: colors.foreground }]}>{period}</Text>
          <Feather name="chevron-down" size={13} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Main Content Layout: Left Donut + Right Legend */}
      <View style={styles.bodyRow}>
        {/* Left Side: SVG Donut Chart */}
        <View style={styles.donutWrap}>
          <Svg width="165" height="165" viewBox="0 0 165 165">
            <G rotation="-90" origin="82.5, 82.5">
              {donutSegments.map((seg) => (
                <Circle
                  key={seg.key}
                  cx="82.5"
                  cy="82.5"
                  r="64"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="22"
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={seg.strokeOffset}
                  strokeLinecap="butt"
                />
              ))}
            </G>
          </Svg>

          {/* Center Text Overlay */}
          <View style={styles.centerOverlay} pointerEvents="none">
            <Text style={[styles.centerTopLabel, { color: colors.mutedForeground }]}>TOTAL</Text>
            <Text style={[styles.centerBigVal, { color: colors.foreground }]}>{totalCount}</Text>
            <Text style={[styles.centerSubLabel, { color: colors.mutedForeground }]}>applications</Text>
          </View>
        </View>

        {/* Right Side: 5 Status Legend Rows */}
        <View style={styles.legendCol}>
          {stats.map((item) => (
            <View key={item.key} style={styles.legendRow}>
              <View style={styles.legendLeft}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={[styles.legendLabel, { color: colors.foreground }]}>{item.label}</Text>
              </View>

              <View style={styles.legendRight}>
                <Text style={[styles.legendCount, { color: colors.foreground }]}>{item.count}</Text>
                <Text style={[styles.legendPct, { color: item.color }]}>({item.pct}%)</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Period Dropdown Selection Modal (Matching final PerformanceChart modal design) */}
      <Modal visible={showPeriodModal} transparent animationType="fade" onRequestClose={() => setShowPeriodModal(false)}>
        <Pressable style={styles.centerModalOverlay} onPress={() => setShowPeriodModal(false)}>
          <Pressable style={[styles.pickerModalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.pickerModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Period</Text>
              <TouchableOpacity onPress={() => setShowPeriodModal(false)} style={styles.closeBtn} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
              {[
                { id: 'All Time', label: 'All Time', sub: 'Complete historical overview', icon: 'globe' },
                { id: 'This Month', label: 'This Month', sub: 'Applications for current month', icon: 'calendar' },
                { id: 'Last Month', label: 'Last Month', sub: 'Applications for previous month', icon: 'clock' },
                { id: 'This Year', label: 'This Year', sub: 'Applications for current year', icon: 'trending-up' },
              ].map((opt) => {
                const isSelected = opt.id === period;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => handleSelectPeriod(opt.id)}
                    style={[
                      styles.modalOption,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected ? (isDark ? '#27272A' : '#F1F5F9') : 'transparent',
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <View
                        style={[
                          styles.modalOptionIcon,
                          { backgroundColor: isSelected ? (isDark ? '#374151' : '#E2E8F0') : colors.surface },
                        ]}
                      >
                        <Feather name={opt.icon as any} size={16} color={colors.foreground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalOptionTitle, { color: colors.foreground }]}>
                          {opt.label}
                        </Text>
                        <Text style={[styles.modalOptionSub, { color: colors.mutedForeground }]}>
                          {opt.sub}
                        </Text>
                      </View>
                    </View>
                    {isSelected && <Feather name="check" size={18} color={colors.foreground} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
  },
  periodPillText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  donutWrap: {
    width: 165,
    height: 165,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  centerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTopLabel: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  centerBigVal: {
    fontSize: 27,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 30,
    marginVertical: 1,
  },
  centerSubLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  legendCol: {
    flex: 1,
    paddingLeft: 14,
    gap: 6,
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendCount: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  legendPct: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    minWidth: 46,
    textAlign: 'right',
  },

  // Modal styles
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    width: '92%',
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  closeBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
  },
  modalOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  modalOptionSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
});
