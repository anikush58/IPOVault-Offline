import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
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
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDB } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { useSmartIPODatabase } from '@/hooks/useSmartIPODatabase';
import { KPICard } from '@/components/KPICard';
import { PerformanceChart } from '@/components/PerformanceChart';
import { Leaderboard } from '@/components/Leaderboard';
import { FilterSheet } from '@/components/FilterSheet';
import { formatCurrency } from '@/utils/formatters';
import {
  calcBuyValue,
  calculateAppTaxAndNet,
} from '@/utils/calculations';

const heroBg = require('@/assets/images/dashboard-hero-bg.png');
const graphicLeft = require('@/assets/images/dashboard-graphic-left.png');
const graphicRight = require('@/assets/images/dashboard-graphic-right.png');

export default function DashboardScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { applications, ipos, isLoading, refresh } = useDB();
  const insets = useSafeAreaInsets();

  // ── filter state ───────────────────────────────────────────────────────────
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterBrokers, setFilterBrokers] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(new Date().getFullYear().toString());
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  // ── search state ───────────────────────────────────────────────────────────
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

  // ── base filter (user / broker / year / IPO) ──────────────────────────────
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

  const profitPct = totalInvested > 0 ? (totalNetProfit / totalInvested) * 100 : null;
  const profitPctLabel = profitPct != null ? `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}%` : '—';

  const holdingProfitPct = holdingInvested > 0 ? (totalHoldingNet / holdingInvested) * 100 : null;
  const holdingProfitPctLabel = holdingProfitPct != null ? `${holdingProfitPct >= 0 ? '+' : ''}${holdingProfitPct.toFixed(1)}%` : '—';

  // ── display helpers ────────────────────────────────────────────────────────
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>IPO PORTFOLIO</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Dashboard</Text>
        </View>

        {/* Actions (Filter) */}
        <View style={styles.headerActions}>
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
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

        {/* ── Net Profit Hero Section (Seamless 20% | 60% | 20% 3-Part Graphics) ── */}
        <View style={styles.heroSection}>
          <View style={styles.graphicsRow}>
            {/* Left Graphic (20%) */}
            <View style={styles.graphicColLeft}>
              <Image
                source={graphicLeft}
                style={styles.fullGraphicImage}
                resizeMode="cover"
              />
            </View>

            {/* Center Hero Background (60%) */}
            <View style={styles.graphicColCenter}>
              <Image
                source={heroBg}
                style={styles.fullGraphicImage}
                resizeMode="contain"
              />
            </View>

            {/* Right Graphic (20%) */}
            <View style={styles.graphicColRight}>
              <Image
                source={graphicRight}
                style={styles.fullGraphicImage}
                resizeMode="cover"
              />
            </View>
          </View>

          <View style={styles.heroContent}>
            <Text style={[styles.heroEyebrow, { color: colors.mutedForeground }]}>
              NET PROFIT
            </Text>
            <Text style={[styles.heroValue, { color: totalNetProfit >= 0 ? '#10B981' : colors.destructive }]}>
              {formatCurrency(totalNetProfit)}
            </Text>
          </View>
        </View>

        {/* ── Portfolio Details Card (Matching reference design) ── */}
        <View
          style={[
            styles.portfolioCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Card Header (No Chevron) */}
          <View style={styles.portfolioCardHeader}>
            <Text style={[styles.portfolioCardTitle, { color: colors.foreground }]}>
              Portfolio Details
            </Text>
          </View>

          {/* 3 Columns Row */}
          <View style={styles.portfolioMetricsRow}>
            {/* Column 1: Gross Profit */}
            <View style={styles.portfolioMetricColLeft}>
              <Text style={[styles.portfolioMetricVal, { color: totalPL >= 0 ? '#10B981' : colors.destructive }]}>
                {formatCurrency(totalPL)}
              </Text>
              <Text style={[styles.portfolioMetricLabel, { color: colors.mutedForeground }]}>
                Gross Profit
              </Text>
            </View>

            {/* Column 2: Holding Profit */}
            <View style={styles.portfolioMetricColCenter}>
              <Text style={[styles.portfolioMetricVal, { color: totalHoldingNet >= 0 ? '#10B981' : colors.destructive }]}>
                {formatCurrency(totalHoldingNet)}
              </Text>
              <Text style={[styles.portfolioMetricLabel, { color: colors.mutedForeground }]}>
                Holding Profit
              </Text>
            </View>

            {/* Column 3: Charges */}
            <View style={styles.portfolioMetricColRight}>
              <Text style={[styles.portfolioMetricVal, { color: colors.foreground }]}>
                {formatCurrency(totalTax + totalUserCut)}
              </Text>
              <Text style={[styles.portfolioMetricLabel, { color: colors.mutedForeground }]}>
                Charges
              </Text>
            </View>
          </View>
        </View>

        {/* Performance chart */}
        <PerformanceChart applications={baseFilteredApps} />

        {/* Leaderboard */}
        <Leaderboard applications={baseFilteredApps} searchQuery={searchQuery} />
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

  header: {
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
    color: '#D4A017',
  },
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
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  filterBarText: { flex: 1, fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },

  kpiGrid: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  kpiRow: { flexDirection: 'row', gap: 10 },

  // Net Profit Hero Section (20% | 60% | 20% Seamless Proportions)
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    position: 'relative',
    minHeight: 155,
    width: '100%',
    overflow: 'hidden',
  },
  graphicsRow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  graphicColLeft: {
    width: '20%',
    height: '100%',
  },
  graphicColCenter: {
    width: '60%',
    height: '100%',
  },
  graphicColRight: {
    width: '20%',
    height: '100%',
  },
  fullGraphicImage: {
    width: '100%',
    height: '100%',
  },
  heroContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  heroEyebrow: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 32,
    fontFamily: 'SpaceMono_700Bold',
    letterSpacing: -0.8,
  },

  // Custom Hero Image Graphics
  heroGraphicWrap: {
    position: 'absolute',
    bottom: 14,
    width: 76,
    height: 96,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  heroGraphicImage: {
    width: '100%',
    height: '100%',
  },

  // Portfolio Details Card
  portfolioCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  portfolioCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  portfolioCardTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  portfolioMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portfolioMetricColLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  portfolioMetricColCenter: {
    flex: 1,
    alignItems: 'center',
  },
  portfolioMetricColRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  portfolioMetricVal: {
    fontSize: 14.5,
    fontFamily: 'SpaceMono_700Bold',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  portfolioMetricLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  snapshotWrap: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  snapshotGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  snapshotItem: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 64,
  },
  snapshotVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  snapshotSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
});
