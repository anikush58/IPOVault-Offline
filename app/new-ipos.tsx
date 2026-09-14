import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';

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

  const [rawIpos, setRawIpos] = useState<BackendIpo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  const [activeTab, setActiveTab] = useState<NewIpoTab>('live');
  const [includeSme, setIncludeSme] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('DEFAULT');
  const [showFilterModal, setShowFilterModal] = useState(false);

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

  const onRefresh = () => {
    setRefreshing(true);
    fetchBackendIpos();
  };

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

  const displayedIpos = useMemo(() => {
    let list: BackendIpo[] = [];
    switch (activeTab) {
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
  }, [activeTab, liveList, upcomingList, closedList, listedList, sortBy]);

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
    const companyName = item.company?.displayName || item.companyName || item.symbol;
    const priceBandText = item.priceBandLow && item.priceBandHigh
      ? item.priceBandLow === item.priceBandHigh
        ? `₹${item.priceBandHigh}`
        : `₹${item.priceBandLow} to ₹${item.priceBandHigh}`
      : item.priceBandHigh
      ? `₹${item.priceBandHigh}`
      : item.priceBandLow
      ? `₹${item.priceBandLow}`
      : 'TBA';

    const minInvestment = (item.priceBandHigh || item.priceBandLow) && item.lotSize
      ? (item.priceBandHigh || item.priceBandLow!) * item.lotSize
      : null;

    const gmpAmt = item.currentGmp?.gmpAmount != null ? Number(item.currentGmp.gmpAmount) : null;
    const gmpPct = item.currentGmp?.gmpPercentage != null ? Number(item.currentGmp.gmpPercentage) : null;
    const hasGmp = gmpAmt != null || gmpPct != null;

    const gmpDisplay = gmpAmt != null
      ? `₹${gmpAmt}${gmpPct != null ? ` (${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(0)}%)` : ''}`
      : gmpPct != null
      ? `${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(0)}%`
      : 'TBA';

    const gmpColor = hasGmp ? ((gmpAmt || gmpPct || 0) >= 0 ? '#10B981' : '#EF4444') : colors.mutedForeground;

    const gmpFreshnessText = item.currentGmp?.observedAt
      ? (() => {
          const diffMs = Date.now() - new Date(item.currentGmp.observedAt).getTime();
          const diffHours = Math.floor(diffMs / (3600 * 1000));
          if (diffHours >= 48) return 'Updated 2d ago';
          if (diffHours >= 24) return 'Updated 1d ago';
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins < 60) return `Updated ${diffMins}m ago`;
          return `Updated ${diffHours}h ago`;
        })()
      : '';

    const applyDateStr = formatApplyDates(item.openDate, item.closeDate);

    const logoUrl = item.company?.logoUrl;
    const initials = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

    const isSme = item.marketSegment === 'SME';
    const statusBadge = getStatusBadge(item.status, item.openDate);

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
            borderColor: isDark ? '#1E293B' : '#E2E8F0',
          },
        ]}
      >
        {/* Card Header: Logo + Title + Segment & Exchange Badge */}
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

        {/* Compact Feature Spotlight Box: Est. GMP & Status Pill */}
        <View
          style={[
            styles.gmpSpotlightBox,
            {
              backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
              borderColor: isDark ? '#334155' : '#EDF2F7',
            },
          ]}
        >
          <View style={styles.gmpSpotlightLeft}>
            <Text style={[styles.gmpSpotlightLabel, { color: colors.mutedForeground }]}>
              Est. GMP
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View
                style={[
                  styles.gmpBadgePill,
                  {
                    backgroundColor: hasGmp
                      ? ((gmpAmt || gmpPct || 0) >= 0
                          ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#E6F4EA')
                          : (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FCE8E6'))
                      : (isDark ? '#334155' : '#E2E8F0'),
                  },
                ]}
              >
                <Text style={[styles.gmpBadgeText, { color: gmpColor }]}>
                  {gmpDisplay}
                </Text>
              </View>
              {gmpFreshnessText ? (
                <Text style={[styles.gmpFreshnessText, { color: colors.mutedForeground }]}>
                  {gmpFreshnessText}
                </Text>
              ) : null}
            </View>
          </View>

          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : statusBadge.bg,
              },
            ]}
          >
            <Feather
              name={statusBadge.icon as any}
              size={11}
              color={isDark ? colors.foreground : statusBadge.color}
            />
            <Text
              style={[
                styles.statusPillText,
                { color: isDark ? colors.foreground : statusBadge.color },
              ]}
            >
              {statusBadge.text}
            </Text>
          </View>
        </View>

        {/* 3-Column Key Metrics Grid */}
        <View style={styles.metricsGridRow}>
          <View style={styles.metricGridCol}>
            <Text style={[styles.metricGridLabel, { color: colors.mutedForeground }]}>
              Min Investment
            </Text>
            <Text style={[styles.metricGridVal, { color: colors.foreground }]}>
              {minInvestment ? `₹${minInvestment.toLocaleString('en-IN')}` : '—'}
            </Text>
          </View>

          <View style={[styles.metricGridCol, { alignItems: 'center' }]}>
            <Text style={[styles.metricGridLabel, { color: colors.mutedForeground }]}>
              Apply Date
            </Text>
            <Text style={[styles.metricGridVal, { color: colors.foreground }]}>
              {applyDateStr}
            </Text>
          </View>

          <View style={[styles.metricGridCol, { alignItems: 'flex-end' }]}>
            <Text style={[styles.metricGridLabel, { color: colors.mutedForeground }]}>
              Lot Size
            </Text>
            <Text style={[styles.metricGridVal, { color: colors.foreground }]}>
              {item.lotSize ? `${item.lotSize} Qty` : '—'}
            </Text>
          </View>
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
        <IconButton
          name="arrow-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
          style={{ zIndex: 2 }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: topPad,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
          pointerEvents="none"
        >
          <Text style={[styles.headerEyebrow, { color: colors.primary, textAlign: 'center' }]}>
            PRIMARY MARKET
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: 'center' }]}>
            New IPOs
          </Text>
        </View>
        <View style={[styles.headerRightActions, { zIndex: 2 }]}>
          <IconButton
            name="search"
            variant={showSearch || searchQuery.length > 0 ? 'primary' : 'surface'}
            size="md"
            onPress={() => {
              setShowSearch((prev) => !prev);
              if (showSearch) setSearchQuery('');
            }}
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

      {/* Search Input Bar */}
      {showSearch || searchQuery.length > 0 ? (
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchInputWrap,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search IPOs..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground }]}
              autoFocus={showSearch && !searchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

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
          onChange={(newTab) => setActiveTab(newTab as NewIpoTab)}
          style={{ paddingHorizontal: 16 }}
        />
      </View>

      {/* Main Catalog Feed List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Fetching live IPO catalog…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
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
        </View>
      ) : displayedIpos.length === 0 ? (
        <View style={styles.centerContainer}>
          <Feather name="inbox" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No IPOs Found
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            No matching IPO records in this view.
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedIpos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingTop: 4,
            paddingBottom: insets.bottom + 40,
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
  gmpSpotlightBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  gmpSpotlightLeft: {
    flex: 1,
  },
  gmpSpotlightLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gmpBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gmpBadgeText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  gmpFreshnessText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  statusPillText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  metricsGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
  },
  metricGridCol: {
    flex: 1,
  },
  metricGridLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginBottom: 3,
  },
  metricGridVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  filterModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  sortOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sortOptionText: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
  },
  modalFooterResetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalFooterApplyBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
