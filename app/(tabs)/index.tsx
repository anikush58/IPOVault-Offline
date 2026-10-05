import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useSQLiteContext } from 'expo-sqlite';
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
import { formatCurrency, formatDayMonth, getResolvedLogoUrl } from '@/utils/formatters';
import { calculateNormalizedIPOStatus } from '@/services/ipo/statusNormalizer';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { triggerCentralizedIPOSync } from '@/services/ipo/centralizedSync';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { useAuth } from '@/context/AuthContext';
import {
  BrokerAccountItem,
  brokerApiService,
  DashboardIpoHoldingItem,
  UserPortfolioSummaryResponse,
  MarketQuotesMap,
} from '@/services/broker/BrokerApiService';
import {
  enrichApplicationsWithBrokerData,
  findMatchingBrokerInvestment,
  getBrokerLtpForApplication,
  resolveCanonicalBrokerUserId,
  syncBrokerHoldingPricesToLocalDb,
  extractHoldingInstrumentsForQuotes,
} from '@/utils/brokerMatching';
import { AllotmentSuccessModal } from '@/components/allotment/AllotmentSuccessModal';
import { useAllotmentResultModal } from '@/hooks/useAllotmentResultModal';

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

const heroBgLight = require('@/assets/images/dashboard-hero-bg.png');
const graphicLeftLight = require('@/assets/images/dashboard-graphic-left.png');
const graphicRightLight = require('@/assets/images/dashboard-graphic-right.png');

const heroBgDark = require('@/assets/images/dashboard-hero-bg-dark.png');
const graphicLeftDark = require('@/assets/images/dashboard-graphic-left-dark.png');
const graphicRightDark = require('@/assets/images/dashboard-graphic-right-dark.png');

export default function DashboardScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const heroBg = isDark ? heroBgDark : heroBgLight;
  const graphicLeft = isDark ? graphicLeftDark : graphicLeftLight;
  const graphicRight = isDark ? graphicRightDark : graphicRightLight;

  const { applications, ipos, users, isLoading, refresh } = useDB();
  const { user: authUser } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const {
    visible: showAllotmentModal,
    modalState: allotmentModalState,
    dismissModal: dismissAllotmentModal,
    recheckUnviewed: recheckAllotmentModal,
  } = useAllotmentResultModal();

  useFocusEffect(
    useCallback(() => {
      recheckAllotmentModal();
    }, [recheckAllotmentModal])
  );

  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccountItem[]>([]);
  const [brokerPortfolio, setBrokerPortfolio] =
    useState<UserPortfolioSummaryResponse | null>(null);
  const [marketQuotes, setMarketQuotes] = useState<MarketQuotesMap>({});
  const [brokerHoldings, setBrokerHoldings] = useState<
    DashboardIpoHoldingItem[]
  >([]);
  const [loadingHoldings, setLoadingHoldings] = useState<boolean>(false);
  const [isHoldingsExpanded, setIsHoldingsExpanded] = useState<boolean>(true);

  const activeUserId = useMemo(() => {
    return resolveCanonicalBrokerUserId(authUser, users);
  }, [authUser, users]);

  const isBrokerConnected = useMemo(() => {
    return brokerAccounts.some(
      (acc) => acc.connection?.status === 'CONNECTED' && acc.isActive,
    );
  }, [brokerAccounts]);

  const db = useSQLiteContext();
  const [ipoHubItems, setIpoHubItems] = useState<any[]>([]);
  const [refreshingIpoHub, setRefreshingIpoHub] = useState(false);

  const loadBrokerHoldingsData = useCallback(async () => {
    if (!activeUserId) return;
    try {
      setLoadingHoldings(true);
      const accounts = await brokerApiService.getAccounts(activeUserId);
      setBrokerAccounts(accounts);

      const connectedAccounts = accounts.filter(
        (acc) => acc.connection?.status === 'CONNECTED' && acc.isActive,
      );

      if (connectedAccounts.length === 0) {
        setBrokerPortfolio(null);
        setMarketQuotes({});
        return;
      }

      // 1. Fetch user portfolio (holdings & sell trades for linked accounts)
      const portfolioData = await brokerApiService.getUserPortfolio(activeUserId);
      setBrokerPortfolio(portfolioData);

      // 2. Fetch market quotes (LTP) for ALL holding applications via any connected broker quote capability
      const holdingInstruments = extractHoldingInstrumentsForQuotes(applications, ipos);
      if (holdingInstruments.length > 0) {
        const quotes = await brokerApiService.getMarketQuotes(
          activeUserId,
          holdingInstruments,
          connectedAccounts[0]?.id,
        );
        if (quotes && Object.keys(quotes).length > 0) {
          setMarketQuotes(quotes);
        }
      }

      // 3. Persist auto-detected sales into SQLite for linked Holding applications
      if (portfolioData?.investments && db) {
        syncBrokerHoldingPricesToLocalDb(
          applications,
          ipos,
          portfolioData.investments,
          db,
          refresh,
        ).catch(() => {});
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to load broker holdings data:', err);
    } finally {
      setLoadingHoldings(false);
    }
  }, [activeUserId, applications, db, ipos, refresh]);

  const loadIpoHubData = useCallback(async () => {
    try {
      // Trigger background sync with live API
      if (db) {
        triggerCentralizedIPOSync(db, { source: 'Dashboard' }).catch(() => {});
      }

      // Fetch live backend IPO list (only backend-published IPOs)
      let backendItems: any[] = [];
      try {
        backendItems = await backendIpoApiService.listBackendIpos();
      } catch (err) {
        if (__DEV__) console.warn('[Dashboard] Failed to fetch backend IPO list', err);
      }

      const map = new Map<string, any>();

      for (const b of backendItems) {
        if (!b || !b.id) continue;
        const id = b.id;
        const companyName = b.company?.displayName || b.companyName || b.symbol || 'IPO';
        const priceMin = b.priceBandLow ?? b.issuePriceInr;
        const priceMax = b.priceBandHigh ?? b.issuePriceInr;
        const lotSize = b.lotSize;
        const gmpAmt = b.currentGmp?.gmpAmount != null ? Number(b.currentGmp.gmpAmount) : null;
        const gmpPct = b.currentGmp?.gmpPercentage != null ? Number(b.currentGmp.gmpPercentage) : null;
        const totalSub = b.currentSubscription?.totalSubscriptionMultiple != null ? Number(b.currentSubscription.totalSubscriptionMultiple) : null;

        const normStatus = calculateNormalizedIPOStatus({
          status: b.status,
          open_date: b.openDate || b.lifecycle?.openDate || '',
          close_date: b.closeDate || b.lifecycle?.closeDate || '',
          listing_date: b.listingDate || b.lifecycle?.listingDate || '',
        });

        map.set(id, {
          id,
          company_name: companyName,
          ipo_name: companyName,
          symbol: b.symbol || '',
          price_band_min: priceMin,
          price_band_max: priceMax,
          lot_size: lotSize,
          issue_type: b.marketSegment === 'SME' ? 'SME' : 'Mainboard',
          open_date: b.openDate || b.lifecycle?.openDate || '',
          close_date: b.closeDate || b.lifecycle?.closeDate || '',
          listing_date: b.listingDate || b.lifecycle?.listingDate || '',
          allotment_date: b.allotmentDate || b.allotment_date || b.lifecycle?.basisOfAllotmentDate || '',
          gmp_amount: gmpAmt,
          gmp_percent: gmpPct,
          total_sub: totalSub,
          logo_url: b.company?.logoUrl || (b as any).logoUrl || '',
          status: normStatus,
          lifecycle_status: normStatus,
        });
      }

      const allItems = Array.from(map.values());
      setIpoHubItems(allItems);
    } catch (err) {
      if (__DEV__) console.warn('[DashboardScreen] Failed to load IPO Hub data', err);
    }
  }, [db]);

  useEffect(() => {
    loadIpoHubData();
    loadBrokerHoldingsData();
  }, [loadIpoHubData, loadBrokerHoldingsData]);

  // Screen Focus Auto-Refresh (instantly update dashboard when tab is selected)
  useFocusEffect(
    useCallback(() => {
      loadIpoHubData();
      loadBrokerHoldingsData();
    }, [loadIpoHubData, loadBrokerHoldingsData])
  );

  // 10-Second Periodic Polling for real-time live synchronization with backend
  useEffect(() => {
    const timer = setInterval(() => {
      loadIpoHubData();
      loadBrokerHoldingsData();
    }, 10000);

    return () => {
      clearInterval(timer);
    };
  }, [loadIpoHubData, loadBrokerHoldingsData]);

  // Re-fetch open IPOs whenever applications are applied (backendSyncEmitter fires after each apply)
  useEffect(() => {
    const unsub = backendSyncEmitter.subscribe(() => {
      loadIpoHubData().catch(() => {});
      loadBrokerHoldingsData().catch(() => {});
    });
    return unsub;
  }, [loadIpoHubData, loadBrokerHoldingsData]);

  const handleDashboardRefresh = useCallback(async () => {
    try {
      setRefreshingIpoHub(true);
      await Promise.all([
        refresh(),
        loadIpoHubData(),
        loadBrokerHoldingsData(),
        db ? triggerCentralizedIPOSync(db, { force: true, source: 'Dashboard Pull-to-Refresh' }) : Promise.resolve(),
      ]);
    } catch (err) {
      if (__DEV__) console.warn('[Dashboard] Refresh error', err);
    } finally {
      setRefreshingIpoHub(false);
    }
  }, [refresh, loadIpoHubData, db]);

  const openIpoList = useMemo(() => {
    // Merge ipoHubItems (live API) + ipos (local DB, enriched from ipo_master) into one source.
    const mergedMap = new Map<string, any>();

    // First add ipos (local DB, lower priority)
    for (const i of ipos) {
      if (i.id) mergedMap.set(i.id, i);
    }
    // Then overlay ipoHubItems (live API, higher priority — overrides local for same ID)
    for (const i of ipoHubItems) {
      if (i.id) mergedMap.set(i.id, i);
    }

    const sourceList = Array.from(mergedMap.values());
    const active = sourceList.filter((i) => i.archived !== 1 && (i as any).archived !== true);
    
    // Filter for strictly OPEN and CLOSING_TODAY IPOs matching IPO Hub status calculation
    const openOnly = active.filter((i) => {
      const st = (i.status || i.lifecycle_status || calculateNormalizedIPOStatus(i) || '').toUpperCase().trim();
      return st === 'OPEN' || st === 'ACTIVE' || st === 'LIVE' || st === 'CLOSING_TODAY' || st === 'CLOSING TODAY';
    });
    
    let targetList = openOnly;
    if (targetList.length === 0) {
      targetList = active.filter((i) => {
        const st = (i.status || i.lifecycle_status || calculateNormalizedIPOStatus(i) || '').toUpperCase().trim();
        return st === 'OPEN' || st === 'UPCOMING' || st === 'ACTIVE' || st === 'LIVE' || st === 'CLOSING_TODAY' || st === 'CLOSING TODAY';
      });
    }
    if (targetList.length === 0) {
      targetList = active.filter((i) => {
        const st = (i.status || i.lifecycle_status || calculateNormalizedIPOStatus(i) || '').toUpperCase().trim();
        return st !== 'CLOSED' && st !== 'LISTED';
      });
    }

    if (targetList.length > 0) {
      return [...targetList].sort((a, b) => {
        if (a.close_date && b.close_date) {
          return a.close_date.localeCompare(b.close_date);
        }
        if (a.close_date) return -1;
        if (b.close_date) return 1;
        return 0;
      });
    }
    return [];
  }, [ipoHubItems, ipos]);

  // ── filter state ───────────────────────────────────────────────────────────
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [cardLogoErrors, setCardLogoErrors] = useState<Record<string, boolean>>({});
  const [showFilter, setShowFilter] = useState(false);

  // ── Allotted IPO names for dashboard filter (only IPOs allotted from IPO Hub) ──
  const allottedIpoNames = useMemo(() => {
    const allottedSet = new Set<string>();

    const checkAndAdd = (item: any) => {
      if (!item) return;
      const rawStatus = (item.status || item.lifecycle_status || '').toUpperCase().trim();
      const clean = rawStatus.replace(/[\s-]+/g, '_');
      const isAllotted =
        clean === 'ALLOTMENT_COMPLETED' ||
        clean === 'ALLOTMENT_OUT' ||
        clean === 'ALLOTMENT' ||
        clean === 'ALLOTTED' ||
        clean === 'ALLOTTED_AVAILABLE' ||
        clean === 'LISTING_PENDING' ||
        clean === 'LISTING_UPCOMING' ||
        clean === 'LISTED' ||
        clean.includes('ALLOT') ||
        clean.includes('LIST');

      if (isAllotted) {
        if (item.id) allottedSet.add(String(item.id).toLowerCase());
        if (item.symbol) allottedSet.add(String(item.symbol).toLowerCase().trim());
        if (item.company_name) allottedSet.add(String(item.company_name).toLowerCase().trim());
        if (item.ipo_name) allottedSet.add(String(item.ipo_name).toLowerCase().trim());
      }
    };

    ipos.forEach(checkAndAdd);
    ipoHubItems.forEach(checkAndAdd);

    const names = new Set<string>();
    for (const app of applications) {
      if (!app.ipo_name) continue;
      const appNameLower = app.ipo_name.toLowerCase().trim();
      const appIpoId = app.ipo_id ? String(app.ipo_id).toLowerCase() : '';
      const appStatus = (app.status || '').toLowerCase();

      const isAppHoldingOrSold =
        appStatus === 'holding' ||
        appStatus === 'sold' ||
        appStatus === 'allotted' ||
        appStatus === 'partially allotted';

      const isHubAllotted =
        (appIpoId && allottedSet.has(appIpoId)) ||
        allottedSet.has(appNameLower);

      if (isAppHoldingOrSold || isHubAllotted) {
        names.add(app.ipo_name);
      }
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [applications, ipos, ipoHubItems]);

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

  // ── Merge broker-backed live portfolio with local applications ──────────
  const effectiveApplications = useMemo(() => {
    return enrichApplicationsWithBrokerData(
      applications,
      ipos,
      brokerPortfolio?.investments,
      marketQuotes,
    );
  }, [applications, brokerPortfolio, ipos, marketQuotes]);

  // ── base filter (user / year / IPO) ──────────────────────────────
  const baseFilteredApps = effectiveApplications.filter((a) => {
    if (filterUserIds.length > 0 && !filterUserIds.includes(a.user_id)) return false;
    if (filterIpoNames.length > 0 && !filterIpoNames.includes(a.ipo_name ?? '')) return false;
    if (filterYear) {
      const y = a.open_date ? a.open_date.slice(0, 4) : '';
      if (y !== filterYear) return false;
    }
    return true;
  });

  const holdingApplications = useMemo(() => {
    return baseFilteredApps.filter((a) => a.status === 'Holding');
  }, [baseFilteredApps]);

  const totalHoldingCurrentValue = useMemo(() => {
    return holdingApplications.reduce((sum, app) => {
      const qty = app.shares_count ?? app.quantity;
      const curPrice = app.sell_price ?? app.buy_price;
      return sum + curPrice * qty;
    }, 0);
  }, [holdingApplications]);

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
  const hasFilter = filterUserIds.length > 0 || filterIpoNames.length > 0 || filterYear !== null;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const filterUserNames = filterUserIds
    .map((uid) => applications.find((a) => a.user_id === uid)?.user_name)
    .filter(Boolean) as string[];
  const filterChipLabel = [...filterUserNames, ...(filterYear ? [filterYear] : []), ...filterIpoNames].join(' · ');

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
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>IPOVAULT</Text>
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
            placeholder="Search users or IPOs…"
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
          <RefreshControl refreshing={isLoading || refreshingIpoHub} onRefresh={handleDashboardRefresh} tintColor={colors.primary} />
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
              onPress={() => { setFilterUserIds([]); setFilterIpoNames([]); setFilterYear(null); }}
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
                style={[
                  styles.viewReportBtn,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                    borderColor: isDark ? '#374151' : '#E5E7EB',
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.viewReportText, { color: colors.foreground }]}>
                  View Report
                </Text>
                <Feather name="chevron-right" size={13} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* 3 Columns Row with Dividers */}
            <View style={styles.portfolioMetricsRow}>
              {/* Column 1: Gross Profit (shifted 15px left) */}
              <View style={[styles.portfolioCell, styles.portfolioCellLeft]}>
                <View
                  style={[
                    styles.portfolioIconWrap,
                    {
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.10)',
                    },
                  ]}
                >
                  <Feather
                    name="trending-up"
                    size={18}
                    color={isDark ? '#34D399' : '#059669'}
                  />
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
                <View
                  style={[
                    styles.portfolioIconWrap,
                    {
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.10)',
                    },
                  ]}
                >
                  <Feather
                    name="briefcase"
                    size={18}
                    color={isDark ? '#818CF8' : '#4F46E5'}
                  />
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
                <View
                  style={[
                    styles.portfolioIconWrap,
                    {
                      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.10)',
                    },
                  ]}
                >
                  <Feather
                    name="percent"
                    size={18}
                    color={isDark ? '#FBBF24' : '#D97706'}
                  />
                </View>
                <Text style={[styles.portfolioVal, { color: colors.foreground }]}>
                  {formatCurrency(totalTax + totalUserCut).replace(/,/g, '')}
                </Text>
                <Text style={[styles.portfolioLabel, { color: colors.mutedForeground }]}>
                  Charges
                </Text>
              </View>
            </View>

            {/* ── Connected Broker IPO Holdings Section (Only when broker is connected) ── */}
            {isBrokerConnected && (
              <View style={[styles.dashboardHoldingsSection, { borderTopColor: colors.border }]}>
                {/* Holdings Header with Expand/Collapse Toggle */}
                <TouchableOpacity
                  style={[
                    styles.dashboardHoldingsHeader,
                    !isHoldingsExpanded && { marginBottom: 0 },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setIsHoldingsExpanded((prev) => !prev)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="layers" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.dashboardHoldingsTitle, { color: colors.mutedForeground }]}>
                      IPO HOLDINGS ({holdingApplications.length})
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {holdingApplications.length > 0 && (
                      <Text style={[styles.dashboardHoldingsTotalVal, { color: colors.foreground }]}>
                        Total: {formatCurrency(totalHoldingCurrentValue)}
                      </Text>
                    )}
                    <Feather
                      name={isHoldingsExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.mutedForeground}
                    />
                  </View>
                </TouchableOpacity>

                {/* Holdings Rows (Expandable) */}
                {isHoldingsExpanded && (
                  loadingHoldings && holdingApplications.length === 0 ? (
                    <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={[styles.dashboardHoldingsEmptyText, { color: colors.mutedForeground }]}>
                        Updating live broker holdings…
                      </Text>
                    </View>
                  ) : holdingApplications.length === 0 ? (
                    <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                      <Text style={[styles.dashboardHoldingsEmptyText, { color: colors.mutedForeground }]}>
                        No active IPO shares currently held.
                      </Text>
                    </View>
                  ) : (
                    holdingApplications.map((app, idx) => {
                      const qty = app.shares_count ?? app.quantity;
                      const currentPrice = app.sell_price ?? app.buy_price;
                      const buyVal = calcBuyValue(app.buy_price, qty);
                      const holdingVal = currentPrice * qty;
                      const grossPL = holdingVal - buyVal;
                      const gainPct = buyVal > 0 ? (grossPL / buyVal) * 100 : 0;
                      const isPos = grossPL >= 0;
                      const pnlColor = isPos
                        ? isDark
                          ? '#34D399'
                          : '#10B981'
                        : isDark
                        ? '#F87171'
                        : '#EF4444';
                      const hasBorder = idx < holdingApplications.length - 1;

                      return (
                        <View
                          key={app.id || `${app.ipo_id}-${idx}`}
                          style={[
                            styles.dashboardHoldingRow,
                            hasBorder && {
                              borderBottomColor: isDark
                                ? 'rgba(255,255,255,0.06)'
                                : 'rgba(0,0,0,0.05)',
                              borderBottomWidth: 1,
                            },
                          ]}
                        >
                          {/* Left: IPO Name & Qty */}
                          <View style={styles.dashboardHoldingLeft}>
                            <Text
                              style={[
                                styles.dashboardHoldingName,
                                { color: colors.foreground },
                              ]}
                              numberOfLines={1}
                            >
                              {app.ipo_name}
                            </Text>
                            <Text
                              style={[
                                styles.dashboardHoldingQty,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              Qty:{' '}
                              <Text
                                style={{
                                  fontFamily: 'SpaceMono_700Bold',
                                  color: colors.foreground,
                                }}
                              >
                                {qty}
                              </Text>
                              {currentPrice > 0
                                ? `  •  LTP: ₹${currentPrice.toFixed(2)}`
                                : ''}
                            </Text>
                          </View>

                          {/* Right: Holding Value & Unrealized P&L */}
                          <View style={styles.dashboardHoldingRight}>
                            <Text
                              style={[
                                styles.dashboardHoldingValue,
                                { color: colors.foreground },
                              ]}
                            >
                              {formatCurrency(holdingVal)}
                            </Text>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 3,
                                marginTop: 2,
                              }}
                            >
                              <Feather
                                name={isPos ? 'arrow-up-right' : 'arrow-down-right'}
                                size={11}
                                color={pnlColor}
                              />
                              <Text
                                style={[
                                  styles.dashboardHoldingPnl,
                                  { color: pnlColor },
                                ]}
                              >
                                {isPos ? '+' : ''}
                                {formatCurrency(grossPL)} (
                                {isPos ? '+' : ''}
                                {gainPct.toFixed(1)}%)
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )
                )}
              </View>
            )}
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


        {/* Performance chart — Line */}
        <PerformanceChart applications={baseFilteredApps} />

        {/* Leaderboard */}
        <Leaderboard applications={baseFilteredApps} searchQuery={searchQuery} />
      </ScrollView>

      <FilterSheet
        visible={showFilter}
        filterUserIds={filterUserIds}
        filterBrokers={[]}
        filterYear={filterYear}
        filterIpoNames={filterIpoNames}
        filterBankNames={[]}
        hideBank={true}
        hideBroker={true}
        customIpoNames={allottedIpoNames}
        onFilterChange={(uids, _brokers, year, ipos) => {
          setFilterUserIds(uids);
          setFilterYear(year);
          setFilterIpoNames(ipos);
        }}
        onClose={() => setShowFilter(false)}
      />

      <BulkApplySheet
        visible={showBulkSheet}
        onClose={() => setShowBulkSheet(false)}
      />

      {allotmentModalState && (
        <AllotmentSuccessModal
          visible={showAllotmentModal}
          ipoId={allotmentModalState.ipoId}
          ipoName={allotmentModalState.ipoName}
          companyName={allotmentModalState.companyName}
          results={allotmentModalState.results}
          onClose={dismissAllotmentModal}
          onViewDetails={() => {
            router.push({
              pathname: '/allotment-checker',
              params: { ipoId: allotmentModalState.ipoId },
            } as any);
          }}
        />
      )}
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
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  viewReportText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
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
  dashboardHoldingsSection: {
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  dashboardHoldingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  dashboardHoldingsTitle: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  dashboardHoldingsTotalVal: {
    fontSize: 11,
    fontFamily: 'SpaceMono_700Bold',
  },
  dashboardHoldingsEmptyText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },
  dashboardHoldingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 2,
  },
  dashboardHoldingLeft: {
    flex: 1,
    paddingRight: 10,
  },
  dashboardHoldingName: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginBottom: 2,
  },
  dashboardHoldingQty: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  dashboardHoldingRight: {
    alignItems: 'flex-end',
  },
  dashboardHoldingValue: {
    fontSize: 13,
    fontFamily: 'SpaceMono_700Bold',
  },
  dashboardHoldingPnl: {
    fontSize: 10.5,
    fontFamily: 'SpaceMono_700Bold',
  },
});
