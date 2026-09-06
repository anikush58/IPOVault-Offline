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
import { formatCurrency, getResolvedLogoUrl } from '@/utils/formatters';

const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'], // Purple
  ['#10B981', '#047857'], // Emerald
  ['#3B82F6', '#1D4ED8'], // Blue
  ['#F59E0B', '#B45309'], // Amber
  ['#EC4899', '#BE185D'], // Pink
  ['#6366F1', '#4338CA'], // Indigo
  ['#14B8A6', '#0F766E'], // Teal
  ['#F43F5E', '#BE123C'], // Rose
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}
import {
  calcBuyValue,
  calculateAppTaxAndNet,
} from '@/utils/calculations';

function parseAppDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const str = dateStr.trim();
  const parts = str.split(/[-/ T]/);
  if (parts.length >= 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && year > 1900 && month >= 0 && month <= 11) {
      return new Date(year, month, day);
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

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
        { id: 'ola-elec', company_name: 'Ola Electric Mobility', ipo_name: 'Ola Electric Mobility IPO', price_band_min: 72, price_band_max: 76, lot_size: 195, issue_type: 'Mainboard', close_date: '31 Aug', gmp_percent: 16, gmp_amount: 12, total_sub: 4.2 },
        { id: 'premier-eng', company_name: 'Premier Energies', ipo_name: 'Premier Energies IPO', price_band_min: 425, price_band_max: 450, lot_size: 33, issue_type: 'Mainboard', close_date: '02 Sep', gmp_percent: 42, gmp_amount: 189, total_sub: 74.3 },
        { id: 'firstcry', company_name: 'Brainbees Solutions (FirstCry)', ipo_name: 'Brainbees Solutions IPO', price_band_min: 440, price_band_max: 465, lot_size: 32, issue_type: 'Mainboard', close_date: '04 Sep', gmp_percent: 12, gmp_amount: 56, total_sub: 12.2 },
        { id: 'unicommerce', company_name: 'Unicommerce eSolutions', ipo_name: 'Unicommerce eSolutions IPO', price_band_min: 102, price_band_max: 108, lot_size: 135, issue_type: 'SME', close_date: '05 Sep', gmp_percent: 68, gmp_amount: 74, total_sub: 168.3 },
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
  const [cardLogoErrors, setCardLogoErrors] = useState<Record<string, boolean>>({});
  const [showFilter, setShowFilter] = useState(false);

  React.useEffect(() => {
    setCardLogoErrors({});
  }, [ipos]);
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
    const lastMonthEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999);

    let curProfit = 0;
    let prevProfit = 0;

    for (const a of baseFilteredApps) {
      if (a.status !== 'Sold' && a.status !== 'Holding') continue;
      const { netPL } = calculateAppTaxAndNet(a);

      if (a.status === 'Sold') {
        const dateStr = a.sale_date || a.updated_at || a.created_at;
        if (!dateStr) continue;
        const d = parseAppDate(dateStr);
        if (!d) continue;
        if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
          curProfit += netPL;
        } else if (d.getFullYear() === prevYear && d.getMonth() === prevMonth) {
          prevProfit += netPL;
        }
      } else if (a.status === 'Holding') {
        const dateStr = a.open_date || a.created_at || a.updated_at;
        const d = parseAppDate(dateStr);
        curProfit += netPL;
        if (!d || d.getTime() <= lastMonthEnd.getTime()) {
          prevProfit += netPL;
        }
      }
    }

    if (prevProfit === 0) {
      if (curProfit > 0) return 100;
      if (curProfit < 0) return -100;
      return 0;
    }
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
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]} numberOfLines={1}>
                Manage Users
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
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]} numberOfLines={1}>
                Manage Banks
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
              snapToInterval={300}
              snapToAlignment="start"
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true }
              )}
            >
              {openIpoList.map((ipo, idx) => {
                const item = ipo as any;
                const CARD_SIZE = 315;
                const inputRange = [
                  (idx - 1) * CARD_SIZE,
                  idx * CARD_SIZE,
                  (idx + 1) * CARD_SIZE,
                ];

                const cardScale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.96, 1, 0.96],
                  extrapolate: 'clamp',
                });

                const cardOpacity = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.85, 1, 0.85],
                  extrapolate: 'clamp',
                });

                const companyName = item.company_name || item.ipo_name || 'IPO';
                const resolvedLogo = getResolvedLogoUrl(item.logo_url);
                const initials = companyName
                  .replace(/[^a-zA-Z0-9\s]/g, '')
                  .split(' ')
                  .slice(0, 2)
                  .map((w: string) => w[0])
                  .join('')
                  .toUpperCase();

                // Format Price Band
                const priceMin = item.price_band_min;
                const priceMax = item.price_band_max || item.buy_price;
                let priceBandText = 'TBA';
                if (priceMin && priceMax) {
                  priceBandText = priceMin === priceMax ? formatCurrency(priceMax) : `${formatCurrency(priceMin)} - ${formatCurrency(priceMax)}`;
                } else if (priceMax) {
                  priceBandText = formatCurrency(priceMax);
                }

                // Minimum Investment / Lot size calculation
                const lotSize = item.lot_size || item.quantity;
                const lotVal = priceMax && lotSize ? priceMax * lotSize : null;

                // GMP
                const gmpAmt = item.gmp_amount ?? item.gmp_value;
                const gmpPct = item.gmp_percent;
                const hasGmp = gmpAmt != null || gmpPct != null;
                const isPos = ((gmpAmt ?? gmpPct ?? 0) >= 0);
                const gmpDisplay = gmpAmt != null
                  ? `${gmpAmt > 0 ? '+' : ''}₹${gmpAmt}${gmpPct != null ? ` (${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%)` : ''}`
                  : gmpPct != null
                  ? `${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%`
                  : 'TBA';
                const gmpColor = hasGmp ? (isPos ? '#10B981' : colors.destructive) : colors.mutedForeground;

                // Demand / Subscription
                const totalSub = item.total_sub ?? item.total_subscription;
                const subDisplay = totalSub != null ? `${totalSub.toFixed(1)}x` : (item.qib_sub != null ? `${item.qib_sub.toFixed(1)}x QIB` : '—');

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
                      onPress={() => router.push({ pathname: '/apply-ipo', params: { ipoId: ipo.id } } as any)}
                      style={[
                        styles.openIpoCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      {/* Top Header: Logo/Avatar + Name + Issue Type & Timeline Pill */}
                      <View style={styles.openIpoHeaderRow}>
                        {resolvedLogo && !cardLogoErrors[item.id || idx] ? (
                          <Image
                            source={{ uri: resolvedLogo }}
                            style={styles.openIpoLogoImage}
                            resizeMode="contain"
                            onError={() => setCardLogoErrors((prev) => ({ ...prev, [item.id || idx]: true }))}
                          />
                        ) : (
                          <LinearGradient
                            colors={getAvatarGradient(companyName)}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.openIpoAvatar}
                          >
                            <Text style={styles.openIpoAvatarText}>{initials}</Text>
                          </LinearGradient>
                        )}

                        <View style={styles.openIpoHeaderInfo}>
                          <Text style={[styles.openIpoTitle, { color: colors.foreground }]} numberOfLines={1}>
                            {companyName}
                          </Text>
                          <View style={styles.openIpoBadgesRow}>
                            <View
                              style={[
                                styles.openIpoCategoryBadge,
                                {
                                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF',
                                  borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : '#C7D2FE',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.openIpoCategoryText,
                                  { color: isDark ? '#818CF8' : '#4F46E5' },
                                ]}
                              >
                                {ipo.issue_type || 'Mainboard'}
                              </Text>
                            </View>
                            {ipo.close_date ? (
                              <View style={[styles.openIpoDateBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <Feather name="clock" size={10} color={colors.mutedForeground} />
                                <Text style={[styles.openIpoDateText, { color: colors.mutedForeground }]}>
                                  {ipo.close_date}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      {/* Main Decision Banner: Price Band | GMP | Demand */}
                      <View style={[styles.openIpoMetricsBanner, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(241, 243, 245, 0.65)', borderColor: colors.border }]}>
                        {/* Price Band & Lot Size */}
                        <View style={styles.openIpoMetricCell}>
                          <Text style={[styles.openIpoMetricLabel, { color: colors.mutedForeground }]}>PRICE BAND</Text>
                          <Text style={[styles.openIpoMetricValue, { color: colors.foreground }]} numberOfLines={1}>
                            {priceBandText}
                          </Text>
                          <Text style={[styles.openIpoMetricSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {lotSize ? `${lotSize} Shares / Lot` : 'Min 1 Lot'}
                          </Text>
                        </View>

                        <View style={[styles.openIpoMetricDivider, { backgroundColor: colors.border }]} />

                        {/* Expected GMP */}
                        <View style={styles.openIpoMetricCellRight}>
                          <Text style={[styles.openIpoMetricLabel, { color: colors.mutedForeground }]}>EXPECTED GMP</Text>
                          <Text style={[styles.openIpoMetricValue, { color: gmpColor }]} numberOfLines={1}>
                            {gmpDisplay}
                          </Text>
                          <Text style={[styles.openIpoMetricSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {subDisplay !== '—' ? `${subDisplay} Subscribed` : 'Demand TBA'}
                          </Text>
                        </View>
                      </View>

                      {/* Bottom Row: Total Amount & Apply CTA */}
                      <View style={styles.openIpoFooterRow}>
                        <Text style={[styles.openIpoTotalAmountText, { color: colors.foreground }]} numberOfLines={1}>
                          {lotVal ? formatCurrency(lotVal) : '—'}
                        </Text>

                        <View style={[styles.openIpoCtaButton, { backgroundColor: colors.primary }]}>
                          <Text style={styles.openIpoCtaText}>APPLY NOW</Text>
                          <Feather name="arrow-right" size={12} color="#FFFFFF" />
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
    gap: 8,
  },
  openIpoCard: {
    width: 310,
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  openIpoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  openIpoLogoImage: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  openIpoAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openIpoAvatarText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  openIpoHeaderInfo: {
    flex: 1,
    gap: 3,
  },
  openIpoTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  openIpoBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  openIpoCategoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  openIpoCategoryText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  openIpoDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  openIpoDateText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  // Decision Metrics Banner
  openIpoMetricsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  openIpoMetricCell: {
    flex: 1,
    gap: 1,
  },
  openIpoMetricCellRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 1,
  },
  openIpoMetricDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 10,
  },
  openIpoMetricLabel: {
    fontSize: 8.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  openIpoMetricValue: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  openIpoMetricSub: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  // Footer Row
  openIpoFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  openIpoTotalAmountText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  openIpoCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  openIpoCtaText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.4,
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
