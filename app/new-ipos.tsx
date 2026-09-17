import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { useDB } from '@/context/DBContext';
import { formatCurrency } from '@/utils/formatters';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { triggerCentralizedIPOSync } from '@/services/ipo/centralizedSync';

type NewIpoTab = 'live' | 'upcoming' | 'closed' | 'listed';
type SortOption = 'DEFAULT' | 'GMP' | 'DATE' | 'MIN_INVEST' | 'NAME';

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

  const toggleSearch = () => {
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
  };

  const searchBarHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });
  const searchBarOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });
  
  const TABS: NewIpoTab[] = ['live', 'upcoming', 'closed', 'listed'];
  const { width: screenWidth } = useWindowDimensions();
  const horizontalScrollViewRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<NewIpoTab>('live');
  const [includeSme, setIncludeSme] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('DEFAULT');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const handleTabPress = (tab: NewIpoTab) => {
    setActiveTab(tab);
    try { Haptics.selectionAsync(); } catch {}
    const index = TABS.indexOf(tab);
    if (index !== -1) {
      horizontalScrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    }
  };

  const handleHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / screenWidth);
    if (TABS[index] && TABS[index] !== activeTab) {
      setActiveTab(TABS[index]);
    }
  };

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

  const filteredRawIpos = useMemo(() => {
    let list = rawIpos;
    if (!includeSme) {
      list = list.filter((i) => i.marketSegment !== 'SME');
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => {
        const name = (i.company?.displayName || i.companyName || i.symbol || '').toLowerCase();
        return name.includes(q);
      });
    }
    return list;
  }, [rawIpos, includeSme, searchQuery]);

  const liveList = useMemo(() => {
    return filteredRawIpos.filter((item) => item.status === 'OPEN' || item.status === 'ACTIVE');
  }, [filteredRawIpos]);

  const upcomingList = useMemo(() => {
    return filteredRawIpos.filter((item) => item.status === 'UPCOMING');
  }, [filteredRawIpos]);

  const closedList = useMemo(() => {
    return filteredRawIpos.filter((item) => {
      const st = (item.status || '').toUpperCase();
      return st === 'CLOSED' || st.includes('ALLOT') || st.includes('AWAIT');
    });
  }, [filteredRawIpos]);

  const listedList = useMemo(() => {
    return filteredRawIpos.filter((item) => item.status === 'LISTED');
  }, [filteredRawIpos]);

  const getListForTab = useCallback((tab: NewIpoTab) => {
    let list: BackendIpo[] = [];
    switch (tab) {
      case 'live':
        list = [...liveList];
        break;
      case 'upcoming':
        list = [...upcomingList];
        break;
      case 'closed':
        list = [...closedList];
        break;
      case 'listed':
        list = [...listedList];
        break;
    }

    switch (sortBy) {
      case 'GMP':
        list.sort((a, b) => {
          const gmpA = Number(a.currentGmp?.gmpAmount || a.currentGmp?.gmpPercentage || 0);
          const gmpB = Number(b.currentGmp?.gmpAmount || b.currentGmp?.gmpPercentage || 0);
          return gmpB - gmpA;
        });
        break;
      case 'DATE':
        list.sort((a, b) => (a.openDate || '').localeCompare(b.openDate || ''));
        break;
      case 'MIN_INVEST':
        list.sort((a, b) => {
          const valA = (a.priceBandHigh || a.priceBandLow || 0) * (a.lotSize || 1);
          const valB = (b.priceBandHigh || b.priceBandLow || 0) * (b.lotSize || 1);
          return valA - valB;
        });
        break;
      case 'NAME':
        list.sort((a, b) => {
          const nameA = a.company?.displayName || a.companyName || a.symbol;
          const nameB = b.company?.displayName || b.companyName || b.symbol;
          return nameA.localeCompare(nameB);
        });
        break;
    }

    return list;
  }, [liveList, upcomingList, closedList, listedList, sortBy]);

  const sortLabel = useMemo(() => {
    switch (sortBy) {
      case 'GMP': return 'GMP';
      case 'DATE': return 'Apply Date';
      case 'MIN_INVEST': return 'Min Investment';
      case 'NAME': return 'Name';
      default: return 'Default';
    }
  }, [sortBy]);

function getStatusBadge(status?: string, openDate?: string | null) {
  const norm = (status || '').toUpperCase();
  if (norm === 'OPEN' || norm === 'ACTIVE') {
    return { text: 'Live Now', bg: '#DCFCE7', color: '#15803D', icon: 'activity' };
  }
  if (norm === 'LISTED') {
    return { text: 'Listed', bg: '#E0E7FF', color: '#4338CA', icon: 'check-circle' };
  }
  if (norm === 'CLOSED') {
    return { text: 'Closed', bg: '#F1F5F9', color: '#64748B', icon: 'lock' };
  }
  const formattedOpen = openDate ? formatApplyDates(openDate, null) : 'Soon';
  return { text: `Opens ${formattedOpen}`, bg: '#E0F2FE', color: '#0369A1', icon: 'calendar' };
}

  const renderItem = ({ item }: { item: BackendIpo }) => {
    const companyName = item.company?.displayName || item.companyName || item.symbol || 'IPO';
    const priceBandText = item.priceBandLow && item.priceBandHigh
      ? item.priceBandLow === item.priceBandHigh
        ? `₹${item.priceBandHigh}`
        : `₹${item.priceBandLow} to ₹${item.priceBandHigh}`
      : item.priceBandHigh
      ? `₹${item.priceBandHigh}`
      : item.priceBandLow
      ? `₹${item.priceBandLow}`
      : 'TBA';

    const minPrice = item.priceBandHigh || item.priceBandLow || 0;
    const lotQty = item.lotSize || 0;
    const lotValue = minPrice && lotQty ? minPrice * lotQty : null;

    const gmpAmt = item.currentGmp?.gmpAmount != null ? Number(item.currentGmp.gmpAmount) : null;
    const gmpPct = item.currentGmp?.gmpPercentage != null ? Number(item.currentGmp.gmpPercentage) : null;
    const hasGmp = gmpAmt != null || gmpPct != null;

    const gmpDisplay = gmpAmt != null
      ? `${gmpAmt > 0 ? '+' : ''}₹${gmpAmt}${gmpPct != null ? ` (${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%)` : ''}`
      : gmpPct != null
      ? `${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%`
      : 'TBA';

    const gmpColor = hasGmp ? ((gmpAmt || gmpPct || 0) >= 0 ? '#10B981' : '#EF4444') : colors.mutedForeground;

    const applyDateStr = formatApplyDates(item.openDate, item.closeDate);

    const logoUrl = item.company?.logoUrl || (item as any).logoUrl || (item as any).logo_url;
    const initials = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

    const isSme = item.marketSegment === 'SME';
    const statusBadge = getStatusBadge(item.status, item.openDate);

    const normStatus = (item.status || '').toUpperCase();
    const isClosedOrListed = normStatus === 'CLOSED' || normStatus === 'LISTED' || normStatus === 'ALLOTTED' || normStatus.includes('CLOSED') || normStatus.includes('LIST');

    // Matching applications from SQLite
    const matchingApps = applications.filter((a) => {
      if (a.ipo_id === item.id) return true;
      const aName = (a.ipo_name || '').toLowerCase().trim();
      const iName = companyName.toLowerCase().trim();
      return aName && iName && (aName === iName || aName.includes(iName) || iName.includes(aName));
    });

    const totalAppsCount = matchingApps.length;
    const appliedCount = matchingApps.filter((a) => a.status === 'Applied' || a.status === 'Mandate Approved').length;
    const allottedCount = matchingApps.filter((a) => a.status === 'Allotted' || a.status === 'Partially Allotted' || a.status === 'Holding' || a.status === 'Sold').length;

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() =>
          router.push({
            pathname: '/backend-ipo-details',
            params: { id: item.id, item: JSON.stringify(item) },
          })
        }
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
                Bid Price: <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }}>{priceBandText}</Text>
              </Text>
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View
              style={[
                styles.segmentBadge,
                {
                  backgroundColor: isSme
                    ? (isDark ? 'rgba(217, 119, 6, 0.15)' : '#FEF3C7')
                    : (isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF'),
                },
              ]}
            >
              <Text
                style={[
                  styles.segmentBadgeText,
                  {
                    color: isSme
                      ? (isDark ? '#F59E0B' : '#D97706')
                      : (isDark ? '#818CF8' : '#4F46E5'),
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

        {/* Compact Surface Box (Matching IPO Management card style) */}
        <View style={[styles.middleGridCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Col 1: EST. GMP & % */}
          <View style={styles.gridCol}>
            <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>EST. GMP</Text>
            <Text style={[styles.gridVal, { color: gmpColor }]} numberOfLines={1}>
              {gmpDisplay}
            </Text>
          </View>

          <View style={[styles.gridDivider, { backgroundColor: colors.border }]} />

          {/* Col 2: LOT QTY / SIZE */}
          <View style={[styles.gridCol, { alignItems: 'center' }]}>
            <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>LOT QTY</Text>
            <Text style={[styles.gridVal, { color: colors.foreground }]} numberOfLines={1}>
              {lotQty ? `${lotQty} shares` : '—'}
            </Text>
          </View>

          <View style={[styles.gridDivider, { backgroundColor: colors.border }]} />

          {/* Col 3: LOT VALUE / MIN INVEST */}
          <View style={[styles.gridCol, { alignItems: 'flex-end' }]}>
            <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>LOT VALUE</Text>
            <Text style={[styles.gridVal, { color: colors.foreground }]} numberOfLines={1}>
              {lotValue ? formatCurrency(lotValue) : '—'}
            </Text>
          </View>
        </View>

        {/* Timeline & Status Badge Row */}
        <View style={styles.dateAndStatusRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Feather name="calendar" size={12} color={colors.mutedForeground} />
            <Text style={[styles.dateRowText, { color: colors.mutedForeground }]} numberOfLines={1}>
              Apply: <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }}>{applyDateStr}</Text>
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

        {/* Applications Stats Pill Row & Apply CTA Footer */}
        <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
          <View style={styles.appPillsContainer}>
            <Text style={[styles.totalAppsLabel, { color: colors.mutedForeground }]}>
              Apps: <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_700Bold' }}>{totalAppsCount}</Text>
            </Text>

            <View style={[styles.countPill, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
              <Text style={[styles.countPillText, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                {appliedCount} applied
              </Text>
            </View>

            <View style={[styles.countPill, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7' }]}>
              <Text style={[styles.countPillText, { color: isDark ? '#34D399' : '#15803D' }]}>
                {allottedCount} allotted
              </Text>
            </View>
          </View>

          {!isClosedOrListed ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/apply-ipo',
                  params: { ipoId: item.id },
                } as any)
              }
              style={[styles.applyCtaBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.applyCtaText}>Apply Now</Text>
              <Feather name="arrow-right" size={12} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/backend-ipo-details',
                  params: { id: item.id, item: JSON.stringify(item) },
                })
              }
              style={[styles.viewDetailsCtaBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.viewDetailsText, { color: colors.mutedForeground }]}>View Details</Text>
              <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

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
            variant={includeSme || sortBy !== 'DEFAULT' ? 'primary' : 'surface'}
            size="md"
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setShowFilterModal(true);
            }}
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
          tabs={[
            { key: 'live', label: 'Live', count: liveList.length },
            { key: 'upcoming', label: 'Upcoming', count: upcomingList.length },
            { key: 'closed', label: 'Closed', count: closedList.length },
            { key: 'listed', label: 'Listed', count: listedList.length },
          ]}
          activeTab={activeTab}
          onChange={(newTab) => handleTabPress(newTab as NewIpoTab)}
          style={{ paddingHorizontal: 16 }}
        />
      </View>

      {/* Main Catalog Feed List with Horizontal Swiping between Tabs */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Fetching live IPO catalog…
          </Text>
        </View>
      ) : error ? (
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
          <Feather name="wifi-off" size={32} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            API Connection Error
          </Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '600' }}>
              Retry API Request
            </Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView
          ref={horizontalScrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleHorizontalScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {TABS.map((tabKey) => {
            const list = getListForTab(tabKey);
            return (
              <View key={tabKey} style={{ width: screenWidth, flex: 1 }}>
                {list.length === 0 ? (
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
                    <Feather name="inbox" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                      No IPOs Found
                    </Text>
                    <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                      No matching IPO records in this view.
                    </Text>
                  </ScrollView>
                ) : (
                  <FlatList
                    data={list}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{
                      paddingTop: 4,
                      paddingBottom: Math.max(insets.bottom + 110, 135),
                    }}
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
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Filter & Sort</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, gap: 14 }}>
              {/* Filter Section: SME Toggle */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 14.5, fontFamily: 'GoogleSansFlex_600SemiBold', color: colors.foreground }}>
                    Include SME IPOs
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginTop: 2 }}>
                    Show Small & Medium Enterprise IPOs
                  </Text>
                </View>
                <Switch
                  value={includeSme}
                  onValueChange={(val) => {
                    setIncludeSme(val);
                    try { Haptics.selectionAsync(); } catch {}
                  }}
                  trackColor={{ false: colors.border, true: colors.primary + '80' }}
                  thumbColor={includeSme ? colors.primary : '#FFFFFF'}
                />
              </View>

              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />

              {/* Sort Section Title */}
              <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Sort By
              </Text>

              {[
                { key: 'DEFAULT', label: 'Default Order' },
                { key: 'GMP', label: 'GMP: Highest First' },
                { key: 'DATE', label: 'Apply Date: Opening Soon' },
                { key: 'MIN_INVEST', label: 'Min Investment: Low to High' },
                { key: 'NAME', label: 'Alphabetical: A-Z' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => {
                    setSortBy(opt.key as SortOption);
                    try { Haptics.selectionAsync(); } catch {}
                  }}
                  style={[
                    styles.sortOptionRow,
                    {
                      borderColor: sortBy === opt.key ? colors.primary : colors.border,
                      backgroundColor: sortBy === opt.key ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.sortOptionText, { color: sortBy === opt.key ? colors.primary : colors.foreground }]}>
                    {opt.label}
                  </Text>
                  {sortBy === opt.key ? <Feather name="check" size={16} color={colors.primary} /> : null}
                </TouchableOpacity>
              ))}
            </View>

            {/* Modal Actions Footer */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setIncludeSme(false);
                  setSortBy('DEFAULT');
                  setShowFilterModal(false);
                  try { Haptics.selectionAsync(); } catch {}
                }}
                style={[styles.modalFooterResetBtn, { borderColor: colors.border }]}
              >
                <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold', color: colors.foreground }}>
                  Reset All
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowFilterModal(false);
                  try { Haptics.selectionAsync(); } catch {}
                }}
                style={[styles.modalFooterApplyBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primaryForeground }}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  filterModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  sortOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  sortOptionText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalFooterResetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooterApplyBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
