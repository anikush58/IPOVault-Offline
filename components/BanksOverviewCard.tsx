import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { formatCurrency } from '@/utils/formatters';

type Props = {
  totalBalance: number;
  totalBlocked: number;
  totalAvailable: number;
  totalSlots: number;
  activeIpoLotCost?: number;
  accountsCount?: number;
};

export function BanksOverviewCard({
  totalBalance,
  totalBlocked,
  totalAvailable,
  totalSlots,
  activeIpoLotCost = 15000,
  accountsCount,
}: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const total = Math.max(totalBalance, totalAvailable + totalBlocked);

  // Percentages out of total balance
  const calcPct = (cnt: number) => (total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0');
  const availablePct = calcPct(totalAvailable);
  const blockedPct = calcPct(totalBlocked);

  // SVG Donut Chart Math
  const donutSegments = useMemo(() => {
    const slices = [
      { key: 'available', count: totalAvailable, color: colors.positive },
      { key: 'blocked', count: totalBlocked, color: colors.negative },
    ];

    const R = 62;
    const C = 2 * Math.PI * R;
    let accumulatedAngle = -90;

    if (total === 0) {
      return [{ key: 'empty', color: isDark ? '#334155' : '#E2E8F0', dashArray: `${C} 0`, strokeOffset: 0 }];
    }

    return slices
      .filter((s) => s.count > 0)
      .map((s) => {
        const fraction = s.count / total;
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
  }, [totalAvailable, totalBlocked, total, colors, isDark]);

  const formattedTotal = formatCurrency(totalBalance);
  const totalValFontSize = formattedTotal.length > 10 ? 17 : formattedTotal.length > 8 ? 19 : 22;

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
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>CAPITAL OVERVIEW</Text>
        {accountsCount !== undefined ? (
          <View style={[styles.badgePill, { borderColor: colors.border, backgroundColor: isDark ? '#27272A' : '#F8FAFC' }]}>
            <Feather name="credit-card" size={11} color={colors.mutedForeground} />
            <Text style={[styles.badgePillText, { color: colors.mutedForeground }]}>
              {accountsCount} {accountsCount === 1 ? 'Account' : 'Accounts'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Main Top Section: Left Donut + Right KPI Legends */}
      <View style={styles.topSectionRow}>
        {/* Left Side: Donut Chart */}
        <View style={styles.donutWrap}>
          <Svg width="155" height="155" viewBox="0 0 155 155">
            <G rotation="-90" origin="77.5, 77.5">
              {donutSegments.map((seg) => (
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
            <Text
              style={[
                styles.centerBigVal,
                { color: colors.foreground, fontSize: totalValFontSize },
              ]}
              numberOfLines={1}
            >
              {formattedTotal}
            </Text>
            <Text style={[styles.centerSubLabel, { color: colors.mutedForeground }]}>capital</Text>
          </View>
        </View>

        {/* Right Side: KPI Legend Rows */}
        <View style={styles.legendCol}>
          {/* Available */}
          <View style={styles.legendRow}>
            <View style={styles.legendLeft}>
              <View style={[styles.legendDot, { backgroundColor: colors.positive }]} />
              <Text style={[styles.legendLabel, { color: colors.foreground }]}>Available</Text>
            </View>
            <View style={styles.legendRight}>
              <Text style={[styles.legendCount, { color: colors.positive }]}>
                {formatCurrency(totalAvailable)}
              </Text>
              <Text style={[styles.legendPct, { color: colors.positive }]}>({availablePct}%)</Text>
            </View>
          </View>

          {/* Blocked */}
          <View style={styles.legendRow}>
            <View style={styles.legendLeft}>
              <View style={[styles.legendDot, { backgroundColor: colors.negative }]} />
              <Text style={[styles.legendLabel, { color: colors.foreground }]}>Blocked</Text>
            </View>
            <View style={styles.legendRight}>
              <Text style={[styles.legendCount, { color: totalBlocked > 0 ? colors.negative : colors.mutedForeground }]}>
                {totalBlocked > 0 ? formatCurrency(totalBlocked) : '—'}
              </Text>
              <Text style={[styles.legendPct, { color: totalBlocked > 0 ? colors.negative : colors.mutedForeground }]}>
                ({blockedPct}%)
              </Text>
            </View>
          </View>

          {/* Free Slots */}
          <View style={styles.legendRow}>
            <View style={styles.legendLeft}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.legendLabel, { color: colors.foreground }]}>IPO Slots</Text>
            </View>
            <View style={styles.legendRight}>
              <Text style={[styles.legendCount, { color: colors.foreground }]}>
                {totalSlots} {totalSlots === 1 ? 'slot' : 'slots'}
              </Text>
            </View>
          </View>
        </View>
      </View>
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
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  // Top Section: Donut + KPI Legends
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
    paddingHorizontal: 8,
  },
  centerTopLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  centerBigVal: {
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 26,
    marginVertical: 1,
    textAlign: 'center',
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
    gap: 4,
  },
  legendCount: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  legendPct: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textAlign: 'right',
  },
});

