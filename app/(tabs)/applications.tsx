import React, { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { IconButton } from '@/components/ui/IconButton';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { ApplicationCard } from '@/components/ApplicationCard';
import { FilterSheet } from '@/components/FilterSheet';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import { KPICard } from '@/components/KPICard';
import { FeatureFlags } from '@/constants/FeatureFlags';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

type TabKey = 'Applied' | 'Allotted' | 'Sold' | 'Holding' | 'Not Allotted';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'Applied',      label: 'Applied' },
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
  const { applications, isLoading, refresh } = useDB();
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
    st === 'Mandate Approved';

  const filtered = activeTab === 'Applied'
    ? searchFiltered.filter((a) => isAppliedStatus(a.status))
    : searchFiltered.filter((a) => a.status === activeTab);

  const countFor = (key: TabKey) => {
    if (key === 'Applied') return searchFiltered.filter((a) => isAppliedStatus(a.status)).length;
    return searchFiltered.filter((a) => a.status === key).length;
  };

  const filterUserNames = filterUserIds
    .map((uid) => applications.find((a) => a.user_id === uid)?.user_name)
    .filter(Boolean) as string[];
  const filterChipLabel = [...filterUserNames, ...filterBrokers, ...filterBankNames, ...filterIpoNames].join(' · ');

  // ── KPI calculations ───────────────────────────────────────────────────────
  const appliedCount = searchFiltered.length;
  const allottedCount = searchFiltered.filter((a) => a.status === 'Allotted' || a.status === 'Holding' || a.status === 'Sold').length;

  const ipoProfitMap: Record<string, number> = {};
  const userProfitMap: Record<string, number> = {};
  for (const a of searchFiltered) {
    if (a.status !== 'Sold') continue;
    const bv = calcBuyValue(a.buy_price, a.quantity);
    const sv = calcSaleValue(a.sell_price ?? 0, a.quantity);
    const net = calcNetProfit(calcProfitLoss(sv, bv), a.tax ?? 0, a.user_cut ?? 0);
    ipoProfitMap[a.ipo_name] = (ipoProfitMap[a.ipo_name] ?? 0) + net;
    userProfitMap[a.user_name] = (userProfitMap[a.user_name] ?? 0) + net;
  }

  let bestIpoName = '—';
  let maxIpoProfit = -Infinity;
  for (const [name, profit] of Object.entries(ipoProfitMap)) {
    if (profit > maxIpoProfit && profit > 0) {
      maxIpoProfit = profit;
      bestIpoName = name;
    }
  }

  let bestUserName = '—';
  let maxUserProfit = -Infinity;
  for (const [name, profit] of Object.entries(userProfitMap)) {
    if (profit > maxUserProfit && profit > 0) {
      maxUserProfit = profit;
      bestUserName = name;
    }
  }

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
            borderBottomColor: colors.border,
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

      {/* KPI Cards Grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiRow}>
          <KPICard
            label="Applied"
            value={String(appliedCount)}
            subtitle="total applications"
          />
          <KPICard
            label="Allotted"
            value={String(allottedCount)}
            subtitle="allotted or sold"
          />
        </View>
        <View style={styles.kpiRow}>
          <KPICard
            label="Best IPO"
            value={bestIpoName}
            subtitle={maxIpoProfit > 0 ? `+${formatCurrency(maxIpoProfit, false)}` : 'no profit yet'}
            isPositive={maxIpoProfit > 0}
          />
          <KPICard
            label="Top User"
            value={bestUserName}
            subtitle={maxUserProfit > 0 ? `+${formatCurrency(maxUserProfit, false)}` : 'no profit yet'}
            isPositive={maxUserProfit > 0}
          />
        </View>
      </View>

      {/* Check Allotment Button */}
      {FeatureFlags.ENABLE_AUTO_ALLOTMENT && (
        <TouchableOpacity
          onPress={() => router.push('/allotment-checker')}
          style={[styles.checkAllotmentBtn, { borderColor: colors.primary }]}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.checkAllotmentBtnText}>🔍 Check Allotment</Text>
        </TouchableOpacity>
      )}

      {/* Tab pills */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <FlatList
          data={TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(t) => t.key}
          contentContainerStyle={styles.tabScroll}
          renderItem={({ item: tab }) => {
            const active = activeTab === tab.key;
            const count = countFor(tab.key);
            return (
              <TouchableOpacity
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tab,
                  active
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.tabLabel, { color: active ? '#fff' : colors.mutedForeground }]}>
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor: active
                          ? (isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.25)')
                          : (isDark ? 'rgba(255,255,255,0.08)' : (colors.borderStrong || '#D1D5DB')),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        {
                          color: active
                            ? (isDark ? '#14120F' : '#FFFFFF')
                            : (isDark ? colors.mutedForeground : colors.secondaryForeground),
                        },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <ApplicationCard application={item} onPress={() => setSelectedApp(item)} />
        )}
        ListHeaderComponent={() => (
          <View style={styles.listHeader}>
            <Text style={[styles.listCount, { color: colors.mutedForeground }]}>
              {filtered.length} {filtered.length === 1 ? 'application' : 'applications'}
            </Text>
          </View>
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingTop: 8 }}
      />

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
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 30, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.8, lineHeight: 34 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    borderBottomWidth: 1,
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
  tabBar: { borderBottomWidth: 1 },
  tabScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  tabLabel: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },
  tabBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, minWidth: 20, alignItems: 'center' },
  tabBadgeText: { fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold' },
  listHeader: { paddingHorizontal: 16, paddingVertical: 6 },
  listCount: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular' },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 22 },
  kpiGrid: { paddingHorizontal: 16, paddingTop: 18, gap: 10, marginBottom: 6 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  checkAllotmentBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 14,
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  checkAllotmentBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.1,
  },
});
