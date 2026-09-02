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
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { BulkApplySheet } from '@/components/BulkApplySheet';
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
  const router = useRouter();

  const openIpoList = useMemo(() => {
    const active = ipos.filter((i) => i.archived !== 1 && (i as any).archived !== true);
    if (active.length > 0) {
      return [...active].sort((a, b) => {
        if (a.close_date && b.close_date) {
          return a.close_date.localeCompare(b.close_date);
        }
        if (a.close_date) return -1;
        if (b.close_date) return 1;
        return 0;
      });
    }
    // Only return mock fallback if DB has ZERO IPOs total (first fresh launch before any IPO is created in DB)
    if (ipos.length === 0) {
      return [
        { id: 'ola-elec', ipo_name: 'Ola Electric Mobility IPO', buy_price: 15000, quantity: 195, issue_type: 'Mainboard', close_date: '2026-08-31', gmp_percent: 16, gmp_value: 234 },
        { id: 'premier-eng', ipo_name: 'Premier Energies IPO', buy_price: 14700, quantity: 33, issue_type: 'Mainboard', close_date: '2026-09-02', gmp_percent: 42, gmp_value: 185 },
        { id: 'firstcry', ipo_name: 'Brainbees Solutions (FirstCry) IPO', buy_price: 14960, quantity: 32, issue_type: 'Mainboard', close_date: '2026-09-04', gmp_percent: 12, gmp_value: 56 },
        { id: 'unicommerce', ipo_name: 'Unicommerce eSolutions IPO', buy_price: 14850, quantity: 135, issue_type: 'SME', close_date: '2026-09-05', gmp_percent: 68, gmp_value: 74 },
      ];
    }
    return [];
  }, [ipos]);

  // ── filter state ───────────────────────────────────────────────────────────
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterBrokers, setFilterBrokers] = useState<string[]>([]);
  const [filterBankNames, setFilterBankNames] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const [showBulkSheet, setShowBulkSheet] = useState(false);

  // ── search state ───────────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);

  // ── Open IPOs Smooth Scroll Animation ──
  const scrollX = useRef(new Animated.Value(0)).current;

  // ── Subtle Dashboard Entrance Animations ──
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(14)).current;
  const amountScaleAnim = useRef(new Animated.Value(0.96)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(translateYAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(amountScaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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

  const monthPercentage = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
    const prevYear = curMonth === 0 ? curYear - 1 : curYear;

    let curProfit = 0;
    let prevProfit = 0;

    for (const a of baseFilteredApps) {
      if (a.status !== 'Sold' && a.status !== 'Holding') continue;
      const dateStr = a.sale_date || a.open_date || '';
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) continue;

      const { netPL } = calculateAppTaxAndNet(a);
      if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
        curProfit += netPL;
      } else if (d.getFullYear() === prevYear && d.getMonth() === prevMonth) {
        prevProfit += netPL;
      }
    }

    if (prevProfit === 0) return curProfit > 0 ? 100 : 0;
    const pct = ((curProfit - prevProfit) / Math.abs(prevProfit)) * 100;
    return Math.round(pct * 10) / 10;
  }, [baseFilteredApps]);

  const profitPct = totalInvested > 0 ? (totalNetProfit / totalInvested) * 100 : null;
  const profitPctLabel = profitPct != null ? `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}%` : '—';

  const holdingProfitPct = holdingInvested > 0 ? (totalHoldingNet / holdingInvested) * 100 : null;
  const holdingProfitPctLabel = holdingProfitPct != null ? `${holdingProfitPct >= 0 ? '+' : ''}${holdingProfitPct.toFixed(1)}%` : '—';

  // ── display helpers ────────────────────────────────────────────────────────
  const hasFilter = filterUserIds.length > 0 || filterBrokers.length > 0 || filterIpoNames.length > 0 || filterBankNames.length > 0;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const filterUserNames = filterUserIds
    .map((uid) => applications.find((a) => a.user_id === uid)?.user_name)
    .filter(Boolean) as string[];
  const filterChipLabel = [...filterUserNames, ...filterBrokers, ...filterBankNames, ...filterIpoNames].join(' · ');

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
          { paddingTop: topPad, height: topPad + 60, backgroundColor: isDark ? colors.background : '#F7F7F9' },
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
              onPress={() => { setFilterUserIds([]); setFilterBrokers([]); setFilterIpoNames([]); setFilterBankNames([]); setFilterYear(null); }}
              hitSlop={8}
            >
              <Feather name="x" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Net Profit Hero Section ── */}
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: translateYAnim }] }]}>
          {/* 3-Part Seamless Background Graphics (20% | 60% | 20%) */}
          <View style={styles.graphicsRow} pointerEvents="none">
            <View style={styles.graphicColLeft}>
              <Image
                source={graphicLeft}
                style={styles.fullGraphicImage}
                resizeMode="stretch"
              />
            </View>

            <View style={styles.graphicColCenter}>
              <Image
                source={heroBg}
                style={styles.fullGraphicImage}
                resizeMode="stretch"
              />
            </View>

            <View style={styles.graphicColRight}>
              <Image
                source={graphicRight}
                style={styles.fullGraphicImage}
                resizeMode="stretch"
              />
            </View>
          </View>

          {/* Left-Aligned Rearranged Content */}
          <View style={styles.heroContentLeft}>
            <View style={styles.eyebrowRow}>
              <Text style={[styles.heroEyebrow, { color: colors.mutedForeground }]}>
                NET PROFIT
              </Text>
              <View style={[styles.eyebrowDot, { backgroundColor: totalNetProfit >= 0 ? (isDark ? '#34D399' : '#10B981') : colors.destructive }]} />
            </View>

            <Animated.View style={{ transform: [{ scale: amountScaleAnim }] }}>
              <BlurView
                intensity={Platform.OS === 'web' ? 0 : 35}
                tint={isDark ? 'dark' : 'light'}
                style={[
                  styles.glassValueCard,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.55)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.7)',
                  },
                ]}
              >
                <Text style={[styles.heroValue, { color: totalNetProfit >= 0 ? (isDark ? '#34D399' : '#10B981') : colors.destructive }]}>
                  {formatCurrency(totalNetProfit).replace(/,/g, '')}
                </Text>
              </BlurView>
            </Animated.View>

            <View style={styles.heroBadgeRow}>
              <View
                style={[
                  styles.heroBadge,
                  {
                    backgroundColor: monthPercentage >= 0
                      ? (isDark ? 'rgba(16, 185, 129, 0.09)' : 'rgba(220, 252, 231, 0.5)')
                      : (isDark ? 'rgba(239, 68, 68, 0.09)' : 'rgba(254, 226, 226, 0.5)'),
                  },
                ]}
              >
                <Feather
                  name={monthPercentage >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={12}
                  color={monthPercentage >= 0 ? (isDark ? '#34D399' : '#15803D') : (isDark ? '#F87171' : '#B91C1C')}
                />
                <Text
                  style={[
                    styles.heroBadgeText,
                    { color: monthPercentage >= 0 ? (isDark ? '#34D399' : '#15803D') : (isDark ? '#F87171' : '#B91C1C') },
                  ]}
                >
                  {Math.abs(monthPercentage)}%
                </Text>
              </View>
              <Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>
                vs last month
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Portfolio Details Card ── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateYAnim }] }}>
          <BlurView
            intensity={Platform.OS === 'web' ? 0 : 50}
            tint={isDark ? 'dark' : 'light'}
            style={[
              styles.portfolioCard,
              { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: colors.border },
            ]}
          >
            {/* Card Header with View Report */}
            <View style={styles.portfolioCardHeader}>
              <Text style={[styles.portfolioCardTitle, { color: colors.foreground }]}>
                Portfolio Details
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/portfolio-report')}
                style={styles.viewReportBtn}
                hitSlop={8}
              >
                <Text style={[styles.viewReportText, { color: colors.mutedForeground }]}>
                  View Report
                </Text>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* 3 Columns Row with Dividers */}
            <View style={styles.portfolioMetricsRow}>
              {/* Column 1: Gross Profit (shifted 15px left) */}
              <View style={[styles.portfolioCell, styles.portfolioCellLeft]}>
                <View style={[styles.portfolioIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }]}>
                  <Feather name="trending-up" size={18} color={colors.foreground} />
                </View>
                <Text style={[styles.portfolioVal, { color: colors.foreground }]}>
                  {formatCurrency(totalPL).replace(/,/g, '')}
                </Text>
                <Text style={[styles.portfolioLabel, { color: colors.mutedForeground }]}>
                  Gross Profit
                </Text>
              </View>

              <View style={[styles.portfolioDivider, { backgroundColor: colors.border }]} />

              {/* Column 2: Holding Profit */}
              <View style={styles.portfolioCell}>
                <View style={[styles.portfolioIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }]}>
                  <Feather name="briefcase" size={18} color={colors.foreground} />
                </View>
                <Text style={[styles.portfolioVal, { color: colors.foreground }]}>
                  {formatCurrency(totalHoldingNet).replace(/,/g, '')}
                </Text>
                <Text style={[styles.portfolioLabel, { color: colors.mutedForeground }]}>
                  Holding Profit
                </Text>
              </View>

              <View style={[styles.portfolioDivider, { backgroundColor: colors.border }]} />

              {/* Column 3: Charges (shifted 15px right) */}
              <View style={[styles.portfolioCell, styles.portfolioCellRight]}>
                <View style={[styles.portfolioIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }]}>
                  <Feather name="percent" size={18} color={colors.foreground} />
                </View>
                <Text style={[styles.portfolioVal, { color: colors.foreground }]}>
                  {formatCurrency(totalTax + totalUserCut).replace(/,/g, '')}
                </Text>
                <Text style={[styles.portfolioLabel, { color: colors.mutedForeground }]}>
                  Charges
                </Text>
              </View>
            </View>
          </BlurView>
        </Animated.View>

        {/* ── Quick Actions Section ── */}
        <View style={styles.quickActionsSection}>
          <Text style={[styles.quickActionsEyebrow, { color: colors.mutedForeground }]}>
            QUICK ACTIONS
          </Text>

          <View style={styles.quickActionsRow}>
            {/* 1. Allotment Checker */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push('/allotment-checker')}
              style={styles.quickActionItem}
            >
              <BlurView
                intensity={Platform.OS === 'web' ? 0 : 35}
                tint={isDark ? 'dark' : 'light'}
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <View style={{ width: 22, height: 24, justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="file-document-outline" size={20} color={colors.foreground} />
                  <View style={{ position: 'absolute', bottom: -3, right: -4, backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderRadius: 7 }}>
                    <MaterialCommunityIcons name="check-circle" size={13} color={colors.foreground} />
                  </View>
                </View>
              </BlurView>
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]} numberOfLines={1}>
                Allotment
              </Text>
            </TouchableOpacity>

            {/* 2. Users */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: '/users', params: { from: 'dashboard' } })}
              style={styles.quickActionItem}
            >
              <BlurView
                intensity={Platform.OS === 'web' ? 0 : 35}
                tint={isDark ? 'dark' : 'light'}
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <Feather name="users" size={20} color={colors.foreground} />
              </BlurView>
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>
                Users
              </Text>
            </TouchableOpacity>

            {/* 3. Banks */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: '/banks', params: { from: 'dashboard' } })}
              style={styles.quickActionItem}
            >
              <BlurView
                intensity={Platform.OS === 'web' ? 0 : 35}
                tint={isDark ? 'dark' : 'light'}
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <MaterialCommunityIcons name="bank-outline" size={20} color={colors.foreground} />
              </BlurView>
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>
                Banks
              </Text>
            </TouchableOpacity>

            {/* 4. Leaderboard */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push('/leaderboard')}
              style={styles.quickActionItem}
            >
              <BlurView
                intensity={Platform.OS === 'web' ? 0 : 35}
                tint={isDark ? 'dark' : 'light'}
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <MaterialCommunityIcons name="trophy-outline" size={20} color={colors.foreground} />
              </BlurView>
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]} numberOfLines={1}>
                Leaderboard
              </Text>
            </TouchableOpacity>

            {/* 5. IPO Calendar (Hidden for now) */}
            {/* <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push('/ipo-calendar')}
              style={styles.quickActionItem}
            >
              <BlurView
                intensity={Platform.OS === 'web' ? 0 : 35}
                tint={isDark ? 'dark' : 'light'}
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <Feather name="calendar" size={20} color={colors.foreground} />
              </BlurView>
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]} numberOfLines={1}>
                Calendar
              </Text>
            </TouchableOpacity> */}
          </View>
        </View>

        {/* ── Open IPOs Horizontal Scrolling Section (Matching reference design) ── */}
        {openIpoList.length > 0 && (
          <View style={styles.openIposSection}>
            <Text style={[styles.openIposEyebrow, { color: colors.mutedForeground }]}>
              OPEN IPOS
            </Text>

            <Animated.ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.openIposScrollContent}
              snapToInterval={307}
              snapToAlignment="start"
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true }
              )}
            >
              {openIpoList.map((ipo, idx) => {
                const CARD_SIZE = 307;
                const inputRange = [
                  (idx - 1) * CARD_SIZE,
                  idx * CARD_SIZE,
                  (idx + 1) * CARD_SIZE,
                ];

                const cardScale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.95, 1, 0.95],
                  extrapolate: 'clamp',
                });

                const cardOpacity = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.82, 1, 0.82],
                  extrapolate: 'clamp',
                });

                const pct = (ipo as any).gmp_percent;
                const val = (ipo as any).gmp_value;
                const hasGmp = pct !== undefined && pct !== null;
                const isPos = (pct ?? 0) >= 0;

                return (
                  <Animated.View
                    key={ipo.id || idx}
                    style={{
                      transform: [{ scale: cardScale }],
                      opacity: cardOpacity,
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => router.push({ pathname: '/bids', params: { ipoId: ipo.id } })}
                      style={[
                        styles.openIpoCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.openIpoCardMain}>
                        <View style={styles.openIpoLeftCol}>
                          <Text style={[styles.openIpoTitle, { color: colors.foreground }]} numberOfLines={1}>
                            {ipo.ipo_name}
                          </Text>
                          <Text style={[styles.openIpoSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {formatCurrency(ipo.buy_price)} / lot · {ipo.quantity} shares
                          </Text>

                          <View style={styles.openIpoBottomRow}>
                            <Text style={[styles.openIpoCtaText, { color: colors.foreground }]}>
                              APPLY NOW
                            </Text>
                            <Feather name="arrow-right" size={13} color={colors.foreground} />
                          </View>
                        </View>

                        <View style={styles.openIpoRightCol}>
                          <View
                            style={[
                              styles.openIpoCategoryBadge,
                              {
                                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#E6F4EA',
                                borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#CEEAD6',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.openIpoCategoryText,
                                { color: isDark ? '#34D399' : '#137333' },
                              ]}
                            >
                              {ipo.issue_type || 'Mainboard'}
                            </Text>
                          </View>

                          <View style={styles.openIpoGmpStack}>
                            <Text style={[styles.openIpoGmpLabel, { color: colors.mutedForeground }]}>
                              GMP
                            </Text>
                            <Text style={[styles.openIpoGmpValue, { color: isPos ? '#10B981' : colors.destructive }]} numberOfLines={1}>
                              {hasGmp ? `${pct}%${val != null ? ` (${val})` : ''}` : '—'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>
          </View>
        )}

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

      <BulkApplySheet
        visible={showBulkSheet}
        onClose={() => setShowBulkSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 16,
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

  // Net Profit Hero Section
  heroSection: {
    paddingVertical: 39,
    position: 'relative',
    minHeight: 217,
    width: '100%',
    justifyContent: 'center',
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
  heroContentLeft: {
    alignItems: 'flex-start',
    paddingLeft: 30,
    paddingRight: 20,
    zIndex: 2,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  heroEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  eyebrowDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  glassValueCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginVertical: 4,
    overflow: 'hidden',
  },
  heroValue: {
    fontSize: 38,
    fontFamily: 'SpaceMono_700Bold',
    letterSpacing: -1.2,
    lineHeight: 44,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroBadgeText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  // Quick Actions Section
  quickActionsSection: {
    marginBottom: 20,
    marginTop: 4,
  },
  quickActionsEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
  },
  quickActionItem: {
    alignItems: 'center',
    gap: 8,
  },
  quickActionIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  quickActionLabel: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // Portfolio Details Card
  portfolioCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  portfolioCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  portfolioCardTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.4,
  },
  viewReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewReportText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  portfolioMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portfolioCell: {
    flex: 1,
    alignItems: 'center',
  },
  portfolioCellLeft: {
    marginLeft: -15,
  },
  portfolioCellRight: {
    marginRight: -15,
  },
  portfolioIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  portfolioVal: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  portfolioLabel: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  portfolioDivider: {
    width: 1,
    height: 64,
    opacity: 0.5,
  },

  // Open IPOs Horizontal Scrolling Section
  openIposSection: {
    marginBottom: 8,
  },
  openIposEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  openIposScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 12,
  },
  openIpoCard: {
    width: 295,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  openIpoCardMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  openIpoLeftCol: {
    flex: 1,
    paddingRight: 4,
  },
  openIpoRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  openIpoCategoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  openIpoCategoryText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  openIpoGmpStack: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  openIpoGmpLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  openIpoGmpValue: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
    marginTop: 1.5,
  },
  openIpoTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    lineHeight: 20,
    marginBottom: 4,
  },
  openIpoSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 10,
  },
  openIpoBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  openIpoCtaText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
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
