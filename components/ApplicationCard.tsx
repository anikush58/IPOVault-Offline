import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBadge } from './StatusBadge';
import { formatCurrency } from '@/utils/formatters';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDB } from '@/context/DBContext';
import type { ApplicationStatus, ApplicationWithDetails } from '@/context/DBContext';

type Props = {
  application: ApplicationWithDetails;
  onPress: () => void;
};

export function ApplicationCard({ application: app, onPress }: Props) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { toggleFavorite } = useDB();
  const [expanded, setExpanded] = useState(false);

  const STATUS_BORDER: Record<ApplicationStatus, string> = {
    Applied:             colors.statusApplied,
    'Mandate Approved':  '#2563EB',
    Allotted:            colors.statusAllotted,
    'Partially Allotted':'#059669',
    Holding:             colors.statusHolding,
    'Not Allotted':      colors.statusNotAllotted,
    Sold:                colors.statusSold,
    Cancelled:           colors.statusRefund,
  };

  const borderColor = STATUS_BORDER[app.status] ?? colors.statusApplied;
  const isFav = app.is_favorite === 1;

  const buyValue  = calcBuyValue(app.buy_price, app.quantity);
  const isSold    = app.status === 'Sold' && app.sell_price != null;
  const saleValue = isSold ? calcSaleValue(app.sell_price!, app.quantity) : null;
  const pl        = saleValue != null ? calcProfitLoss(saleValue, buyValue) : null;
  const netProfit = pl != null ? calcNetProfit(pl, app.tax ?? 0, app.user_cut ?? 0) : null;
  const isProfit  = netProfit != null && netProfit >= 0;

  const initial = app.ipo_name.charAt(0).toUpperCase();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Top Header Row */}
      <View style={styles.topRow}>
        {/* Brand Avatar */}
        <View style={[styles.avatar, { backgroundColor: isDark ? '#2E3545' : '#F1F3F5' }]}>
          <Text style={[styles.avatarText, { color: colors.foreground }]}>{initial}</Text>
        </View>

        {/* Title and User info */}
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[styles.ipoTitle, { color: colors.foreground }]} numberOfLines={1}>
            {app.ipo_name}
          </Text>
          <Text style={[styles.userSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {app.user_name} · {app.user_broker ?? 'Broker'}
          </Text>
        </View>

        {/* Status Badge */}
        <StatusBadge status={app.status} small />
      </View>

      {/* Metric 3-Column Grid (Reference Image 3 Style) */}
      <View style={[styles.metricsGrid, { backgroundColor: isDark ? '#161B22' : '#F8F9FA', borderColor: colors.border }]}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Invested</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {formatCurrency(buyValue)}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Qty / Price</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {app.quantity} @ ₹{app.buy_price}
          </Text>
        </View>

        <View style={[styles.metricItem, { alignItems: 'flex-end' }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
            {isSold ? 'Net Return' : 'Status Date'}
          </Text>
          {isSold && netProfit != null ? (
            <Text style={[styles.metricValue, { color: isProfit ? colors.positive : colors.negative }]}>
              {isProfit ? '+' : ''}{formatCurrency(netProfit)}
            </Text>
          ) : (
            <Text style={[styles.metricValue, { color: colors.foreground }]}>
              {app.open_date ? app.open_date.slice(5) : '—'}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  ipoTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  userSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
