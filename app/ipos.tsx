import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { IconButton } from '@/components/ui/IconButton';
import { IPOCard } from '@/components/ipo/IPOCard';
import { IPOSearchBar } from '@/components/ipo/IPOSearchBar';
import { IPOFilterSheet, FilterState } from '@/components/ipo/IPOFilterSheet';
import { IPOEmptyState } from '@/components/ipo/IPOEmptyState';
import { IPOSkeletonList } from '@/components/ipo/IPOSkeleton';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';

import { FloatingCompareBar } from '@/components/compare/FloatingCompareBar';
import { ManualAddIPOFlowModal } from '@/components/ipo/ManualAddIPOFlowModal';
import { IPOOverviewTab } from '@/components/ipo/IPOOverviewTab';
import { IPORadarTab } from '@/components/ipo/IPORadarTab';
import { IPODiscoverTab } from '@/components/ipo/IPODiscoverTab';
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';
import { triggerCentralizedIPOSync, LAST_SYNCED_AT_KEY } from '@/services/ipo/centralizedSync';
import { syncStore } from '@/services/sync/syncStatus';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';

type PrimarySegment = 'ipos' | 'insights' | 'explore';
type HubTab = 'all' | 'open' | 'upcoming' | 'closed' | 'listed' | 'favorites';

function formatLastSynced(timestamp: string | null): string {
  if (!timestamp) return 'Offline · Using local database';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Last synced just now';
  if (diffMins < 60) return `Last synced ${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Last synced ${diffHours}h ago`;
  const d = new Date(timestamp);
  return `Last synced ${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const TABS: { key: HubTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'open',      label: 'Open' },
  { key: 'upcoming',  label: 'Upcoming' },
  { key: 'closed',    label: 'Closed' },
  { key: 'listed',    label: 'Listed' },
  { key: 'favorites', label: 'Favorites' },
];

const DEFAULT_FILTERS: FilterState = {
  issueTypes: [],
  exchanges: [],
  sectors: [],
  registrars: [],
  onlyFavorites: false,
};

export default function IPOHubScreen() {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const repo = useMemo(() => new IPORepository(db), [db]);

  // Sync Store & Timestamp State
  const [syncStatus, setSyncStatus] = useState(syncStore.getStatus());
  const [lastSyncedTimeStr, setLastSyncedTimeStr] = useState<string | null>(null);

  // Primary Segmented Switcher (IPOs vs Insights vs Explore)
  const [segment, setSegment] = useState<PrimarySegment>('ipos');

  // Discover Sub-Tab State
  const [activeTab, setActiveTab] = useState<HubTab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Raw dataset fetched from repository
  const [records, setRecords] = useState<IPOMasterRecord[]>([]);

  // Search & Filter UI state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showManualAddFlow, setShowManualAddFlow] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Unique metadata for Filter Sheet options
  const [availableSectors, setAvailableSectors] = useState<string[]>([]);
  const [availableRegistrars, setAvailableRegistrars] = useState<string[]>([]);

  // Debounce search query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      if (searchQuery.trim() && !recentSearches.includes(searchQuery.trim())) {
        setRecentSearches((prev) => [searchQuery.trim(), ...prev.filter((s) => s !== searchQuery.trim())].slice(0, 5));
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch records from repository based on active tab or search
  const loadData = useCallback(async () => {
    try {
      let list: IPOMasterRecord[] = [];
      if (debouncedQuery.trim()) {
        list = await repo.search(debouncedQuery.trim());
      } else {
        switch (activeTab) {
          case 'all': {
            const [up, op, cl, li] = await Promise.all([
              repo.getUpcoming(),
              repo.getOpen(),
              repo.getClosed(),
              repo.getListed(),
            ]);
            const map = new Map<string, IPOMasterRecord>();
            [...op, ...up, ...cl, ...li].forEach((r) => map.set(r.id, r));
            list = Array.from(map.values());
            break;
          }
          case 'upcoming':
            list = await repo.getUpcoming();
            break;
          case 'open':
            list = await repo.getOpen();
            break;
          case 'closed':
            list = await repo.getClosed();
            break;
          case 'listed':
            list = await repo.getListed();
            break;
          case 'favorites': {
            const [up, op, cl, li] = await Promise.all([
              repo.getUpcoming(),
              repo.getOpen(),
              repo.getClosed(),
              repo.getListed(),
            ]);
            const map = new Map<string, IPOMasterRecord>();
            [...up, ...op, ...cl, ...li].forEach((r) => {
              if (r.is_favorite === 1) map.set(r.id, r);
            });
            list = Array.from(map.values());
            break;
          }
        }
      }
      setRecords(list);

      const sectors = Array.from(new Set(list.map((r) => r.sector).filter(Boolean))).sort();
      const registrars = Array.from(new Set(list.map((r) => r.registrar).filter(Boolean))).sort();
      setAvailableSectors(sectors);
      setAvailableRegistrars(registrars);
    } catch (err) {
      if (__DEV__) console.warn('[IPOHubScreen] Failed to load records', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, activeTab, debouncedQuery]);

  useEffect(() => {
    loadData();
    const unsub = syncStore.subscribe((status) => {
      setSyncStatus(status);
      if (status.state === 'Idle' && status.lastSyncTimestamp) {
        safeAsyncStorage.getItem(LAST_SYNCED_AT_KEY).then(setLastSyncedTimeStr);
        loadData();
      }
    });
    safeAsyncStorage.getItem(LAST_SYNCED_AT_KEY).then(setLastSyncedTimeStr);
    return unsub;
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerCentralizedIPOSync(db, { source: 'Pull to Refresh' });
    await loadData();
    const latestTime = await safeAsyncStorage.getItem(LAST_SYNCED_AT_KEY);
    setLastSyncedTimeStr(latestTime);
    setRefreshing(false);
  }, [db, loadData]);

  const handleToggleFavorite = useCallback(
    async (id: string, isFav: boolean) => {
      await repo.toggleFavorite(id, isFav);
      setRecords((prev) =>
        prev.map((item) => (item.id === id ? { ...item, is_favorite: isFav ? 1 : 0 } : item))
      );
    },
    [repo]
  );

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filters.onlyFavorites && r.is_favorite !== 1) return false;
      if (filters.issueTypes.length > 0 && !filters.issueTypes.includes(r.issue_type)) return false;
      if (filters.exchanges.length > 0 && !filters.exchanges.includes(r.exchange)) return false;
      if (filters.sectors.length > 0 && !filters.sectors.includes(r.sector)) return false;
      if (filters.registrars.length > 0 && !filters.registrars.includes(r.registrar)) return false;
      return true;
    });
  }, [records, filters]);

  const handleCardPress = useCallback(
    (ipoOrId: IPOMasterRecord | string) => {
      Haptics.selectionAsync();
      const targetId = typeof ipoOrId === 'string' ? ipoOrId : ipoOrId?.id;
      if (!targetId || targetId === 'undefined') return;
      router.push({
        pathname: '/ipo-details',
        params: { id: targetId },
      });
    },
    [router]
  );

  // Swipe gesture for smooth tab navigation in Discover mode
  const tabKeys: HubTab[] = ['upcoming', 'open', 'closed', 'listed', 'favorites'];
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => {
      if (segment !== 'explore') return;
      const idx = tabKeys.indexOf(activeTab);
      if (idx < tabKeys.length - 1) {
        setActiveTab(tabKeys[idx + 1]);
        Haptics.selectionAsync();
      }
    },
    onSwipeRight: () => {
      if (segment !== 'explore') return;
      const idx = tabKeys.indexOf(activeTab);
      if (idx > 0) {
        setActiveTab(tabKeys[idx - 1]);
        Haptics.selectionAsync();
      }
    },
  });

  const activeFilterCount =
    filters.issueTypes.length +
    filters.exchanges.length +
    filters.sectors.length +
    filters.registrars.length +
    (filters.onlyFavorites ? 1 : 0);

  const renderItem = useCallback(
    ({ item }: { item: IPOMasterRecord }) => (
      <IPOCard ipo={item} onPress={handleCardPress} onToggleFavorite={handleToggleFavorite} />
    ),
    [handleCardPress, handleToggleFavorite]
  );

  const keyExtractor = useCallback((item: IPOMasterRecord) => item.id, []);

  const emptyType = useMemo(() => {
    if (debouncedQuery.trim() || activeFilterCount > 0) return 'search';
    if (filters.onlyFavorites || activeTab === 'favorites') return 'favorites';
    if (activeTab === 'upcoming') return 'upcoming';
    if (activeTab === 'open') return 'open';
    return 'empty';
  }, [debouncedQuery, activeFilterCount, filters.onlyFavorites, activeTab]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...swipeHandlers}>
      {/* Top Header App Bar */}
      <View
        style={[
          styles.topBar,
          { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background },
        ]}
      >
        <View style={styles.titleWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -2, flexWrap: 'wrap' }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>IPO MARKET</Text>
            {syncStatus.state === 'Offline' || syncStatus.state === 'Error' ? (
              <View style={[styles.statusPill, { backgroundColor: '#EF44441A', borderColor: '#EF444444' }]}>
                <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.statusPillText, { color: '#EF4444' }]}>Offline</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: 'GoogleSansFlex_500Medium' }}>
                • {formatLastSynced(lastSyncedTimeStr || syncStatus.lastSyncTimestamp)}
              </Text>
            )}
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPO Hub</Text>
        </View>

        <View style={styles.actionsRight}>
          <IconButton
            name="search"
            variant={showSearch ? 'primary' : 'surface'}
            size="md"
            onPress={() => {
              setShowSearch((prev) => !prev);
              if (showSearch) setSearchQuery('');
            }}
          />

          <IconButton
            name="bookmark"
            variant="surface"
            size="md"
            onPress={() => {
              router.push('/watchlist' as any);
            }}
          />

          <IconButton
            name="plus"
            variant="surface"
            size="md"
            onPress={() => {
              router.push('/add-ipo-manual' as any);
            }}
          />
        </View>
      </View>

      {/* Top Segmented Control (IPOs | Insights | Explore) */}
      <View style={[styles.segmentedWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <SegmentedTabControl
          variant="primary"
          tabs={[
            { key: 'ipos', label: 'IPOs', icon: 'layers' },
            { key: 'insights', label: 'Insights', icon: 'star' },
            { key: 'explore', label: 'Explore', icon: 'compass' },
          ]}
          activeTab={segment}
          onChange={(newSeg) => setSegment(newSeg as PrimarySegment)}
        />
      </View>

      {/* Expandable Instant Search Bar */}
      {showSearch ? (
        <View style={styles.searchBarWrap}>
          <IPOSearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClear={() => setSearchQuery('')}
            recentSearches={recentSearches}
            onSelectRecent={(query) => setSearchQuery(query)}
          />
        </View>
      ) : null}

      {/* Content Rendering Based On Primary Segment */}
      {segment === 'ipos' ? (
        <IPOOverviewTab
          repo={repo}
          ipos={records}
          onSelectIPO={handleCardPress}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      ) : segment === 'insights' ? (
        <IPORadarTab
          repo={repo}
          ipos={records}
          onSelectIPO={handleCardPress}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      ) : (
        <IPODiscoverTab
          repo={repo}
          allRecords={records}
          loading={loading}
          onSelectIPO={handleCardPress}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onFilterPress={() => setShowFilterSheet(true)}
        />
      )}

      {/* Manual Add IPO Search-Before-Create Modal */}
      <ManualAddIPOFlowModal
        visible={showManualAddFlow}
        onClose={() => setShowManualAddFlow(false)}
        onOpenCreateForm={(prefillCompanyName) => {
          router.push({
            pathname: '/add-ipo-manual' as any,
            params: { initialName: prefillCompanyName },
          });
        }}
      />

      {/* Filter Sheet */}
      <IPOFilterSheet
        visible={showFilterSheet}
        filters={filters}
        availableSectors={availableSectors}
        availableRegistrars={availableRegistrars}
        onApply={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
      />

      {/* Floating Compare Action Bar */}
      <FloatingCompareBar />

      {/* Floating Action Button (FAB) for Allotment Checker */}
      <TouchableOpacity
        onPress={() => {
          router.push('/allotment-checker' as any);
          Haptics.selectionAsync();
        }}
        style={[
          styles.allotmentFab,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
          },
        ]}
        activeOpacity={0.85}
      >
        <Feather name="check-circle" size={18} color="#FFFFFF" />
        <Text style={[styles.allotmentFabText, { color: '#FFFFFF' }]}>Allotment Checker</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  titleWrap: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segmentedWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
  },
  segmentedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentedBtnActive: {},
  segmentedText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  segmentedTextActive: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  searchBarWrap: {
    marginTop: 10,
  },
  allotmentFab: {
    position: 'absolute',
    bottom: 18,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 22,
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  allotmentFabText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
});
