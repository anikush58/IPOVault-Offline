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
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';

type NewIpoTab = 'live' | 'upcoming' | 'listed';
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
  const [showSortModal, setShowSortModal] = useState(false);

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

  const listedList = useMemo(() => {
    return filteredRawIpos.filter((item) => item.status === 'LISTED' || item.status === 'CLOSED');
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
  }, [activeTab, liveList, upcomingList, listedList, sortBy]);

  const sortLabel = useMemo(() => {
    switch (sortBy) {
      case 'GMP': return 'GMP';
      case 'DATE': return 'Apply Date';
      case 'MIN_INVEST': return 'Min Investment';
      case 'NAME': return 'Name';
      default: return 'Default';
    }
  }, [sortBy]);

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
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {/* Header Row: Logo on left, Market Segment (Mainboard/SME) on top right */}
        <View style={styles.cardHeaderRow}>
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

          <Text style={[styles.segmentLabelText, { color: colors.mutedForeground }]}>
            {item.marketSegment === 'SME' ? 'SME' : 'Mainboard'}
          </Text>
        </View>

        {/* Company Title */}
        <Text style={[styles.companyTitle, { color: colors.foreground }]} numberOfLines={2}>
          {companyName}
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
              {minInvestment ? `₹ ${minInvestment.toLocaleString('en-IN')}` : '—'}
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
              {item.lotSize ?? '—'}
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
        />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary, textAlign: 'center' }]}>
            IPOVAULT CLOUD
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: 'center' }]}>
            New IPOs
          </Text>
        </View>
        <View style={styles.headerRightActions}>
          <IconButton
            name="search"
            variant={showSearch || searchQuery.length > 0 ? 'primary' : 'surface'}
            size="md"
            onPress={() => {
              setShowSearch((prev) => !prev);
              if (showSearch) setSearchQuery('');
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

      {/* Sub-Tab Bar: Live | Upcoming | Listed (Pills matching applications page) */}
      <View style={[styles.subTabBarWrap, { paddingVertical: 8 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: 'row' }}>
          {[
            { key: 'live' as const, label: `Live (${liveList.length})` },
            { key: 'upcoming' as const, label: `Upcoming (${upcomingList.length})` },
            { key: 'listed' as const, label: `Listed (${listedList.length})` },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => {
                  setActiveTab(tab.key);
                  try { Haptics.selectionAsync(); } catch {}
                }}
                style={{
                  height: 36,
                  paddingHorizontal: 16,
                  borderRadius: 9999,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive ? (isDark ? '#F8FAFC' : '#0B132B') : (isDark ? '#1E293B' : '#FFFFFF'),
                  borderColor: isActive ? (isDark ? '#F8FAFC' : '#0B132B') : (isDark ? '#334155' : '#E2E8F0'),
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontFamily: 'GoogleSansFlex_700Bold',
                    color: isActive ? (isDark ? '#0B132B' : '#FFFFFF') : (isDark ? '#F8FAFC' : '#0B132B'),
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* SME Toggle Switch & Sort Bar */}
      <View style={styles.toolbarRow}>
        <View style={styles.smeToggleWrap}>
          <Switch
            value={includeSme}
            onValueChange={(val) => {
              setIncludeSme(val);
              Haptics.selectionAsync();
            }}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={includeSme ? colors.primary : '#FFFFFF'}
          />
          <Text style={[styles.smeToggleText, { color: colors.foreground }]}>
            SME IPOs
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setShowSortModal(true);
          }}
          style={[styles.sortDropdownBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.sortBtnText, { color: colors.foreground }]}>
            Sort {sortLabel !== 'Default' ? `: ${sortLabel}` : ''}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
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

      {/* Sort Menu Modal */}
      <Modal visible={showSortModal} transparent animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortModal(false)}>
          <View style={[styles.sortModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Sort IPOs</Text>
              <TouchableOpacity onPress={() => setShowSortModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {[
              { key: 'DEFAULT', label: 'Default' },
              { key: 'GMP', label: 'GMP: Highest First' },
              { key: 'DATE', label: 'Apply Date: Opening Soon' },
              { key: 'MIN_INVEST', label: 'Min Investment: Low to High' },
              { key: 'NAME', label: 'Alphabetical: A-Z' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => {
                  setSortBy(opt.key as SortOption);
                  setShowSortModal(false);
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.sortOptionRow,
                  { borderBottomColor: colors.border },
                  sortBy === opt.key && { backgroundColor: colors.surface },
                ]}
              >
                <Text style={[styles.sortOptionText, { color: sortBy === opt.key ? colors.primary : colors.foreground }]}>
                  {opt.label}
                </Text>
                {sortBy === opt.key ? <Feather name="check" size={16} color={colors.primary} /> : null}
              </TouchableOpacity>
            ))}
          </View>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
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
  segmentLabelText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sortModalCard: {
    width: '100%',
    maxWidth: 340,
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sortOptionText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
});
