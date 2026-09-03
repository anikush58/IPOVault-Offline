import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  FlatList,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDB, type ApplicationStatus, type ApplicationWithDetails } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { ApplicationCard } from '@/components/ApplicationCard';
import { FilterSheet } from '@/components/FilterSheet';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import { ApplicationsOverviewCard } from '@/components/ApplicationsOverviewCard';
import { Tabs } from '@/components/ui/Tabs';

type TabKey = 'Applied' | 'Allotted' | 'Sold' | 'Holding' | 'Not Allotted';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'Applied',      label: 'Active' },
  { key: 'Allotted',     label: 'Allotted' },
  { key: 'Sold',         label: 'Sold' },
  { key: 'Holding',      label: 'Holding' },
  { key: 'Not Allotted', label: 'Not Allotted' },
];

export default function ApplicationsScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const { applications, isLoading, refresh, updateBulkApplications } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<TabKey>('Applied');
  const [selectedApp, setSelectedApp] = useState<ApplicationWithDetails | null>(null);
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterBrokers, setFilterBrokers] = useState<string[]>([]);
  const [filterBankNames, setFilterBankNames] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  // Bulk Selection Mode State for Applied Tab
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Notify Tab Bar layout of active Applications tab name
  useEffect(() => {
    DeviceEventEmitter.emit('APPLICATIONS_TAB_CHANGED', activeTab);
  }, [activeTab]);

  // Notify Tab Bar layout of Selection Mode state changes for dynamic Check/Cross FAB button icon
  useEffect(() => {
    DeviceEventEmitter.emit('SELECTION_MODE_CHANGED', isSelectionMode);
  }, [isSelectionMode]);

  // Context-Aware Button Listener from Bottom Tab Bar
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('TOGGLE_BULK_MARK', () => {
      if (activeTab === 'Applied') {
        setIsSelectionMode((prev) => {
          if (prev) setSelectedAppIds([]);
          return !prev;
        });
      }
    });
    return () => sub.remove();
  }, [activeTab]);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
        searchRef.current?.focus(),
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

  const hasFilter = filterUserIds.length > 0 || filterBrokers.length > 0 || filterIpoNames.length > 0 || filterBankNames.length > 0;

  // Newest first sorting by open_date or ID
  const sortedApplications = [...applications].sort((a, b) => {
    const dateA = a.open_date ? new Date(a.open_date).getTime() : 0;
    const dateB = b.open_date ? new Date(b.open_date).getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;
    return (b.id || "").localeCompare(a.id || "");
  });

  const filterBase = sortedApplications.filter((a) => {
    if (filterUserIds.length > 0 && !filterUserIds.includes(a.user_id)) return false;
    if (filterBrokers.length > 0 && !filterBrokers.includes(a.user_broker ?? '')) return false;
    if (filterBankNames.length > 0) {
      const appBank = (a.user_bank_name || (a as any).bank_name || '').trim();
      if (!appBank || !filterBankNames.some((b) => b.trim().toLowerCase() === appBank.toLowerCase())) return false;
    }
    if (filterIpoNames.length > 0 && !filterIpoNames.includes(a.ipo_name ?? '')) return false;
    if (filterYear) {
      const y = a.open_date ? a.open_date.slice(0, 4) : '';
      if (y !== filterYear) return false;
    }
    return true;
  });

  const searchFiltered = filterBase.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.user_name.toLowerCase().includes(q) ||
      (a.user_broker ?? '').toLowerCase().includes(q) ||
      (a.user_bank_name ?? '').toLowerCase().includes(q) ||
      (a.ipo_name ?? '').toLowerCase().includes(q)
    );
  });

  const isAppliedStatus = (st: string) =>
    st === 'Applied' || st === 'Mandate Approved';

  const isAllottedStatus = (st: string) =>
    st === 'Allotted' || st === 'Partially Allotted' || st === 'Holding' || st === 'Sold';

  const filtered = activeTab === 'Applied'
    ? searchFiltered.filter((a) => isAppliedStatus(a.status))
    : activeTab === 'Allotted'
    ? searchFiltered.filter((a) => isAllottedStatus(a.status))
    : searchFiltered.filter((a) => a.status === activeTab);

  const countFor = (key: TabKey) => {
    if (key === 'Applied') return searchFiltered.filter((a) => isAppliedStatus(a.status)).length;
    if (key === 'Allotted') return searchFiltered.filter((a) => isAllottedStatus(a.status)).length;
    return searchFiltered.filter((a) => a.status === key).length;
  };

  const filterUserNames = filterUserIds
    .map((uid) => applications.find((a) => a.user_id === uid)?.user_name)
    .filter(Boolean) as string[];
  const filterChipLabel = [...filterUserNames, ...filterBrokers, ...filterBankNames, ...filterIpoNames].join(' · ');

  // Selection Mode Helpers
  const toggleSelectApp = (id: string) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setSelectedAppIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedAppIds.length === filtered.length) {
      setSelectedAppIds([]);
    } else {
      setSelectedAppIds(filtered.map((a) => a.id));
    }
  };

  const handleBulkStatusUpdate = async (status: ApplicationStatus) => {
    if (selectedAppIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      if (status === 'Allotted') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      await updateBulkApplications(selectedAppIds, status);
      setSelectedAppIds([]);
      setIsSelectionMode(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key as TabKey);
    setIsSelectionMode(false);
    setSelectedAppIds([]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>IPO</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Applications</Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton
            name={showSearch ? 'x' : 'search'}
            variant={showSearch ? 'primary' : 'surface'}
            size="md"
            onPress={toggleSearch}
          />
          <IconButton
            name="star"
            variant="surface"
            size="md"
            onPress={() => router.push('/favorite-applications')}
          />
          <IconButton
            name="sliders"
            variant={hasFilter ? 'primary' : 'surface'}
            size="md"
            onPress={() => setShowFilter(true)}
          />
        </View>
      </View>

      {/* ── Collapsible search bar ── */}
      <Animated.View
        style={[
          styles.searchBar,
          {
            height: searchBarHeight,
            opacity: searchBarOpacity,
            backgroundColor: colors.background,
          },
        ]}
        pointerEvents={showSearch ? 'auto' : 'none'}
      >
        <View style={[styles.searchInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            ref={searchRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search users, brokers or IPOs…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* SectionList with Sticky Tab Pills Header */}
      <SectionList
        sections={[{ title: 'Applications', data: filtered }]}
        keyExtractor={(item) => item.id.toString()}
        stickySectionHeadersEnabled={true}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={() => (
          <View>
            {/* Active filter chip */}
            {hasFilter && (
              <View style={[styles.filterBar, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
                <Feather name="filter" size={12} color={colors.primary} />
                <Text style={[styles.filterBarText, { color: colors.primary }]}>
                  {filterChipLabel}
                </Text>
                <TouchableOpacity onPress={() => { setFilterUserIds([]); setFilterBrokers([]); setFilterIpoNames([]); setFilterBankNames([]); setFilterYear(null); }} hitSlop={8}>
                  <Feather name="x" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Applications Overview Card */}
            <ApplicationsOverviewCard applications={applications} />
          </View>
        )}
        renderSectionHeader={() => (
          <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
            <Tabs
              variant="pills"
              scrollable
              tabs={TABS.map((t) => ({
                key: t.key,
                label: t.label,
                count: countFor(t.key) > 0 ? countFor(t.key) : undefined,
              }))}
              activeTab={activeTab}
              onChange={handleTabChange}
              style={{ paddingVertical: 8 }}
            />
            <View style={styles.listHeader}>
              <Text style={[styles.listCount, { color: colors.mutedForeground }]}>
                {filtered.length} {filtered.length === 1 ? 'application' : 'applications'}
              </Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <ApplicationCard
            application={item}
            onPress={() => {
              if (isSelectionMode) {
                toggleSelectApp(item.id);
              } else {
                setSelectedApp(item);
              }
            }}
            isAppliedTab={activeTab === 'Applied'}
            isSelectionMode={isSelectionMode}
            isSelected={selectedAppIds.includes(item.id)}
            onSelectToggle={() => toggleSelectApp(item.id)}
          />
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather
                name="inbox"
                size={28}
                color={colors.mutedForeground}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Applications
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {activeTab === 'Applied'
                ? 'Create applications from the Actions tab.'
                : `No ${activeTab} applications yet.`}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + (isSelectionMode ? 170 : 90), paddingTop: 8 }}
      />

      {/* Floating Action Bar (White Surface, Topmost Layer Above Menu) */}
      {isSelectionMode && (
        <View
          style={[
            styles.floatingBulkContainer,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: colors.border,
              bottom: Platform.OS === 'web' ? 30 : Math.max(insets.bottom + 76, 92),
            },
          ]}
        >
          {/* Top Info Row */}
          <View style={styles.floatingBulkHeaderRow}>
            <View style={[styles.selectedBadgePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9' }]}>
              <View style={styles.selectedDot} />
              <Text style={[styles.selectedCountText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                {selectedAppIds.length} Selected
              </Text>
            </View>

            <TouchableOpacity onPress={handleSelectAll} hitSlop={8}>
              <Text style={[styles.deselectAllText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {selectedAppIds.length === filtered.length ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 4 Action Buttons Row */}
          <View style={styles.floating4ButtonsRow}>
            {/* 1. Mandate */}
            <TouchableOpacity
              onPress={() => handleBulkStatusUpdate('Mandate Approved')}
              disabled={bulkActionLoading || selectedAppIds.length === 0}
              style={[
                styles.bulk4Btn,
                { backgroundColor: '#1E40AF' },
                selectedAppIds.length === 0 && { opacity: 0.5 },
              ]}
            >
              <Feather name="clock" size={13} color="#FFFFFF" />
              <Text style={styles.bulk4BtnText}>Mandate</Text>
            </TouchableOpacity>

            {/* 2. Allotted */}
            <TouchableOpacity
              onPress={() => handleBulkStatusUpdate('Allotted')}
              disabled={bulkActionLoading || selectedAppIds.length === 0}
              style={[
                styles.bulk4Btn,
                { backgroundColor: '#16A34A' },
                selectedAppIds.length === 0 && { opacity: 0.5 },
              ]}
            >
              <Feather name="check" size={13} color="#FFFFFF" />
              <Text style={styles.bulk4BtnText}>Allotted</Text>
            </TouchableOpacity>

            {/* 3. Not Allotted */}
            <TouchableOpacity
              onPress={() => handleBulkStatusUpdate('Not Allotted')}
              disabled={bulkActionLoading || selectedAppIds.length === 0}
              style={[
                styles.bulk4Btn,
                { backgroundColor: '#DC2626' },
                selectedAppIds.length === 0 && { opacity: 0.5 },
              ]}
            >
              <Feather name="x" size={13} color="#FFFFFF" />
              <Text style={styles.bulk4BtnText}>Not Allotted</Text>
            </TouchableOpacity>

            {/* 4. Cancelled */}
            <TouchableOpacity
              onPress={() => handleBulkStatusUpdate('Cancelled')}
              disabled={bulkActionLoading || selectedAppIds.length === 0}
              style={[
                styles.bulk4Btn,
                { backgroundColor: '#475569' },
                selectedAppIds.length === 0 && { opacity: 0.5 },
              ]}
            >
              <Feather name="slash" size={13} color="#FFFFFF" />
              <Text style={styles.bulk4BtnText}>Cancelled</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <UpdateApplicationModal application={selectedApp} onClose={() => setSelectedApp(null)} />
      <FilterSheet
        visible={showFilter}
        filterUserIds={filterUserIds}
        filterBrokers={filterBrokers}
        filterYear={filterYear}
        filterIpoNames={filterIpoNames}
        filterBankNames={filterBankNames}
        onFilterChange={(uids, brokers, year, ipos, banks) => {
          setFilterUserIds(uids);
          setFilterBrokers(brokers);
          setFilterYear(year);
          setFilterIpoNames(ipos);
          setFilterBankNames(banks || []);
        }}
        onClose={() => setShowFilter(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  headerEyebrow: { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 30, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.8, lineHeight: 34 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBar: {
    borderBottomWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  filterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 10, marginBottom: 2,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1,
  },
  filterBarText: { flex: 1, fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },
  tabBar: { borderBottomWidth: 0 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 28,
  },
  listCount: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular' },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 22 },

  // ── Floating Action Bar ──
  floatingBulkContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 24,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
    zIndex: 9999,
  },
  floatingBulkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  selectedBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  selectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0EA5E9',
  },
  selectedCountText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  deselectAllText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  floating4ButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulk4Btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 14,
  },
  bulk4BtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
