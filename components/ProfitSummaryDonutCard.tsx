import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
};

export function ProfitSummaryDonutCard({
  grossProfit,
  holdingProfit,
  totalCharges,
  netRealizedProfit,
}: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  // Configured Colors
  const COLOR_GROSS = '#10B981'; // Green
  const COLOR_CHARGES = '#F59E0B'; // Amber / Yellow
  const COLOR_HOLDING = '#8B5CF6'; // Purple
  const COLOR_NET = '#3B82F6'; // Royal Blue

  const totalPositiveProfit = Math.max(1, Math.max(0, grossProfit) + Math.max(0, holdingProfit));
  const totalOutflow = Math.max(1, Math.max(0, grossProfit) + totalCharges);

  const grossPct = Math.round((Math.max(0, grossProfit) / totalPositiveProfit) * 100);
  const holdingPct = Math.round((Math.max(0, holdingProfit) / totalPositiveProfit) * 100);
  const chargesPct = Math.round((totalCharges / totalOutflow) * 100);
  const netPct = Math.round((Math.max(0, netRealizedProfit) / totalPositiveProfit) * 100);

  // SVG Geometry
  const radius = 55;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius; // ~345.575

  const chartData = useMemo(() => {
    const valGross = Math.max(0, grossProfit);
    const valNet = Math.max(0, netRealizedProfit);
    const valHolding = Math.max(0, holdingProfit);
    const valCharges = Math.max(0, totalCharges);

    const sum = valGross + valNet + valHolding + valCharges;
    if (sum <= 0) {
      return [{ color: isDark ? '#374151' : '#E2E8F0', strokeDash: `${circumference} 0`, offset: 0 }];
    }

    const segments = [
      { color: COLOR_GROSS, val: valGross },
      { color: COLOR_NET, val: valNet },
      { color: COLOR_HOLDING, val: valHolding },
      { color: COLOR_CHARGES, val: valCharges },
    ].filter((s) => s.val > 0);

    let accum = 0;
    return segments.map((s) => {
      const fraction = s.val / sum;
      const arcLength = fraction * circumference;
      const gap = segments.length > 1 ? 5 : 0;
      const strokeDash = `${Math.max(0, arcLength - gap)} ${circumference - (arcLength - gap)}`;
      const offset = -accum;
      accum += arcLength;
      return { ...s, strokeDash, offset };
    });
  }, [grossProfit, holdingProfit, totalCharges, netRealizedProfit, circumference, isDark]);

  const lineColor = isDark ? 'rgba(255, 255, 255, 0.22)' : '#CBD5E1';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
          borderColor: colors.border,
        },
      ]}
    >
      {/* ── Card Header ── */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardEyebrow, { color: colors.foreground }]}>PROFIT SUMMARY</Text>
          <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>Overview of your P&L</Text>
        </View>

        <View style={[styles.periodPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8F9FA', borderColor: colors.border }]}>
          <Feather name="calendar" size={13} color={colors.mutedForeground} />
          <Text style={[styles.periodText, { color: colors.foreground }]}>This Month</Text>
          <Feather name="chevron-down" size={12} color={colors.mutedForeground} />
        </View>
      </View>

      {/* ── 3-Column Layout: Left Callouts | Center SVG Donut + Pointer Lines | Right Callouts ── */}
      <View style={styles.mainRow}>
        {/* Left Side Column */}
        <View style={styles.sideColumnLeft}>
          {/* Top Left: Total Charges */}
          <View style={styles.calloutBlock}>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: COLOR_CHARGES }]} />
              <Text style={[styles.metricTitle, { color: colors.mutedForeground }]}>TOTAL CHARGES</Text>
            </View>
            <Text style={[styles.metricAmount, { color: COLOR_CHARGES }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(totalCharges)}
            </Text>
            <View style={styles.subtextWrap}>
              <Text style={[styles.pctText, { color: COLOR_CHARGES }]}>{chargesPct}%</Text>
              <Text style={[styles.pctLabel, { color: colors.mutedForeground }]}>of outflow</Text>
            </View>
          </View>

          {/* Bottom Left: Holding Profit */}
          <View style={styles.calloutBlock}>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: COLOR_HOLDING }]} />
              <Text style={[styles.metricTitle, { color: colors.mutedForeground }]}>HOLDING PROFIT</Text>
            </View>
            <Text style={[styles.metricAmount, { color: COLOR_HOLDING }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(holdingProfit)}
            </Text>
            <View style={styles.subtextWrap}>
              <Text style={[styles.pctText, { color: COLOR_HOLDING }]}>{holdingPct}%</Text>
              <Text style={[styles.pctLabel, { color: colors.mutedForeground }]}>of profit</Text>
            </View>
          </View>
        </View>

        {/* Center SVG Donut & Pointer Lines */}
        <View style={styles.centerSvgWrap}>
          <Svg width={170} height={170} viewBox="0 0 170 170">
            {/* Top-Left Line (Total Charges) */}
            <Path d="M 0 25 L 28 25 L 43 43" fill="none" stroke={lineColor} strokeWidth="1.2" />
            <Circle cx="43" cy="43" r="3.5" fill={isDark ? '#1F2937' : '#FFFFFF'} stroke={COLOR_CHARGES} strokeWidth="2" />

            {/* Bottom-Left Line (Holding Profit) */}
            <Path d="M 0 145 L 28 145 L 43 127" fill="none" stroke={lineColor} strokeWidth="1.2" />
            <Circle cx="43" cy="127" r="3.5" fill={isDark ? '#1F2937' : '#FFFFFF'} stroke={COLOR_HOLDING} strokeWidth="2" />

            {/* Top-Right Line (Gross Profit) */}
            <Path d="M 170 25 L 142 25 L 127 43" fill="none" stroke={lineColor} strokeWidth="1.2" />
            <Circle cx="127" cy="43" r="3.5" fill={isDark ? '#1F2937' : '#FFFFFF'} stroke={COLOR_GROSS} strokeWidth="2" />

            {/* Bottom-Right Line (Net Realized) */}
            <Path d="M 170 145 L 142 145 L 127 127" fill="none" stroke={lineColor} strokeWidth="1.2" />
            <Circle cx="127" cy="127" r="3.5" fill={isDark ? '#1F2937' : '#FFFFFF'} stroke={COLOR_NET} strokeWidth="2" />

            {/* Background Track Circle */}
            <G rotation="-90" origin="85, 85">
              <Circle cx="85" cy="85" r={radius} stroke={isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9'} strokeWidth={strokeWidth} fill="transparent" />

              {/* Data Segments */}
              {chartData.map((seg, idx) => (
                <Circle
                  key={idx}
                  cx="85"
                  cy="85"
                  r={radius}
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={seg.strokeDash}
                  strokeDashoffset={seg.offset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              ))}
            </G>

            {/* Center Disk White Container */}
            <Circle cx="85" cy="85" r={40} fill={isDark ? '#1F2937' : '#FFFFFF'} stroke={colors.border} strokeWidth="1" />
          </Svg>

          {/* Donut Center Overlay Text */}
          <View style={styles.donutCenterOverlay}>
            <Text style={[styles.donutCenterLabel, { color: colors.mutedForeground }]}>TOTAL PROFIT</Text>
            <Text style={[styles.donutCenterValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(netRealizedProfit)}
            </Text>
            <Text style={[styles.donutCenterSub, { color: colors.mutedForeground }]}>Net Realized Profit</Text>
          </View>
        </View>

        {/* Right Side Column */}
        <View style={styles.sideColumnRight}>
          {/* Top Right: Gross Profit */}
          <View style={styles.calloutBlockRight}>
            <View style={styles.labelRowRight}>
              <View style={[styles.dot, { backgroundColor: COLOR_GROSS }]} />
              <Text style={[styles.metricTitle, { color: colors.mutedForeground }]}>GROSS PROFIT</Text>
            </View>
            <Text style={[styles.metricAmountRight, { color: COLOR_GROSS }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(grossProfit)}
            </Text>
            <View style={styles.subtextWrapRight}>
              <Text style={[styles.pctText, { color: COLOR_GROSS }]}>{grossPct}%</Text>
              <Text style={[styles.pctLabel, { color: colors.mutedForeground }]}>of profit</Text>
            </View>
          </View>

          {/* Bottom Right: Net Realized */}
          <View style={styles.calloutBlockRight}>
            <View style={styles.labelRowRight}>
              <View style={[styles.dot, { backgroundColor: COLOR_NET }]} />
              <Text style={[styles.metricTitle, { color: colors.mutedForeground }]}>NET REALIZED</Text>
            </View>
            <Text style={[styles.metricAmountRight, { color: COLOR_NET }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(netRealizedProfit)}
            </Text>
            <View style={styles.subtextWrapRight}>
              <Text style={[styles.pctText, { color: COLOR_NET }]}>{netPct}%</Text>
              <Text style={[styles.pctLabel, { color: colors.mutedForeground }]}>of profit</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Legend Row ── */}
      <View style={[styles.legendRow, { borderTopColor: colors.border }]}>
        <View style={styles.legendItem}>
          <View style={[styles.dotSmall, { backgroundColor: COLOR_GROSS }]} />
          <Text style={[styles.legendText, { color: colors.foreground }]}>Gross Profit</Text>
        </View>

        <View style={[styles.legendDivider, { backgroundColor: colors.border }]} />

        <View style={styles.legendItem}>
          <View style={[styles.dotSmall, { backgroundColor: COLOR_HOLDING }]} />
          <Text style={[styles.legendText, { color: colors.foreground }]}>Holding Profit</Text>
        </View>

        <View style={[styles.legendDivider, { backgroundColor: colors.border }]} />

        <View style={styles.legendItem}>
          <View style={[styles.dotSmall, { backgroundColor: COLOR_CHARGES }]} />
          <Text style={[styles.legendText, { color: colors.foreground }]}>Total Charges</Text>
        </View>
      </View>

      {/* ── Footnote ── */}
      <View style={styles.footnoteRow}>
        <Feather name="info" size={12} color={colors.mutedForeground} />
        <Text style={[styles.footnoteText, { color: colors.mutedForeground }]}>
          Based on total profit (Realized + Holding)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardEyebrow: {
    fontSize: 15,
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
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  periodText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  sideColumnLeft: {
    flex: 1,
    justifyContent: 'space-between',
    height: 150,
    paddingVertical: 4,
  },
  sideColumnRight: {
    flex: 1,
    justifyContent: 'space-between',
    height: 150,
    paddingVertical: 4,
  },
  calloutBlock: {
    alignItems: 'flex-start',
  },
  calloutBlockRight: {
    alignItems: 'flex-end',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-end',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metricTitle: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
  },
  metricAmount: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },
  metricAmountRight: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
    textAlign: 'right',
  },
  subtextWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: 1,
  },
  subtextWrapRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: 1,
    justifyContent: 'flex-end',
  },
  pctText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  pctLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  centerSvgWrap: {
    width: 170,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 85,
  },
  donutCenterLabel: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  donutCenterValue: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
    textAlign: 'center',
  },
  donutCenterSub: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
    textAlign: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotSmall: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  legendDivider: {
    width: 1,
    height: 12,
  },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
  },
  footnoteText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
});
