import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatIssueSize, getResolvedLogoUrl } from '@/utils/formatters';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDateComponents(str?: string | null): { day: number; month: string; monthIdx: number } | null {
  if (!str) return null;
  const clean = str.trim();
  if (!clean || clean.toUpperCase() === 'TBA' || clean.toUpperCase() === 'N/A') return null;

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/);
    const day = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    if (!isNaN(day) && monthIdx >= 0 && monthIdx < 12) {
      return { day, month: MONTHS[monthIdx], monthIdx };
    }
  }

  // YYYY-MM-DD or ISO string
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(clean)) {
    const datePart = clean.split('T')[0];
    const parts = datePart.split(/[-/]/);
    const day = parseInt(parts[2], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    if (!isNaN(day) && monthIdx >= 0 && monthIdx < 12) {
      return { day, month: MONTHS[monthIdx], monthIdx };
    }
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return { day: d.getDate(), month: MONTHS[d.getMonth()], monthIdx: d.getMonth() };
  }
  return null;
}

function formatSingleDate(dateStr?: string | null): string {
  if (!dateStr) return 'TBA';
  const parsed = parseDateComponents(dateStr);
  if (parsed) {
    return `${parsed.day} ${parsed.month}`;
  }
  return dateStr.trim() || 'TBA';
}

function formatApplyDates(openDate?: string | null, closeDate?: string | null): string {
  if (!openDate && !closeDate) return 'TBA';
  const o = parseDateComponents(openDate);
  const c = parseDateComponents(closeDate);

  if (o && c) {
    if (o.monthIdx === c.monthIdx) {
      if (o.day === c.day) {
        return `${o.day} ${o.month}`;
      }
      return `${o.day} - ${c.day} ${o.month}`;
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
    const formatIntVal = (v: any) => {
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (isNaN(n)) return null;
      return Math.round(n);
    };
    const low = formatIntVal(ipo.price_band_min);
    const high = formatIntVal(ipo.price_band_max);
    if (low && high) {
      if (low === high) {
        return `₹${high}`;
      }
      return `₹${low} - ₹${high}`;
    }
    if (high) return `₹${high}`;
    if (low) return `₹${low}`;
    return 'TBA';
  }, [ipo.price_band_min, ipo.price_band_max]);

  // Issue Type (SME vs Mainboard)
  const isSme = (ipo.issue_type || '').toUpperCase().includes('SME');
  const issueTypeLabel = isSme ? 'SME' : 'Mainboard';

  // Calculated min investment amount
  const lotValue = React.useMemo(() => {
    const p = ipo.price_band_max || ipo.price_band_min;
    if (p && ipo.lot_size) {
      return isSme ? p * ipo.lot_size * 2 : p * ipo.lot_size;
    }
    return null;
  }, [ipo.price_band_max, ipo.price_band_min, ipo.lot_size, isSme]);

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

  const handleLongPressCard = () => {
    if (onLongPress) {
      onLongPress(ipo);
    } else {
      toggleCompare(ipo.id);
    }
  };

  // Status computation
  const normStatus = (ipo.status || ipo.lifecycle_status || '').toUpperCase().trim();
  const isOpen = normStatus === 'OPEN' || normStatus === 'LIVE' || normStatus === 'LIVE NOW' || normStatus === 'LIVE BID';
  const isAllotmentOut =
    normStatus === 'ALLOTTED_AVAILABLE' ||
    normStatus === 'ALLOTMENT_OUT' ||
    normStatus === 'ALLOTMENT_COMPLETED' ||
    (ipo.status || '').toUpperCase() === 'ALLOTMENT_COMPLETED' ||
    (ipo.status || '').toUpperCase() === 'ALLOTMENT_OUT';
  const isListed = normStatus === 'LISTED' || normStatus === 'LISTING_PENDING';
  const isClosed = normStatus === 'CLOSED' || normStatus.includes('ALLOT') || normStatus.includes('AWAIT');
  const isUpcoming = !isOpen && !isClosed && !isListed && !isAllotmentOut;

  // GMP Text & Calculation
  const gmpAmt = ipo.gmp_amount != null ? Math.round(ipo.gmp_amount) : null;
  const gmpPct = ipo.gmp_percent != null ? ipo.gmp_percent : null;
  const hasGmp = gmpAmt != null || gmpPct != null;

  const gmpDisplay = React.useMemo(() => {
    if (gmpAmt != null) {
      const pctStr = gmpPct != null ? ` (${gmpPct > 0 ? '' : ''}${Math.round(gmpPct)}%)` : '';
      return `₹${gmpAmt}${pctStr}`;
    }
    if (gmpPct != null) {
      return `${gmpPct > 0 ? '+' : ''}${Math.round(gmpPct)}%`;
    }
    return '—';
  }, [gmpAmt, gmpPct]);

  const gmpColor = hasGmp ? ((gmpAmt || gmpPct || 0) >= 0 ? '#10B981' : '#EF4444') : colors.mutedForeground;

  // Expected Profit / Lot calculation
  const issuePrice = ipo.price_band_max || ipo.price_band_min || 0;
  const listingPrice = (ipo as any).listing_price != null ? Number((ipo as any).listing_price) : null;
  const profitAmt = (ipo as any).profit_amount != null
    ? Number((ipo as any).profit_amount)
    : (listingPrice && issuePrice > 0 && ipo.lot_size ? (listingPrice - issuePrice) * ipo.lot_size : null);

  const exptProfitPerLot = React.useMemo(() => {
    if (gmpAmt != null && ipo.lot_size) {
      return Math.round(gmpAmt * ipo.lot_size);
    }
    if (gmpPct != null && lotValue) {
      return Math.round(lotValue * (gmpPct / 100));
    }
    if (isListed && profitAmt != null) {
      return Math.round(profitAmt);
    }
    return null;
  }, [gmpAmt, ipo.lot_size, gmpPct, lotValue, isListed, profitAmt]);

  const exptProfitDisplay = React.useMemo(() => {
    if (exptProfitPerLot != null) {
      if (exptProfitPerLot > 0) {
        return `₹${exptProfitPerLot.toLocaleString('en-IN')}`;
      }
      if (exptProfitPerLot < 0) {
        return `-₹${Math.abs(exptProfitPerLot).toLocaleString('en-IN')}`;
      }
      return '₹0';
    }
    return '—';
  }, [exptProfitPerLot]);

  const profitColor = exptProfitPerLot != null
    ? (exptProfitPerLot >= 0 ? '#10B981' : '#EF4444')
    : colors.mutedForeground;

  // Subscription Display
  const subDisplay = React.useMemo(() => {
    const sub = ipo.total_sub != null ? ipo.total_sub : ipo.qib_sub;
    if (sub != null && !isNaN(Number(sub))) {
      return `${Number(sub).toFixed(2)}x`;
    }
    return '—';
  }, [ipo.total_sub, ipo.qib_sub]);

  // Dynamic Dates and Labels
  let dateColLabel = 'Apply Dates';
  let dateColValue = formatApplyDates(ipo.open_date, ipo.close_date);

  if (isListed) {
    dateColLabel = 'Listing Date';
    dateColValue = formatSingleDate(ipo.listing_date);
  } else if (isClosed) {
    dateColLabel = 'Allotment Date';
    dateColValue = formatSingleDate(ipo.allotment_date);
  }

  // Button Label & Action
  const buttonLabel = React.useMemo(() => {
    if (isAllotmentOut) return 'Check';
    if (isListed) return 'Details';
    if (isClosed) return 'Details';
    if (isUpcoming) return 'View';
    return 'Apply Now';
  }, [isAllotmentOut, isListed, isClosed, isUpcoming]);

  const handleButtonPress = (e: any) => {
    e.stopPropagation?.();
    if (isAllotmentOut) {
      router.push({
        pathname: '/allotment-checker',
        params: { ipoId: ipo.id },
      } as any);
    } else {
      onPress(ipo);
    }
  };

  return (
    <TouchableOpacity
      onPress={() => onPress(ipo)}
      onLongPress={handleLongPressCard}
      delayLongPress={250}
      activeOpacity={0.88}
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#1E293B' : '#F4F5F7',
          borderColor: isCompared ? colors.primary : (isDark ? '#334155' : '#E5E7EB'),
        },
        isCompared && { borderWidth: 1.5 },
      ]}
    >
      {/* Top Header: Logo + Title & Price on Left, Badges on Right */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.headerLeftWrap}>
          <View
            style={[
              styles.logoWrap,
              {
                backgroundColor: '#FFFFFF',
                borderColor: isDark ? '#334155' : '#E5E7EB',
              },
            ]}
          >
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

          <View style={styles.titleAndPriceWrap}>
            <Text
              style={[styles.companyTitle, { color: colors.foreground }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {companyNameStr}
            </Text>
            <View style={styles.bidPriceRow}>
              <Text style={[styles.bidPriceLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Bid Price:{' '}
              </Text>
              <Text style={[styles.bidPriceVal, { color: colors.foreground }]}>
                {priceBandText}
              </Text>
            </View>
          </View>
        </View>

        {/* Right Badges */}
        <View style={styles.badgesRow}>
          {/* Issue Type Pill */}
          <View
            style={[
              styles.issueTypePill,
              isSme
                ? {
                    backgroundColor: isDark ? 'rgba(236,72,153,0.12)' : '#FDF2F8',
                    borderColor: isDark ? 'rgba(244,114,182,0.4)' : '#FBCFE8',
                  }
                : {
                    backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF',
                    borderColor: isDark ? 'rgba(199,210,254,0.4)' : '#C7D2FE',
                  },
            ]}
          >
            <Text
              style={[
                styles.issueTypeText,
                { color: isSme ? (isDark ? '#F472B6' : '#BE185D') : (isDark ? '#818CF8' : '#4F46E5') },
              ]}
            >
              {issueTypeLabel}
            </Text>
          </View>

          {/* Status Pill */}
          <View
            style={[
              styles.statusPill,
              isOpen
                ? {
                    backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4',
                    borderColor: isDark ? 'rgba(134,239,172,0.4)' : '#86EFAC',
                  }
                : isUpcoming
                ? {
                    backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#EFF6FF',
                    borderColor: isDark ? 'rgba(147,197,253,0.4)' : '#93C5FD',
                  }
                : isAllotmentOut
                ? {
                    backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4',
                    borderColor: isDark ? 'rgba(134,239,172,0.4)' : '#86EFAC',
                  }
                : isListed
                ? {
                    backgroundColor: isDark ? 'rgba(139,92,246,0.12)' : '#F5F3FF',
                    borderColor: isDark ? 'rgba(221,214,254,0.4)' : '#DDD6FE',
                  }
                : {
                    backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : '#F8FAFC',
                    borderColor: isDark ? 'rgba(203,213,225,0.4)' : '#CBD5E1',
                  },
            ]}
          >
            {isOpen && (
              <Feather
                name="zap"
                size={11.5}
                color={isDark ? '#4ADE80' : '#16A34A'}
                style={{ marginRight: 2 }}
              />
            )}
            <Text
              style={[
                styles.statusText,
                {
                  color: isOpen
                    ? (isDark ? '#4ADE80' : '#15803D')
                    : isUpcoming
                    ? (isDark ? '#60A5FA' : '#1D4ED8')
                    : isAllotmentOut
                    ? (isDark ? '#4ADE80' : '#15803D')
                    : isListed
                    ? (isDark ? '#A78BFA' : '#7C3AED')
                    : (isDark ? '#94A3B8' : '#64748B'),
                },
              ]}
            >
              {isOpen
                ? 'Live Now'
                : isUpcoming
                ? 'Upcoming'
                : isAllotmentOut
                ? 'Allotment Out'
                : isListed
                ? 'Listed'
                : 'Closed'}
            </Text>
          </View>
        </View>
      </View>

      {/* Inner White Data Card */}
      <View
        style={[
          styles.innerDataCard,
          {
            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            borderColor: isDark ? '#334155' : '#E5E7EB',
          },
        ]}
      >
        {/* Row 1: Apply Dates | Min Investment | Lot Size | Issue Size */}
        <View style={styles.dataRow}>
          <View style={styles.dataColFirst}>
            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {dateColLabel}
            </Text>
            <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
              {dateColValue}
            </Text>
          </View>

          <View style={styles.dataColMiddle}>
            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Min Investment
            </Text>
            <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
              {lotValue ? `₹${lotValue.toLocaleString('en-IN')}` : '—'}
            </Text>
          </View>

          <View style={styles.dataColLot}>
            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Lot Size
            </Text>
            <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
              {ipo.lot_size ? `${ipo.lot_size}` : '—'}
            </Text>
          </View>

          <View style={styles.dataColLast}>
            <View style={styles.issueSizeWrap}>
              <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Issue Size
              </Text>
              <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                {formatIssueSize(ipo.issue_size ?? (ipo as any).issueSize ?? (ipo as any).total_issue_size)}
              </Text>
            </View>
          </View>
        </View>

        {/* Row 2: Expt. GMP | Expt. Profit/Lot | Subscription | Action Button */}
        <View style={[styles.dataRow, { marginTop: 14, alignItems: 'center' }]}>
          <View style={styles.dataColFirst}>
            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Expt. GMP
            </Text>
            <Text style={[styles.dataVal, { color: gmpColor }]} numberOfLines={1}>
              {gmpDisplay}
            </Text>
          </View>

          <View style={styles.dataColMiddle}>
            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Expt. Profit/Lot
            </Text>
            <Text style={[styles.dataVal, { color: profitColor }]} numberOfLines={1}>
              {exptProfitDisplay}
            </Text>
          </View>

          <View style={styles.dataColLot}>
            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Subscription
            </Text>
            <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
              {subDisplay}
            </Text>
          </View>

          <View style={styles.dataColLastBtn}>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={handleButtonPress}
              style={[
                styles.applyBtn,
                {
                  backgroundColor: isDark ? '#38BDF8' : '#0F172A',
                },
              ]}
            >
              <Text
                style={[
                  styles.applyBtnText,
                  { color: isDark ? '#0F172A' : '#FFFFFF' },
                ]}
              >
                {buttonLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 14,
    paddingLeft: 5,
    paddingRight: 5,
    paddingBottom: 5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 9,
  },
  headerLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  avatar: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  titleAndPriceWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  companyTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  bidPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bidPriceLabel: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  bidPriceVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  issueTypePill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueTypeText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
  },
  statusText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  innerDataCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dataColFirst: {
    flex: 1.2,
  },
  dataColMiddle: {
    flex: 1.2,
  },
  dataColLot: {
    flex: 0.85,
  },
  dataColLast: {
    flex: 1.15,
    alignItems: 'flex-end',
  },
  issueSizeWrap: {
    width: 94,
    alignItems: 'flex-start',
  },
  dataColLastBtn: {
    flex: 1.15,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  dataLabel: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 3.5,
  },
  dataVal: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  applyBtn: {
    width: 94,
    borderRadius: 20,
    paddingVertical: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.1,
  },
});
