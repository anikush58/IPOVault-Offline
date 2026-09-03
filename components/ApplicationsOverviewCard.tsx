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

  const isStatus = (st: string, ...targets: string[]) => {
    const s = (st || '').trim().toLowerCase();
    return targets.some((t) => s === t.toLowerCase());
  };

  // Main Counts
  const totalApps = useMemo(() => filteredApps.length, [filteredApps]);
  const waitingCount = useMemo(
    () => filteredApps.filter((a) => isStatus(a.status, 'Applied', 'Mandate Approved')).length,
    [filteredApps]
  );
  const allottedTotalCount = useMemo(
    () => filteredApps.filter((a) => isStatus(a.status, 'Allotted', 'Partially Allotted', 'Holding', 'Sold')).length,
    [filteredApps]
  );
  const notAllottedCount = useMemo(
    () => filteredApps.filter((a) => isStatus(a.status, 'Not Allotted', 'Cancelled')).length,
    [filteredApps]
  );

  // Allotted Portfolio Sub-counts
  const soldCount = useMemo(
    () => filteredApps.filter((a) => isStatus(a.status, 'Sold')).length,
    [filteredApps]
  );
  const holdingCount = useMemo(
    () => filteredApps.filter((a) => isStatus(a.status, 'Holding')).length,
    [filteredApps]
  );
  const currentlyAllottedCount = useMemo(
    () => filteredApps.filter((a) => isStatus(a.status, 'Allotted', 'Partially Allotted')).length,
    [filteredApps]
  );

  // Percentages out of total apps
  const calcPct = (cnt: number) => (totalApps > 0 ? ((cnt / totalApps) * 100).toFixed(1) : '0.0');
  const waitingPct = calcPct(waitingCount);
  const allottedTotalPct = calcPct(allottedTotalCount);
  const notAllottedPct = calcPct(notAllottedCount);

  // Percentages out of allotted total
  const calcAllottedPct = (cnt: number) =>
    allottedTotalCount > 0 ? ((cnt / allottedTotalCount) * 100).toFixed(1) : '0.0';
  const soldPct = calcAllottedPct(soldCount);
  const holdingPct = calcAllottedPct(holdingCount);
  const currentlyAllottedPct = calcAllottedPct(currentlyAllottedCount);

  // Main 3 Legend Rows: Waiting Allotment, Allotted, Not Allotted
  const mainStats = useMemo(() => {
    return [
      { key: 'Waiting Allotment', label: 'Waiting Allotment', count: waitingCount,       pct: waitingPct,       color: colors.statusApplied },
      { key: 'Allotted',          label: 'Allotted',          count: allottedTotalCount, pct: allottedTotalPct, color: colors.statusAllotted },
      { key: 'Not Allotted',      label: 'Not Allotted',      count: notAllottedCount,   pct: notAllottedPct,   color: colors.statusNotAllotted },
    ];
  }, [waitingCount, allottedTotalCount, notAllottedCount, waitingPct, allottedTotalPct, notAllottedPct, colors]);

  // Main SVG Donut Chart Math (3 Slices: Applied, Allotted, Not Allotted)
  const mainDonutSegments = useMemo(() => {
    const slices = [
      { key: 'applied', count: waitingCount, color: colors.statusApplied },
      { key: 'allotted', count: allottedTotalCount, color: colors.statusAllotted },
      { key: 'notAllotted', count: notAllottedCount, color: colors.statusNotAllotted },
    ];

    const R = 62;
    const C = 2 * Math.PI * R;
    let accumulatedAngle = -90;

    if (totalApps === 0) {
      return [{ key: 'empty', color: isDark ? '#334155' : '#E2E8F0', dashArray: `${C} 0`, strokeOffset: 0 }];
    }

    return slices
      .filter((s) => s.count > 0)
      .map((s) => {
        const fraction = s.count / totalApps;
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
  }, [waitingCount, allottedTotalCount, notAllottedCount, totalApps, colors, isDark]);

  // Mini Donut Chart Math (Allotted Portfolio Breakdown: Sold, Holding, Currently Allotted)
  const allottedDonutSegments = useMemo(() => {
    const slices = [
      { key: 'sold', count: soldCount, color: colors.statusSold },
      { key: 'holding', count: holdingCount, color: colors.statusHolding },
      { key: 'currentlyAllotted', count: currentlyAllottedCount, color: colors.statusAllotted },
    ];

    const R = 30;
    const C = 2 * Math.PI * R;
    let accumulatedAngle = -90;

    if (allottedTotalCount === 0) {
      return [{ key: 'empty', color: isDark ? '#334155' : '#E2E8F0', dashArray: `${C} 0`, strokeOffset: 0 }];
    }

    return slices
      .filter((s) => s.count > 0)
      .map((s) => {
        const fraction = s.count / allottedTotalCount;
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
  }, [soldCount, holdingCount, currentlyAllottedCount, allottedTotalCount, colors, isDark]);

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

      {/* Main Top Section: Left Donut + Right 3 Legends */}
      <View style={styles.topSectionRow}>
        {/* Left Side: Main Donut Chart */}
        <View style={styles.donutWrap}>
          <Svg width="155" height="155" viewBox="0 0 155 155">
            <G rotation="-90" origin="77.5, 77.5">
              {mainDonutSegments.map((seg) => (
                <Circle
                  key={seg.key}
                  cx="77.5"
                  cy="77.5"
                  r="62"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="20"
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
            <Text style={[styles.centerBigVal, { color: colors.foreground }]}>{totalApps}</Text>
            <Text style={[styles.centerSubLabel, { color: colors.mutedForeground }]}>applications</Text>
          </View>
        </View>

        {/* Right Side: 3 Main Status Legend Rows */}
        <View style={styles.legendCol}>
          {mainStats.map((item) => (
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

      {/* Allotted Portfolio Breakdown Card with Horizontal Segmented Bar Chart */}
      <View
        style={[
          styles.allottedCard,
          {
            backgroundColor: isDark ? '#161B22' : '#FFFFFF',
            borderColor: colors.border,
          },
        ]}
      >
        {/* Header Row */}
        <View style={styles.allottedHeaderRow}>
          <Text style={[styles.allottedSectionTitle, { color: colors.foreground }]}>ALLOTTED PORTFOLIO</Text>
        </View>

        {/* 3 Breakdown Legends with Vertical Accent Bars (Inspired by screenshot) */}
        <View style={styles.allottedBarLegendRow}>
          {/* Sold */}
          <View style={styles.barLegendItem}>
            <View style={[styles.vertAccentBar, { backgroundColor: colors.statusSold }]} />
            <View>
              <Text style={[styles.barLegendTitle, { color: colors.mutedForeground }]}>Sold</Text>
              <Text style={[styles.barLegendVal, { color: colors.foreground }]}>
                {soldCount} <Text style={{ color: colors.statusSold, fontSize: 11 }}>({soldPct}%)</Text>
              </Text>
            </View>
          </View>

          {/* Holding */}
          <View style={styles.barLegendItem}>
            <View style={[styles.vertAccentBar, { backgroundColor: colors.statusHolding }]} />
            <View>
              <Text style={[styles.barLegendTitle, { color: colors.mutedForeground }]}>Holding</Text>
              <Text style={[styles.barLegendVal, { color: colors.foreground }]}>
                {holdingCount} <Text style={{ color: colors.statusHolding, fontSize: 11 }}>({holdingPct}%)</Text>
              </Text>
            </View>
          </View>

          {/* Newly Allotted */}
          <View style={styles.barLegendItem}>
            <View style={[styles.vertAccentBar, { backgroundColor: colors.statusAllotted }]} />
            <View>
              <Text style={[styles.barLegendTitle, { color: colors.mutedForeground }]}>Newly Allotted</Text>
              <Text style={[styles.barLegendVal, { color: colors.foreground }]}>
                {currentlyAllottedCount} <Text style={{ color: colors.statusAllotted, fontSize: 11 }}>({currentlyAllottedPct}%)</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Horizontal Segmented Bar Graph (Inspired by screenshot) */}
        <View style={[styles.segmentedBarTrack, { backgroundColor: isDark ? '#27272A' : '#E2E8F0' }]}>
          {allottedTotalCount === 0 ? (
            <View style={{ flex: 1, backgroundColor: colors.border, borderRadius: 4 }} />
          ) : (
            <>
              {soldCount > 0 && (
                <View
                  style={[
                    styles.segmentedBarSlice,
                    { flex: soldCount, backgroundColor: colors.statusSold },
                  ]}
                />
              )}
              {holdingCount > 0 && (
                <View
                  style={[
                    styles.segmentedBarSlice,
                    { flex: holdingCount, backgroundColor: colors.statusHolding },
                  ]}
                />
              )}
              {currentlyAllottedCount > 0 && (
                <View
                  style={[
                    styles.segmentedBarSlice,
                    { flex: currentlyAllottedCount, backgroundColor: colors.statusAllotted },
                  ]}
                />
              )}
            </>
          )}
        </View>
      </View>

      {/* Period Selection Modal */}
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
    marginBottom: 12,
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

  // Top Section: Donut + 3 Main Legends
  topSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  donutWrap: {
    width: 155,
    height: 155,
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
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  centerBigVal: {
    fontSize: 26,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 28,
    marginVertical: 1,
  },
  centerSubLabel: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  legendCol: {
    flex: 1,
    paddingLeft: 12,
    gap: 10,
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
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    minWidth: 44,
    textAlign: 'right',
  },

  sectionDivider: {
    height: 1,
    width: '100%',
    marginVertical: 14,
  },

  allottedCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  allottedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  allottedTitleCol: {
    flex: 1,
    gap: 1,
  },
  allottedSectionTitle: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  allottedBigCount: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 26,
  },
  allottedCountSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  allottedTotalSub: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },

  // Mini Donut Chart
  miniDonutWrap: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  miniCenterOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCenterText: {
    fontSize: 6.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
    marginTop: 1,
  },

  innerDivider: {
    height: 1,
    width: '100%',
    marginVertical: 10,
  },

  allottedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  // Vertical Accent Bar Legends (Inspired by screenshot)
  allottedBarLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
  },
  barLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vertAccentBar: {
    width: 3.5,
    height: 28,
    borderRadius: 2,
  },
  barLegendTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  barLegendVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
  },

  // Segmented Bar Track & Slices (Inspired by screenshot)
  segmentedBarTrack: {
    height: 12,
    borderRadius: 100,
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 3,
    padding: 2,
  },
  segmentedBarSlice: {
    height: '100%',
    borderRadius: 100,
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
