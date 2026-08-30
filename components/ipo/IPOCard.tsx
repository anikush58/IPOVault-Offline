import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency } from '@/utils/formatters';
import { IPOStatusChip } from './IPOStatusChip';
import { useCompare } from '@/context/CompareContext';

type Props = {
  ipo: IPOMasterRecord;
  onPress: (ipo: IPOMasterRecord) => void;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  onLongPress?: (ipo: IPOMasterRecord) => void;
};

export const IPOCard = React.memo(function IPOCard({ ipo, onPress, onToggleFavorite, onLongPress }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { isInCompare, toggleCompare } = useCompare();
  const [logoError, setLogoError] = React.useState(false);

  const isFav = ipo.is_favorite === 1;
  const isCompared = isInCompare(ipo.id);

  // Format Price Band
  const priceBandText = React.useMemo(() => {
    if (ipo.price_band_min && ipo.price_band_max) {
      if (ipo.price_band_min === ipo.price_band_max) {
        return formatCurrency(ipo.price_band_max);
      }
      return `${formatCurrency(ipo.price_band_min)} - ${formatCurrency(ipo.price_band_max)}`;
    }
    if (ipo.price_band_max) return formatCurrency(ipo.price_band_max);
    if (ipo.price_band_min) return formatCurrency(ipo.price_band_min);
    return 'TBA';
  }, [ipo.price_band_min, ipo.price_band_max]);

  // Calculated lot value
  const lotValue = React.useMemo(() => {
    const p = ipo.price_band_max || ipo.price_band_min;
    if (p && ipo.lot_size) {
      return p * ipo.lot_size;
    }
    return null;
  }, [ipo.price_band_max, ipo.price_band_min, ipo.lot_size]);

  // Fallback Initials
  const initials = (ipo.company_name || ipo.ipo_name || 'I')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const handleFavoritePress = (e: any) => {
    e.stopPropagation?.();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleFavorite(ipo.id, !isFav);
  };

  const handleComparePress = (e: any) => {
    e.stopPropagation?.();
    toggleCompare(ipo.id);
  };

  const handleLongPressCard = () => {
    if (onLongPress) {
      onLongPress(ipo);
    } else {
      toggleCompare(ipo.id);
    }
  };

  // Status override for closing soon
  const displayStatus = React.useMemo(() => {
    const s = (ipo.status || '').toLowerCase();
    if (s === 'open' || s === 'active') {
      const todayStr = new Date().toISOString().split('T')[0];
      if (ipo.close_date && ipo.close_date <= todayStr) {
        return 'Closing Soon';
      }
    }
    return ipo.status || 'Upcoming';
  }, [ipo.status, ipo.close_date]);

  // GMP Text & Colors
  const gmpAmt = ipo.gmp_amount;
  const gmpPct = ipo.gmp_percent;
  const hasGmp = gmpAmt != null || gmpPct != null;
  const gmpDisplay = gmpAmt != null
    ? `${gmpAmt > 0 ? '+' : ''}₹${gmpAmt}${gmpPct != null ? ` (${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%)` : ''}`
    : gmpPct != null
    ? `${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%`
    : 'TBA';
  const gmpColor = hasGmp ? ((gmpAmt || gmpPct || 0) >= 0 ? '#10B981' : '#EF4444') : colors.mutedForeground;

  // Subscription Text
  const subDisplay = ipo.total_sub != null
    ? `${ipo.total_sub.toFixed(1)}x`
    : ipo.qib_sub != null
    ? `${ipo.qib_sub.toFixed(1)}x QIB`
    : '—';

  // Freshness Evaluation
  const gmpFreshnessText = React.useMemo(() => {
    if (!hasGmp || !ipo.gmp_updated_at) return '';
    const diffMs = Date.now() - new Date(ipo.gmp_updated_at).getTime();
    const diffHours = Math.floor(diffMs / (3600 * 1000));
    if (diffHours >= 48) return ' • Stale';
    if (diffHours >= 24) return ' • 1d ago';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return ` • ${diffMins}m ago`;
    return ` • ${diffHours}h ago`;
  }, [hasGmp, ipo.gmp_updated_at]);

  // Timeline Display Text (Both Open & Close dates)
  const timelineDisplay = React.useMemo(() => {
    const hasOpen = !!ipo.open_date;
    const hasClose = !!ipo.close_date;
    const hasListing = !!ipo.listing_date;

    if (hasOpen && hasClose) {
      if (displayStatus === 'Listed' && hasListing) {
        return `${ipo.open_date} – ${ipo.close_date} • Listed ${ipo.listing_date}`;
      }
      return `${ipo.open_date} – ${ipo.close_date}`;
    }

    if (displayStatus === 'Listed' && hasListing) {
      return `Listed ${ipo.listing_date}`;
    }

    if (hasClose) return `Closes ${ipo.close_date}`;
    if (hasOpen) return `Opens ${ipo.open_date}`;
    return 'Timeline TBA';
  }, [ipo.open_date, ipo.close_date, ipo.listing_date, displayStatus]);

  // Listed Performance Calculations (Listing Price, Premium %, Listing Profit / Lot)
  const isListedStatus = displayStatus === 'Listed';
  const issuePrice = ipo.price_band_max || ipo.price_band_min || 0;
  const listingPriceNum = ipo.listing_price ?? ipo.current_price ?? null;

  const listingGainPct = React.useMemo(() => {
    if (ipo.listing_gain_percent != null) return ipo.listing_gain_percent;
    if (listingPriceNum != null && issuePrice > 0) {
      return ((listingPriceNum - issuePrice) / issuePrice) * 100;
    }
    return null;
  }, [ipo.listing_gain_percent, listingPriceNum, issuePrice]);

  const listingProfitLot = React.useMemo(() => {
    if (listingPriceNum != null && issuePrice > 0 && ipo.lot_size) {
      return (listingPriceNum - issuePrice) * ipo.lot_size;
    }
    if (ipo.profit_per_lot != null) return ipo.profit_per_lot;
    if (listingGainPct != null && lotValue != null && lotValue > 0) {
      return (lotValue * listingGainPct) / 100;
    }
    return null;
  }, [listingPriceNum, issuePrice, ipo.lot_size, ipo.profit_per_lot, listingGainPct, lotValue]);

  const listingPriceDisplay = listingPriceNum != null ? formatCurrency(listingPriceNum) : 'TBA';
  const listingPremiumDisplay = listingGainPct != null
    ? `${listingGainPct >= 0 ? '+' : ''}${listingGainPct.toFixed(1)}%`
    : 'TBA';
  const listingProfitDisplay = listingProfitLot != null
    ? `${listingProfitLot >= 0 ? '+' : ''}${formatCurrency(Math.abs(listingProfitLot))}`
    : 'TBA';

  const listingColor = listingGainPct != null
    ? (listingGainPct >= 0 ? '#10B981' : '#EF4444')
    : colors.foreground;

  return (
    <TouchableOpacity
      onPress={() => onPress(ipo)}
      onLongPress={handleLongPressCard}
      delayLongPress={250}
      activeOpacity={0.88}
      style={[
        styles.snapshotCard,
        { backgroundColor: colors.card, borderColor: isCompared ? colors.primary : colors.border },
        isCompared && { borderWidth: 1.5 },
      ]}
    >
      {/* Top Identity Header Block */}
      <View style={styles.headerBlock}>
        {/* Row 1: Logo + Company Name & Dates + Action Icons */}
        <View style={styles.headerTopRow}>
          {ipo.logo_url && !logoError ? (
            <Image
              source={{ uri: ipo.logo_url }}
              style={styles.logoImage}
              onError={() => setLogoError(true)}
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
            </View>
          )}

          <View style={styles.identityWrap}>
            <Text style={[styles.companyName, { color: colors.foreground }]} numberOfLines={1}>
              {ipo.company_name || ipo.ipo_name}
            </Text>

            {/* Date Range directly below IPO Name */}
            <View style={styles.headerDateRow}>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
              <Text style={[styles.headerDateText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {timelineDisplay}
              </Text>
            </View>
          </View>

          {/* Action Toggle Icons */}
          <View style={styles.iconActionsWrap}>
            <TouchableOpacity
              onPress={handleComparePress}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={styles.iconBtn}
            >
              <Feather
                name="columns"
                size={15}
                color={isCompared ? colors.primary : colors.mutedForeground + '80'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleFavoritePress}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
              style={styles.iconBtn}
            >
              <Feather
                name="bookmark"
                size={17}
                color={isFav ? colors.primary : colors.borderStrong}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Status Chips starting from far left below the IPO logo */}
        <View style={styles.badgeRowFullWidth}>
          {ipo.issue_type ? (
            <View style={[styles.tagBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{ipo.issue_type}</Text>
            </View>
          ) : null}
          {ipo.exchange ? (
            <View style={[styles.tagBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{ipo.exchange}</Text>
            </View>
          ) : null}
          <IPOStatusChip status={displayStatus} />
        </View>
      </View>

      {/* HERO MARKET SIGNALS BANNER (Primary Decision View) */}
      <View style={[styles.heroSignalBanner, { backgroundColor: colors.surface }]}>
        {isListedStatus ? (
          <>
            {/* Listing Signal 1: Listing Premium */}
            <View style={styles.signalCell}>
              <Text style={[styles.signalLabel, { color: colors.mutedForeground }]}>
                LISTING PREMIUM
              </Text>
              <Text style={[styles.signalValue, { color: listingColor }]} numberOfLines={1}>
                {listingPremiumDisplay}
              </Text>
            </View>

            <View style={[styles.signalDivider, { backgroundColor: colors.border }]} />

            {/* Listing Signal 2: Listing Profit Per Lot */}
            <View style={styles.signalCellRight}>
              <Text style={[styles.signalLabel, { color: colors.mutedForeground }]}>LISTING PROFIT / LOT</Text>
              <Text style={[styles.signalValue, { color: listingColor }]} numberOfLines={1}>
                {listingProfitDisplay}
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Signal 1: GMP */}
            <View style={styles.signalCell}>
              <Text style={[styles.signalLabel, { color: colors.mutedForeground }]}>
                EXPECTED PREMIUM (GMP){gmpFreshnessText}
              </Text>
              <Text style={[styles.signalValue, { color: gmpColor }]} numberOfLines={1}>
                {gmpDisplay}
              </Text>
            </View>

            <View style={[styles.signalDivider, { backgroundColor: colors.border }]} />

            {/* Signal 2: Overall Demand / Subscription */}
            <View style={styles.signalCellRight}>
              <Text style={[styles.signalLabel, { color: colors.mutedForeground }]}>DEMAND / SUBSCRIPTION</Text>
              <Text style={[styles.signalValue, { color: colors.foreground }]} numberOfLines={1}>
                {subDisplay}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* COMPACT INVESTMENT STRIP */}
      <View style={styles.investmentStrip}>
        {isListedStatus ? (
          <>
            <View style={styles.investCell}>
              <Text style={[styles.investLabel, { color: colors.mutedForeground }]}>ISSUE PRICE</Text>
              <Text style={[styles.investVal, { color: colors.foreground }]} numberOfLines={1}>
                {issuePrice > 0 ? formatCurrency(issuePrice) : priceBandText}
              </Text>
            </View>

            <View style={styles.investCell}>
              <Text style={[styles.investLabel, { color: colors.mutedForeground }]}>LISTING PRICE</Text>
              <Text style={[styles.investVal, { color: colors.foreground }]} numberOfLines={1}>
                {listingPriceDisplay}
              </Text>
            </View>

            <View style={styles.investCellRight}>
              <Text style={[styles.investLabel, { color: colors.mutedForeground }]}>LISTING PROFIT</Text>
              <Text style={[styles.investValHighlight, { color: listingColor }]} numberOfLines={1}>
                {listingProfitDisplay}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.investCell}>
              <Text style={[styles.investLabel, { color: colors.mutedForeground }]}>PRICE BAND</Text>
              <Text style={[styles.investVal, { color: colors.foreground }]} numberOfLines={1}>
                {priceBandText}
              </Text>
            </View>

            <View style={styles.investCell}>
              <Text style={[styles.investLabel, { color: colors.mutedForeground }]}>MIN LOT SIZE</Text>
              <Text style={[styles.investVal, { color: colors.foreground }]} numberOfLines={1}>
                {ipo.lot_size ? `${ipo.lot_size} Shares` : '—'}
              </Text>
            </View>

            <View style={styles.investCellRight}>
              <Text style={[styles.investLabel, { color: colors.mutedForeground }]}>MIN INVESTMENT</Text>
              <Text style={[styles.investValHighlight, { color: colors.primary }]} numberOfLines={1}>
                {lotValue ? formatCurrency(lotValue) : '—'}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* ACTION BUTTONS */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.btnSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => onPress(ipo)}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>View Details</Text>
        </TouchableOpacity>

        {displayStatus === 'Upcoming' ? (
          <TouchableOpacity
            style={[
              styles.btnPrimary,
              { backgroundColor: isFav ? colors.surface : colors.primary, borderColor: colors.primary, borderWidth: 1 },
            ]}
            onPress={(e) => {
              e.stopPropagation();
              handleFavoritePress(e);
            }}
            activeOpacity={0.8}
          >
            <Feather name={isFav ? 'check' : 'bell'} size={13} color={isFav ? colors.primary : '#FFFFFF'} />
            <Text style={[styles.btnPrimaryText, isFav && { color: colors.primary }]}>
              {isFav ? 'Notified' : 'Notify Me'}
            </Text>
          </TouchableOpacity>
        ) : displayStatus === 'Listed' ? (
          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => onPress(ipo)}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnPrimaryText, { color: colors.foreground }]}>Listing Performance</Text>
            <Feather name="arrow-right" size={13} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: '/apply-ipo', params: { ipoId: ipo.id } } as any);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.btnPrimaryText}>Apply Now</Text>
            <Feather name="arrow-right" size={13} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  snapshotCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  headerBlock: {
    marginBottom: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoImage: {
    width: 42,
    height: 42,
    borderRadius: 11,
    resizeMode: 'contain',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  identityWrap: {
    flex: 1,
  },
  companyName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  headerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerDateText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  badgeRowFullWidth: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
    flexWrap: 'wrap',
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  iconActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    padding: 5,
  },

  /* Hero Market Signal Banner */
  heroSignalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  signalCell: {
    flex: 1.2,
  },
  signalCellRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  signalDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 8,
  },
  signalLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.4,
  },
  signalValue: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
  },

  /* Compact Investment Strip */
  investmentStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  investCell: {
    flex: 1,
  },
  investCellRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  investLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
  },
  investVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 1,
  },
  investValHighlight: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
  },

  /* Timeline Indicator */
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  timelineText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  /* Actions */
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  btnPrimaryText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
});
