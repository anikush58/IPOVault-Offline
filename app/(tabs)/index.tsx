import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDB } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { PerformanceChart } from '@/components/PerformanceChart';
import { Leaderboard } from '@/components/Leaderboard';
import { FilterSheet } from '@/components/FilterSheet';
import { formatCurrency } from '@/utils/formatters';
import {
  calcBuyValue,
  calculateAppTaxAndNet,
} from '@/utils/calculations';

export default function DashboardScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { applications, ipos, isLoading, refresh } = useDB();
  const insets = useSafeAreaInsets();

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterBrokers, setFilterBrokers] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(new Date().getFullYear().toString());
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  // ── Search state ───────────────────────────────────────────────────────────
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

  // ── Base filter (user / broker / year / IPO) ──────────────────────────────
  const baseFilteredApps = applications.filter((a) => {
    if (filterUserIds.length > 0 && !filterUserIds.includes(a.user_id)) return false;
    if (filterBrokers.length > 0 && !filterBrokers.includes(a.user_broker ?? '')) return false;
    if (filterIpoNames.length > 0 && !filterIpoNames.includes(a.ipo_name ?? '')) return false;
    if (filterYear) {
      const y = a.open_date ? a.open_date.slice(0, 4) : '';
      if (y !== filterYear) return false;
    }
    return true;
  });

  // ── KPI calculations ───────────────────────────────────────────────────────
  let totalPL = 0;
  let totalNetProfit = 0;
  let totalTax = 0;
  let totalUserCut = 0;
  let totalHoldingNet = 0;
  let totalInvested = 0;
  let holdingInvested = 0;

  for (const a of baseFilteredApps) {
    if (a.status === 'Sold' || a.status === 'Holding') {
      const { grossPL, tax, userCut, netPL, isHolding } = calculateAppTaxAndNet(a);
      const buyVal = calcBuyValue(a.buy_price, a.quantity);
      totalPL += grossPL;
      totalNetProfit += netPL;
      totalTax += tax;
      totalUserCut += userCut;
      totalInvested += buyVal;
      if (isHolding) {
        totalHoldingNet += netPL;
        holdingInvested += buyVal;
      }
    }
  }

  const netPortfolioValue = totalInvested + totalNetProfit;
  const profitPct = totalInvested > 0 ? (totalNetProfit / totalInvested) * 100 : null;
  const profitPctLabel = profitPct != null ? `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%` : '—';

  // ── Display helpers ────────────────────────────────────────────────────────
  const hasFilter = filterUserIds.length > 0 || filterBrokers.length > 0 || filterIpoNames.length > 0;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const filterUserNames = filterUserIds
    .map((uid) => applications.find((a) => a.user_id === uid)?.user_name)
    .filter(Boolean) as string[];
  const filterChipLabel = [...filterUserNames, ...filterBrokers, ...filterIpoNames].join(' · ');

  const searchBarHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });
  const searchBarOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const quickActions = [
    { label: 'Apply IPO', icon: 'plus-circle', route: '/bids' },
    { label: 'Holdings', icon: 'briefcase', route: '/applications' },
    { label: 'Users', icon: 'users', route: '/users' },
    { label: 'Banks', icon: 'dollar-sign', route: '/banks' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Top Header Actions Bar ── */}
      <View style={[styles.topActionHeader, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          onPress={() => router.push('/users')}
          style={[styles.headerIconCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Feather name="user" size={18} color={colors.foreground} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowFilter(true)}
          style={[
            styles.headerIconCircle,
            {
              backgroundColor: hasFilter ? colors.primary + '20' : colors.surface,
              borderColor: hasFilter ? colors.primary : colors.border,
            },
          ]}
          activeOpacity={0.8}
        >
          <Feather name="sliders" size={18} color={hasFilter ? colors.primary : colors.foreground} />
        </TouchableOpacity>
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
            placeholder="Search users or brokers…"
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Active filter chip */}
        {hasFilter && (
          <View
            style={[
              styles.filterBar,
              { backgroundColor: isDark ? '#3D3011' : colors.primary + '15', borderColor: colors.primary + '30' },
            ]}
          >
            <Feather name="filter" size={12} color={colors.primary} />
            <Text style={[styles.filterBarText, { color: colors.primary }]}>{filterChipLabel}</Text>
            <TouchableOpacity
              onPress={() => { setFilterUserIds([]); setFilterBrokers([]); setFilterIpoNames([]); }}
              hitSlop={8}
            >
              <Feather name="x" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Hero Wealth Display (Arch Reference Style) ── */}
        <View style={styles.heroWealthContainer}>
          <Text style={[styles.heroEyebrow, { color: colors.mutedForeground }]}>
            PORTFOLIO VALUE
          </Text>
          <Text style={[styles.heroAmountText, { color: colors.foreground }]}>
            {formatCurrency(netPortfolioValue > 0 ? netPortfolioValue : totalInvested)}
          </Text>

          {/* 1D Return Pill */}
          <View
            style={[
              styles.returnPill,
              {
                backgroundColor: totalNetProfit >= 0 ? colors.positiveBg : colors.negativeBg,
                borderColor: totalNetProfit >= 0 ? colors.positive + '30' : colors.negative + '30',
              },
            ]}
          >
            <Feather
              name={totalNetProfit >= 0 ? 'trending-up' : 'trending-down'}
              size={13}
              color={totalNetProfit >= 0 ? colors.positive : colors.negative}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.returnPillText,
                { color: totalNetProfit >= 0 ? colors.positive : colors.negative },
              ]}
            >
              {totalNetProfit >= 0 ? '+' : ''}{formatCurrency(totalNetProfit)} ({profitPctLabel}) Total Return
            </Text>
          </View>
        </View>

        {/* ── Quick Actions Grid (Reference Circle Buttons) ── */}
        <View style={styles.quickActionsSection}>
          <Text style={[styles.sectionSerifTitle, { color: colors.foreground, marginBottom: 14 }]}>
            Quick actions
          </Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((qa) => (
              <TouchableOpacity
                key={qa.label}
                onPress={() => router.push(qa.route as any)}
                activeOpacity={0.8}
                style={styles.quickActionItem}
              >
                <View
                  style={[
                    styles.quickActionCircle,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Feather name={qa.icon as any} size={20} color={colors.foreground} />
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>
                  {qa.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Insights Promo Card (Matching Reference Card) ── */}
        <View style={styles.promoWrap}>
          <View
            style={[
              styles.promoCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.promoTitle, { color: colors.foreground }]}>
                Optimize IPO Allocations ✨
              </Text>
              <Text style={[styles.promoSub, { color: colors.mutedForeground }]}>
                Track ASBA balances across user accounts and maximize listing day returns.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/allotment-checker')}
                activeOpacity={0.85}
                style={[styles.promoBtn, { backgroundColor: isDark ? '#FFFFFF' : '#111827' }]}
              >
                <Text style={[styles.promoBtnText, { color: isDark ? '#111827' : '#FFFFFF' }]}>
                  ALLOTMENT CHECKER &gt;
                </Text>
              </TouchableOpacity>
            </View>

            {/* Right Graphic Badge */}
            <View style={[styles.promoGraphic, { backgroundColor: colors.primary + '18' }]}>
              <Feather name="award" size={32} color={colors.primary} />
            </View>
          </View>
        </View>

        {/* ── Analyse Your Portfolio Gauge Cards ── */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionSerifTitle, { color: colors.foreground }]}>
            Portfolio Insights
          </Text>
          <Text style={[styles.sectionSerifSub, { color: colors.mutedForeground }]}>
            Key signals from your investments
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
          >
            {/* Metric Card 1 */}
            <View style={[styles.insightGaugeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.gaugeLabel, { color: colors.mutedForeground }]}>INVESTED CAPITAL</Text>
              <Text style={[styles.gaugeVal, { color: colors.foreground }]}>{formatCurrency(totalInvested)}</Text>
              <View style={[styles.gaugeBar, { backgroundColor: colors.surface }]}>
                <View style={[styles.gaugeFill, { width: '80%', backgroundColor: colors.primary }]} />
              </View>
              <TouchableOpacity onPress={() => router.push('/applications')} activeOpacity={0.7} style={styles.gaugeLink}>
                <Text style={[styles.gaugeLinkText, { color: colors.primary }]}>VIEW HOLDINGS &gt;</Text>
              </TouchableOpacity>
            </View>

            {/* Metric Card 2 */}
            <View style={[styles.insightGaugeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.gaugeLabel, { color: colors.mutedForeground }]}>UNREALIZED P/L</Text>
              <Text style={[styles.gaugeVal, { color: totalHoldingNet >= 0 ? colors.positive : colors.negative }]}>
                {formatCurrency(totalHoldingNet)}
              </Text>
              <View style={[styles.gaugeBar, { backgroundColor: colors.surface }]}>
                <View style={[styles.gaugeFill, { width: '60%', backgroundColor: colors.positive }]} />
              </View>
              <TouchableOpacity onPress={() => router.push('/applications')} activeOpacity={0.7} style={styles.gaugeLink}>
                <Text style={[styles.gaugeLinkText, { color: colors.primary }]}>DETAILS &gt;</Text>
              </TouchableOpacity>
            </View>

            {/* Metric Card 3 */}
            <View style={[styles.insightGaugeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.gaugeLabel, { color: colors.mutedForeground }]}>TAX & CHARGES</Text>
              <Text style={[styles.gaugeVal, { color: colors.foreground }]}>{formatCurrency(totalTax + totalUserCut)}</Text>
              <View style={[styles.gaugeBar, { backgroundColor: colors.surface }]}>
                <View style={[styles.gaugeFill, { width: '35%', backgroundColor: colors.negative }]} />
              </View>
              <TouchableOpacity onPress={() => setShowFilter(true)} activeOpacity={0.7} style={styles.gaugeLink}>
                <Text style={[styles.gaugeLinkText, { color: colors.primary }]}>BREAKDOWN &gt;</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* ── Performance Chart ── */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionSerifTitle, { color: colors.foreground, marginBottom: 12 }]}>
            Portfolio Growth
          </Text>
          <PerformanceChart applications={baseFilteredApps} />
        </View>

        {/* ── Leaderboard ── */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionSerifTitle, { color: colors.foreground, marginBottom: 12 }]}>
            Top Performers
          </Text>
          <Leaderboard applications={baseFilteredApps} searchQuery={searchQuery} />
        </View>
      </ScrollView>

      <FilterSheet
        visible={showFilter}
        filterUserIds={filterUserIds}
        filterBrokers={filterBrokers}
        filterYear={filterYear}
        filterIpoNames={filterIpoNames}
        onFilterChange={(uids, brokers, year, ipos) => {
          setFilterUserIds(uids);
          setFilterBrokers(brokers);
          setFilterYear(year);
          setFilterIpoNames(ipos);
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
  headerIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  filterBarText: { flex: 1, fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },

  // Hero Arch Section
  heroWealthContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  heroEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroAmountText: {
    fontSize: 38,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: -1,
    marginBottom: 10,
  },
  returnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  returnPillText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // Quick Actions Section
  quickActionsSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionSerifTitle: {
    fontSize: 22,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: -0.3,
  },
  sectionSerifSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    marginBottom: 4,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickActionItem: {
    alignItems: 'center',
    width: '22%',
  },
  quickActionCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textAlign: 'center',
  },

  // Promo Wrap
  promoWrap: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  promoCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  promoSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
    marginBottom: 14,
  },
  promoBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  promoBtnText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  promoGraphic: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section Wrap
  sectionWrap: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },

  // Insight Gauge Cards
  insightGaugeCard: {
    width: 160,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  gaugeLabel: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  gaugeVal: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  gaugeBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 3,
  },
  gaugeLink: {
    marginTop: 4,
  },
  gaugeLinkText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
});
