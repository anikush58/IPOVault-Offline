import React, { useState, useMemo } from 'react';
import {
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

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Compute portfolio totals
  const totals = useMemo(() => {
    let grossProfit = 0;
    let holdingProfit = 0;
    let totalTax = 0;
    let totalUserCut = 0;

    for (const a of applications) {
      if (a.status === 'Sold' || a.status === 'Holding') {
        const { grossPL, tax, userCut, netPL, isHolding } = calculateAppTaxAndNet(a);
        if (isHolding) {
          holdingProfit += netPL;
        } else {
          grossProfit += grossPL;
          totalTax += tax;
          totalUserCut += userCut;
        }
      }
    }

    const totalCharges = totalTax + totalUserCut;
    const netRealizedProfit = grossProfit - totalCharges;

    return { grossProfit, holdingProfit, totalTax, totalUserCut, totalCharges, netRealizedProfit };
  }, [applications]);

  // Filter applications by search query and tab
  const filteredApps = useMemo(() => {
    let list = applications.filter((a) => {
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
      const dateA = a.updated_at || a.created_at || '';
      const dateB = b.updated_at || b.created_at || '';
      if (dateA && dateB) {
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }
      return String(b.id).localeCompare(String(a.id));
    });
  }, [applications, activeTab, searchQuery]);

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
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Profit Summary Donut Chart Card */}
        <View style={styles.chartSection}>
          <ProfitSummaryDonutCard
            grossProfit={totals.grossProfit}
            holdingProfit={totals.holdingProfit}
            totalCharges={totals.totalCharges}
            netRealizedProfit={totals.netRealizedProfit}
          />
        </View>

        {/* Pill/Chip Style Tab Selection */}
        <View style={styles.chipTabContainer}>
          <Tabs
            variant="pills"
            scrollable
            tabs={[
              { key: 'profits', label: 'All Profits' },
              { key: 'holding', label: 'Holding Profits' },
              { key: 'charges', label: 'All Charges' },
            ]}
            activeTab={activeTab}
            onChange={(key) => setActiveTab(key as TabType)}
          />
        </View>

        {/* List Section (Cards styled 100% identical to Portfolio Details card) */}
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

              return (
                <View
                  key={item.id}
                  style={[
                    styles.reportCard,
                    { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: colors.border },
                  ]}
                >
                  {/* Card Header: IPO Name, Applicant & Status */}
                  <View style={styles.reportCardHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.appName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.ipo_name || 'IPO Application'}
                      </Text>
                      <Text style={[styles.appSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {item.user_name} • {item.user_broker || 'No Broker'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            item.status === 'Sold'
                              ? isDark ? 'rgba(16,185,129,0.18)' : '#ECFDF5'
                              : isDark ? 'rgba(139,92,246,0.18)' : '#F5F3FF',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              item.status === 'Sold'
                                ? colors.positive
                                : colors.statusHolding,
                          },
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                  {/* Compact 3-Column Metrics Row */}
                  <View style={styles.metricsRow}>
                    {activeTab === 'charges' ? (
                      <>
                        <View style={styles.metricCell}>
                          <Text style={[styles.metricVal, { color: colors.foreground }]}>{formatCurrency(tax)}</Text>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TAX (STCG)</Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricVal, { color: colors.foreground }]}>{formatCurrency(userCut)}</Text>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>USER CUT</Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricVal, { color: colors.negative }]}>{formatCurrency(tax + userCut)}</Text>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL CHARGES</Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.metricCell}>
                          <Text style={[styles.metricVal, { color: colors.foreground }]}>{formatCurrency(buyVal)}</Text>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>INVESTED</Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricVal, { color: grossPL >= 0 ? colors.positive : colors.negative }]}>
                            {formatCurrency(grossPL)}
                          </Text>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>GROSS P&L</Text>
                        </View>

                        <View style={[styles.colDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.metricCell}>
                          <Text style={[styles.metricVal, { color: netPL >= 0 ? colors.positive : colors.negative }]}>
                            {formatCurrency(netPL)}
                          </Text>
                          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>NET P&L</Text>
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
  chartSection: { paddingHorizontal: 16, paddingTop: 14 },
  chipTabContainer: { marginTop: 14 },
  listSection: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  reportCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  reportCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appName: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  appSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold' },
  cardDivider: { height: 1, marginVertical: 10 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metricVal: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold' },
  metricLabel: { fontSize: 9, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.6, marginTop: 2 },
  colDivider: { width: 1, height: 26 },
  emptyCard: { borderRadius: 24, borderWidth: 1, alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold' },
  emptyText: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center' },
});
