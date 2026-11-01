import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDB, type ApplicationStatus, type ApplicationWithDetails } from '@/context/DBContext';
import { useAppExperience } from '@/context/AppExperienceContext';

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ApplicationCard } from '@/components/ApplicationCard';
import { FilterSheet } from '@/components/FilterSheet';
import { ApplicationsSkeleton } from '@/components/applications/ApplicationsSkeleton';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import { ApplicationsOverviewCard } from '@/components/ApplicationsOverviewCard';


type TabKey = 'Applied' | 'Allotted' | 'Holding' | 'Sold' | 'Not Allotted';

const TABS: { key: TabKey; label: string; flex: number }[] = [
  { key: 'Applied',      label: 'Applied',      flex: 1.0 },
  { key: 'Allotted',     label: 'Allotted',     flex: 1.1 },
  { key: 'Holding',      label: 'Holding',      flex: 1.0 },
  { key: 'Sold',         label: 'Sold',         flex: 0.75 },
  { key: 'Not Allotted', label: 'Not Allotted', flex: 1.45 },
];

function isAppliedStatus(st: string) {
  return st === 'Applied' || st === 'Mandate Approved';
}

function isAllottedStatus(st: string) {
  return st === 'Allotted' || st === 'Partially Allotted' || st === 'Holding' || st === 'Sold';
}

function ApplicationsScreenContent() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const { applications, updateBulkApplications, isLoading, refresh, toggleFavorite, updateApplication } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const hasApplied = applications.some((a) => isAppliedStatus(a.status));
    return hasApplied ? 'Applied' : 'Allotted';
  });
  const hasUserSelectedTabRef = useRef(false);

  // Automatically select Applied if any applications exist in Applied, otherwise Allotted
  useEffect(() => {
    if (!isLoading && !hasUserSelectedTabRef.current) {
      const hasApplied = applications.some((a) => isAppliedStatus(a.status));
      const targetDefault: TabKey = hasApplied ? 'Applied' : 'Allotted';
      setActiveTab((prev) => (hasUserSelectedTabRef.current ? prev : targetDefault));
    }
  }, [isLoading, applications]);
  const [selectedApp, setSelectedApp] = useState<ApplicationWithDetails | null>(null);
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterBrokers, setFilterBrokers] = useState<string[]>([]);
  const [filterBankNames, setFilterBankNames] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  // Sort order for applications (newest first by default)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

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
      Keyboard.dismiss();
      searchRef.current?.blur();
      Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
      Animated.timing(searchAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
      setTimeout(() => {
        searchRef.current?.focus();
      }, 80);
    }
  };

  const searchBarHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 54],
  });
  const searchBarOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const hasFilter =
    filterUserIds.length > 0 ||
    filterBrokers.length > 0 ||
    filterIpoNames.length > 0 ||
    filterBankNames.length > 0 ||
    Boolean(filterYear);

  const clearFilters = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setFilterUserIds([]);
    setFilterBrokers([]);
    setFilterIpoNames([]);
    setFilterBankNames([]);
    setFilterYear(null);
  };

  const effectiveApplications = applications;

  // Base filtered list of applications
  const filterBase = useMemo(() => {
    return effectiveApplications.filter((a) => {
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
  }, [effectiveApplications, filterUserIds, filterBrokers, filterBankNames, filterIpoNames, filterYear]);

  const searchFiltered = useMemo(() => {
    if (!searchQuery) return filterBase;
    const q = searchQuery.toLowerCase();
    return filterBase.filter((a) => {
      return (
        a.user_name.toLowerCase().includes(q) ||
        (a.user_broker ?? '').toLowerCase().includes(q) ||
        (a.user_bank_name ?? '').toLowerCase().includes(q) ||
        (a.ipo_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [filterBase, searchQuery]);

  const getAppTimestamp = useCallback((a: ApplicationWithDetails) => {
    if (a.created_at) {
      const t = new Date(a.created_at).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if ((a as any).sale_date) {
      const t = new Date((a as any).sale_date).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (a.open_date) {
      const t = new Date(a.open_date).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    return 0;
  }, []);

  const filtered = useMemo(() => {
    const tabFiltered = activeTab === 'Applied'
      ? searchFiltered.filter((a) => isAppliedStatus(a.status))
      : activeTab === 'Allotted'
      ? searchFiltered.filter((a) => isAllottedStatus(a.status))
      : searchFiltered.filter((a) => a.status === activeTab);

    return [...tabFiltered].sort((a, b) => {
      const tsA = getAppTimestamp(a);
      const tsB = getAppTimestamp(b);
      if (tsA !== tsB) {
        return sortOrder === 'newest' ? tsB - tsA : tsA - tsB;
      }
      return sortOrder === 'newest'
        ? (b.id || '').localeCompare(a.id || '')
        : (a.id || '').localeCompare(b.id || '');
    });
  }, [activeTab, searchFiltered, sortOrder, getAppTimestamp]);

  // Single-pass count calculation across all 5 tabs
  const tabCounts = useMemo(() => {
    let applied = 0;
    let allotted = 0;
    let holding = 0;
    let sold = 0;
    let notAllotted = 0;

    for (let i = 0; i < searchFiltered.length; i++) {
      const st = searchFiltered[i].status;
      if (isAppliedStatus(st)) applied++;
      if (isAllottedStatus(st)) allotted++;
      if (st === 'Holding') holding++;
      if (st === 'Sold') sold++;
      if (st === 'Not Allotted') notAllotted++;
    }

    return {
      'Applied': applied,
      'Allotted': allotted,
      'Holding': holding,
      'Sold': sold,
      'Not Allotted': notAllotted,
    };
  }, [searchFiltered]);

  const filterUserNames = filterUserIds
    .map((uid) => applications.find((a) => a.user_id === uid)?.user_name)
    .filter(Boolean) as string[];
  const filterChipLabel = [
    ...filterUserNames,
    ...filterBrokers,
    ...filterBankNames,
    ...filterIpoNames,
    ...(filterYear ? [`Year: ${filterYear}`] : []),
  ].join(' · ');

  // Selection Mode Helpers
  const toggleSelectApp = useCallback((id: string) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setSelectedAppIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const keyExtractor = useCallback((item: ApplicationWithDetails) => item.id.toString(), []);

  const renderItem = useCallback(
    ({ item }: { item: ApplicationWithDetails }) => (
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
        onToggleFavorite={toggleFavorite}
        onUpdateStatus={updateApplication}
      />
    ),
    [isSelectionMode, toggleSelectApp, activeTab, selectedAppIds, toggleFavorite, updateApplication]
  );

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
    hasUserSelectedTabRef.current = true;
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
          <Icon name="search" size={16} color={colors.mutedForeground} />
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
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
              <Icon name="x-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Main Content Area */}
      {isLoading && applications.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 90,
            paddingTop: 8,
          }}
          showsVerticalScrollIndicator={false}
        >
          <ApplicationsSkeleton />
        </ScrollView>
      ) : (
        /* SectionList with Sticky Tab Pills Header */
        <SectionList
          style={{ flex: 1 }}
          sections={[{ title: 'Applications', data: filtered }]}
          keyExtractor={keyExtractor}
          stickySectionHeadersEnabled={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor={colors.primary}
            progressViewOffset={showSearch ? 52 : 0}
          />
        }
        ListHeaderComponent={() => (
          <View>
            {/* Active filter chip */}
            {hasFilter && (
              <View style={[styles.filterBar, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
                <Icon name="filter" size={12} color={colors.primary} />
                <Text style={[styles.filterBarText, { color: colors.primary }]}>
                  {filterChipLabel}
                </Text>
                <TouchableOpacity
                  onPress={clearFilters}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.7}
                >
                  <Icon name="x" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Applications Overview Card */}
            <ApplicationsOverviewCard applications={searchFiltered} />
          </View>
        )}
        renderSectionHeader={() => (
          <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
            {/* Full width row: sort btn → divider → 5 tab pills */}
            <View style={styles.tabBarRow}>
              {/* Icon-only Sort button — always visible */}
              <TouchableOpacity
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'));
                }}
                style={[
                  styles.sortByBtn,
                  { backgroundColor: isDark ? colors.surfaceElevated : '#FFFFFF', borderColor: colors.border },
                ]}
                hitSlop={8}
                activeOpacity={0.75}
              >
                <Icon name="align-left" size={13} color={colors.foreground} />
              </TouchableOpacity>

              {/* Vertical divider */}
              <View style={[styles.tabDivider, { backgroundColor: colors.border }]} />

              {/* 5 Tab pills enclosed in sleek 36px pill track container filling full width */}
              <View
                style={[
                  styles.tabPillsTrack,
                  {
                    backgroundColor: isDark ? colors.surfaceElevated : '#ECEEF1',
                    borderColor: colors.border,
                  },
                ]}
              >
                {TABS.map((t) => {
                  const isActive = activeTab === t.key;
                  const count = tabCounts[t.key];
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => handleTabChange(t.key)}
                      style={[
                        styles.tabPill,
                        { flex: t.flex },
                        isActive && styles.tabPillActive,
                        {
                          backgroundColor: isActive
                            ? colors.pillActiveBg
                            : 'transparent',
                        },
                      ]}
                    >
                      <View style={styles.tabContentRow}>
                        <Text
                          style={[
                            styles.tabPillText,
                            {
                              color: isActive
                                ? colors.pillActiveText
                                : colors.mutedForeground,
                            },
                            isActive ? styles.fontBold : styles.fontSemiBold,
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                        >
                          {t.label}
                        </Text>
                        {isActive && count != null ? (
                          <View
                            style={[
                              styles.countBadgePill,
                              {
                                backgroundColor: '#EF4444',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.countTextPill,
                                {
                                  color: '#FFFFFF',
                                },
                              ]}
                            >
                              {count}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Count + sort-order row */}
            <View style={styles.listHeader}>
              <Text style={[styles.listCount, { color: colors.mutedForeground }]}>
                {filtered.length} {filtered.length === 1 ? 'application' : 'applications'}
              </Text>
              <Text style={[styles.sortOrderLabel, { color: colors.mutedForeground }]}>
                {sortOrder === 'newest' ? '↓ Newest first' : '↑ Oldest first'}
              </Text>
            </View>
          </View>
        )}
        renderItem={renderItem}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Icon
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
      )}

      {/* Floating Action Bar (White Surface, Topmost Layer Above Menu) */}
      {isSelectionMode && (
        <View
          style={[
            styles.floatingBulkContainer,
            {
              backgroundColor: colors.card,
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
              <Icon name="clock" size={13} color="#FFFFFF" />
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
              <Icon name="check" size={13} color="#FFFFFF" />
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
              <Icon name="x" size={13} color="#FFFFFF" />
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
              <Icon name="slash" size={13} color="#FFFFFF" />
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
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
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: '100%',
  },
  sortByBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    borderRadius: 9999,
    borderWidth: 1,
  },
  tabDivider: {
    width: 1,
    height: 22,
    marginRight: 9,
    borderRadius: 1,
  },
  tabPillsTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    minHeight: 36,
    maxHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    padding: 2.5,
    gap: 1.5,
    overflow: 'hidden',
  },
  tabPill: {
    height: 30,
    minHeight: 30,
    maxHeight: 30,
    paddingHorizontal: 2,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabPillActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  tabPillText: {
    fontSize: 10.5,
    letterSpacing: 0,
    textAlign: 'center',
  },
  tabContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
  },
  countBadgePill: {
    minWidth: 15,
    height: 15,
    paddingHorizontal: 2.5,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countTextPill: {
    fontSize: 8.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 11,
  },
  fontBold: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  fontSemiBold: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 33,
  },
  listCount: { fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium' },
  sortOrderLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
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
    borderRadius: 9999,
  },
  bulk4BtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});

export default function ApplicationsScreen() {
  const { isNonPro, isLoading: isExperienceLoading } = useAppExperience();
  const router = useRouter();

  useEffect(() => {
    if (!isExperienceLoading && isNonPro) {
      if (typeof (router as any).navigate === 'function') {
        (router as any).navigate('/(tabs)/ipos');
      } else {
        router.replace('/(tabs)/ipos');
      }
    }
  }, [isNonPro, isExperienceLoading, router]);

  if (isNonPro) {
    return null;
  }

  return <ApplicationsScreenContent />;
}
