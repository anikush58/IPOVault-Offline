import React, { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { IconButton } from '@/components/ui/IconButton';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { ApplicationCard } from '@/components/ApplicationCard';
import { FilterSheet } from '@/components/FilterSheet';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue, calculateAppTaxAndNet } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

type TabKey = 'All' | 'Applied' | 'Allotted' | 'Sold' | 'Holding' | 'Not Allotted';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'All',          label: 'All' },
  { key: 'Applied',      label: 'Applied' },
  { key: 'Allotted',     label: 'Allotted' },
  { key: 'Holding',      label: 'Holding' },
  { key: 'Sold',         label: 'Sold' },
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

  const [activeTab, setActiveTab] = useState<TabKey>('All');
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

  // Newest first sorting
  const sortedApplications = [...applications].sort((a, b) => {
    const dateA = a.open_date ? new Date(a.open_date).getTime() : 0;
    const dateB = b.open_date ? new Date(b.open_date).getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;
    return (b.id || "").localeCompare(a.id || "");
  });

  const filterBase = sortedApplications.filter((a) => {
    if (filterUserIds.length > 0 && !filterUserIds.includes(a.user_id)) return false;
    if (filterBrokers.length > 0 && !filterBrokers.includes(a.user_broker ?? '')) return false;
    if (filterBankNames.length > 0 && !filterBankNames.includes(a.user_bank_name ?? '')) return false;
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

  const filtered = activeTab === 'All'
    ? searchFiltered
    : activeTab === 'Applied'
    ? searchFiltered.filter((a) => a.status === 'Applied' || a.status === 'Mandate Approved')
    : searchFiltered.filter((a) => a.status === activeTab);

  const countFor = (key: TabKey) => {
    if (key === 'All') return searchFiltered.length;
    if (key === 'Applied') return searchFiltered.filter((a) => a.status === 'Applied' || a.status === 'Mandate Approved').length;
    return searchFiltered.filter((a) => a.status === key).length;
  };

  // Portfolio holdings total calculations
  let totalInvested = 0;
  let totalNetReturn = 0;

  for (const a of searchFiltered) {
    if (a.status === 'Sold' || a.status === 'Holding') {
      const { netPL } = calculateAppTaxAndNet(a);
      const buyVal = calcBuyValue(a.buy_price, a.quantity);
      totalInvested += buyVal;
      totalNetReturn += netPL;
    }
  }

  const overallPortfolioVal = totalInvested + totalNetReturn;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Action Header ── */}
      <View style={[styles.topActionHeader, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerIconCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleSerif, { color: colors.foreground }]}>Holdings & Portfolio</Text>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            onPress={toggleSearch}
            style={[styles.headerIconCircle, { backgroundColor: showSearch ? colors.primary + '20' : colors.surface, borderColor: showSearch ? colors.primary : colors.border }]}
            activeOpacity={0.8}
          >
            <Feather name={showSearch ? 'x' : 'search'} size={18} color={showSearch ? colors.primary : colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowFilter(true)}
            style={[styles.headerIconCircle, { backgroundColor: hasFilter ? colors.primary + '20' : colors.surface, borderColor: hasFilter ? colors.primary : colors.border }]}
            activeOpacity={0.8}
          >
            <Feather name="sliders" size={18} color={hasFilter ? colors.primary : colors.foreground} />
          </TouchableOpacity>
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

      {/* ── Holdings List with Hero Header Component ── */}
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
          <View style={styles.listHeaderSection}>
            {/* ── Reference Image 3 Hero Wealth Header ── */}
            <View style={styles.heroHoldingsContainer}>
              <Text style={[styles.heroHoldingsEyebrow, { color: colors.mutedForeground }]}>
                TOTAL HOLDINGS VALUE
              </Text>
              <Text style={[styles.heroHoldingsAmount, { color: colors.foreground }]}>
                {formatCurrency(overallPortfolioVal > 0 ? overallPortfolioVal : totalInvested)}
              </Text>
              <View style={[styles.returnPill, { backgroundColor: totalNetReturn >= 0 ? colors.positiveBg : colors.negativeBg, borderColor: totalNetReturn >= 0 ? colors.positive + '30' : colors.negative + '30' }]}>
                <Feather
                  name={totalNetReturn >= 0 ? 'trending-up' : 'trending-down'}
                  size={12}
                  color={totalNetReturn >= 0 ? colors.positive : colors.negative}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.returnPillText, { color: totalNetReturn >= 0 ? colors.positive : colors.negative }]}>
                  {totalNetReturn >= 0 ? '+' : ''}{formatCurrency(totalNetReturn)} Net Returns
                </Text>
              </View>
            </View>

            {/* ── Holdings Summary Card (Reference Image 3 Style) ── */}
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryCol}>
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>
                  {formatCurrency(totalInvested)}
                </Text>
                <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>Invested</Text>
              </View>

              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />

              <View style={styles.summaryCol}>
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>
                  {searchFiltered.length}
                </Text>
                <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>Total Bids</Text>
              </View>

              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />

              <View style={styles.summaryCol}>
                <Text style={[styles.summaryVal, { color: totalNetReturn >= 0 ? colors.positive : colors.negative }]}>
                  {totalNetReturn >= 0 ? '+' : ''}{formatCurrency(totalNetReturn)}
                </Text>
                <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>Total Returns</Text>
              </View>
            </View>

            {/* ── Section Title & Filter Chips ── */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionSerifTitle, { color: colors.foreground }]}>
                Holdings
              </Text>
            </View>

            {/* Tab Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
            >
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                const count = countFor(tab.key);
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setActiveTab(tab.key)}
                    activeOpacity={0.8}
                    style={[
                      styles.tabPill,
                      {
                        backgroundColor: active ? (isDark ? '#FFFFFF' : '#111827') : colors.surface,
                        borderColor: active ? (isDark ? '#FFFFFF' : '#111827') : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabPillText,
                        { color: active ? (isDark ? '#111827' : '#FFFFFF') : colors.foreground },
                      ]}
                    >
                      {tab.label} {count > 0 ? `(${count})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface }]}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Applications Found
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {activeTab === 'All'
                ? 'Create applications from the Bids tab.'
                : `No ${activeTab} applications matching your filters.`}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
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

  topActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitleSerif: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: -0.2,
  },
  headerRightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconCircle: {
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
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },

  listHeaderSection: {
    marginBottom: 4,
  },
  heroHoldingsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 18,
  },
  heroHoldingsEyebrow: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroHoldingsAmount: {
    fontSize: 34,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  returnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  returnPillText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // Summary Card (Reference Image 3)
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryCol: {
    alignItems: 'center',
    flex: 1,
  },
  summaryVal: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  summarySub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 24,
  },

  sectionHeaderRow: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionSerifTitle: {
    fontSize: 22,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: -0.3,
  },

  // Filter Pills
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 36 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 22 },
});
