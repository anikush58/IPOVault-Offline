import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency, getResolvedLogoUrl } from '@/utils/formatters';
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

function formatApplyDates(openDate?: string | null, closeDate?: string | null): string {
  if (!openDate && !closeDate) return 'TBA';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const parseD = (str?: string | null) => {
    if (!str) return null;
    const clean = str.trim();
    if (!clean) return null;
    const parts = clean.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      if (!isNaN(day) && monthIdx >= 0 && monthIdx < 12) {
        return { day, month: MONTHS[monthIdx] };
      }
    }
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return { day: d.getDate(), month: MONTHS[d.getMonth()] };
    }
    return null;
  };

  const o = parseD(openDate);
  const c = parseD(closeDate);

  if (o && c) {
    if (o.month === c.month) {
      return `${o.day}-${c.day} ${o.month}`;
    }
    return `${o.day} ${o.month} - ${c.day} ${c.month}`;
  }
  if (o) return `${o.day} ${o.month}`;
  if (c) return `${c.day} ${c.month}`;
  return 'TBA';
}

export const IPOCard = React.memo(function IPOCard({ ipo, onPress, onToggleFavorite, onLongPress }: Props) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { isInCompare, toggleCompare } = useCompare();
  const [logoError, setLogoError] = React.useState(false);

  React.useEffect(() => {
    setLogoError(false);
  }, [ipo.logo_url]);

  const isFav = ipo.is_favorite === 1;
  const isCompared = isInCompare(ipo.id);

  const companyNameStr = ipo.company_name || ipo.ipo_name || 'IPO';
  const avatarGradient = getAvatarGradient(companyNameStr);
  const resolvedLogo = getResolvedLogoUrl(ipo.logo_url, ipo.website, companyNameStr);

  // Format Price Band
  const priceBandText = React.useMemo(() => {
    if (ipo.price_band_min && ipo.price_band_max) {
      if (ipo.price_band_min === ipo.price_band_max) {
        return `₹${ipo.price_band_max}`;
      }
      return `₹${ipo.price_band_min} to ₹${ipo.price_band_max}`;
    }
    if (ipo.price_band_max) return `₹${ipo.price_band_max}`;
    if (ipo.price_band_min) return `₹${ipo.price_band_min}`;
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

  // GMP Text & Colors
  const gmpAmt = ipo.gmp_amount;
  const gmpPct = ipo.gmp_percent;
  const hasGmp = gmpAmt != null || gmpPct != null;
  const gmpDisplay = gmpAmt != null
    ? `₹${gmpAmt}${gmpPct != null ? ` (${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(0)}%)` : ''}`
    : gmpPct != null
    ? `${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(0)}%`
    : 'TBA';
  const gmpColor = hasGmp ? ((gmpAmt || gmpPct || 0) >= 0 ? '#10B981' : '#EF4444') : colors.mutedForeground;

  // Freshness Evaluation
  const gmpFreshnessText = React.useMemo(() => {
    if (!hasGmp || !ipo.gmp_updated_at) return '';
    const diffMs = Date.now() - new Date(ipo.gmp_updated_at).getTime();
    const diffHours = Math.floor(diffMs / (3600 * 1000));
    if (diffHours >= 48) return 'Updated 2d ago';
    if (diffHours >= 24) return 'Updated 1d ago';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Updated ${diffMins}m ago`;
    return `Updated ${diffHours}h ago`;
  }, [hasGmp, ipo.gmp_updated_at]);

  const applyDateStr = formatApplyDates(ipo.open_date, ipo.close_date);

  return (
    <TouchableOpacity
      onPress={() => onPress(ipo)}
      onLongPress={handleLongPressCard}
      delayLongPress={250}
      activeOpacity={0.88}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: isCompared ? colors.primary : colors.border },
        isCompared && { borderWidth: 1.5 },
      ]}
    >
      {/* Top Header: Logo on left, Segment & Actions on right */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.logoWrap}>
          {resolvedLogo && !logoError ? (
            <Image
              source={{ uri: resolvedLogo }}
              style={styles.logoImage}
              resizeMode="contain"
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
        </View>

        <View style={styles.headerRightWrap}>
          <Text style={[styles.segmentLabelText, { color: colors.mutedForeground }]}>
            {ipo.issue_type || 'Mainboard'}
          </Text>

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
                size={13}
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
                size={13}
                color={isFav ? '#D97706' : colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Company Title */}
      <Text style={[styles.companyTitle, { color: colors.foreground }]} numberOfLines={2}>
        {companyNameStr}
      </Text>

      {/* Bid Price Line */}
      <View style={styles.infoLineRow}>
        <Text style={[styles.infoLineLabel, { color: colors.mutedForeground }]}>Bid Price: </Text>
        <Text style={[styles.infoLineVal, { color: colors.foreground }]}>{priceBandText}</Text>
      </View>

      {/* GMP Line */}
      <View style={styles.infoLineRow}>
        <Text style={[styles.infoLineLabel, { color: colors.mutedForeground }]}>GMP: </Text>
        <Text style={[styles.gmpValText, { color: gmpColor }]}>
          {gmpDisplay}
        </Text>
        {gmpFreshnessText ? (
          <Text style={[styles.gmpUpdatedText, { color: colors.mutedForeground }]}>
            {'  '}{gmpFreshnessText}
          </Text>
        ) : null}
      </View>

      {/* Bottom 3-Column Metrics Grid */}
      <View style={[styles.metricsGridRow, { borderTopColor: colors.border }]}>
        <View style={styles.metricGridCol}>
          <Text style={[styles.metricGridLabel, { color: colors.mutedForeground }]}>Min Investment</Text>
          <Text style={[styles.metricGridVal, { color: colors.foreground }]}>
            {lotValue ? `₹ ${lotValue.toLocaleString('en-IN')}` : '—'}
          </Text>
        </View>

        <View style={[styles.metricGridCol, { alignItems: 'center' }]}>
          <Text style={[styles.metricGridLabel, { color: colors.mutedForeground }]}>Apply Date</Text>
          <Text style={[styles.metricGridVal, { color: colors.foreground }]}>
            {applyDateStr}
          </Text>
        </View>

        <View style={[styles.metricGridCol, { alignItems: 'flex-end' }]}>
          <Text style={[styles.metricGridLabel, { color: colors.mutedForeground }]}>Lot Size</Text>
          <Text style={[styles.metricGridVal, { color: colors.foreground }]}>
            {ipo.lot_size ?? '—'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  logoWrap: {
    width: 48,
    height: 48,
  },
  logoImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
    resizeMode: 'contain',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  headerRightWrap: {
    alignItems: 'flex-end',
    gap: 6,
  },
  segmentLabelText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  iconActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  softIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  infoLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  infoLineLabel: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  infoLineVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  gmpValText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  gmpUpdatedText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  metricsGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  metricGridCol: {
    flex: 1,
  },
  metricGridLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 4,
  },
  metricGridVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
