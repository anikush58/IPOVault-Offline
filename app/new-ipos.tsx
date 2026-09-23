import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { useDB } from '@/context/DBContext';
import { formatCurrency } from '@/utils/formatters';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { triggerCentralizedIPOSync } from '@/services/ipo/centralizedSync';

type NewIpoTab = 'live' | 'upcoming' | 'closed' | 'listed';
type SortOption = 'DEFAULT' | 'GMP';

const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'],
  ['#10B981', '#047857'],
  ['#3B82F6', '#1D4ED8'],
  ['#F59E0B', '#B45309'],
  ['#EC4899', '#BE185D'],
  ['#6366F1', '#4338CA'],
  ['#14B8A6', '#0F766E'],
  ['#F43F5E', '#BE123C'],
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDatePart(str?: string | null) {
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
}

function formatApplyDates(openDate?: string | null, closeDate?: string | null): string {
  if (!openDate && !closeDate) return 'TBA';
  const o = parseDatePart(openDate);
  const c = parseDatePart(closeDate);

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

function formatSingleDate(dateStr?: string | null): string {
  if (!dateStr) return 'TBA';
  const p = parseDatePart(dateStr);
  if (p) {
    return `${p.day} ${p.month}`;
  }
  return 'TBA';
}

function getStatusBadge(status?: string, openDate?: string | null) {
  const norm = (status || '').toUpperCase().trim();
  if (norm === 'CLOSING_TODAY' || norm === 'CLOSING TODAY' || norm === 'CLOSES TODAY') {
    return { text: 'Closing Today', bg: '#FEF3C7', color: '#D97706', icon: 'alert-circle' };
  }
  if (norm === 'OPEN' || norm === 'ACTIVE' || norm === 'LIVE') {
    return { text: 'Live Now', bg: '#DCFCE7', color: '#15803D', icon: 'activity' };
  }
  if (norm === 'LISTED') {
    return { text: 'Listed', bg: '#E0E7FF', color: '#4338CA', icon: 'check-circle' };
  }
  if (
    norm === 'ALLOTMENT_OUT' ||
    norm === 'ALLOTTED' ||
    norm === 'ALLOTMENT' ||
    norm === 'ALLOTMENT_COMPLETED' ||
    norm === 'ALLOTTED_AVAILABLE' ||
    norm.includes('ALLOT')
  ) {
    return { text: 'Allotment Out', bg: 'rgba(16, 185, 129, 0.12)', color: '#10B981', icon: 'check-circle' };
  }
  if (norm === 'CLOSED' || norm === 'ALLOTMENT_PENDING' || norm === 'ALLOTTED_PENDING' || (norm.includes('CLOSED') && norm !== 'CLOSING_TODAY')) {
    return { text: 'Closed', bg: '#F1F5F9', color: '#64748B', icon: 'lock' };
  }
  const formattedOpen = openDate ? formatApplyDates(openDate, null) : 'Soon';
  return { text: `Opens ${formattedOpen}`, bg: '#E0F2FE', color: '#0369A1', icon: 'calendar' };
}

interface NewIpoCardItemProps {
  item: BackendIpo;
  tab: NewIpoTab;
  colors: any;
  isDark: boolean;
  totalAppsCount: number;
  appliedCount: number;
  allottedCount: number;
  onPress: (item: BackendIpo) => void;
  onApplyPress: (item: BackendIpo) => void;
}

const NewIpoCardItem = React.memo(
  function NewIpoCardItem({
    item,
    tab,
    colors,
    isDark,
    totalAppsCount,
    appliedCount,
    allottedCount,
    onPress,
    onApplyPress,
  }: NewIpoCardItemProps) {
    const companyName = item.company?.displayName || item.companyName || item.symbol || 'IPO';
    const formatIntPrice = (val: any) => {
      if (val == null || val === '') return null;
      const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.]/g, ''));
      if (isNaN(num)) return null;
      return Math.round(num);
    };
    const lowPrice = formatIntPrice(item.priceBandLow);
    const highPrice = formatIntPrice(item.priceBandHigh);
    const priceBandText = lowPrice && highPrice
      ? lowPrice === highPrice
        ? `₹${highPrice}`
        : `₹${lowPrice} to ₹${highPrice}`
      : highPrice
      ? `₹${highPrice}`
      : lowPrice
      ? `₹${lowPrice}`
      : 'TBA';

    const isSme = item.marketSegment === 'SME' || ((item as any).issue_type || '').toUpperCase().includes('SME');
    const upperPrice = highPrice || lowPrice || 0;
    const lotQty = item.lotSize || 0;
    const minInvestment = upperPrice && lotQty ? (isSme ? upperPrice * lotQty * 2 : upperPrice * lotQty) : null;

    const subTotal = (item as any).total_sub ?? (item as any).total_subscription ?? (item.currentSubscription?.totalSubscriptionMultiple != null ? Number(item.currentSubscription.totalSubscriptionMultiple) : null);
    const qibCat = item.currentSubscription?.categories?.find((c: any) => c.category === 'QIB');
    const subQib = (item as any).qib_sub ?? (qibCat?.subscriptionMultiple != null ? Number(qibCat.subscriptionMultiple) : null);
    const subDisplay = subTotal != null ? `${subTotal.toFixed(1)}x` : (subQib != null ? `${subQib.toFixed(1)}x` : '—');

    const gmpAmt = item.currentGmp?.gmpAmount != null ? Number(item.currentGmp.gmpAmount) : null;
    const gmpPct = item.currentGmp?.gmpPercentage != null ? Number(item.currentGmp.gmpPercentage) : null;
    const hasGmp = gmpAmt != null || gmpPct != null;

    const gmpDisplay = gmpAmt != null
      ? `${gmpAmt > 0 ? '+' : ''}₹${gmpAmt}${gmpPct != null ? ` (${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%)` : ''}`
      : gmpPct != null
      ? `${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%`
      : 'TBA';

    const gmpColor = hasGmp ? ((gmpAmt || gmpPct || 0) >= 0 ? '#10B981' : '#EF4444') : colors.mutedForeground;

    const normStatus = (item.status || '').toUpperCase().trim();
    const isClosedOrListed =
      normStatus === 'CLOSED' ||
      normStatus === 'LISTED' ||
      normStatus === 'ALLOTTED' ||
      normStatus === 'ALLOTMENT_OUT' ||
      normStatus === 'ALLOTMENT_COMPLETED' ||
      (normStatus.includes('CLOSED') && normStatus !== 'CLOSING_TODAY') ||
      normStatus.includes('ALLOT') ||
      normStatus.includes('LIST');
    const isListed = normStatus === 'LISTED' || tab === 'listed';
    const isUpcoming = normStatus === 'UPCOMING' || tab === 'upcoming';
    const isOpen =
      (normStatus === 'OPEN' ||
        normStatus === 'CLOSING_TODAY' ||
        normStatus === 'LIVE' ||
        normStatus === 'BIDDING' ||
        normStatus === 'ACTIVE' ||
        tab === 'live') &&
      !isUpcoming &&
      !isClosedOrListed;

    const applyDateStr = formatApplyDates(item.openDate, item.closeDate);
    const allotmentDateRaw =
      item.allotmentDate ||
      item.lifecycle?.basisOfAllotmentDate ||
      item.allotment?.expectedDate ||
      item.allotment?.expectedAllotmentDate ||
      (item as any).allotment_date;
    const allotmentDateStr = formatSingleDate(allotmentDateRaw);

    const listingDateRaw =
      item.listingDate ||
      item.lifecycle?.listingDate ||
      (item as any).listing_date;
    const listingDateStr = formatSingleDate(listingDateRaw);

    let dateLabel = 'Apply:';
    let dateValueStr = applyDateStr;

    if (isListed) {
      dateLabel = 'Listing:';
      dateValueStr = listingDateStr;
    } else if (tab === 'closed' || isClosedOrListed) {
      dateLabel = 'Allotment:';
      dateValueStr = allotmentDateStr;
    }

    const logoUrl = item.company?.logoUrl || (item as any).logoUrl || (item as any).logo_url;
    const initials = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

    const statusBadge = getStatusBadge(item.status, item.openDate);

    const issuePrice = upperPrice || 0;
    const listingPrice = item.listingPrice != null ? Number(item.listingPrice) : null;
    const listingGainPct = item.listingGainPct != null ? Number(item.listingGainPct) : (listingPrice && issuePrice > 0 ? ((listingPrice - issuePrice) / issuePrice) * 100 : null);
    const profitAmt = item.profitAmount != null ? Number(item.profitAmount) : (listingPrice && issuePrice > 0 && lotQty ? (listingPrice - issuePrice) * lotQty : null);
    const profitPct = item.profitPercentage != null ? Number(item.profitPercentage) : listingGainPct;

    const profitDisplay = profitAmt != null
      ? `${profitAmt > 0 ? '+' : ''}₹${Math.round(profitAmt).toLocaleString('en-IN')}${profitPct != null ? ` (${profitPct > 0 ? '+' : ''}${profitPct.toFixed(1)}%)` : ''}`
      : profitPct != null
      ? `${profitPct > 0 ? '+' : ''}${profitPct.toFixed(1)}%`
      : 'TBA';
    const profitColor = (profitAmt ?? profitPct ?? 0) >= 0 ? '#10B981' : '#EF4444';

    const showAllottedCount = tab === 'closed' || tab === 'listed' || (!isOpen && isClosedOrListed);

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => onPress(item)}
        style={[
          styles.itemCard,
          {
            backgroundColor: colors.card,
            borderColor: isDark ? '#1E293B' : colors.border,
          },
        ]}
      >
        {/* Card Header Row: Logo/Avatar + Company Title & Price + Segment & Exchange Badge */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.headerLeftCol}>
            <View style={styles.logoWrap}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="contain" />
              ) : (
                <LinearGradient
                  colors={getAvatarGradient(companyName)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{initials}</Text>
                </LinearGradient>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.companyTitle, { color: colors.foreground }]} numberOfLines={1}>
                {companyName}
              </Text>
              <Text style={[styles.bidPriceSubtitle, { color: colors.mutedForeground }]}>
                {isListed && listingPrice != null ? 'Listing Price: ' : 'Bid Price: '}
                <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }}>
                  {isListed && listingPrice != null ? `₹${Math.round(listingPrice)}` : priceBandText}
                </Text>
              </Text>
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View
              style={[
                styles.segmentBadge,
                {
                  backgroundColor: isSme
                    ? (isDark ? 'rgba(236, 72, 153, 0.15)' : '#FCE7F3')
                    : (isDark ? 'rgba(139, 92, 246, 0.15)' : '#F3E8FF'),
                  borderColor: isSme
                    ? (isDark ? 'rgba(236, 72, 153, 0.3)' : 'rgba(236, 72, 153, 0.25)')
                    : (isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.25)'),
                  borderWidth: 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.segmentBadgeText,
                  {
                    color: isSme
                      ? (isDark ? '#F472B6' : '#DB2777')
                      : (isDark ? '#A78BFA' : '#7C3AED'),
                  },
                ]}
              >
                {isSme ? 'SME' : 'Mainboard'}
              </Text>
            </View>
            <Text style={[styles.topExchangeTag, { color: colors.mutedForeground }]}>
              NSE • BSE
            </Text>
          </View>
        </View>

        {/* Compact Surface Box (Matching IPO Management card style, 50% reduced opacity) */}
        <View
          style={[
            styles.middleGridCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(241, 243, 245, 0.4)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
        >
          {/* Col 1: GMP / PROFIT & % */}
          <View style={styles.gridCol}>
            <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>
              {isListed ? 'PROFIT' : 'GMP'}
            </Text>
            <Text style={[styles.gridVal, { color: isListed ? profitColor : gmpColor }]} numberOfLines={1}>
              {isListed ? profitDisplay : gmpDisplay}
            </Text>
          </View>

          <View style={[styles.gridDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border }]} />

          {/* Col 2: OVERALL SUBSCRIPTION */}
          <View style={[styles.gridCol, { alignItems: 'center' }]}>
            <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>OVERALL SUB</Text>
            <Text style={[styles.gridVal, { color: colors.foreground }]} numberOfLines={1}>
              {subDisplay}
            </Text>
          </View>

          <View style={[styles.gridDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border }]} />

          {/* Col 3: MIN INVESTMENT */}
          <View style={[styles.gridCol, { alignItems: 'flex-end' }]}>
            <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>MIN INVESTMENT</Text>
            <Text style={[styles.gridVal, { color: colors.foreground }]} numberOfLines={1}>
              {minInvestment != null ? formatCurrency(minInvestment) : '—'}
            </Text>
          </View>
        </View>

        {/* Timeline & Status Badge Row */}
        <View style={[styles.dateAndStatusRow, isUpcoming && { marginBottom: 0 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Feather name="calendar" size={12} color={colors.mutedForeground} />
            <Text style={[styles.dateRowText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {dateLabel}{' '}
              <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }}>
                {dateValueStr}
              </Text>
            </Text>
          </View>

          <View
            style={[
              styles.statusPill,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : statusBadge.bg },
            ]}
          >
            <Feather name={statusBadge.icon as any} size={11} color={isDark ? colors.foreground : statusBadge.color} />
            <Text style={[styles.statusPillText, { color: isDark ? colors.foreground : statusBadge.color }]}>
              {statusBadge.text}
            </Text>
          </View>
        </View>

        {/* Applications Stats Pill Row & Apply CTA Footer (Hidden for Upcoming tab/status) */}
        {!isUpcoming && (
          <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
            <View style={styles.appPillsContainer}>
              <View style={[styles.countPill, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                <Text style={[styles.countPillText, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                  {totalAppsCount} applied
                </Text>
              </View>

              {showAllottedCount && (
                <View style={[styles.countPill, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7' }]}>
                  <Text style={[styles.countPillText, { color: isDark ? '#34D399' : '#15803D' }]}>
                    {allottedCount} allotted
                  </Text>
                </View>
              )}
            </View>

            {isOpen ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onApplyPress(item)}
                style={[styles.applyCtaBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.applyCtaText, { color: colors.primaryForeground }]}>Apply Now</Text>
                <Feather name="arrow-right" size={12} color={colors.primaryForeground} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onPress(item)}
                style={[styles.viewDetailsCtaBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.viewDetailsText, { color: colors.mutedForeground }]}>View Details</Text>
                <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  }
);

const TABS: readonly NewIpoTab[] = ['live', 'upcoming', 'closed', 'listed'] as const;

export default function NewIposScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { applications } = useDB();

  const [rawIpos, setRawIpos] = useState<BackendIpo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);

  const toggleSearch = useCallback(() => {
    if (showSearch) {
      Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
      Animated.timing(searchAnim, { toValue: 1, duration: 220, useNativeDriver: false }).start(() =>
        searchRef.current?.focus()
      );
    }
  }, [showSearch, searchAnim]);

  const searchBarHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });
  const searchBarOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const { width: screenWidth } = useWindowDimensions();
  const horizontalScrollViewRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<NewIpoTab>('live');
  const [includeSme, setIncludeSme] = useState(true);
  const [onlyActiveGmp, setOnlyActiveGmp] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('DEFAULT');
  const [tempIncludeSme, setTempIncludeSme] = useState(true);
  const [tempOnlyActiveGmp, setTempOnlyActiveGmp] = useState(false);
  const [tempSortBy, setTempSortBy] = useState<SortOption>('DEFAULT');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const hasActiveFilter = !includeSme || onlyActiveGmp || sortBy !== 'DEFAULT';

  const openFilterModal = useCallback(() => {
    setTempIncludeSme(includeSme);
    setTempOnlyActiveGmp(onlyActiveGmp);
    setTempSortBy(sortBy);
    setShowFilterModal(true);
    try { Haptics.selectionAsync(); } catch {}
  }, [includeSme, onlyActiveGmp, sortBy]);

  const handleTabPress = useCallback((tab: NewIpoTab) => {
    setActiveTab(tab);
    try { Haptics.selectionAsync(); } catch {}
    const index = TABS.indexOf(tab);
    if (index !== -1) {
      horizontalScrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    }
  }, [screenWidth]);

  const handleHorizontalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / screenWidth);
    if (TABS[index] && TABS[index] !== activeTab) {
      setActiveTab(TABS[index]);
    }
  }, [screenWidth, activeTab]);

  const db = useSQLiteContext();

  const fetchBackendIpos = useCallback(async () => {
    try {
      setError(null);
      const data = await backendIpoApiService.listBackendIpos({
        q: searchQuery.trim() || undefined,
      });
      setRawIpos(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to connect to IPOVault backend API');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    setLoading(true);
    fetchBackendIpos();
  }, [fetchBackendIpos]);

  // Screen Focus Auto-Refresh
  useFocusEffect(
    useCallback(() => {
      fetchBackendIpos();
    }, [fetchBackendIpos])
  );

  // 15-Second Periodic Polling & Global Event Sync Auto-Refresh
  useEffect(() => {
    const timer = setInterval(() => {
      fetchBackendIpos();
    }, 15000);

    const unsubscribe = backendSyncEmitter.subscribe(() => {
      fetchBackendIpos();
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [fetchBackendIpos]);

  const onRefresh = useCallback(async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setRefreshing(true);
    await fetchBackendIpos();
    if (db) {
      triggerCentralizedIPOSync(db, { force: true, source: 'IPO Hub Manual Refresh' }).catch(() => {});
    }
  }, [fetchBackendIpos, db]);

  // Memoized application statistics map (O(N) calculation run only when rawIpos or applications change)
  const appStatsMap = useMemo(() => {
    const map = new Map<string, { total: number; applied: number; allotted: number }>();
    if (!rawIpos.length) return map;

    for (const item of rawIpos) {
      const companyName = (item.company?.displayName || item.companyName || item.symbol || '').toLowerCase().trim();
      let total = 0;
      let applied = 0;
      let allotted = 0;

      for (let i = 0; i < applications.length; i++) {
        const a = applications[i];
        let matched = a.ipo_id === item.id;
        if (!matched && companyName) {
          const aName = (a.ipo_name || '').toLowerCase().trim();
          if (aName && (aName === companyName || aName.includes(companyName) || companyName.includes(aName))) {
            matched = true;
          }
        }
        if (matched) {
          total++;
          if (a.status === 'Applied' || a.status === 'Mandate Approved') applied++;
          if (a.status === 'Allotted' || a.status === 'Partially Allotted' || a.status === 'Holding' || a.status === 'Sold') allotted++;
        }
      }
      map.set(item.id, { total, applied, allotted });
    }
    return map;
  }, [rawIpos, applications]);

  const filteredRawIpos = useMemo(() => {
    let list = rawIpos;
    if (!includeSme) {
      list = list.filter((i) => i.marketSegment !== 'SME');
    }
    if (onlyActiveGmp) {
      list = list.filter((i) => {
        const gmpAmt = i.currentGmp?.gmpAmount != null ? Number(i.currentGmp.gmpAmount) : null;
        const gmpPct = i.currentGmp?.gmpPercentage != null ? Number(i.currentGmp.gmpPercentage) : null;
        return gmpAmt != null || gmpPct != null;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => {
        const name = (i.company?.displayName || i.companyName || i.symbol || '').toLowerCase();
        return name.includes(q);
      });
    }
    return list;
  }, [rawIpos, includeSme, onlyActiveGmp, searchQuery]);

  const liveList = useMemo(() => {
    return filteredRawIpos.filter((item) => {
      const st = (item.status || '').toUpperCase().trim();
      return st === 'OPEN' || st === 'ACTIVE' || st === 'LIVE' || st === 'CLOSING_TODAY';
    });
  }, [filteredRawIpos]);

  const upcomingList = useMemo(() => {
    return filteredRawIpos.filter((item) => item.status === 'UPCOMING');
  }, [filteredRawIpos]);

  const closedList = useMemo(() => {
    return filteredRawIpos.filter((item) => {
      const st = (item.status || '').toUpperCase();
      return (
        (st === 'CLOSED' || st.includes('ALLOT') || st.includes('AWAIT') || st === 'LISTING_PENDING') &&
        st !== 'CLOSING_TODAY'
      );
    });
  }, [filteredRawIpos]);

  const listedList = useMemo(() => {
    return filteredRawIpos.filter((item) => {
      const st = (item.status || '').toUpperCase();
      return st === 'LISTED' || st === 'LISTING_PENDING';
    });
  }, [filteredRawIpos]);

  // Pre-sorted lists for all 4 tabs so tab switching never executes array sorts
  const sortedTabLists = useMemo(() => {
    const sortFn = (list: BackendIpo[]) => {
      const arr = [...list];
      switch (sortBy) {
        case 'GMP':
          return arr.sort((a, b) => {
            const gmpA = Number(a.currentGmp?.gmpAmount || a.currentGmp?.gmpPercentage || 0);
            const gmpB = Number(b.currentGmp?.gmpAmount || b.currentGmp?.gmpPercentage || 0);
            return gmpB - gmpA;
          });
        default:
          return arr;
      }
    };

    return {
      live: sortFn(liveList),
      upcoming: sortFn(upcomingList),
      closed: sortFn(closedList),
      listed: sortFn(listedList),
    };
  }, [liveList, upcomingList, closedList, listedList, sortBy]);

  const handleCardPress = useCallback(
    (item: BackendIpo) => {
      router.push({
        pathname: '/backend-ipo-details',
        params: { id: item.id, item: JSON.stringify(item) },
      });
    },
    [router]
  );

  const handleApplyPress = useCallback(
    (item: BackendIpo) => {
      router.push({
        pathname: '/apply-ipo',
        params: {
          ipoId: item.id,
          item: JSON.stringify(item),
          name: item.company?.displayName || item.companyName || item.symbol,
          company_name: item.company?.displayName || item.companyName || item.symbol,
          symbol: item.symbol,
          priceBandLow: item.priceBandLow != null ? String(item.priceBandLow) : undefined,
          priceBandHigh: item.priceBandHigh != null ? String(item.priceBandHigh) : undefined,
          buy_price: String(item.priceBandHigh || item.priceBandLow || item.issuePriceInr || 0),
          lotSize: item.lotSize != null ? String(item.lotSize) : undefined,
          closeDate: item.closeDate || undefined,
          openDate: item.openDate || undefined,
          logoUrl: item.company?.logoUrl || item.logoUrl || undefined,
          issueType: item.marketSegment === 'SME' ? 'SME' : 'Mainboard',
        },
      } as any);
    },
    [router]
  );

  const renderTabCard = useCallback(
    (tab: NewIpoTab) =>
      ({ item }: { item: BackendIpo }) => {
        const stats = appStatsMap.get(item.id) || { total: 0, applied: 0, allotted: 0 };
        return (
          <NewIpoCardItem
            key={item.id}
            item={item}
            tab={tab}
            colors={colors}
            isDark={isDark}
            totalAppsCount={stats.total}
            appliedCount={stats.applied}
            allottedCount={stats.allotted}
            onPress={handleCardPress}
            onApplyPress={handleApplyPress}
          />
        );
      },
    [appStatsMap, colors, isDark, handleCardPress, handleApplyPress]
  );

  const tabsConfig = useMemo(
    () => [
      { key: 'live' as const, label: 'Live', count: liveList.length },
      { key: 'upcoming' as const, label: 'Upcoming', count: upcomingList.length },
      { key: 'closed' as const, label: 'Closed', count: closedList.length },
      { key: 'listed' as const, label: 'Listed', count: listedList.length },
    ],
    [liveList.length, upcomingList.length, closedList.length, listedList.length]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* App Bar Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            height: topPad + 60,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>
            PRIMARY MARKET
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            IPO Hub
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <IconButton
            name={showSearch ? 'x' : 'search'}
            variant={showSearch ? 'primary' : 'surface'}
            size="md"
            onPress={toggleSearch}
          />
          <IconButton
            name="sliders"
            variant={hasActiveFilter ? 'primary' : 'surface'}
            size="md"
            onPress={openFilterModal}
          />
        </View>
      </View>

      {/* Expandable Search Input */}
      <Animated.View
        style={[
          styles.searchWrap,
          {
            height: searchBarHeight,
            opacity: searchBarOpacity,
            overflow: 'hidden',
          },
        ]}
      >
        <View
          style={[
            styles.searchInputWrap,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            ref={searchRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search IPOs..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Sub-Tab Bar matching Manage Users spacing & badge pills */}
      <View style={{ marginTop: 10, marginBottom: 12 }}>
        <Tabs
          variant="pills"
          scrollable
          tabs={tabsConfig}
          activeTab={activeTab}
          onChange={(newTab) => handleTabPress(newTab as NewIpoTab)}
          style={{ paddingHorizontal: 16 }}
        />
      </View>

      {/* Main Catalog Feed List with Horizontal Swiping between Tabs */}
      {loading ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading...
          </Text>
        </View>
      ) : error && rawIpos.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.centerContainer, { flexGrow: 1, paddingBottom: Math.max(insets.bottom + 110, 135) }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>Connection Error</Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>{error}</Text>
          <TouchableOpacity onPress={onRefresh} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView
          ref={horizontalScrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleHorizontalScroll}
          style={{ flex: 1 }}
        >
          {TABS.map((tab) => {
            const listData = sortedTabLists[tab];
            return (
              <View key={tab} style={{ width: screenWidth, flex: 1 }}>
                {listData.length === 0 ? (
                  <ScrollView
                    contentContainerStyle={styles.emptyCenter}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                      />
                    }
                  >
                    <Feather name="inbox" size={48} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
                    <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No {tab} IPOs found</Text>
                    <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                      {searchQuery
                        ? `No results matching "${searchQuery}"`
                        : !includeSme
                        ? 'Try enabling SME IPOs in filters'
                        : `There are currently no ${tab} IPOs listed.`}
                    </Text>
                  </ScrollView>
                ) : (
                  <FlatList
                    data={listData}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTabCard(tab)}
                    contentContainerStyle={{
                      paddingTop: 12,
                      paddingBottom: Math.max(insets.bottom + 85, 100),
                    }}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={6}
                    maxToRenderPerBatch={6}
                    windowSize={5}
                    removeClippedSubviews={Platform.OS !== 'web'}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                      />
                    }
                  />
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Filter & Sort Modal */}
      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)}>
          <Pressable style={[styles.filterModalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            {/* Drag handle */}
            <View style={styles.modalHandleWrap}>
              <View style={[styles.modalHandle, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)' }]} />
            </View>

            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Filter & Sort</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  Customize IPO Hub listings & ranking
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                hitSlop={8}
                style={[styles.modalCloseBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)' }]}
              >
                <Feather name="x" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {/* Filter Section */}
              <View style={styles.sectionHeaderRow}>
                <Feather name="filter" size={11} color={colors.primary} />
                <Text style={[styles.sectionHeaderTitle, { color: colors.mutedForeground }]}>
                  Filters
                </Text>
              </View>

              <View style={[styles.filterSectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* SME Toggle */}
                <View style={styles.filterRow}>
                  <View style={[styles.filterIconWrap, { backgroundColor: isDark ? 'rgba(236, 72, 153, 0.15)' : '#FCE7F3' }]}>
                    <Feather name="layers" size={15} color={isDark ? '#F472B6' : '#DB2777'} />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.filterItemTitle, { color: colors.foreground }]}>
                      Include SME IPOs
                    </Text>
                    <Text style={[styles.filterItemSub, { color: colors.mutedForeground }]}>
                      Show Small & Medium Enterprise IPOs
                    </Text>
                  </View>
                  <Switch
                    value={tempIncludeSme}
                    onValueChange={(val) => {
                      setTempIncludeSme(val);
                      try { Haptics.selectionAsync(); } catch {}
                    }}
                    trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: colors.primary + '80' }}
                    thumbColor={tempIncludeSme ? colors.primary : '#FFFFFF'}
                  />
                </View>

                <View style={[styles.filterItemDivider, { backgroundColor: colors.border }]} />

                {/* Only Active GMP Toggle */}
                <View style={styles.filterRow}>
                  <View style={[styles.filterIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7' }]}>
                    <Feather name="trending-up" size={15} color="#10B981" />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.filterItemTitle, { color: colors.foreground }]}>
                      Only Active GMP
                    </Text>
                    <Text style={[styles.filterItemSub, { color: colors.mutedForeground }]}>
                      Hide IPOs with TBA or unlisted GMP
                    </Text>
                  </View>
                  <Switch
                    value={tempOnlyActiveGmp}
                    onValueChange={(val) => {
                      setTempOnlyActiveGmp(val);
                      try { Haptics.selectionAsync(); } catch {}
                    }}
                    trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: '#10B98180' }}
                    thumbColor={tempOnlyActiveGmp ? '#10B981' : '#FFFFFF'}
                  />
                </View>
              </View>

              {/* Sort Section */}
              <View style={[styles.sectionHeaderRow, { marginTop: 4 }]}>
                <Feather name="bar-chart-2" size={11} color={colors.primary} />
                <Text style={[styles.sectionHeaderTitle, { color: colors.mutedForeground }]}>
                  Sort By
                </Text>
              </View>

              <View style={{ gap: 8 }}>
                {[
                  {
                    key: 'DEFAULT',
                    label: 'Default Order',
                    sub: 'Standard catalog & timeline order',
                    icon: 'list',
                    color: colors.primary,
                  },
                  {
                    key: 'GMP',
                    label: 'GMP: Highest First',
                    sub: 'Rank by highest grey market premium',
                    icon: 'arrow-up-right',
                    color: '#10B981',
                  },
                ].map((opt) => {
                  const isSelected = tempSortBy === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      activeOpacity={0.75}
                      onPress={() => {
                        setTempSortBy(opt.key as SortOption);
                        try { Haptics.selectionAsync(); } catch {}
                      }}
                      style={[
                        styles.sortCard,
                        {
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected
                            ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF')
                            : colors.surface,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.sortIconWrap,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(99, 102, 241, 0.2)' : '#E0E7FF')
                              : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                          },
                        ]}
                      >
                        <Feather name={opt.icon as any} size={15} color={isSelected ? colors.primary : colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.sortCardTitle, { color: isSelected ? colors.primary : colors.foreground }]}>
                          {opt.label}
                        </Text>
                        <Text style={[styles.sortCardSub, { color: colors.mutedForeground }]}>
                          {opt.sub}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.radioCircle,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {isSelected && <Feather name="check" size={10} color="#FFFFFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Modal Actions Footer */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setTempIncludeSme(true);
                  setTempOnlyActiveGmp(false);
                  setTempSortBy('DEFAULT');
                  setIncludeSme(true);
                  setOnlyActiveGmp(false);
                  setSortBy('DEFAULT');
                  setShowFilterModal(false);
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
                }}
                style={[styles.modalFooterResetBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.resetBtnText, { color: colors.mutedForeground }]}>
                  Reset All
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setIncludeSme(tempIncludeSme);
                  setOnlyActiveGmp(tempOnlyActiveGmp);
                  setSortBy(tempSortBy);
                  setShowFilterModal(false);
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                }}
                style={[styles.modalFooterApplyBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Feather name="check" size={14} color={colors.primaryForeground} style={{ marginRight: 6 }} />
                <Text style={[styles.applyBtnText, { color: colors.primaryForeground }]}>
                  Apply Filters
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  subTabBarWrap: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  smeToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smeToggleText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  sortDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  sortBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  errorSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptyCenter: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },
  itemCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  logoWrap: {
    width: 40,
    height: 40,
  },
  logoImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
    resizeMode: 'contain',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  companyTitle: {
    fontSize: 15.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  bidPriceSubtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  segmentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  segmentBadgeText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  topExchangeTag: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.5,
  },
  middleGridCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  gridCol: {
    flex: 1,
  },
  gridDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 8,
  },
  gridLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  gridVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  dateAndStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  dateRowText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
  },
  appPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  totalAppsLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countPillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  applyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  applyCtaText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  viewDetailsCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  viewDetailsText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  filterModalCard: {
    width: '100%',
    maxWidth: 410,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  modalHandleWrap: {
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 8,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingTop: 14,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  filterSectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  filterIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  filterItemTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  filterItemSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1.5,
  },
  filterItemDivider: {
    height: 1,
    marginHorizontal: -4,
  },
  sortCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  sortIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sortCardTitle: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  sortCardSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  modalFooterResetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  modalFooterApplyBtn: {
    flex: 1.8,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
