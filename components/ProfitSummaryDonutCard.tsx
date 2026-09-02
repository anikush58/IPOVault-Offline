import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { formatCurrency } from '@/utils/formatters';

type Props = {
  grossProfit: number;
  holdingProfit: number;
  totalCharges: number;
  netRealizedProfit: number;
  vsLastMonthPct?: number;
  isVsLastMonthUp?: boolean;
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
};

const PERIOD_OPTIONS = ['This Month', 'Last Month', 'This Year', 'All Time'];

export function ProfitSummaryDonutCard({
  grossProfit,
  holdingProfit,
  totalCharges,
  netRealizedProfit,
  vsLastMonthPct = 0,
  isVsLastMonthUp = true,
  selectedPeriod = 'This Month',
  onPeriodChange,
}: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const [showPeriodModal, setShowPeriodModal] = useState(false);

  // Exact Color Tokens
  const COLOR_GROSS = isDark ? '#10B981' : '#059669'; // Emerald Green
  const COLOR_CHARGES = '#F97316'; // Vibrant Orange
  const COLOR_HOLDING = '#8B5CF6'; // Vibrant Purple
  const COLOR_NET = '#10B981'; // Green

  const isEmptyState = grossProfit <= 0 && totalCharges <= 0 && netRealizedProfit <= 0 && holdingProfit <= 0;

  // Percentage Calculations
  const grossProfitVal = Math.max(0, grossProfit);
  const chargesVal = Math.max(0, totalCharges);
  const netRealizedVal = Math.max(0, netRealizedProfit);
  const holdingVal = Math.max(0, holdingProfit);

  const chargesPct = grossProfitVal > 0 ? ((chargesVal / grossProfitVal) * 100).toFixed(1) : '0.0';
  const netPct = grossProfitVal > 0 ? ((netRealizedVal / grossProfitVal) * 100).toFixed(1) : '0.0';
  const holdingPct = grossProfitVal > 0 ? ((holdingVal / grossProfitVal) * 100).toFixed(1) : '0.0';

  // SVG Geometry
  const radius = 60;
  const strokeWidth = 25;
  const circumference = 2 * Math.PI * radius; // ~376.99

  // Calculate rotation so Yellow Arc (Charges) is ALWAYS centered at 180° (9 o'clock / Left side)
  const yellowRotation = useMemo(() => {
    if (isEmptyState) return -90;
    const totalSum = chargesVal + netRealizedVal;
    if (totalSum <= 0) return -90;

    const fractionCharges = chargesVal / totalSum;
    // 180° is 9 o'clock in SVG rotation space
    return 180 - (fractionCharges * 180);
  }, [isEmptyState, chargesVal, netRealizedVal]);

  const chartArcs = useMemo(() => {
    if (isEmptyState) return [];

    const totalSum = chargesVal + netRealizedVal;
    if (totalSum <= 0) return [];

    const fractionCharges = chargesVal / totalSum;
    const fractionNet = netRealizedVal / totalSum;

    const gap = totalCharges > 0 && netRealizedProfit > 0 ? 5 : 0;

    const lenCharges = Math.max(0, fractionCharges * circumference - gap);
    const lenNet = Math.max(0, fractionNet * circumference - gap);

    const dashCharges = `${lenCharges} ${circumference - lenCharges}`;
    const dashNet = `${lenNet} ${circumference - lenNet}`;

    const offsetNet = -(fractionCharges * circumference);

    return [
      { color: COLOR_CHARGES, strokeDash: dashCharges, offset: 0 },
      { color: COLOR_NET, strokeDash: dashNet, offset: offsetNet },
    ];
  }, [isEmptyState, chargesVal, netRealizedVal, circumference, COLOR_CHARGES, COLOR_NET, totalCharges, netRealizedProfit]);

  const lineColor = isDark ? '#374151' : '#E2E8F0';

  return (
    <View style={styles.wrapper}>
      {/* ── Main Top Card ── */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
            borderColor: colors.border,
          },
        ]}
      >
        {/* Card Header: Title & Date Selector Pill */}
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>PROFIT SUMMARY</Text>
            <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>Overview of your P&L</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowPeriodModal(true)}
            style={[
              styles.periodPill,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                borderColor: isDark ? '#374151' : '#E5E7EB',
              },
            ]}
          >
            <Text style={[styles.periodText, { color: colors.foreground }]}>{selectedPeriod}</Text>
            <Feather name="chevron-down" size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Gross Profit Callout Top Center */}
        <View style={styles.grossHeaderBlock}>
          <Text style={[styles.grossLabel, { color: colors.mutedForeground }]}>GROSS PROFIT</Text>
          <Text
            style={[
              styles.grossValue,
              {
                color: grossProfit > 0 ? COLOR_GROSS : grossProfit < 0 ? colors.negative : colors.foreground,
              },
            ]}
          >
            {formatCurrency(grossProfit)}
          </Text>
          <View style={styles.vsRow}>
            {isEmptyState || vsLastMonthPct === 0 ? (
              <Text style={[styles.vsText, { color: colors.mutedForeground }]}>— 0.0% vs last month</Text>
            ) : (
              <Text style={[styles.vsText, { color: isVsLastMonthUp ? COLOR_GROSS : colors.negative }]}>
                {isVsLastMonthUp ? '▲' : '▼'} {vsLastMonthPct.toFixed(1)}% <Text style={{ color: colors.mutedForeground }}>vs last month</Text>
              </Text>
            )}
          </View>
        </View>

        {/* ── 3-Column Visual Layout (Left Callout | Donut SVG + Lines | Right Callout) ── */}
        <View style={styles.chartRow}>
          {/* Left Column: Charges Callout */}
          <View style={styles.leftCalloutCol}>
            <View style={styles.calloutHeaderRow}>
              <Text style={[styles.calloutTitle, { color: colors.mutedForeground }]}>CHARGES</Text>
              <View style={[styles.dot, { backgroundColor: COLOR_CHARGES }]} />
            </View>

            <Text style={[styles.calloutAmount, { color: COLOR_CHARGES }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(totalCharges)}
            </Text>

            <Text style={styles.calloutSub}>
              <Text style={[styles.pctBold, { color: COLOR_CHARGES }]}>{chargesPct}%</Text>{' '}
              <Text style={[styles.pctGray, { color: colors.mutedForeground }]}>of gross profit</Text>
            </Text>
          </View>

          {/* Center Column: SVG Donut & Stepped Pointer Lines */}
          <View style={styles.svgContainer}>
            <Svg width={200} height={200} viewBox="0 0 200 200">
              {/* 1. Background Track & Rotated Arcs (Rendered Underneath) */}
              <G rotation={yellowRotation} origin="100, 100">
                <Circle
                  cx="100"
                  cy="100"
                  r={radius}
                  stroke={isEmptyState ? (isDark ? 'rgba(255,255,255,0.08)' : '#EAEFF5') : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9')}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />

                {/* Populated Arcs */}
                {chartArcs.map((arc, idx) => (
                  <Circle
                    key={idx}
                    cx="100"
                    cy="100"
                    r={radius}
                    stroke={arc.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={arc.strokeDash}
                    strokeDashoffset={arc.offset}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                ))}
              </G>

              {/* 2. Left Stepped Pointer Line (Orange) aligned at y = 42.5 with calloutLine */}
              <Path d="M 6 42.5 L 15.6 42.5 L 21.2 100 L 26.25 100" fill="none" stroke={COLOR_CHARGES} strokeWidth="1.5" />
              <Circle cx="26.25" cy="100" r="6.75" fill={isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)'} />
              <Circle cx="26.25" cy="100" r="5.5" fill={COLOR_CHARGES} stroke="#FFFFFF" strokeWidth="2" />

              {/* 3. Right Stepped Pointer Line (Green) aligned at y = 42.5 with calloutLine */}
              <Path d="M 194 42.5 L 184.4 42.5 L 178.8 100 L 173.75 100" fill="none" stroke={COLOR_NET} strokeWidth="1.5" />
              <Circle cx="173.75" cy="100" r="6.75" fill={isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)'} />
              <Circle cx="173.75" cy="100" r="5.5" fill={COLOR_NET} stroke="#FFFFFF" strokeWidth="2" />
            </Svg>

            {/* Donut Center Overlay: Good Looking Profit Icon Badge for BOTH States */}
            <View style={styles.donutCenterContent}>
              <View
                style={[
                  styles.centerIconCircle,
                  {
                    backgroundColor: isEmptyState
                      ? isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9'
                      : isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5',
                    borderColor: isEmptyState
                      ? isDark ? '#374151' : '#E2E8F0'
                      : isDark ? 'rgba(16,185,129,0.3)' : '#A7F3D0',
                  },
                ]}
              >
                <Feather
                  name="trending-up"
                  size={26}
                  color={isEmptyState ? colors.mutedForeground : COLOR_NET}
                />
              </View>
            </View>
          </View>

          {/* Right Column: Net Profit Callout */}
          <View style={styles.rightCalloutCol}>
            <View style={styles.calloutHeaderRowRight}>
              <View style={[styles.dot, { backgroundColor: COLOR_NET }]} />
              <Text style={[styles.calloutTitle, { color: colors.mutedForeground }]}>
                NET PROFIT
              </Text>
            </View>

            <Text style={[styles.calloutAmountRight, { color: COLOR_NET }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(netRealizedProfit)}
            </Text>

            <Text style={styles.calloutSubRight}>
              <Text style={[styles.pctBold, { color: COLOR_NET }]}>{netPct}%</Text>{' '}
              <Text style={[styles.pctGray, { color: colors.mutedForeground }]}>of gross profit</Text>
            </Text>
          </View>
        </View>

        {/* ── Empty State Text Block (Shifted below Donut Chart) ── */}
        {isEmptyState && (
          <View style={styles.emptyTextBlock}>
            <Text style={[styles.emptyTextTitle, { color: colors.foreground }]}>
              No sales data
            </Text>
            <Text style={[styles.emptyTextSub, { color: colors.mutedForeground }]}>
              Start investing to see your performance
            </Text>
          </View>
        )}

        {/* ── Holding Section Inside Inner Box (No line separator) ── */}
        <View style={[styles.holdingBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
          <Text style={[styles.holdingHeader, { color: colors.mutedForeground }]}>UNREALIZED PROFIT (HOLDING)</Text>

          <View style={styles.holdingRow}>
            <View style={styles.holdingLeft}>
              <View style={[styles.holdingIconCircle, { backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : '#F3E8FF' }]}>
                <Feather name="briefcase" size={18} color={COLOR_HOLDING} />
              </View>
              <View>
                <Text style={[styles.holdingValText, { color: COLOR_HOLDING }]}>{formatCurrency(holdingProfit)}</Text>
                <Text style={[styles.holdingSubText, { color: colors.mutedForeground }]}>Currently unrealized profit</Text>
              </View>
            </View>

            <View style={styles.holdingRight}>
              <View style={[styles.holdingPill, { backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : '#F3E8FF' }]}>
                <Text style={[styles.holdingPillText, { color: COLOR_HOLDING }]}>{holdingPct}%</Text>
              </View>
              <Text style={[styles.holdingPillSub, { color: colors.mutedForeground }]}>of gross profit</Text>
            </View>
          </View>
        </View>
      </View>



      {/* ── Period Selector Modal (Matching final PerformanceChart modal design) ── */}
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
                { id: 'All Time', label: 'All Time', sub: 'Complete historical performance', icon: 'globe' },
                { id: 'This Month', label: 'This Month', sub: 'Performance for current month', icon: 'calendar' },
                { id: 'Last Month', label: 'Last Month', sub: 'Performance for previous month', icon: 'clock' },
                { id: 'This Year', label: 'This Year', sub: 'Performance for current year', icon: 'trending-up' },
              ].map((opt) => {
                const isSelected = selectedPeriod === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      onPeriodChange?.(opt.id);
                      setShowPeriodModal(false);
                    }}
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
  wrapper: {
    width: '100%',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  periodText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  grossHeaderBlock: {
    alignItems: 'center',
    marginBottom: 8,
  },
  grossLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
  },
  grossValue: {
    fontSize: 32,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vsText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: -2,
    marginBottom: 0,
    height: 200,
  },
  leftCalloutCol: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingRight: 0,
    paddingTop: 35,
  },
  rightCalloutCol: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingLeft: 0,
    paddingTop: 35,
  },
  calloutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  calloutHeaderRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'flex-start',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  calloutTitle: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  calloutLine: {
    height: 1.2,
    width: '100%',
    marginTop: 4,
    marginBottom: 6,
  },
  calloutAmount: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 4,
    textAlign: 'right',
  },
  calloutAmountRight: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 4,
    textAlign: 'left',
  },
  calloutSub: {
    marginTop: 2,
    textAlign: 'right',
  },
  calloutSubRight: {
    marginTop: 2,
    textAlign: 'left',
  },
  pctBold: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  pctGray: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  svgContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
  },
  centerIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    marginTop: -8,
    marginBottom: 4,
  },
  emptyTextTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
  },
  emptyTextSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 2,
  },
  holdingBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: -5,
  },
  holdingHeader: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  holdingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  holdingIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdingValText: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  holdingSubText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  holdingRight: {
    alignItems: 'flex-end',
  },
  holdingPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  holdingPillText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  holdingPillSub: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 3,
  },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 12,
  },
  footnoteText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
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

