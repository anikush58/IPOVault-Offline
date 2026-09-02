import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency } from '@/utils/formatters';
import { IPOStatusChip } from './IPOStatusChip';
import { useCompare } from '@/context/CompareContext';

const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'], // Purple
  ['#10B981', '#047857'], // Emerald
  ['#3B82F6', '#1D4ED8'], // Blue
  ['#F59E0B', '#B45309'], // Amber
  ['#EC4899', '#BE185D'], // Pink
  ['#6366F1', '#4338CA'], // Indigo
  ['#14B8A6', '#0F766E'], // Teal
  ['#F43F5E', '#BE123C'], // Rose
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

type Props = {
  ipo: IPOMasterRecord;
  onPress: (ipo: IPOMasterRecord) => void;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  onLongPress?: (ipo: IPOMasterRecord) => void;
};

export const IPOCard = React.memo(function IPOCard({ ipo, onPress, onToggleFavorite, onLongPress }: Props) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { isInCompare, toggleCompare } = useCompare();
  const [logoError, setLogoError] = React.useState(false);

  const isFav = ipo.is_favorite === 1;
  const isCompared = isInCompare(ipo.id);

  const companyNameStr = ipo.company_name || ipo.ipo_name || 'IPO';
  const avatarGradient = getAvatarGradient(companyNameStr);

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
  const initials = companyNameStr
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
            <LinearGradient
              colors={avatarGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          )}

          <View style={styles.identityWrap}>
            <Text style={[styles.companyName, { color: colors.foreground }]} numberOfLines={1}>
              {companyNameStr}
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
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={[
                styles.softIconBtn,
                {
                  backgroundColor: isCompared
                    ? (isDark ? 'rgba(99,102,241,0.2)' : '#EEF2FF')
                    : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9'),
                },
              ]}
            >
              <Feather
                name="columns"
                size={14}
                color={isCompared ? '#6366F1' : colors.mutedForeground}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleFavoritePress}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={[
                styles.softIconBtn,
                {
                  backgroundColor: isFav
                    ? (isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7')
                    : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9'),
                },
              ]}
            >
              <Feather
                name="bookmark"
                size={14}
                color={isFav ? '#D97706' : colors.mutedForeground}
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
    marginBottom: 12,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  headerBlock: {
    marginBottom: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoImage: {
    width: 44,
    height: 44,
    borderRadius: 14,
    resizeMode: 'contain',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  identityWrap: {
    flex: 1,
  },
  companyName: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  headerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  headerDateText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  badgeRowFullWidth: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 9,
    flexWrap: 'wrap',
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagText: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  iconActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    padding: 6,
  },
  softIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSignalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
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
    marginBottom: 10,
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

  /* Actions */
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 9,
    minHeight: 40,
    borderRadius: 12,
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
    paddingVertical: 9,
    minHeight: 40,
    borderRadius: 12,
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
