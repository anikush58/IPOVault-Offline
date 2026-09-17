import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { backendIpoApiService, normalizeBackendIpo } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { AnchorInvestorAllocation } from '@/components/ipo/AnchorInvestorAllocation';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';

function formatDateShort(dateStr?: string | null): string {
  if (!dateStr) return 'TBA';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const clean = dateStr.trim();
  const parts = clean.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[2], 10);
    const mIdx = parseInt(parts[1], 10) - 1;
    if (!isNaN(day) && mIdx >= 0 && mIdx < 12) {
      return `${day} ${MONTHS[mIdx]}`;
    }
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  return clean;
}

export default function BackendIpoDetailsScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; item?: string }>();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  type DetailTab = 'IPO' | 'Subscription' | 'Company Info' | 'Docs';

  const mainScrollViewRef = useRef<ScrollView>(null);
  const tabScrollViewRef = useRef<ScrollView>(null);
  const sectionYMap = useRef<Record<string, number>>({});
  const isManualScrollingRef = useRef<boolean>(false);

  const [ipo, setIpo] = useState<BackendIpo | null>(() => {
    if (params.item) {
      try {
        const parsed = JSON.parse(params.item);
        return normalizeBackendIpo(parsed);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(!ipo && !!params.id);
  const [refreshing, setRefreshing] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('IPO');

  const handleOpenUrl = (url?: string | null) => {
    if (!url) return;
    const formatted = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(formatted).catch(() => {});
  };

  const handleTabPress = (tabKey: DetailTab) => {
    setActiveDetailTab(tabKey);
    isManualScrollingRef.current = true;
    try { Haptics.selectionAsync(); } catch {}
    const targetY = sectionYMap.current[tabKey] || 0;
    mainScrollViewRef.current?.scrollTo({ y: Math.max(0, targetY - 10), animated: true });
    setTimeout(() => {
      isManualScrollingRef.current = false;
    }, 700);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isManualScrollingRef.current) return;
    const scrollY = e.nativeEvent.contentOffset.y;
    const tabs: DetailTab[] = ['IPO', 'Subscription', 'Company Info', 'Docs'];
    let currentTab = tabs[0];
    for (const tab of tabs) {
      const y = sectionYMap.current[tab];
      if (y !== undefined && scrollY >= y - 100) {
        currentTab = tab;
      }
    }
    if (currentTab !== activeDetailTab) {
      setActiveDetailTab(currentTab);
    }
  };

  const fetchDetail = React.useCallback(async () => {
    if (!params.id) return;
    try {
      const res = await backendIpoApiService.getBackendIpoDetail(params.id);
      if (res) setIpo(res);
    } catch (e) {
      console.warn('Failed to fetch backend IPO detail', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) {
      setLoading(true);
      fetchDetail();
    }
  }, [params.id, fetchDetail]);

  useFocusEffect(
    React.useCallback(() => {
      fetchDetail();
    }, [fetchDetail])
  );

  useEffect(() => {
    const timer = setInterval(() => {
      fetchDetail();
    }, 15000);

    const unsubscribe = backendSyncEmitter.subscribe(() => {
      fetchDetail();
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [fetchDetail]);

  const handleRefresh = React.useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setRefreshing(true);
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading backend IPO details…
          </Text>
        </View>
      </View>
    );
  }

  if (!ipo) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContainer}>
          <Feather name="alert-circle" size={32} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            IPO Not Found
          </Text>
          <IconButton
            name="arrow-left"
            variant="surface"
            size="md"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const companyName =
    ipo.company?.displayName || ipo.companyName || ipo.symbol;

  const minInvestAmount =
    ipo.priceBandHigh && ipo.lotSize
      ? Number(ipo.priceBandHigh) * Number(ipo.lotSize)
      : ipo.priceBandLow && ipo.lotSize
      ? Number(ipo.priceBandLow) * Number(ipo.lotSize)
      : null;

  const registrar = ipo.participants?.find((p) => p.role === 'REGISTRAR');
  const brlms = ipo.participants?.filter(
    (p) => p.role === 'BRLM' || p.role === 'CO_BRLM',
  );

  const leadManagersList =
    brlms && brlms.length > 0
      ? brlms.map((b) => b.name)
      : ipo.company?.contactPerson
      ? [ipo.company.contactPerson]
      : [];

  const priceBandText =
    ipo.priceBandLow && ipo.priceBandHigh
      ? ipo.priceBandLow === ipo.priceBandHigh
        ? `₹${ipo.priceBandHigh}`
        : `₹${ipo.priceBandLow} - ₹${ipo.priceBandHigh}`
      : ipo.priceBandHigh
      ? `₹${ipo.priceBandHigh}`
      : ipo.priceBandLow
      ? `₹${ipo.priceBandLow}`
      : 'TBA';


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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary, textAlign: 'center' }]}>
            {ipo.symbol} · {ipo.marketSegment}
          </Text>
          <Text
            style={[styles.headerTitle, { color: colors.foreground, textAlign: 'center' }]}
            numberOfLines={1}
          >
            {companyName}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Top 4 Detail Tabs (Scroll-synced Pills with no bottom border line) */}
      <View style={[styles.detailTabBarWrap, { backgroundColor: colors.background, paddingVertical: 8, borderBottomWidth: 0 }]}>
        <ScrollView ref={tabScrollViewRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: 'row' }}>
          {(['IPO', 'Subscription', 'Company Info', 'Docs'] as const).map((tabKey) => {
            const isActive = activeDetailTab === tabKey;
            return (
              <TouchableOpacity
                key={tabKey}
                onPress={() => handleTabPress(tabKey)}
                style={{
                  height: 36,
                  paddingHorizontal: 16,
                  borderRadius: 9999,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive ? colors.pillActiveBg : colors.pillInactiveBg,
                  borderColor: isActive ? colors.pillActiveBg : colors.pillInactiveBorder,
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontFamily: 'GoogleSansFlex_700Bold',
                    color: isActive ? colors.pillActiveText : colors.pillInactiveText,
                  }}
                >
                  {tabKey}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        ref={mainScrollViewRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 100,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── SECTION 1: IPO OVERVIEW ── */}
        <View onLayout={(e) => { sectionYMap.current['IPO'] = e.nativeEvent.layout.y; }}>
          {/* HERO CARD (Redesigned with logo avatar & 2-column stats box) */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, borderRadius: 18 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <View style={{ width: 54, height: 54, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                {ipo.company?.logoUrl ? (
                  <Image source={{ uri: ipo.company.logoUrl }} style={{ width: 44, height: 44 }} resizeMode="contain" />
                ) : (
                  <Text style={{ fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary }}>
                    {companyName.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground, marginBottom: 4 }}>
                  {companyName}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium', color: colors.mutedForeground }}>
                    {ipo.marketSegment === 'SME' ? 'SME' : 'Mainboard'}
                  </Text>
                  <View style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', color: '#059669' }}>
                      {ipo.status}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.cardAlt, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium', color: colors.mutedForeground, marginBottom: 2 }}>
                  {ipo.status === 'LISTED' ? 'Listing Price' : 'Bid Price'}
                </Text>
                <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground }}>
                  {ipo.status === 'LISTED' ? (ipo.listingPrice != null ? `₹${ipo.listingPrice}${ipo.listingGainPct != null ? ` (${ipo.listingGainPct > 0 ? '+' : ''}${ipo.listingGainPct}%)` : ''}` : 'TBA') : priceBandText}
                </Text>
              </View>

              <View style={{ width: 1, backgroundColor: colors.border }} />

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium', color: colors.mutedForeground, marginBottom: 2 }}>
                  {ipo.status === 'LISTED' ? 'Est. Profit' : 'Est. GMP'}
                </Text>
                <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: ipo.status === 'LISTED' ? (ipo.listingGainPct != null && ipo.listingGainPct >= 0 ? '#10B981' : '#EF4444') : (ipo.currentGmp ? '#10B981' : colors.foreground) }}>
                  {ipo.status === 'LISTED' ? (ipo.profitAmount != null ? `₹${Math.round(ipo.profitAmount).toLocaleString('en-IN')}${ipo.profitPercentage != null ? ` (${ipo.profitPercentage > 0 ? '+' : ''}${ipo.profitPercentage}%)` : ''}` : '—') : (ipo.currentGmp ? `₹${ipo.currentGmp.gmpAmount}${ipo.currentGmp.gmpPercentage != null ? ` (${ipo.currentGmp.gmpPercentage}%)` : ''}` : '—')}
                </Text>
              </View>
            </View>
          </View>

          {/* IPO DETAILS CARD */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, borderRadius: 18, marginTop: 12 }]}>
            <Text style={{ fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary, marginBottom: 16 }}>
              IPO Details
            </Text>

            {/* TIMELINE STEPPER (Pixel-perfect alignment matching reference image) */}
            {(() => {
              const norm = String(ipo.status || '').toUpperCase();

              const checkDatePassed = (dateStr?: string | null) => {
                if (!dateStr) return false;
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return false;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                d.setHours(0, 0, 0, 0);
                return today.getTime() >= d.getTime();
              };

              const isListed = norm.includes('LISTED');
              const isRefunded = norm.includes('REFUND') || norm.includes('CREDIT') || isListed;
              const isAllotted = norm.includes('ALLOT') || isRefunded;
              const isClosed = norm.includes('CLOSE') || isAllotted;
              const isOpen = norm.includes('OPEN') || norm.includes('LIVE') || isClosed;

              const refundDateStr = ipo.refundDate || ipo.refundInitiationDate || ipo.lifecycle?.refundInitiationDate || (ipo.allotmentDate ? ipo.allotmentDate : null);

              const step0Achieved = isOpen || checkDatePassed(ipo.openDate);
              const step1Achieved = isClosed || checkDatePassed(ipo.closeDate);
              const step2Achieved = isAllotted || checkDatePassed(ipo.allotmentDate);
              const step3Achieved = isRefunded || checkDatePassed(refundDateStr);
              const step4Achieved = isListed || checkDatePassed(ipo.listingDate);

              const stepAchievements = [step0Achieved, step1Achieved, step2Achieved, step3Achieved, step4Achieved];
              let maxContiguousAchieved = -1;
              for (let i = 0; i < stepAchievements.length; i++) {
                if (stepAchievements[i]) {
                  maxContiguousAchieved = i;
                } else {
                  break;
                }
              }

              const timelineSteps = [
                { label: 'Open', date: formatDateShort(ipo.openDate), isAchieved: step0Achieved },
                { label: 'Close', date: formatDateShort(ipo.closeDate), isAchieved: step1Achieved },
                { label: 'Allotment', date: formatDateShort(ipo.allotmentDate), isAchieved: step2Achieved },
                { label: 'Refund', date: formatDateShort(refundDateStr), isAchieved: step3Achieved },
                { label: 'Listing', date: formatDateShort(ipo.listingDate), isAchieved: step4Achieved },
              ];

              return (
                <View style={{ marginBottom: 22, paddingTop: 4 }}>
                  <View style={{ height: 68, position: 'relative', marginHorizontal: 16 }}>
                    {/* Track line (gray background) */}
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: 2.5,
                        backgroundColor: isDark ? '#334155' : '#E2E8F0',
                        top: 10.75,
                      }}
                    />

                    {/* Track line (green completed) */}
                    {maxContiguousAchieved > 0 && (
                      <View
                        style={{
                          position: 'absolute',
                          left: 0,
                          width: `${(maxContiguousAchieved / 4) * 100}%`,
                          height: 2.5,
                          backgroundColor: '#10B981',
                          top: 10.75,
                        }}
                      />
                    )}

                    {/* 5 Milestone Step Columns */}
                    {timelineSteps.map((step, idx) => {
                      const isAchieved = step.isAchieved;
                      return (
                        <View
                          key={idx}
                          style={{
                            position: 'absolute',
                            left: `${(idx / 4) * 100}%`,
                            width: 64,
                            marginLeft: -32,
                            alignItems: 'center',
                            top: 0,
                          }}
                        >
                          {/* Circle Icon */}
                          <View
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              backgroundColor: isAchieved ? '#10B981' : (isDark ? '#334155' : '#E2E8F0'),
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 2,
                            }}
                          >
                            <Feather name="check" size={13} color={isAchieved ? '#FFFFFF' : (isDark ? '#64748B' : '#94A3B8')} />
                          </View>

                          {/* Date Value */}
                          <Text
                            style={{
                              fontSize: 12,
                              fontFamily: 'GoogleSansFlex_700Bold',
                              color: colors.foreground,
                              textAlign: 'center',
                              marginTop: 8,
                            }}
                            numberOfLines={1}
                          >
                            {step.date || 'TBA'}
                          </Text>

                          {/* Step Label */}
                          <Text
                            style={{
                              fontSize: 11,
                              fontFamily: 'GoogleSansFlex_400Regular',
                              color: colors.mutedForeground,
                              textAlign: 'center',
                              marginTop: 2,
                            }}
                            numberOfLines={1}
                          >
                            {step.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

            <View style={{ gap: 10 }}>
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Face Value</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {ipo.faceValue != null ? `₹${ipo.faceValue} Per Share` : '—'}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Min. Investment</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {minInvestAmount != null ? `₹ ${minInvestAmount.toLocaleString('en-IN')}` : '—'}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Issue Size</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {(() => {
                    if (ipo.issueSize == null) return '—';
                    const num = Number(ipo.issueSize);
                    const cr = num >= 1000000 ? num / 10000000 : num;
                    return `₹${cr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
                  })()}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Min. Quantity</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {ipo.lotSize != null ? `${ipo.lotSize} Qty` : '—'}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Listing at</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {(() => {
                    const ex = String(ipo.exchange || '').trim().toUpperCase();
                    if (!ex || ex === 'BOTH' || ex === 'BSE / NSE' || ex === 'NSE / BSE' || ex === 'BSE, NSE' || ex === 'BSE,NSE') {
                      return 'NSE, BSE';
                    }
                    return ex;
                  })()}
                </Text>
              </View>
            </View>
          </View>

          {/* LEAD MANAGERS CARD */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, borderRadius: 18, marginTop: 12 }]}>
            <Text style={{ fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary, marginBottom: 12 }}>
              Lead Manager(s)
            </Text>

            {leadManagersList.length > 0 ? (
              <View style={{ gap: 8 }}>
                {leadManagersList.map((mgr, idx) => (
                  <Text key={idx} style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', color: colors.foreground }}>
                    {idx + 1}. {mgr}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground }}>
                Lead manager data unavailable.
              </Text>
            )}
          </View>

          {/* Offer Breakup & Investment Category Breakdown */}
          {(() => {
            const qibCat = ipo.offerCategories?.find(c => c.category === 'QIB');
            const niiCat = ipo.offerCategories?.find(c => c.category === 'NII');
            const retailCat = ipo.offerCategories?.find(c => c.category === 'RETAIL');

            const qibPct = qibCat?.allocationPct != null ? Number(qibCat.allocationPct) : 50;
            const niiPct = niiCat?.allocationPct != null ? Number(niiCat.allocationPct) : 15;
            const retailPct = retailCat?.allocationPct != null ? Number(retailCat.allocationPct) : 35;
            const mmPct = 0;

            const total = (qibPct + niiPct + retailPct + mmPct) || 100;
            const r = 40;
            const cx = 55;
            const cy = 55;
            const C = 2 * Math.PI * r;

            const fracRii = retailPct / total;
            const fracQib = qibPct / total;
            const fracNii = niiPct / total;
            const fracMm = mmPct / total;

            const lenRii = fracRii * C;
            const lenQib = fracQib * C;
            const lenNii = fracNii * C;
            const lenMm = fracMm * C;

            const gap = 2;
            const dashRii = `${Math.max(0, lenRii - gap)} ${C - Math.max(0, lenRii - gap)}`;
            const dashQib = `${Math.max(0, lenQib - gap)} ${C - Math.max(0, lenQib - gap)}`;
            const dashNii = `${Math.max(0, lenNii - gap)} ${C - Math.max(0, lenNii - gap)}`;
            const dashMm = `${Math.max(0, lenMm - gap)} ${C - Math.max(0, lenMm - gap)}`;

            const offRii = 0;
            const offQib = -lenRii;
            const offNii = -(lenRii + lenQib);
            const offMm = -(lenRii + lenQib + lenNii);

            const COLOR_QIB = '#2196F3';
            const COLOR_NII = '#4CAF50';
            const COLOR_RII = '#FF9800';
            const COLOR_MM = '#9C27B0';

            return (
              <>
                <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Offer Breakup</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Svg width={110} height={110} viewBox="0 0 110 110">
                      <G rotation="-90" origin="55, 55">
                        {lenRii > 0 && (
                          <Circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            stroke={COLOR_RII}
                            strokeWidth={16}
                            strokeDasharray={dashRii}
                            strokeDashoffset={offRii}
                            fill="none"
                          />
                        )}
                        {lenQib > 0 && (
                          <Circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            stroke={COLOR_QIB}
                            strokeWidth={16}
                            strokeDasharray={dashQib}
                            strokeDashoffset={offQib}
                            fill="none"
                          />
                        )}
                        {lenNii > 0 && (
                          <Circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            stroke={COLOR_NII}
                            strokeWidth={16}
                            strokeDasharray={dashNii}
                            strokeDashoffset={offNii}
                            fill="none"
                          />
                        )}
                        {lenMm > 0 && (
                          <Circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            stroke={COLOR_MM}
                            strokeWidth={16}
                            strokeDasharray={dashMm}
                            strokeDashoffset={offMm}
                            fill="none"
                          />
                        )}
                      </G>
                    </Svg>
                    <View style={{ width: 170, gap: 10 }}>
                      <View style={styles.cardRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COLOR_QIB }} />
                          <Text style={[styles.label, { color: colors.foreground }]}>QIB</Text>
                        </View>
                        <Text style={[styles.value, { color: colors.foreground }]}>{qibPct}%</Text>
                      </View>
                      <View style={styles.cardRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COLOR_NII }} />
                          <Text style={[styles.label, { color: colors.foreground }]}>NII</Text>
                        </View>
                        <Text style={[styles.value, { color: colors.foreground }]}>{niiPct}%</Text>
                      </View>
                      <View style={styles.cardRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COLOR_RII }} />
                          <Text style={[styles.label, { color: colors.foreground }]}>RII</Text>
                        </View>
                        <Text style={[styles.value, { color: colors.foreground }]}>{retailPct}%</Text>
                      </View>
                      <View style={styles.cardRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COLOR_MM }} />
                          <Text style={[styles.label, { color: colors.foreground }]}>MM</Text>
                        </View>
                        <Text style={[styles.value, { color: colors.foreground }]}>{mmPct}%</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </>
            );
          })()}

          {/* Investment Category Breakdown Table */}
          <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Investment Category Breakdown</Text>
          <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {ipo.lotSize && (ipo.priceBandHigh || ipo.priceBandLow) ? (
              <>
                <View style={[styles.tableHeaderRow, { backgroundColor: colors.tableHeaderBg }]}>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 1.6 }]}>Category</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 0.8, textAlign: 'center' }]}>Lot</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 1, textAlign: 'center' }]}>Shares</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 1.2, textAlign: 'right' }]}>Rates</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 1.5, textAlign: 'right' }]}>Amount</Text>
                </View>

                {(() => {
                  const lot = Number(ipo.lotSize);
                  const price = Number(ipo.priceBandHigh || ipo.priceBandLow);
                  const catRows = [
                    { category: 'Retail (Min)', lots: 1 },
                    { category: 'Retail (Max)', lots: Math.floor(200000 / (lot * price)) || 1 },
                    { category: 'S-HNI (Min)', lots: Math.ceil(200000 / (lot * price)) || 15 },
                    { category: 'S-HNI (Max)', lots: Math.floor(1000000 / (lot * price)) || 70 },
                    { category: 'B-HNI (Min)', lots: Math.ceil(1000000 / (lot * price)) || 71 },
                  ];
                  return catRows.map((r, idx) => {
                    const shares = r.lots * lot;
                    const amount = shares * price;
                    return (
                      <View key={idx} style={idx === catRows.length - 1 ? styles.tableBodyRowLast : styles.tableBodyRow}>
                        <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.6 }]}>{r.category}</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 0.8, textAlign: 'center' }]}>{r.lots}</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'center' }]}>{shares}</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{price.toLocaleString('en-IN')}</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.5, textAlign: 'right' }]}>{amount.toLocaleString('en-IN')}</Text>
                      </View>
                    );
                  });
                })()}
              </>
            ) : (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, padding: 12 }}>
                Category breakdown calculation requires lot size & price band.
              </Text>
            )}
          </View>
        </View>

        {/* ── SECTION 2: SUBSCRIPTION ── */}
        <View onLayout={(e) => { sectionYMap.current['Subscription'] = e.nativeEvent.layout.y; }} style={{ marginTop: 16 }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>Subscription Figure</Text>
            {ipo.currentSubscription?.categories && ipo.currentSubscription.categories.length > 0 ? (
              ipo.currentSubscription.categories.map((sub, idx) => (
                <View key={idx} style={styles.cardRow}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>{sub.category}</Text>
                  <Text style={[styles.value, { color: colors.foreground }]}>{sub.subscriptionMultiple}x</Text>
                </View>
              ))
            ) : (
              <View style={[styles.subNoticeCard, { backgroundColor: isDark ? '#1C2E30' : '#F0FDFA', borderColor: '#0D948844' }]}>
                <Text style={[styles.subNoticeTitle, { color: '#0F766E' }]}>Subscription Figures Unavailable</Text>
                <Text style={[styles.subNoticeBody, { color: colors.foreground }]}>
                  Subscription data will be available once bidding begins.{'\n'}
                  Bidding will open from <Text style={{ fontFamily: 'GoogleSansFlex_700Bold' }}>10:00 AM to 5:00 PM</Text> on public issue days.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── SECTION 3: COMPANY INFO ── */}
        <View onLayout={(e) => { sectionYMap.current['Company Info'] = e.nativeEvent.layout.y; }} style={{ marginTop: 16 }}>
          {/* ABOUT COMPANY */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>About Company</Text>
            <Text style={[styles.disclaimerText, { color: colors.foreground }]}>
              {ipo.company?.aboutDescription || 'No description available.'}
            </Text>
          </View>

          {/* COMPANY FINANCIALS TABLE */}
          <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Company financials (Amount in ₹ Crore)</Text>
          <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {ipo.company?.financials && ipo.company.financials.length > 0 ? (
              <>
                <View style={[styles.tableHeaderRow, { backgroundColor: colors.tableHeaderBg }]}>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 1.5 }]}>Period</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 1.2, textAlign: 'right' }]}>Assets</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 1.2, textAlign: 'right' }]}>Revenue</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.tableHeaderForeground, flex: 1.2, textAlign: 'right' }]}>Profit</Text>
                </View>
                {ipo.company.financials.map((row: any, idx: number) => (
                  <View key={idx} style={idx === ipo.company!.financials!.length - 1 ? styles.tableBodyRowLast : styles.tableBodyRow}>
                    <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.5 }]}>{row.fiscalPeriod || row.period || '—'}</Text>
                    <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.totalAssets ?? row.assets ?? '—'}</Text>
                    <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.totalRevenue ?? row.revenue ?? '—'}</Text>
                    <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.pat ?? row.profit ?? '—'}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, padding: 12 }}>
                Financial data not available.
              </Text>
            )}
          </View>

          {/* KEY FINANCIAL RATIOS */}
          <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Key Financial Ratios</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>EBITDA</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{ipo.company?.financials?.[0]?.ebitda != null ? `${ipo.company.financials[0].ebitda}` : '—'}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>ROE %</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{ipo.company?.financials?.[0]?.roePercentage != null ? `${ipo.company.financials[0].roePercentage}%` : '—'}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>PAT Margin %</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{ipo.company?.financials?.[0]?.patMarginPercent != null ? `${ipo.company.financials[0].patMarginPercent}%` : '—'}</Text>
            </View>
          </View>

          {/* COMPANY CONTACT DETAILS */}
          <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Company Contact Details</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Name</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{companyName}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Phone</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{ipo.company?.phone || '—'}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{ipo.company?.email || '—'}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Website</Text>
              {ipo.company?.website ? (
                <TouchableOpacity onPress={() => handleOpenUrl(ipo.company?.website)}>
                  <Text style={[styles.value, { color: colors.primary }]}>{ipo.company.website}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.value, { color: colors.foreground }]}>—</Text>
              )}
            </View>
          </View>
        </View>

        {/* ── SECTION 4: DOCS & ANCHOR LIST ── */}
        <View onLayout={(e) => { sectionYMap.current['Docs'] = e.nativeEvent.layout.y; }} style={{ marginTop: 16 }}>
          {/* Document Filings Card */}
          {(() => {
            const drhpDoc = ipo.documents?.find((d) => d.documentType === 'DRHP');
            const rhpDoc = ipo.documents?.find((d) => d.documentType === 'RHP');
            const prospectusDoc = ipo.documents?.find((d) => d.documentType === 'PROSPECTUS');
            const anchorDoc = ipo.documents?.find((d) => d.documentType === 'ANCHOR_LIST');

            const drhpUrl = (ipo.drhpUrl || drhpDoc?.sourceUrl || drhpDoc?.fileUrl || drhpDoc?.documentUrl || '').trim();
            const rhpUrl = (ipo.rhpUrl || rhpDoc?.sourceUrl || rhpDoc?.fileUrl || rhpDoc?.documentUrl || '').trim();
            const prospectusUrl = (ipo.prospectusUrl || prospectusDoc?.sourceUrl || prospectusDoc?.fileUrl || prospectusDoc?.documentUrl || '').trim();
            const anchorListUrl = (ipo.anchorListUrl || ipo.anchorDetails?.documentUrl || anchorDoc?.sourceUrl || anchorDoc?.fileUrl || anchorDoc?.documentUrl || '').trim();

            const availableDocs = [
              { title: 'DRHP Prospectus', url: drhpUrl, icon: 'file-text' as const },
              { title: 'RHP Prospectus', url: rhpUrl, icon: 'file-text' as const },
              { title: 'Final Prospectus', url: prospectusUrl, icon: 'file-text' as const },
              { title: 'Anchor List', url: anchorListUrl, icon: 'users' as const },
            ].filter((d) => Boolean(d.url));

            if (ipo.documents && Array.isArray(ipo.documents)) {
              ipo.documents.forEach((doc) => {
                const url = (doc.fileUrl || doc.documentUrl || doc.sourceUrl || '').trim();
                if (url && doc.documentType === 'OTHER') {
                  const title = doc.title || 'Other Document';
                  if (!availableDocs.some((d) => d.url === url)) {
                    availableDocs.push({ title, url, icon: 'file-text' as const });
                  }
                }
              });
            }

            if (availableDocs.length === 0) {
              return (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>
                    IPO Prospectus & Official Filings
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginTop: 8 }}>
                    No documents uploaded
                  </Text>
                </View>
              );
            }

            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>
                  IPO Prospectus & Official Filings
                </Text>

                {availableDocs.map((doc, idx) => (
                  <TouchableOpacity
                    key={doc.title + idx}
                    onPress={() => handleOpenUrl(doc.url)}
                    style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: idx === availableDocs.length - 1 ? 0 : 1, borderBottomColor: colors.border }]}
                  >
                    <Feather name={doc.icon} size={16} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium', color: colors.foreground, flex: 1 }}>
                      {doc.title}
                    </Text>
                    <Feather name="external-link" size={14} color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            );
          })()}

          {/* ANCHOR INVESTOR ALLOCATION COMPONENT */}
          <AnchorInvestorAllocation
            anchorDetails={ipo.anchorDetails}
            anchorListUrl={ipo.anchorListUrl || ipo.anchorDetails?.documentUrl}
            onOpenUrl={handleOpenUrl}
          />

          {/* OFFICIAL IPOVAULT DISCLAIMER CARD */}
          <View style={[styles.intelCardOrange, { backgroundColor: isDark ? '#37271E' : '#FFFBF8', borderColor: colors.primary + '44', marginTop: 16 }]}>
            <Text style={[styles.disclaimerTitle, { color: colors.primary }]}>Disclaimer</Text>
            <Text style={[styles.disclaimerBody, { color: colors.foreground }]}>
              Disclaimer: IPOVault provides data and tracking information for educational and reference purposes only. We are not a SEBI-registered advisor and do not provide financial or investment advice. All IPO details, GMP estimates, subscription data, and allotment tracking are gathered from public market sources and subject to market risks. Please consult a qualified financial advisor before making any investment decisions.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Sticky Action Bar — Login To Apply */}
      {(() => {
        const statusUpper = (ipo.status || '').toUpperCase();
        const isClosedOrPast = statusUpper === 'CLOSED' || statusUpper === 'ALLOTTED' || statusUpper === 'LISTED' || statusUpper.includes('CLOSED') || statusUpper.includes('ALLOT');
        if (isClosedOrPast) return null;

        return (
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.88}
              onPress={() =>
                router.push({
                  pathname: '/apply-ipo',
                  params: { ipoId: ipo.id },
                } as any)
              }
            >
              <Text style={styles.applyBtnText}>Apply Now</Text>
            </TouchableOpacity>
          </View>
        );
      })()}
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  value: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  applyBtn: {
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  detailTabBarWrap: {
    borderBottomWidth: 1,
    paddingTop: 4,
  },
  detailTabBarScroll: {
    paddingHorizontal: 16,
    gap: 20,
  },
  detailTabBtn: {
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  detailTabBtnActive: {
    borderBottomWidth: 2,
  },
  detailTabBtnText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  detailTabBtnTextActive: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  sectionTitleOrange: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 12,
    marginBottom: 8,
  },
  donutRingPlaceholder: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 16,
    borderColor: '#3B82F6',
    borderRightColor: '#10B981',
    borderBottomColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  tableCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tableHeaderCell: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  tableBodyRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff10',
  },
  tableBodyRowLast: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableCellLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  tableCellVal: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  intelCardOrange: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
    gap: 6,
  },
  disclaimerTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  disclaimerBody: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  chartContainerCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  chartPlotArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 10,
  },
  chartColPoint: {
    alignItems: 'center',
    gap: 4,
  },
  chartPointVal: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  chartDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartPointTime: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  subNoticeCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 6,
    gap: 6,
  },
  subNoticeTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  subNoticeBody: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  docRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  docBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textDecorationLine: 'underline',
  },
  disclaimerText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
});
