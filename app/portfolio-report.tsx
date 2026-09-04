import React, { useState, useMemo } from 'react';
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
import { useDB } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { ProfitSummaryDonutCard } from '@/components/ProfitSummaryDonutCard';
import { Tabs } from '@/components/ui/Tabs';
import { calculateAppTaxAndNet, calcBuyValue } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

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

function CompanyAvatar({ ipoName, logoUrl }: { ipoName: string; logoUrl?: string | null }) {
  const [imgError, setImgError] = useState(false);
  const initials = (ipoName || 'IPO').trim().charAt(0).toUpperCase();
  const grad = getAvatarGradient(ipoName || 'IPO');

  if (logoUrl && typeof logoUrl === 'string' && logoUrl.trim().length > 0 && !imgError) {
    return (
      <Image
        source={{ uri: logoUrl.trim() }}
        style={styles.avatarImage}
        resizeMode="contain"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <LinearGradient colors={grad} style={styles.avatarCircle}>
      <Text style={styles.avatarText}>{initials}</Text>
    </LinearGradient>
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
  const { applications, isLoading, refresh } = useDB();

  const [activeTab, setActiveTab] = useState<TabType>('profits');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('All Time');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Compute tab counts based on current period filter
  const tabCounts = useMemo(() => {
    let profits = 0;
    let holding = 0;
    let charges = 0;

    for (const a of applications) {
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
  }, [applications, selectedPeriod]);

  // Compute portfolio totals and vs last month comparison according to selected period
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

    for (const a of applications) {
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
  }, [applications, selectedPeriod]);

  // Filter applications by search query, period and tab
  const filteredApps = useMemo(() => {
    let list = applications.filter((a) => {
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
  }, [applications, activeTab, searchQuery, selectedPeriod]);

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
      {/* Header Bar with Right Search Action (Toggles between Search & Close Icon) */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: isDark ? colors.background : '#F7F7F9' }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>REPORTS</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Portfolio Report</Text>
        </View>

        <IconButton
          name={showSearch ? 'x' : 'search'}
          iconSize={showSearch ? 15 : 18}
          variant={showSearch || searchQuery.length > 0 ? 'primary' : 'surface'}
          size="md"
          onPress={toggleSearch}
        />
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />}
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
            scrollable
            tabs={[
              { key: 'profits', label: 'All Profits', count: tabCounts.profits },
              { key: 'holding', label: 'Holding Profits', count: tabCounts.holding },
              { key: 'charges', label: 'All Charges', count: tabCounts.charges },
            ]}
            activeTab={activeTab}
            onChange={(key) => setActiveTab(key as TabType)}
            style={{ paddingVertical: 4 }}
          />
        </View>

        {/* List Section */}
        <View style={styles.listSection}>
          {filteredApps.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: colors.border }]}>
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

              return (
                <View
                  key={item.id}
                  style={[
                    styles.reportCard,
                    { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.border },
                  ]}
                >
                  {/* Card Header: Company Logo / Initial Avatar + IPO Name & Subtitle + Sold/Holding Status Badge */}
                  <View style={styles.reportCardHeader}>
                    <View style={styles.headerLeftCol}>
                      <CompanyAvatar ipoName={item.ipo_name || 'IPO'} logoUrl={logoUrl} />

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.appName, { color: colors.foreground }]} numberOfLines={1}>
                          {item.ipo_name || 'IPO Application'}
                        </Text>
                        <Text style={[styles.appSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {item.user_name} • {item.user_broker || 'No Broker'} • {item.quantity} Qty
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            item.status === 'Sold'
                              ? colors.statusSoldBg
                              : item.status === 'Holding'
                              ? colors.statusHoldingBg
                              : isDark ? 'rgba(245,158,11,0.16)' : '#FFFBEB',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              item.status === 'Sold'
                                ? colors.statusSold
                                : item.status === 'Holding'
                                ? colors.statusHolding
                                : '#F59E0B',
                          },
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                  </View>

                  {/* Compact Trade Info Banner */}
                  <View
                    style={[
                      styles.priceRow,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
                      },
                    ]}
                  >
                    <View style={styles.priceCell}>
                      <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>BUY PRICE</Text>
                      <Text style={[styles.priceVal, { color: colors.foreground }]}>
                        {formatCurrency(item.buy_price || 0)}
                      </Text>
                    </View>

                    <View style={[styles.priceDivider, { backgroundColor: colors.border }]} />

                    <View style={styles.priceCell}>
                      <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>
                        {activeTab === 'holding' ? 'EST. PRICE' : 'SELL PRICE'}
                      </Text>
                      <Text
                        style={[
                          styles.priceVal,
                          {
                            color:
                              item.sell_price != null
                                ? item.sell_price >= (item.buy_price || 0)
                                  ? colors.positive
                                  : colors.negative
                                : colors.mutedForeground,
                          },
                        ]}
                      >
                        {item.sell_price != null ? formatCurrency(item.sell_price) : '—'}
                      </Text>
                    </View>

                    <View style={[styles.priceDivider, { backgroundColor: colors.border }]} />

                    <View style={styles.priceCell}>
                      <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>INVESTED</Text>
                      <Text style={[styles.priceVal, { color: colors.foreground }]}>
                        {formatCurrency(buyVal)}
                      </Text>
                    </View>
                  </View>

                  {/* Tab-Specific 3-Column Metrics Row */}
                  <View style={styles.metricsRow}>
                    {activeTab === 'charges' ? (
                      <>
                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TAX (STCG)</Text>
                          <Text style={[styles.metricVal, { color: colors.negative }]}>{formatCurrency(tax)}</Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>USER CUT</Text>
                          <Text style={[styles.metricVal, { color: colors.negative }]}>{formatCurrency(userCut)}</Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL CHARGES</Text>
                          <Text style={[styles.metricValHighlight, { color: colors.negative }]}>
                            {formatCurrency(totalCharges)}
                          </Text>
                        </View>
                      </>
                    ) : activeTab === 'holding' ? (
                      <>
                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>GROSS P&L</Text>
                          <Text style={[styles.metricVal, { color: grossPL >= 0 ? colors.positive : colors.negative }]}>
                            {grossPL >= 0 ? '+' : ''}{formatCurrency(grossPL)}
                          </Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>EST. CHARGES</Text>
                          <Text style={[styles.metricVal, { color: colors.negative }]}>
                            {formatCurrency(totalCharges)}
                          </Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>NET P&L (EST)</Text>
                          <Text style={[styles.metricValHighlight, { color: netPL >= 0 ? colors.positive : colors.negative }]}>
                            {netPL >= 0 ? '+' : ''}{formatCurrency(netPL)} ({netPLPct >= 0 ? '+' : ''}{netPLPct.toFixed(1)}%)
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>GROSS P&L</Text>
                          <Text style={[styles.metricVal, { color: grossPL >= 0 ? colors.positive : colors.negative }]}>
                            {grossPL >= 0 ? '+' : ''}{formatCurrency(grossPL)}
                          </Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>CHARGES</Text>
                          <Text style={[styles.metricVal, { color: colors.negative }]}>
                            -{formatCurrency(totalCharges)}
                          </Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>NET REALIZED P&L</Text>
                          <Text style={[styles.metricValHighlight, { color: netPL >= 0 ? colors.positive : colors.negative }]}>
                            {netPL >= 0 ? '+' : ''}{formatCurrency(netPL)} ({netPLPct >= 0 ? '+' : ''}{netPLPct.toFixed(1)}%)
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
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
  },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
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
  chipTabContainer: { paddingTop: 8, paddingBottom: 6, zIndex: 10 },
  listSection: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  reportCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  reportCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeftCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 },
  avatarImage: { width: 32, height: 32, borderRadius: 16 },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },
  appName: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  appSub: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  priceCell: { flex: 1, alignItems: 'center' },
  priceLabel: { fontSize: 9, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.5 },
  priceVal: { fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold', marginTop: 1 },
  priceDivider: { width: 1, height: 16 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 9, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.5 },
  metricVal: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', marginTop: 2 },
  metricValHighlight: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', marginTop: 2 },
  colDivider: { width: 1, height: 22 },
  emptyCard: { borderRadius: 24, borderWidth: 1, alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold' },
  emptyText: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center' },
});
