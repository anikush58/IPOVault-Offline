import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { analyticsApiService } from '@/services/analytics/AnalyticsApiService';
import {
  AnalyticsFilter,
  AnalyticsQualityStatus,
  AnalyticsQualityWarningCode,
  AnalyticsSummaryResponseDto,
  AnalyticsTimePeriod,
  DetailedAllotmentAnalyticsResponseDto,
  DetailedAnalyticsQualitySummaryResponseDto,
  DetailedIpoMarketAnalyticsResponseDto,
  DetailedIpoPerformanceAnalyticsResponseDto,
  DetailedSubscriptionDemandAnalyticsResponseDto,
} from '@/types/analytics';
import { formatCurrency, formatRatio, formatShareCount } from '@/utils/formatters';

type AnalyticsTab = 'summary' | 'market' | 'performance' | 'subscription' | 'allotment' | 'quality';

export default function AnalyticsDashboardScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('summary');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedSegment, setSelectedSegment] = useState<'ALL' | 'MAINBOARD' | 'SME'>('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState<AnalyticsTimePeriod>(AnalyticsTimePeriod.MONTH);

  // Data states
  const [summaryData, setSummaryData] = useState<AnalyticsSummaryResponseDto | null>(null);
  const [marketData, setMarketData] = useState<DetailedIpoMarketAnalyticsResponseDto | null>(null);
  const [performanceData, setPerformanceData] = useState<DetailedIpoPerformanceAnalyticsResponseDto | null>(null);
  const [subscriptionData, setSubscriptionData] = useState<DetailedSubscriptionDemandAnalyticsResponseDto | null>(null);
  const [allotmentData, setAllotmentData] = useState<DetailedAllotmentAnalyticsResponseDto | null>(null);
  const [qualityData, setQualityData] = useState<DetailedAnalyticsQualitySummaryResponseDto | null>(null);

  // Task 8: Initial load fetches SUMMARY first
  const fetchSummary = useCallback(async () => {
    try {
      setError(null);
      const res = await analyticsApiService.getAnalyticsSummary();
      setSummaryData(res);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch analytics summary telemetry from backend');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Lazy fetch active tab data
  const fetchActiveTabData = useCallback(async (tab: AnalyticsTab) => {
    const filter: AnalyticsFilter = {
      segment: selectedSegment !== 'ALL' ? selectedSegment : undefined,
      period: selectedPeriod,
    };

    try {
      setTabLoading(true);
      setError(null);
      if (tab === 'market') {
        const res = await analyticsApiService.getMarketAnalytics(filter);
        setMarketData(res);
      } else if (tab === 'performance') {
        const res = await analyticsApiService.getPerformanceAnalytics(filter);
        setPerformanceData(res);
      } else if (tab === 'subscription') {
        const res = await analyticsApiService.getSubscriptionAnalytics(filter);
        setSubscriptionData(res);
      } else if (tab === 'allotment') {
        const res = await analyticsApiService.getAllotmentAnalytics(filter);
        setAllotmentData(res);
      } else if (tab === 'quality') {
        const res = await analyticsApiService.getQualitySummary();
        setQualityData(res);
      }
    } catch (e: any) {
      setError(e?.message || `Failed to fetch ${tab} analytics data`);
    } finally {
      setTabLoading(false);
    }
  }, [selectedSegment, selectedPeriod]);

  useEffect(() => {
    setLoading(true);
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeTab !== 'summary') {
      fetchActiveTabData(activeTab);
    }
  }, [activeTab, fetchActiveTabData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSummary();
    if (activeTab !== 'summary') {
      fetchActiveTabData(activeTab);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            height: topPad + 60,
            backgroundColor: colors.background,
          },
        ]}
      >
        <IconButton
          name="arrow-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />
        <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>
            DATA-QUALITY-AWARE INTELLIGENCE
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Analytics Dashboard
          </Text>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabBarContainer}>
        <Tabs
          variant="pills"
          scrollable
          tabs={[
            { key: 'summary', label: 'Summary' },
            { key: 'market', label: 'Market' },
            { key: 'performance', label: 'Performance' },
            { key: 'subscription', label: 'Subscription' },
            { key: 'allotment', label: 'Allotment' },
            { key: 'quality', label: 'Data Quality' },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as AnalyticsTab)}
          style={{ marginHorizontal: 16 }}
        />
      </View>

      {/* Filter Toolbar (Only when not in summary tab) */}
      {activeTab !== 'summary' && activeTab !== 'quality' && (
        <View style={styles.filterToolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>SEGMENT:</Text>
            {(['ALL', 'MAINBOARD', 'SME'] as const).map((seg) => (
              <TouchableOpacity
                key={seg}
                onPress={() => setSelectedSegment(seg)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor:
                      selectedSegment === seg ? colors.card : colors.surface,
                    borderColor:
                      selectedSegment === seg ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color:
                        selectedSegment === seg ? colors.primary : colors.mutedForeground,
                    },
                  ]}
                >
                  {seg}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginLeft: 12 }]}>PERIOD:</Text>
            {(
              [
                AnalyticsTimePeriod.MONTH,
                AnalyticsTimePeriod.QUARTER,
                AnalyticsTimePeriod.YEAR,
              ] as const
            ).map((per) => (
              <TouchableOpacity
                key={per}
                onPress={() => setSelectedPeriod(per)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor:
                      selectedPeriod === per ? colors.card : colors.surface,
                    borderColor:
                      selectedPeriod === per ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color:
                        selectedPeriod === per ? colors.primary : colors.mutedForeground,
                    },
                  ]}
                >
                  {per}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading analytics summary telemetry…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Feather name="wifi-off" size={32} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Analytics Connection Error
          </Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '600' }}>
              Retry Analytics Request
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 40,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* TAB 0: SUMMARY (Summary-First Dashboard) */}
          {activeTab === 'summary' && summaryData && (
            <View style={{ gap: 14 }}>
              {/* Market Overview Card */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.cardSectionTitle, { color: colors.primary, marginBottom: 0 }]}>
                    MARKET OVERVIEW
                  </Text>
                  <TouchableOpacity onPress={() => setActiveTab('market')}>
                    <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'GoogleSansFlex_600SemiBold' }}>
                      View Details →
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.grid2Row, { marginTop: 12 }]}>
                  <View style={styles.gridCell}>
                    <Text style={[styles.metricValLarge, { color: colors.foreground }]}>
                      {summaryData.market.snapshot.totalIpos}
                    </Text>
                    <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                      Total Canonical IPOs
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.metricValLarge, { color: '#10B981' }]}>
                      {summaryData.market.snapshot.openIposCount}
                    </Text>
                    <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                      Open IPOs
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    TOTAL ISSUE SIZE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {formatCurrency(summaryData.market.summary.issueSize.totalIssueSizeInr)}
                  </Text>
                </View>
              </View>

              {/* Allotment Outcome Card */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.cardSectionTitle, { color: colors.primary, marginBottom: 0 }]}>
                    ALLOTMENT OBSERVATIONS
                  </Text>
                  <TouchableOpacity onPress={() => setActiveTab('allotment')}>
                    <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'GoogleSansFlex_600SemiBold' }}>
                      View Details →
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.grid2Row, { marginTop: 12 }]}>
                  <View style={styles.gridCell}>
                    <Text style={[styles.metricValLarge, { color: '#10B981' }]}>
                      {summaryData.allotment.outcomes.observedPositiveAllotmentRatePercentage !== null
                        ? `${summaryData.allotment.outcomes.observedPositiveAllotmentRatePercentage}%`
                        : 'N/A'}
                    </Text>
                    <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                      Observed Positive Rate
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.metricValLarge, { color: colors.foreground }]}>
                      {summaryData.allotment.dataQuality.definitiveObservationsCount}
                    </Text>
                    <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                      Definitive Sample Items
                    </Text>
                  </View>
                </View>
              </View>

              {/* Performance Snapshot Card */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.cardSectionTitle, { color: colors.primary, marginBottom: 0 }]}>
                    PERFORMANCE SNAPSHOT
                  </Text>
                  <TouchableOpacity onPress={() => setActiveTab('performance')}>
                    <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'GoogleSansFlex_600SemiBold' }}>
                      View Details →
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    PRICE-BAND COVERAGE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {summaryData.performance.priceBandSummary.priceBandCoveragePercentage}%
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    AVG PRICE-BAND SPREAD
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {summaryData.performance.priceBandSummary.averagePriceBandSpreadInr !== null
                      ? `₹${summaryData.performance.priceBandSummary.averagePriceBandSpreadInr}`
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    LISTING GAIN
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.mutedForeground }]}>
                    FUTURE_DATA_DEPENDENT
                  </Text>
                </View>
              </View>

              {/* Data Quality & Subscription Status Card */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>
                  DATA QUALITY & STATUS
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    CANONICAL QUALITY STATUS
                  </Text>
                  <View
                    style={[
                      styles.statusTag,
                      {
                        backgroundColor:
                          summaryData.qualityStatus.overallStatus === AnalyticsQualityStatus.COMPLETE
                            ? '#10B98120'
                            : '#F59E0B20',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusTagText,
                        {
                          color:
                            summaryData.qualityStatus.overallStatus === AnalyticsQualityStatus.COMPLETE
                              ? '#10B981'
                              : '#F59E0B',
                        },
                      ]}
                    >
                      {summaryData.qualityStatus.overallStatus}
                    </Text>
                  </View>
                </View>

                {/* Subscription Availability Banner */}
                <View style={[styles.unavailableBox, { marginTop: 12 }]}>
                  <Feather name="clock" size={18} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.unavailableTitle, { color: colors.foreground, fontSize: 13 }]}>
                      Subscription Analytics Coming Soon
                    </Text>
                    <Text style={[styles.unavailableSub, { color: colors.mutedForeground, fontSize: 11 }]}>
                      {summaryData.subscription.unsupportedMetricReason}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}
          {/* TAB 1: MARKET */}
          {activeTab === 'market' && marketData && (
            <View style={{ gap: 14 }}>
              {/* Snapshot */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>
                  MARKET SNAPSHOT
                </Text>
                <View style={styles.grid2Row}>
                  <View style={styles.gridCell}>
                    <Text style={[styles.metricValLarge, { color: colors.foreground }]}>
                      {marketData.snapshot.totalIpos}
                    </Text>
                    <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                      Total Canonical IPOs
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.metricValLarge, { color: '#10B981' }]}>
                      {marketData.snapshot.openIposCount}
                    </Text>
                    <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                      Open IPOs
                    </Text>
                  </View>
                </View>
                <View style={styles.grid2Row}>
                  <View style={styles.gridCell}>
                    <Text style={[styles.metricValLarge, { color: '#3B82F6' }]}>
                      {marketData.snapshot.upcomingIposCount}
                    </Text>
                    <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                      Upcoming IPOs
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.metricValLarge, { color: colors.foreground }]}>
                      {marketData.snapshot.closedIposCount}
                    </Text>
                    <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                      Closed IPOs
                    </Text>
                  </View>
                </View>
              </View>

              {/* Issue Size Aggregates */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>
                  ISSUE SIZE AGGREGATES (INR)
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    TOTAL ISSUE SIZE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {formatCurrency(marketData.marketSummary.issueSize.totalIssueSizeInr)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    TOTAL FRESH ISSUE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {formatCurrency(marketData.marketSummary.issueSize.totalFreshIssueSizeInr)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    TOTAL OFS ISSUE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {formatCurrency(marketData.marketSummary.issueSize.totalOfsSizeInr)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    AVERAGE ISSUE SIZE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {marketData.marketSummary.issueSize.averageIssueSizeInr
                      ? formatCurrency(marketData.marketSummary.issueSize.averageIssueSizeInr)
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    FRESH / OFS RATIO
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {formatRatio(marketData.marketSummary.issueSize.freshIssueVsOfsRatio)}
                  </Text>
                </View>
              </View>

              {/* Share Counts (Preserves INR !== SHARES) */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>
                  ISSUE SHARE COUNTS (SHARES)
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    TOTAL SHARES OFFERED
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {formatShareCount(marketData.marketSummary.issueSize.totalIssueShareCount)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    FRESH SHARES OFFERED
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {formatShareCount(marketData.marketSummary.issueSize.totalFreshIssueShareCount)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    OFS SHARES OFFERED
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {formatShareCount(marketData.marketSummary.issueSize.totalOfsShareCount)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* TAB 2: PERFORMANCE */}
          {activeTab === 'performance' && performanceData && (
            <View style={{ gap: 14 }}>
              {/* Price Band Spread */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>
                  PRICE-BAND SPREAD ANALYTICS
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    EVALUATED IPOS
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {performanceData.priceBandSummary.knownPriceBandCount} / {performanceData.priceBandSummary.totalIpos}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    COVERAGE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {performanceData.priceBandSummary.priceBandCoveragePercentage}%
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    AVERAGE SPREAD (INR)
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {performanceData.priceBandSummary.averagePriceBandSpreadInr !== null
                      ? `₹${performanceData.priceBandSummary.averagePriceBandSpreadInr}`
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    AVERAGE SPREAD (%)
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {performanceData.priceBandSummary.averagePriceBandSpreadPercentage !== null
                      ? `${performanceData.priceBandSummary.averagePriceBandSpreadPercentage}%`
                      : 'N/A'}
                  </Text>
                </View>
              </View>

              {/* Close-to-Listing Duration */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>
                  CLOSE-TO-LISTING TIMELINE DURATION
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    TIMELINE COVERAGE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {performanceData.listingTimeline.timelineCoveragePercentage}%
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    AVERAGE DURATION
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {performanceData.listingTimeline.averageDaysCloseToListing !== null
                      ? `${performanceData.listingTimeline.averageDaysCloseToListing} days`
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    MEDIAN DURATION
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {performanceData.listingTimeline.medianDaysCloseToListing !== null
                      ? `${performanceData.listingTimeline.medianDaysCloseToListing} days`
                      : 'N/A'}
                  </Text>
                </View>
              </View>

              {/* Deferred Listing Performance */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="clock" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.cardSectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>
                    LISTING PRICE PERFORMANCE
                  </Text>
                </View>
                <Text style={[styles.infoText, { color: colors.mutedForeground, marginTop: 8 }]}>
                  {performanceData.listingPerformance.unsupportedMetricReason}
                </Text>
              </View>
            </View>
          )}

          {/* TAB 3: SUBSCRIPTION (Explicit Unavailable State) */}
          {activeTab === 'subscription' && subscriptionData && (
            <View style={{ gap: 14 }}>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.cardSectionTitle, { color: colors.primary, marginBottom: 0 }]}>
                    SUBSCRIPTION DEMAND METRICS
                  </Text>
                  <View style={[styles.statusTag, { backgroundColor: '#F59E0B20' }]}>
                    <Text style={[styles.statusTagText, { color: '#F59E0B' }]}>
                      FUTURE_DATA_DEPENDENT
                    </Text>
                  </View>
                </View>

                <View style={styles.unavailableBox}>
                  <Feather name="info" size={24} color="#F59E0B" />
                  <Text style={[styles.unavailableTitle, { color: colors.foreground }]}>
                    Subscription Analytics Unavailable
                  </Text>
                  <Text style={[styles.unavailableSub, { color: colors.mutedForeground }]}>
                    {subscriptionData.subscriptionSummary.unsupportedMetricReason}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* TAB 4: ALLOTMENT */}
          {activeTab === 'allotment' && allotmentData && (
            <View style={{ gap: 14 }}>
              {/* Outcomes */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>
                  OBSERVED SAMPLE OUTCOME RATES
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    OBSERVED POSITIVE ALLOTMENT RATE
                  </Text>
                  <Text style={[styles.rowVal, { color: '#10B981' }]}>
                    {allotmentData.summary.outcomes.observedPositiveAllotmentRatePercentage !== null
                      ? `${allotmentData.summary.outcomes.observedPositiveAllotmentRatePercentage}%`
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    FULL ALLOTMENT RATE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {allotmentData.summary.outcomes.fullAllotmentRatePercentage !== null
                      ? `${allotmentData.summary.outcomes.fullAllotmentRatePercentage}%`
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    PARTIAL ALLOTMENT RATE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {allotmentData.summary.outcomes.partialAllotmentRatePercentage !== null
                      ? `${allotmentData.summary.outcomes.partialAllotmentRatePercentage}%`
                      : 'N/A'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    NOT ALLOTTED RATE
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.mutedForeground }]}>
                    {allotmentData.summary.outcomes.notAllottedRatePercentage !== null
                      ? `${allotmentData.summary.outcomes.notAllottedRatePercentage}%`
                      : 'N/A'}
                  </Text>
                </View>
              </View>

              {/* Sample Observation Counts */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>
                  CHECKED SAMPLE OBSERVATIONS
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    RAW CHECK LOGS & ITEMS
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {allotmentData.summary.dataQuality.totalRawObservations}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    DEDUPLICATED OBSERVATIONS
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {allotmentData.summary.dataQuality.deduplicatedObservationsCount}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    DEFINITIVE OUTCOMES
                  </Text>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {allotmentData.summary.dataQuality.definitiveObservationsCount}
                  </Text>
                </View>
              </View>

              {/* Mandatory Disclaimer */}
              <View
                style={[
                  styles.disclaimerBox,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Feather name="shield" size={18} color={colors.primary} />
                <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
                  {allotmentData.summary.disclaimer}
                </Text>
              </View>
            </View>
          )}

          {/* TAB 5: DATA QUALITY TELEMETRY */}
          {activeTab === 'quality' && qualityData && (
            <View style={{ gap: 14 }}>
              {/* Overall Quality Status */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.cardSectionTitle, { color: colors.primary, marginBottom: 0 }]}>
                    OVERALL CANONICAL QUALITY STATUS
                  </Text>
                  <View
                    style={[
                      styles.statusTag,
                      {
                        backgroundColor:
                          qualityData.overallQualityStatus === AnalyticsQualityStatus.COMPLETE
                            ? '#10B98120'
                            : '#F59E0B20',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusTagText,
                        {
                          color:
                            qualityData.overallQualityStatus === AnalyticsQualityStatus.COMPLETE
                              ? '#10B981'
                              : '#F59E0B',
                        },
                      ]}
                    >
                      {qualityData.overallQualityStatus}
                    </Text>
                  </View>
                </View>

                {/* Quality Gate Distribution */}
                <View style={{ marginTop: 12, gap: 8 }}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                      QUALITY GATE PASS RATE
                    </Text>
                    <Text style={[styles.rowVal, { color: colors.foreground }]}>
                      {qualityData.qualityGate.qualityGatePassRatePercentage}%
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                      PROVENANCE COVERAGE
                    </Text>
                    <Text style={[styles.rowVal, { color: colors.foreground }]}>
                      {qualityData.provenance.provenanceCoveragePercentage}%
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                      HEALTHY SOURCES
                    </Text>
                    <Text style={[styles.rowVal, { color: colors.foreground }]}>
                      {qualityData.sourceHealth.healthySourcesCount} / {qualityData.sourceHealth.totalSources}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Data Quality Telemetry Disclaimer */}
              <View
                style={[
                  styles.disclaimerBox,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Feather name="info" size={18} color={colors.mutedForeground} />
                <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
                  {qualityData.disclaimer}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
  },
  tabBarContainer: {
    paddingVertical: 8,
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
  },
  tabPillText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  filterToolbar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.8,
    alignSelf: 'center',
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  errorSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
  },
  cardSectionTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  grid2Row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  gridCell: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(128,128,128,0.06)',
  },
  metricValLarge: {
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  metricSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  rowVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  infoText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusTagText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  unavailableBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  unavailableTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  unavailableSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },
});
