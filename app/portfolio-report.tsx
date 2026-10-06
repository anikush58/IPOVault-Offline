import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
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
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import {
  brokerApiService,
  UserPortfolioSummaryResponse,
} from '@/services/broker/BrokerApiService';
import { IconButton } from '@/components/ui/IconButton';
import { ProfitSummaryDonutCard } from '@/components/ProfitSummaryDonutCard';
import { FilterSheet } from '@/components/FilterSheet';
import { Tabs } from '@/components/ui/Tabs';
import { calculateAppTaxAndNet, calcBuyValue } from '@/utils/calculations';
import { formatCurrency, getResolvedLogoUrl } from '@/utils/formatters';
import {
  enrichApplicationsWithBrokerData,
  resolveCanonicalBrokerUserId,
  extractHoldingInstrumentsForQuotes,
} from '@/utils/brokerMatching';
import { MarketQuotesMap } from '@/services/broker/BrokerApiService';

type TabType = 'profits' | 'holding' | 'charges';

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

function CompanyAvatar({
  ipoName,
  logoUrl,
  isDark,
}: {
  ipoName: string;
  logoUrl?: string | null;
  isDark: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = (ipoName || 'IPO')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'IPO';
  const grad = getAvatarGradient(ipoName || 'IPO');
  const resolvedLogo = getResolvedLogoUrl(logoUrl, undefined, ipoName);

  return (
    <View
      style={[
        styles.avatarWrap,
        {
          backgroundColor: '#FFFFFF',
          borderColor: isDark ? '#334155' : '#E5E7EB',
        },
      ]}
    >
      {resolvedLogo && !imgError ? (
        <Image
          source={{ uri: resolvedLogo }}
          style={styles.avatarImage}
          resizeMode="contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarCircle}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </LinearGradient>
      )}
    </View>
  );
}

function parseAppDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const str = dateStr.trim();
  const parts = str.split(/[-/ T]/);
  if (parts.length >= 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && year > 1900 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

export default function PortfolioReportScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { user: authUser } = useAuth();
  const { applications, users, ipos, isLoading, refresh } = useDB();

  const [activeTab, setActiveTab] = useState<TabType>('profits');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('All Time');

  // Filter state
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const activeUserId = useMemo(() => {
    return resolveCanonicalBrokerUserId(authUser, users);
  }, [authUser, users]);

  const [brokerPortfolio, setBrokerPortfolio] =
    useState<UserPortfolioSummaryResponse | null>(null);
  const [marketQuotes, setMarketQuotes] = useState<MarketQuotesMap>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBrokerPortfolio = useCallback(async () => {
    if (!activeUserId) return;
    try {
      const data = await brokerApiService.getUserPortfolio(activeUserId);
      setBrokerPortfolio(data);

      const holdingInstruments = extractHoldingInstrumentsForQuotes(applications, ipos);
      if (holdingInstruments.length > 0) {
        const quotes = await brokerApiService.getMarketQuotes(activeUserId, holdingInstruments);
        if (quotes && Object.keys(quotes).length > 0) {
          setMarketQuotes(quotes);
        }
      }
    } catch (err) {
      console.warn('[PortfolioReport] Failed to fetch broker portfolio:', err);
    }
  }, [activeUserId]);

  useEffect(() => {
    loadBrokerPortfolio();
  }, [loadBrokerPortfolio]);

  // Merge broker-backed data with local applications
  const effectiveApplications = useMemo(() => {
    return enrichApplicationsWithBrokerData(
      applications,
      ipos,
      brokerPortfolio?.investments,
      marketQuotes,
    );
  }, [applications, brokerPortfolio, ipos, marketQuotes]);

  // List of unique IPO names available in user portfolio
  const reportIpoNames = useMemo(() => {
    const names = new Set<string>();
    for (const a of effectiveApplications) {
      if ((a.status === 'Sold' || a.status === 'Holding') && a.ipo_name) {
        names.add(a.ipo_name);
      }
    }
    return Array.from(names).sort();
  }, [effectiveApplications]);

  // Filter applications by selected User, IPO and Year
  const baseFilteredApps = useMemo(() => {
    return effectiveApplications.filter((a) => {
      if (filterUserIds.length > 0 && !filterUserIds.includes(a.user_id)) return false;
      if (filterIpoNames.length > 0 && !filterIpoNames.includes(a.ipo_name ?? '')) return false;
      if (filterYear) {
        const dateStr = a.sale_date || (a as any).updated_at || (a as any).created_at || a.open_date || '';
        const appDate = parseAppDate(dateStr);
        if (appDate && String(appDate.getFullYear()) !== filterYear) return false;
        if (!appDate && a.open_date && a.open_date.slice(0, 4) !== filterYear) return false;
      }
      return true;
    });
  }, [effectiveApplications, filterUserIds, filterIpoNames, filterYear]);

  const hasFilter = filterUserIds.length > 0 || filterIpoNames.length > 0 || filterYear !== null;

  const filterUserNames = useMemo(() => {
    return filterUserIds
      .map((uid) => users.find((u) => u.id === uid)?.name || applications.find((a) => a.user_id === uid)?.user_name)
      .filter(Boolean) as string[];
  }, [filterUserIds, users, applications]);

  const filterChipLabel = useMemo(() => {
    const parts = [...filterUserNames, ...filterIpoNames];
    if (filterYear) parts.push(filterYear);
    return parts.join(' · ');
  }, [filterUserNames, filterIpoNames, filterYear]);

  // Compute tab counts based on current period and user/ipo filters
  const tabCounts = useMemo(() => {
    let profits = 0;
    let holding = 0;
    let charges = 0;

    for (const a of baseFilteredApps) {
      if (selectedPeriod !== 'All Time') {
        const dateStr = a.sale_date || (a as any).updated_at || (a as any).created_at;
        const appDate = parseAppDate(dateStr);
        if (appDate) {
          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          const lastMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
          const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

          if (selectedPeriod === 'This Month') {
            if (appDate.getMonth() !== currentMonth || appDate.getFullYear() !== currentYear) continue;
          } else if (selectedPeriod === 'Last Month') {
            if (appDate.getMonth() !== lastMonthIndex || appDate.getFullYear() !== lastMonthYear) continue;
          } else if (selectedPeriod === 'This Year') {
            if (appDate.getFullYear() !== currentYear) continue;
          }
        }
      }

      if (a.status === 'Sold') profits++;
      if (a.status === 'Holding') holding++;

      const { tax, userCut } = calculateAppTaxAndNet(a);
      if ((tax > 0 || userCut > 0) && (a.status === 'Sold' || a.status === 'Holding')) {
        charges++;
      }
    }

    return { profits, holding, charges };
  }, [baseFilteredApps, selectedPeriod]);

  // Compute portfolio totals and vs last month comparison according to selected period and user/ipo filters
  const { totals, vsLastMonthPct, isVsLastMonthUp } = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const lastMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthEnd = new Date(lastMonthYear, lastMonthIndex + 1, 0, 23, 59, 59, 999);

    let grossProfit = 0;
    let holdingProfit = 0;
    let totalTax = 0;
    let totalUserCut = 0;
    let thisMonthGross = 0;
    let lastMonthGross = 0;

    for (const a of baseFilteredApps) {
      if (a.status === 'Sold' || a.status === 'Holding') {
        const { grossPL, tax, userCut, netPL, isHolding } = calculateAppTaxAndNet(a);

        // Date check for period filtering
        const dateStr = a.sale_date || (a as any).updated_at || (a as any).created_at || a.open_date || '';
        const appDate = parseAppDate(dateStr);

        let matchPeriod = true;
        if (selectedPeriod !== 'All Time') {
          if (appDate) {
            if (selectedPeriod === 'This Month') {
              matchPeriod = appDate.getMonth() === currentMonth && appDate.getFullYear() === currentYear;
            } else if (selectedPeriod === 'Last Month') {
              matchPeriod = appDate.getMonth() === lastMonthIndex && appDate.getFullYear() === lastMonthYear;
            } else if (selectedPeriod === 'This Year') {
              matchPeriod = appDate.getFullYear() === currentYear;
            }
          }
        }

        if (a.status === 'Sold') {
          if (appDate) {
            if (appDate.getMonth() === currentMonth && appDate.getFullYear() === currentYear) {
              thisMonthGross += grossPL;
            } else if (appDate.getMonth() === lastMonthIndex && appDate.getFullYear() === lastMonthYear) {
              lastMonthGross += grossPL;
            }
          }
        } else if (a.status === 'Holding') {
          const holdingDate = parseAppDate(a.open_date || (a as any).created_at || (a as any).updated_at);
          thisMonthGross += grossPL;
          if (!holdingDate || holdingDate.getTime() <= lastMonthEnd.getTime()) {
            lastMonthGross += grossPL;
          }
        }

        if (matchPeriod) {
          grossProfit += grossPL;
          totalTax += tax;
          totalUserCut += userCut;
          if (isHolding) {
            holdingProfit += netPL;
          }
        }
      }
    }

    const totalCharges = totalTax + totalUserCut;
    const netRealizedProfit = grossProfit - totalCharges;

    let vsPct = 0;
    let isUp = true;

    if (lastMonthGross === 0) {
      if (thisMonthGross > 0) {
        vsPct = 100;
        isUp = true;
      } else if (thisMonthGross < 0) {
        vsPct = 100;
        isUp = false;
      } else {
        vsPct = 0;
        isUp = true;
      }
    } else {
      const diff = thisMonthGross - lastMonthGross;
      vsPct = Math.round(Math.abs((diff / Math.abs(lastMonthGross)) * 100) * 10) / 10;
      isUp = diff >= 0;
    }

    return {
      totals: { grossProfit, holdingProfit, totalTax, totalUserCut, totalCharges, netRealizedProfit },
      vsLastMonthPct: vsPct,
      isVsLastMonthUp: isUp,
    };
  }, [baseFilteredApps, selectedPeriod]);

  // Filter applications by search query, period, user/ipo and tab
  const filteredApps = useMemo(() => {
    let list = baseFilteredApps.filter((a) => {
      if (selectedPeriod !== 'All Time') {
        const dateStr = a.sale_date || (a as any).updated_at || (a as any).created_at;
        const appDate = parseAppDate(dateStr);
        if (appDate) {
          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          const lastMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
          const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

          if (selectedPeriod === 'This Month') {
            if (appDate.getMonth() !== currentMonth || appDate.getFullYear() !== currentYear) return false;
          } else if (selectedPeriod === 'Last Month') {
            if (appDate.getMonth() !== lastMonthIndex || appDate.getFullYear() !== lastMonthYear) return false;
          } else if (selectedPeriod === 'This Year') {
            if (appDate.getFullYear() !== currentYear) return false;
          }
        }
      }

      if (activeTab === 'profits') return a.status === 'Sold';
      if (activeTab === 'holding') return a.status === 'Holding';
      if (activeTab === 'charges') {
        const { tax, userCut } = calculateAppTaxAndNet(a);
        return (tax > 0 || userCut > 0) && (a.status === 'Sold' || a.status === 'Holding');
      }
      return true;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.user_name.toLowerCase().includes(q) ||
          (a.user_broker ?? '').toLowerCase().includes(q) ||
          (a.ipo_name ?? '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      const dateA = (a as any).updated_at || (a as any).created_at || '';
      const dateB = (b as any).updated_at || (b as any).created_at || '';
      if (dateA && dateB) {
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }
      return String(b.id).localeCompare(String(a.id));
    });
  }, [baseFilteredApps, activeTab, searchQuery, selectedPeriod]);

  const toggleSearch = () => {
    if (showSearch) {
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: isDark ? colors.background : '#F7F7F9' }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        
        <View style={[styles.headerCenter, { top: topPad, bottom: 0 }]} pointerEvents="none">
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>REPORTS</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Portfolio Report</Text>
        </View>

        <View style={styles.headerActions}>
          <IconButton
            name={showSearch ? 'x' : 'search'}
            iconSize={showSearch ? 15 : 18}
            variant={showSearch || searchQuery.length > 0 ? 'primary' : 'surface'}
            size="md"
            onPress={toggleSearch}
          />
          <IconButton
            name="sliders"
            iconSize={17}
            variant={hasFilter ? 'primary' : 'surface'}
            size="md"
            onPress={() => setShowFilter(true)}
          />
        </View>
      </View>

      {/* Collapsible Search Input Bar */}
      {showSearch && (
        <View style={[styles.searchBarHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by user, broker or IPO…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Active filter chip bar */}
      {hasFilter && (
        <View style={[styles.filterBar, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
          <Feather name="filter" size={12} color={colors.primary} />
          <Text style={[styles.filterBarText, { color: colors.primary }]} numberOfLines={1}>
            {filterChipLabel}
          </Text>
          <TouchableOpacity onPress={() => { setFilterUserIds([]); setFilterIpoNames([]); setFilterYear(null); }} hitSlop={8}>
            <Feather name="x" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={async () => {
              setIsRefreshing(true);
              try {
                await Promise.all([refresh(), loadBrokerPortfolio()]);
              } finally {
                setIsRefreshing(false);
              }
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Child 0: Profit Summary Donut Chart Card */}
        <View style={styles.chartSection}>
          <ProfitSummaryDonutCard
            grossProfit={totals.grossProfit}
            holdingProfit={totals.holdingProfit}
            totalCharges={totals.totalCharges}
            netRealizedProfit={totals.netRealizedProfit}
            totalTax={totals.totalTax}
            totalUserCut={totals.totalUserCut}
            vsLastMonthPct={vsLastMonthPct}
            isVsLastMonthUp={isVsLastMonthUp}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
          />
        </View>

        {/* Child 1: Sticky Pill/Chip Style Tab Selection */}
        <View style={[styles.chipTabContainer, { backgroundColor: colors.background }]}>
          <Tabs
            variant="pills"
            height={36}
            tabs={[
              { key: 'profits', label: 'All Profits', count: tabCounts.profits },
              { key: 'holding', label: 'Holding Profits', count: tabCounts.holding },
              { key: 'charges', label: 'All Charges', count: tabCounts.charges },
            ]}
            activeTab={activeTab}
            onChange={(key) => setActiveTab(key as TabType)}
          />
        </View>

        {/* List Section */}
        <View style={styles.listSection}>
          {filteredApps.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E5E7EB' }]}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Records Found</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {activeTab === 'profits'
                  ? 'No sold applications recorded yet.'
                  : activeTab === 'holding'
                  ? 'No active holdings found.'
                  : 'No tax or fee charges recorded.'}
              </Text>
            </View>
          ) : (
            filteredApps.map((item) => {
              const { grossPL, tax, userCut, netPL } = calculateAppTaxAndNet(item);
              const buyVal = calcBuyValue(item.buy_price, item.quantity);
              const totalCharges = tax + userCut;
              const netPLPct = buyVal > 0 ? (netPL / buyVal) * 100 : 0;
              const logoUrl = item.ipo_logo_url || (item as any).logo_url;

              const isSme = ((item as any).issue_type || (item as any).marketSegment || '').toUpperCase().includes('SME');
              const issueTypeLabel = isSme ? 'SME' : 'Mainboard';

              return (
                <View
                  key={item.id}
                  style={[
                    styles.reportCard,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F4F5F7',
                      borderColor: isDark ? '#334155' : '#E5E7EB',
                    },
                  ]}
                >
                  {/* Top Header Row: Avatar + Title & Subtitle on Left, Badges on Right */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.headerLeftWrap}>
                      <CompanyAvatar
                        ipoName={item.ipo_name || 'IPO'}
                        logoUrl={logoUrl}
                        isDark={isDark}
                      />

                      <View style={styles.titleWrap}>
                        <Text
                          style={[styles.companyTitle, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {item.ipo_name || 'IPO Application'}
                        </Text>
                        <Text
                          style={[styles.subtitleText, { color: isDark ? '#94A3B8' : '#64748B' }]}
                          numberOfLines={1}
                        >
                          {item.user_name} • {item.user_broker || 'No Broker'} • {item.quantity} Qty
                        </Text>
                      </View>
                    </View>

                    {/* Right Badges */}
                    <View style={styles.badgesRow}>
                      {/* Issue Type Pill */}
                      <View
                        style={[
                          styles.issueTypePill,
                          isSme
                            ? {
                                backgroundColor: isDark ? 'rgba(236,72,153,0.12)' : '#FDF2F8',
                                borderColor: isDark ? 'rgba(244,114,182,0.4)' : '#FBCFE8',
                              }
                            : {
                                backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF',
                                borderColor: isDark ? 'rgba(199,210,254,0.4)' : '#C7D2FE',
                              },
                        ]}
                      >
                        <Text
                          style={[
                            styles.issueTypeText,
                            { color: isSme ? (isDark ? '#F472B6' : '#BE185D') : (isDark ? '#818CF8' : '#4F46E5') },
                          ]}
                        >
                          {issueTypeLabel}
                        </Text>
                      </View>

                      {/* Status Pill */}
                      <View
                        style={[
                          styles.statusPill,
                          item.status === 'Sold'
                            ? {
                                backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4',
                                borderColor: isDark ? 'rgba(134,239,172,0.4)' : '#86EFAC',
                              }
                            : item.status === 'Holding'
                            ? {
                                backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#EFF6FF',
                                borderColor: isDark ? 'rgba(147,197,253,0.4)' : '#93C5FD',
                              }
                            : {
                                backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
                                borderColor: isDark ? 'rgba(251,191,36,0.4)' : '#FDE68A',
                              },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            {
                              color:
                                item.status === 'Sold'
                                  ? (isDark ? '#4ADE80' : '#15803D')
                                  : item.status === 'Holding'
                                  ? (isDark ? '#60A5FA' : '#1D4ED8')
                                  : (isDark ? '#FBBF24' : '#D97706'),
                            },
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Inner Data Card (Matching IPOCard innerDataCard) */}
                  <View
                    style={[
                      styles.innerDataCard,
                      {
                        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                        borderColor: isDark ? '#334155' : '#E5E7EB',
                      },
                    ]}
                  >
                    {/* Row 1: Trade Details Grid (Buy Price | Sell / Est Price | Invested) */}
                    <View style={styles.dataRow}>
                      <View style={styles.dataColLeft}>
                        <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                          BUY PRICE
                        </Text>
                        <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                          {formatCurrency(item.buy_price || 0)}
                        </Text>
                      </View>

                      <View style={styles.dataColCenter}>
                        <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                          {activeTab === 'holding' ? 'EST. PRICE' : 'SELL PRICE'}
                        </Text>
                        <Text
                          style={[
                            styles.dataVal,
                            {
                              color:
                                item.sell_price != null
                                  ? item.sell_price >= (item.buy_price || 0)
                                    ? '#10B981'
                                    : '#EF4444'
                                  : colors.mutedForeground,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.sell_price != null ? formatCurrency(item.sell_price) : '—'}
                        </Text>
                      </View>

                      <View style={styles.dataColRight}>
                        <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                          INVESTED
                        </Text>
                        <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                          {formatCurrency(buyVal)}
                        </Text>
                      </View>
                    </View>

                    {/* Divider Line */}
                    <View
                      style={[
                        styles.innerDivider,
                        { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' },
                      ]}
                    />

                    {/* Row 2: Performance / Financial Metrics Grid */}
                    <View style={styles.dataRow}>
                      {activeTab === 'charges' ? (
                        <>
                          <View style={styles.dataColLeft}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              TAX (STCG)
                            </Text>
                            <Text style={[styles.dataVal, { color: '#EF4444' }]} numberOfLines={1}>
                              {formatCurrency(tax)}
                            </Text>
                          </View>

                          <View style={styles.dataColCenter}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              USER CUT
                            </Text>
                            <Text style={[styles.dataVal, { color: '#EF4444' }]} numberOfLines={1}>
                              {formatCurrency(userCut)}
                            </Text>
                          </View>

                          <View style={styles.dataColRight}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              TOTAL CHARGES
                            </Text>
                            <Text style={[styles.dataValHighlight, { color: '#EF4444' }]} numberOfLines={1}>
                              {formatCurrency(totalCharges)}
                            </Text>
                          </View>
                        </>
                      ) : activeTab === 'holding' ? (
                        <>
                          <View style={styles.dataColLeft}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              GROSS P&L
                            </Text>
                            <Text
                              style={[
                                styles.dataVal,
                                { color: grossPL >= 0 ? '#10B981' : '#EF4444' },
                              ]}
                              numberOfLines={1}
                            >
                              {grossPL >= 0 ? '+' : ''}{formatCurrency(grossPL)}
                            </Text>
                          </View>

                          <View style={styles.dataColCenter}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              EST. CHARGES
                            </Text>
                            <Text style={[styles.dataVal, { color: '#EF4444' }]} numberOfLines={1}>
                              {formatCurrency(totalCharges)}
                            </Text>
                          </View>

                          <View style={styles.dataColRight}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              NET P&L (EST)
                            </Text>
                            <Text
                              style={[
                                styles.dataValHighlight,
                                { color: netPL >= 0 ? '#10B981' : '#EF4444' },
                              ]}
                              numberOfLines={1}
                            >
                              {netPL >= 0 ? '+' : ''}{formatCurrency(netPL)} ({netPLPct >= 0 ? '+' : ''}{netPLPct.toFixed(1)}%)
                            </Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.dataColLeft}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              GROSS P&L
                            </Text>
                            <Text
                              style={[
                                styles.dataVal,
                                { color: grossPL >= 0 ? '#10B981' : '#EF4444' },
                              ]}
                              numberOfLines={1}
                            >
                              {grossPL >= 0 ? '+' : ''}{formatCurrency(grossPL)}
                            </Text>
                          </View>

                          <View style={styles.dataColCenter}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              CHARGES
                            </Text>
                            <Text style={[styles.dataVal, { color: '#EF4444' }]} numberOfLines={1}>
                              -{formatCurrency(totalCharges)}
                            </Text>
                          </View>

                          <View style={styles.dataColRight}>
                            <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              NET REALIZED
                            </Text>
                            <Text
                              style={[
                                styles.dataValHighlight,
                                { color: netPL >= 0 ? '#10B981' : '#EF4444' },
                              ]}
                              numberOfLines={1}
                            >
                              {netPL >= 0 ? '+' : ''}{formatCurrency(netPL)} ({netPLPct >= 0 ? '+' : ''}{netPLPct.toFixed(1)}%)
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
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
        customIpoNames={reportIpoNames.length > 0 ? reportIpoNames : undefined}
        onFilterChange={(uids, _brokers, year, ipoList) => {
          setFilterUserIds(uids);
          setFilterYear(year);
          setFilterIpoNames(ipoList);
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  filterBarText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  searchBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', paddingVertical: 0 },
  chartSection: { paddingHorizontal: 16, paddingTop: 14 },
  chipTabContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, zIndex: 10 },
  listSection: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },

  // Outer Card matching IPOCard style
  reportCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 12,
    paddingBottom: 5,
    paddingLeft: 5,
    paddingRight: 5,
    gap: 10,
  },

  // Header Row
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 7,
    gap: 8,
  },
  headerLeftWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarCircle: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold' },

  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  companyTitle: {
    fontSize: 15.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  subtitleText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },

  // Right Badges
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  issueTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueTypeText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  // Inner White/Dark Data Card
  innerDataCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dataColLeft: {
    flex: 1.1,
    alignItems: 'flex-start',
  },
  dataColCenter: {
    flex: 1.1,
    alignItems: 'center',
  },
  dataColRight: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  dataLabel: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dataVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2.5,
  },
  dataValHighlight: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2.5,
  },
  innerDivider: {
    height: 1,
    width: '100%',
  },

  emptyCard: { borderRadius: 24, borderWidth: 1, alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold' },
  emptyText: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center' },
});
