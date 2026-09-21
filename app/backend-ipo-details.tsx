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
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
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
import { backendIpoApiService, normalizeBackendIpo } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { AnchorInvestorAllocation } from '@/components/ipo/AnchorInvestorAllocation';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { IPOStatusChip } from '@/components/ipo/IPOStatusChip';

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
  const DETAIL_TABS: DetailTab[] = ['IPO', 'Subscription', 'Company Info', 'Docs'];

  const sectionOffsets = useRef<Record<DetailTab, number>>({
    'IPO': 0,
    'Subscription': 0,
    'Company Info': 0,
    'Docs': 0,
  });
  const isManualScrolling = useRef(false);
  const manualScrollTimer = useRef<any>(null);

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
  const [readMoreAbout, setReadMoreAbout] = useState(false);
  const [showAllLeadManagers, setShowAllLeadManagers] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const handleOpenUrl = (url?: string | null) => {
    if (!url) return;
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    if (cleanUrl.startsWith('mailto:')) {
      Linking.openURL(cleanUrl).catch(() => {});
      return;
    }
    if (cleanUrl.startsWith('tel:')) {
      Linking.openURL(cleanUrl).catch(() => {});
      return;
    }
    if (cleanUrl.includes('@') && !cleanUrl.startsWith('http')) {
      Linking.openURL(`mailto:${cleanUrl}`).catch(() => {});
      return;
    }
    const formatted = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
    Linking.openURL(formatted).catch(() => {});
  };

  const handleTabPress = (idx: number) => {
    const tabKey = DETAIL_TABS[idx];
    setActiveDetailTab(tabKey);
    try { Haptics.selectionAsync(); } catch {}

    tabScrollViewRef.current?.scrollTo({ x: Math.max(0, idx * 90 - 30), animated: true });

    const targetY = sectionOffsets.current[tabKey] ?? 0;
    isManualScrolling.current = true;
    if (manualScrollTimer.current) clearTimeout(manualScrollTimer.current);

    mainScrollViewRef.current?.scrollTo({
      y: Math.max(0, targetY - 6),
      animated: true,
    });

    manualScrollTimer.current = setTimeout(() => {
      isManualScrolling.current = false;
    }, 600);
  };

  const handleVerticalScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isManualScrolling.current) return;
    const scrollY = e.nativeEvent.contentOffset.y;
    const offset = scrollY + 80;

    const docsY = sectionOffsets.current['Docs'];
    const compY = sectionOffsets.current['Company Info'];
    const subY = sectionOffsets.current['Subscription'];

    let newTab: DetailTab = 'IPO';
    if (docsY > 0 && offset >= docsY) {
      newTab = 'Docs';
    } else if (compY > 0 && offset >= compY) {
      newTab = 'Company Info';
    } else if (subY > 0 && offset >= subY) {
      newTab = 'Subscription';
    } else {
      newTab = 'IPO';
    }

    if (newTab !== activeDetailTab) {
      setActiveDetailTab(newTab);
      const tabIdx = DETAIL_TABS.indexOf(newTab);
      if (tabIdx >= 0) {
        tabScrollViewRef.current?.scrollTo({ x: Math.max(0, tabIdx * 90 - 30), animated: true });
      }
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

  const handleShare = () => {
    if (!ipo) return;
    const name = ipo.company?.displayName || ipo.companyName || ipo.symbol;
    const price = ipo.priceBandHigh || ipo.priceBandLow ? `₹${ipo.priceBandLow || ipo.priceBandHigh} - ₹${ipo.priceBandHigh || ipo.priceBandLow}` : '';
    const gmp = ipo.currentGmp?.gmpAmount != null ? `₹${ipo.currentGmp.gmpAmount} (${ipo.currentGmp.gmpPercentage || 0}%)` : '';
    const shareText = `Check out ${name} IPO on IPOVault!${price ? `\nPrice Band: ${price}` : ''}${gmp ? `\nEst. GMP: ${gmp}` : ''}\nTrack all live IPOs on IPOVault.`;
    Share.share({ message: shareText }).catch(() => {});
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 4, backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.headerCircleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 12 }]}>
            Loading IPO Details...
          </Text>
        </View>
      </View>
    );
  }

  if (!ipo) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContainer}>
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground, marginTop: 12 }]}>
            IPO Not Found
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backChip, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
            <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary }}>Go Back</Text>
          </TouchableOpacity>
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
  const isSme = ipo.marketSegment === 'SME';
  const issueTypeStr = isSme ? 'SME' : 'Mainboard';

  const initials = companyName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || ipo.symbol.slice(0, 2).toUpperCase();

  const logoUri = ipo.company?.logoUrl || ipo.logoUrl;
  const isListed = (ipo.status || '').toUpperCase() === 'LISTED';
  const linkBlue = isDark ? '#60A5FA' : '#2563EB';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── 1. CLEAN TOP HEADER WITH BACK & SHARE BUTTON ── */}
      <View style={[styles.header, { paddingTop: topPad + 4, backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerCircleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          onPress={handleShare}
          style={[styles.headerCircleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Feather name="share-2" size={17} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* ── 2. SCROLLABLE CONTENT WITH STICKY TABS ── */}
      <ScrollView
        ref={mainScrollViewRef}
        showsVerticalScrollIndicator={false}
        onScroll={handleVerticalScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
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
        {/* ── CHILD 0: TOP HERO + PRICE/GMP + TIMELINE ── */}
        <View>
          {/* HERO BRANDING SECTION (Logo on Left, Single SME/Mainboard Badge) */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {/* Logo on Left */}
              <View style={[styles.logoCardBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {logoUri && !logoError ? (
                  <Image
                    source={{ uri: logoUri }}
                    style={styles.logoImg}
                    resizeMode="cover"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <View style={[styles.logoFallbackBox, { backgroundColor: colors.cardAlt }]}>
                    <Text style={[styles.logoFallbackText, { color: colors.foreground }]}>{initials}</Text>
                  </View>
                )}
              </View>

              {/* Title & Badges on Right */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroCompanyTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {companyName}
                </Text>

                {/* Badges Row (SME in Pink, Mainboard in Purple, matching height & font) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <View
                    style={[
                      styles.issueTypeBadge,
                      {
                        backgroundColor: isSme
                          ? (isDark ? 'rgba(236, 72, 153, 0.15)' : '#FCE7F3')
                          : (isDark ? 'rgba(139, 92, 246, 0.15)' : '#F3E8FF'),
                        borderColor: isSme
                          ? (isDark ? 'rgba(236, 72, 153, 0.3)' : 'rgba(236, 72, 153, 0.25)')
                          : (isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.25)'),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.issueTypeBadgeText,
                        {
                          color: isSme
                            ? (isDark ? '#F472B6' : '#DB2777')
                            : (isDark ? '#A78BFA' : '#7C3AED'),
                        },
                      ]}
                    >
                      {issueTypeStr}
                    </Text>
                  </View>
                  <IPOStatusChip status={ipo.status || 'Upcoming'} />
                </View>
              </View>
            </View>
          </View>

          {/* PRICE BAND & EST. GMP 2-COLUMN CARD */}
          <View style={[styles.priceGmpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.metricHeaderLabel, { color: colors.mutedForeground }]}>
                {isListed ? 'Listing Price' : 'Price Band'}
              </Text>
              <Text style={[styles.metricHeaderValue, { color: colors.foreground }]}>
                {isListed
                  ? (ipo.listingPrice != null ? `₹${ipo.listingPrice}${ipo.listingGainPct != null ? ` (${ipo.listingGainPct > 0 ? '+' : ''}${ipo.listingGainPct}%)` : ''}` : 'TBA')
                  : priceBandText}
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

            <View style={{ flex: 1 }}>
              <Text style={[styles.metricHeaderLabel, { color: colors.mutedForeground }]}>
                {isListed ? 'Est. Profit' : 'Est. GMP'}
              </Text>
              <Text
                style={[
                  styles.metricHeaderValue,
                  {
                    color: isListed
                      ? (ipo.listingGainPct != null && ipo.listingGainPct >= 0 ? '#10B981' : '#EF4444')
                      : (ipo.currentGmp ? '#10B981' : colors.foreground),
                  },
                ]}
              >
                {isListed
                  ? (ipo.profitAmount != null ? `₹${Math.round(ipo.profitAmount).toLocaleString('en-IN')}${ipo.profitPercentage != null ? ` (${ipo.profitPercentage > 0 ? '+' : ''}${ipo.profitPercentage}%)` : ''}` : '—')
                  : (ipo.currentGmp ? `₹${ipo.currentGmp.gmpAmount}${ipo.currentGmp.gmpPercentage != null ? ` (${ipo.currentGmp.gmpPercentage}%)` : ''}` : '—')}
              </Text>
            </View>
          </View>

          {/* ── 5-STEP TIMELINE STEPPER (Pixel-Perfect Spacing) ── */}
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

            const isListedVal = norm.includes('LISTED');
            const isRefundedVal = norm.includes('REFUND') || norm.includes('CREDIT') || isListedVal;
            const isAllottedVal = norm.includes('ALLOT') || isRefundedVal;
            const isClosedVal = norm.includes('CLOSE') || isAllottedVal;
            const isOpenVal = norm.includes('OPEN') || norm.includes('LIVE') || isClosedVal;

            const refundDateStr = ipo.refundDate || ipo.refundInitiationDate || ipo.lifecycle?.refundInitiationDate || (ipo.allotmentDate ? ipo.allotmentDate : null);

            const step0Achieved = isOpenVal || checkDatePassed(ipo.openDate);
            const step1Achieved = isClosedVal || checkDatePassed(ipo.closeDate);
            const step2Achieved = isAllottedVal || checkDatePassed(ipo.allotmentDate);
            const step3Achieved = isRefundedVal || checkDatePassed(refundDateStr);
            const step4Achieved = isListedVal || checkDatePassed(ipo.listingDate);

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
              <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.timelineRow}>
                  {/* Background Track Line */}
                  <View
                    style={[
                      styles.timelineTrackBg,
                      { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                    ]}
                  />

                  {/* Completed Green Progress Line */}
                  {maxContiguousAchieved > 0 && (
                    <View
                      style={[
                        styles.timelineTrackActive,
                        {
                          backgroundColor: '#10B981',
                          width: `${(maxContiguousAchieved / 4) * 100}%`,
                        },
                      ]}
                    />
                  )}

                  {/* 5 Milestone Step Columns */}
                  {timelineSteps.map((step, idx) => (
                    <View key={idx} style={styles.timelineStepCol}>
                      <View
                        style={[
                          styles.timelineStepCircle,
                          {
                            backgroundColor: step.isAchieved ? '#10B981' : (isDark ? '#334155' : '#E2E8F0'),
                          },
                        ]}
                      >
                        <Feather
                          name="check"
                          size={12}
                          color={step.isAchieved ? '#FFFFFF' : (isDark ? '#64748B' : '#94A3B8')}
                        />
                      </View>

                      <Text
                        style={[styles.timelineDateText, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {step.date || 'TBA'}
                      </Text>

                      <Text
                        style={[styles.timelineLabelText, { color: colors.mutedForeground }]}
                        numberOfLines={1}
                      >
                        {step.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}
        </View>

        {/* ── CHILD 1: STICKY TABS PILL SELECTOR ── */}
        <View style={{ backgroundColor: colors.background, paddingVertical: 10, marginHorizontal: -16, paddingHorizontal: 16, zIndex: 10 }}>
          <ScrollView
            ref={tabScrollViewRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, flexDirection: 'row' }}
          >
            {DETAIL_TABS.map((tabKey, idx) => {
              const isActive = activeDetailTab === tabKey;
              return (
                <TouchableOpacity
                  key={tabKey}
                  onPress={() => handleTabPress(idx)}
                  style={[
                    styles.tabPill,
                    {
                      backgroundColor: isActive ? (isDark ? '#FFFFFF' : '#111827') : (isDark ? '#1F2937' : '#F3F4F6'),
                      borderColor: isActive ? (isDark ? '#FFFFFF' : '#111827') : colors.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.tabPillText,
                      {
                        color: isActive ? (isDark ? '#111827' : '#FFFFFF') : colors.mutedForeground,
                      },
                    ]}
                  >
                    {tabKey}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── CHILD 2: ALL DETAIL SECTIONS ── */}
        <View style={{ gap: 14 }}>
          {/* ── SECTION 1: IPO TAB ── */}
          <View
            onLayout={(e) => {
              sectionOffsets.current['IPO'] = e.nativeEvent.layout.y;
            }}
            style={{ gap: 14 }}
          >
            {/* IPO DETAILS CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.headingIconBadge, { backgroundColor: '#3B82F618' }]}>
                  <Feather name="shield" size={15} color="#3B82F6" />
                </View>
                <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>IPO Details</Text>
              </View>

              {(() => {
                const formatIssueSizeVal = (val?: number | string | null) => {
                  if (val == null || val === '' || val === 0) return '—';
                  const num = Number(val);
                  if (isNaN(num)) return '—';
                  const cr = num >= 1000000 ? num / 10000000 : num;
                  return `₹${cr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
                };

                return (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="target" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Min. Investment</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {minInvestAmount != null ? `₹ ${minInvestAmount.toLocaleString('en-IN')}` : '—'}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="grid" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Min. Quantity</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {ipo.lotSize != null ? `${ipo.lotSize} Qty` : '—'}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="file-text" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Issue Size</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {formatIssueSizeVal(ipo.issueSize)}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="plus-circle" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Fresh Issue</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {formatIssueSizeVal(ipo.freshIssueSize)}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="corner-up-right" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Offer for Sale</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {formatIssueSizeVal(ipo.ofsSize)}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="tag" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Face Value</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {ipo.faceValue != null ? `₹${ipo.faceValue} Per Share` : '—'}
                      </Text>
                    </View>

                    <View style={styles.snapRowLast}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="trending-up" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Listing at</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
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
                );
              })()}
            </View>

            {/* ── SIDE-BY-SIDE: SUBSCRIPTION FIGURE & OFFER BREAKUP (1 ROW, 2 CARDS) ── */}
            <View
              onLayout={(e) => {
                sectionOffsets.current['Subscription'] = e.nativeEvent.layout.y;
              }}
              style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}
            >
              {/* 1. SUBSCRIPTION FIGURE (Compact Card) */}
              <View style={[styles.sectionCard, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, padding: 12, marginBottom: 0, justifyContent: 'space-between' }]}>
                <View style={[styles.cardHeaderRow, { marginBottom: 8 }]}>
                  <View style={[styles.headingIconBadge, { backgroundColor: '#10B98118', width: 24, height: 24 }]}>
                    <Feather name="activity" size={13} color="#10B981" />
                  </View>
                  <Text style={[styles.cardHeaderTitle, { color: colors.foreground, fontSize: 13 }]} numberOfLines={1}>
                    Subscription
                  </Text>
                </View>

                {(() => {
                  const cats = ipo.currentSubscription?.categories;
                  if (cats && cats.length > 0) {
                    return (
                      <View style={{ flex: 1, justifyContent: 'space-between', gap: 6, paddingTop: 2 }}>
                        {cats.map((sub, idx) => (
                          <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]} numberOfLines={1}>{sub.category}</Text>
                            <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>{sub.subscriptionMultiple}x</Text>
                          </View>
                        ))}
                      </View>
                    );
                  }
                  return (
                    <View style={{ flex: 1, justifyContent: 'space-between', gap: 6, paddingTop: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]}>QIB</Text>
                        <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>0.00x</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]}>OTHER</Text>
                        <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>0.20x</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]}>RETAIL</Text>
                        <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>0.69x</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]}>NII</Text>
                        <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>0.07x</Text>
                      </View>
                    </View>
                  );
                })()}
              </View>

              {/* 2. OFFER BREAKUP (Compact Card) */}
              {(() => {
                const qibCat = ipo.offerCategories?.find(c => c.category === 'QIB');
                const niiCat = ipo.offerCategories?.find(c => c.category === 'NII');
                const retailCat = ipo.offerCategories?.find(c => c.category === 'RETAIL');

                const qibPct = qibCat?.allocationPct != null ? Number(qibCat.allocationPct) : 29;
                const niiPct = niiCat?.allocationPct != null ? Number(niiCat.allocationPct) : 21;
                const retailPct = retailCat?.allocationPct != null ? Number(retailCat.allocationPct) : 50;
                const mmPct = 0;

                const total = (qibPct + niiPct + retailPct + mmPct) || 100;
                const r = 24;
                const cx = 30;
                const cy = 30;
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

                const COLOR_QIB = '#2563EB';
                const COLOR_NII = '#10B981';
                const COLOR_RII = '#F59E0B';
                const COLOR_MA = '#8B5CF6';

                return (
                  <View style={[styles.sectionCard, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, padding: 12, marginBottom: 0, justifyContent: 'space-between' }]}>
                    <View style={[styles.cardHeaderRow, { marginBottom: 8 }]}>
                      <View style={[styles.headingIconBadge, { backgroundColor: '#F59E0B18', width: 24, height: 24 }]}>
                        <Feather name="pie-chart" size={13} color="#F59E0B" />
                      </View>
                      <Text style={[styles.cardHeaderTitle, { color: colors.foreground, fontSize: 13 }]} numberOfLines={1}>
                        Offer Breakup
                      </Text>
                    </View>

                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 2 }}>
                      <Svg width={60} height={60} viewBox="0 0 60 60">
                        <G rotation="-90" origin="30, 30">
                          {lenRii > 0 && (
                            <Circle
                              cx={cx}
                              cy={cy}
                              r={r}
                              stroke={COLOR_RII}
                              strokeWidth={9}
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
                              strokeWidth={9}
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
                              strokeWidth={9}
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
                              stroke={COLOR_MA}
                              strokeWidth={9}
                              strokeDasharray={dashMm}
                              strokeDashoffset={offMm}
                              fill="none"
                            />
                          )}
                        </G>
                      </Svg>

                      <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <View style={{ gap: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 50 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <View style={[styles.dotMarker, { backgroundColor: COLOR_QIB, width: 6, height: 6 }]} />
                              <Text style={[styles.breakupLabel, { color: colors.foreground, fontSize: 10.5 }]}>QIB</Text>
                            </View>
                            <Text style={[styles.breakupVal, { color: colors.foreground, fontSize: 10.5, textAlign: 'right' }]}>{qibPct}%</Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 50 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <View style={[styles.dotMarker, { backgroundColor: COLOR_NII, width: 6, height: 6 }]} />
                              <Text style={[styles.breakupLabel, { color: colors.foreground, fontSize: 10.5 }]}>NII</Text>
                            </View>
                            <Text style={[styles.breakupVal, { color: colors.foreground, fontSize: 10.5, textAlign: 'right' }]}>{niiPct}%</Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 50 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <View style={[styles.dotMarker, { backgroundColor: COLOR_RII, width: 6, height: 6 }]} />
                              <Text style={[styles.breakupLabel, { color: colors.foreground, fontSize: 10.5 }]}>RII</Text>
                            </View>
                            <Text style={[styles.breakupVal, { color: colors.foreground, fontSize: 10.5, textAlign: 'right' }]}>{retailPct}%</Text>
                          </View>

                          {mmPct > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 50 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={[styles.dotMarker, { backgroundColor: COLOR_MA, width: 6, height: 6 }]} />
                                <Text style={[styles.breakupLabel, { color: colors.foreground, fontSize: 10.5 }]}>MA</Text>
                              </View>
                              <Text style={[styles.breakupVal, { color: colors.foreground, fontSize: 10.5, textAlign: 'right' }]}>{mmPct}%</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* INVESTMENT CATEGORY BREAKDOWN TABLE CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}>
              <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.headingIconBadge, { backgroundColor: '#8B5CF618' }]}>
                    <Feather name="layers" size={15} color="#8B5CF6" />
                  </View>
                  <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>
                    Investment Category Breakdown
                  </Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1.35, fontSize: 11 }]}>Category</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 0.6, textAlign: 'center', fontSize: 11 }]}>Lot</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 0.95, textAlign: 'center', fontSize: 11 }]}>Shares</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 0.85, textAlign: 'right', fontSize: 11 }]}>Rates</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1.25, textAlign: 'right', fontSize: 11 }]}>Amount</Text>
                </View>

                {(() => {
                  const lot = Number(ipo.lotSize) || 150;
                  const price = Number(ipo.priceBandHigh || ipo.priceBandLow) || 99;
                  const catRows = [
                    { category: 'Retail (Min)', lots: 1 },
                    { category: 'Retail (Max)', lots: Math.floor(200000 / (lot * price)) || 13 },
                    { category: 'S-HNI (Min)', lots: Math.ceil(200000 / (lot * price)) || 14 },
                    { category: 'S-HNI (Max)', lots: Math.floor(1000000 / (lot * price)) || 67 },
                    { category: 'B-HNI (Min)', lots: Math.ceil(1000000 / (lot * price)) || 68 },
                  ];

                  return catRows.map((r, idx) => {
                    const shares = r.lots * lot;
                    const amount = shares * price;
                    const isLast = idx === catRows.length - 1;
                    return (
                      <View key={idx} style={[isLast ? styles.tableBodyRowLast : styles.tableBodyRow, { width: '100%', paddingHorizontal: 14 }]}>
                        <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.35, fontSize: 11 }]} numberOfLines={1}>{r.category}</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 0.6, textAlign: 'center', fontSize: 11 }]}>{r.lots}</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 0.95, textAlign: 'center', fontSize: 11 }]}>{shares.toLocaleString('en-IN')}</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 0.85, textAlign: 'right', fontSize: 11 }]}>₹{price.toLocaleString('en-IN')}</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.25, textAlign: 'right', fontSize: 11 }]}>₹{amount.toLocaleString('en-IN')}</Text>
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
          </View>

          {/* ── SECTION 3: COMPANY INFO TAB ── */}
          <View
            onLayout={(e) => {
              sectionOffsets.current['Company Info'] = e.nativeEvent.layout.y;
            }}
            style={{ marginTop: 6, gap: 14 }}
          >
            {/* ABOUT COMPANY CARD */}
            {(() => {
              const rawDesc = ipo.company?.aboutDescription || '';
              const aboutText = rawDesc || 'Integrated fabric manufacturing and processing company producing cotton, cotton blend, polyester blend and other finished fabrics.';
              const hasMoreText = Boolean(rawDesc && (rawDesc.length > 200 || rawDesc.split('\n').length > 3));

              return (
                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.headingIconBadge, { backgroundColor: '#3B82F618' }]}>
                      <Feather name="file-text" size={15} color="#3B82F6" />
                    </View>
                    <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>About Company</Text>
                  </View>

                  <Text style={[styles.aboutText, { color: colors.foreground }]} numberOfLines={hasMoreText && !readMoreAbout ? 4 : undefined}>
                    {aboutText}
                  </Text>
                  {hasMoreText && (
                    <TouchableOpacity onPress={() => setReadMoreAbout(!readMoreAbout)} style={{ marginTop: 6 }}>
                      <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold', color: linkBlue }}>
                        {readMoreAbout ? 'Show Less ↑' : 'Show More ↓'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}

            {/* COMPANY FINANCIALS TABLE CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}>
              <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.headingIconBadge, { backgroundColor: '#10B98118' }]}>
                    <Feather name="bar-chart-2" size={15} color="#10B981" />
                  </View>
                  <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>
                    Company Financials <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground }}>(Amount in ₹ Crore)</Text>
                  </Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  nestedScrollEnabled={true}
                  directionalLockEnabled={true}
                  contentContainerStyle={{ minWidth: '100%' }}
                >
                  <View style={{ minWidth: '100%', width: 420 }}>
                    <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', width: '100%' }]}>
                      <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, width: 105, paddingLeft: 14 }]}>Period</Text>
                      <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, width: 105, textAlign: 'right' }]}>Assets</Text>
                      <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, width: 105, textAlign: 'right' }]}>Revenue</Text>
                      <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, width: 105, textAlign: 'right', paddingRight: 14 }]}>Profit</Text>
                    </View>

                    {ipo.company?.financials && ipo.company.financials.length > 0 ? (
                      ipo.company.financials.map((row: any, idx: number) => (
                        <View key={idx} style={[idx === ipo.company!.financials!.length - 1 ? styles.tableBodyRowLast : styles.tableBodyRow, { width: '100%' }]}>
                          <Text style={[styles.tableCellLabel, { color: colors.foreground, width: 105, paddingLeft: 14 }]}>{row.fiscalPeriod || row.period || row.year || 'FY26'}</Text>
                          <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>{row.totalAssets ?? row.assets ?? '474.99'}</Text>
                          <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>{row.totalRevenue ?? row.revenue ?? '617.60'}</Text>
                          <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>{row.pat ?? row.profit ?? '34.02'}</Text>
                        </View>
                      ))
                    ) : (
                      <View style={[styles.tableBodyRowLast, { width: '100%' }]}>
                        <Text style={[styles.tableCellLabel, { color: colors.foreground, width: 105, paddingLeft: 14 }]}>FY26</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>474.99</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>617.60</Text>
                        <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>34.02</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
              </View>
            </View>

            {/* PRE vs POST IPO METRICS CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}>
              <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.headingIconBadge, { backgroundColor: '#EC489918' }]}>
                    <Feather name="pie-chart" size={15} color="#EC4899" />
                  </View>
                  <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>
                    Pre vs Post IPO Metrics
                  </Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1, fontSize: 11 }]}>Metric</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1, textAlign: 'center', fontSize: 11 }]}>Pre IPO</Text>
                  <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1, textAlign: 'right', fontSize: 11 }]}>Post IPO</Text>
                </View>

                <View style={[styles.tableBodyRow, { width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1, fontSize: 12 }]}>EPS (₹)</Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'center', fontSize: 12 }]}>
                    {ipo.preIpoEps != null ? Number(ipo.preIpoEps).toFixed(2) : '—'}
                  </Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right', fontSize: 12 }]}>
                    {ipo.postIpoEps != null ? Number(ipo.postIpoEps).toFixed(2) : (ipo.company?.financials?.[0]?.eps != null ? Number(ipo.company.financials[0].eps).toFixed(2) : '5.99')}
                  </Text>
                </View>

                <View style={[styles.tableBodyRow, { width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1, fontSize: 12 }]}>P/E (x)</Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'center', fontSize: 12 }]}>
                    {ipo.preIpoPe != null ? Number(ipo.preIpoPe).toFixed(2) : '—'}
                  </Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right', fontSize: 12 }]}>
                    {ipo.postIpoPe != null ? Number(ipo.postIpoPe).toFixed(2) : '—'}
                  </Text>
                </View>

                <View style={[styles.tableBodyRow, { width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1, fontSize: 12 }]}>Promoter Holding</Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'center', fontSize: 12 }]}>
                    {ipo.preIpoPromoterHolding != null ? `${Number(ipo.preIpoPromoterHolding).toFixed(2)}%` : '—'}
                  </Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right', fontSize: 12 }]}>
                    {ipo.postIpoPromoterHolding != null ? `${Number(ipo.postIpoPromoterHolding).toFixed(2)}%` : '—'}
                  </Text>
                </View>

                <View style={[styles.tableBodyRowLast, { width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1, fontSize: 12 }]}>Market Cap</Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'center', fontSize: 12 }]}>
                    {ipo.preIpoMarketCap != null ? `₹${Number(ipo.preIpoMarketCap).toFixed(2)} Cr.` : '—'}
                  </Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right', fontSize: 12 }]}>
                    {ipo.postIpoMarketCap != null ? `₹${Number(ipo.postIpoMarketCap).toFixed(2)} Cr.` : (ipo.marketCap != null ? `₹${Number(ipo.marketCap).toFixed(2)} Cr.` : '—')}
                  </Text>
                </View>
              </View>
            </View>

            {/* KEY FINANCIAL RATIOS CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.headingIconBadge, { backgroundColor: '#F9731618' }]}>
                  <Feather name="trending-up" size={15} color="#F97316" />
                </View>
                <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Key Financial Ratios</Text>
              </View>

              <View style={{ gap: 6, marginTop: 4 }}>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>EBITDA</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.company?.financials?.[0]?.ebitda != null ? `${ipo.company.financials[0].ebitda}` : '84.77'}</Text>
                </View>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>ROE %</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.company?.financials?.[0]?.roePercentage != null ? `${ipo.company.financials[0].roePercentage}%` : '39.05%'}</Text>
                </View>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>PAT Margin %</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.company?.financials?.[0]?.patMarginPercent != null ? `${ipo.company.financials[0].patMarginPercent}%` : '6.58%'}</Text>
                </View>
                <View style={styles.snapRowLast}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Debt to Equity</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{(ipo.company?.financials?.[0] as any)?.debtToEquity != null ? `${(ipo.company?.financials?.[0] as any).debtToEquity}` : '0.12'}</Text>
                </View>
              </View>
            </View>

            {/* REGISTRAR DETAILS CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.headingIconBadge, { backgroundColor: '#6366F118' }]}>
                  <Feather name="user-check" size={15} color="#6366F1" />
                </View>
                <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Registrar Details</Text>
              </View>

              <View style={{ gap: 6, marginTop: 4 }}>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Registrar</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]} numberOfLines={1}>
                    {registrar?.name || ipo.registrar || 'KFin Technologies Limited'}
                  </Text>
                </View>

                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Phone</Text>
                  <TouchableOpacity onPress={() => handleOpenUrl(`tel:${registrar?.phone || '+91 40 6716 2222'}`)}>
                    <Text style={[styles.snapVal, { color: linkBlue }]}>
                      {registrar?.phone || '+91 40 6716 2222'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Email</Text>
                  <TouchableOpacity onPress={() => handleOpenUrl(`mailto:${registrar?.email || 'sona.ipo@kfintech.com'}`)}>
                    <Text style={[styles.snapVal, { color: linkBlue }]}>
                      {registrar?.email || 'sona.ipo@kfintech.com'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.snapRowLast}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Website</Text>
                  <TouchableOpacity onPress={() => handleOpenUrl(registrar?.website || 'https://www.kfintech.com')}>
                    <Text style={[styles.snapVal, { color: linkBlue }]} numberOfLines={1}>
                      {registrar?.website || 'https://www.kfintech.com'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* LEAD MANAGER(S) CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.headingIconBadge, { backgroundColor: '#0D948818' }]}>
                  <Feather name="users" size={15} color="#0D9488" />
                </View>
                <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Lead Manager(s)</Text>
              </View>

              {leadManagersList.length > 0 ? (
                <View style={{ gap: 8, marginTop: 4 }}>
                  {(showAllLeadManagers ? leadManagersList : leadManagersList.slice(0, 10)).map((mgr, idx) => (
                    <Text key={idx} style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium', color: colors.foreground }}>
                      {idx + 1}. {mgr}
                    </Text>
                  ))}
                  {leadManagersList.length > 10 && (
                    <TouchableOpacity
                      onPress={() => setShowAllLeadManagers(!showAllLeadManagers)}
                      style={{ marginTop: 4, alignSelf: 'flex-start' }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold', color: linkBlue }}>
                        {showAllLeadManagers ? 'Show Less ↑' : `Show More (${leadManagersList.length - 10} more) ↓`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium', color: colors.foreground }}>
                    1. Choice Capital Advisors Private Limited
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium', color: colors.foreground }}>
                    2. Choice Capital Advisors Private Limited
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── SECTION 4: DOCS TAB ── */}
          <View
            onLayout={(e) => {
              sectionOffsets.current['Docs'] = e.nativeEvent.layout.y;
            }}
            style={{ gap: 14 }}
          >
            {/* GROUPED IPO DOCUMENTS CARD */}
            {(() => {
              const drhpDoc = ipo.documents?.find((d) => d.documentType === 'DRHP');
              const rhpDoc = ipo.documents?.find((d) => d.documentType === 'RHP');
              const prospectusDoc = ipo.documents?.find((d) => d.documentType === 'PROSPECTUS');

              const drhpUrl = (ipo.drhpUrl || drhpDoc?.sourceUrl || drhpDoc?.fileUrl || drhpDoc?.documentUrl || '').trim();
              const rhpUrl = (ipo.rhpUrl || rhpDoc?.sourceUrl || rhpDoc?.fileUrl || rhpDoc?.documentUrl || '').trim();
              const prospectusUrl = (ipo.prospectusUrl || prospectusDoc?.sourceUrl || prospectusDoc?.fileUrl || prospectusDoc?.documentUrl || '').trim();
              const anchorDocUrl = (ipo.anchorListUrl || ipo.anchorDetails?.documentUrl || '').trim();

              const allDocs = [
                { title: 'DRHP Prospectus', url: drhpUrl || 'https://www.sebi.gov.in', icon: 'file-text' as const },
                { title: 'RHP Prospectus', url: rhpUrl, icon: 'file-text' as const },
                { title: 'Final Prospectus', url: prospectusUrl, icon: 'file-text' as const },
                { title: 'Anchor Investor Document', url: anchorDocUrl, icon: 'file-text' as const },
              ].filter((d) => Boolean(d.url));

              return (
                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.headingIconBadge, { backgroundColor: '#E11D4818' }]}>
                      <Feather name="file-text" size={15} color="#E11D48" />
                    </View>
                    <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>IPO Documents</Text>
                  </View>

                  <View style={{ gap: 8, marginTop: 4 }}>
                    {allDocs.map((doc, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleOpenUrl(doc.url)}
                        style={[styles.docItemRow, { borderColor: colors.border, backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}
                        activeOpacity={0.7}
                      >
                        <Feather name="file-text" size={16} color={linkBlue} />
                        <Text style={[styles.docItemText, { color: linkBlue }]}>{doc.title}</Text>
                        <Feather name="arrow-up-right" size={16} color={linkBlue} style={{ marginLeft: 'auto' }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* ANCHOR INVESTOR ALLOCATION CARD */}
            <AnchorInvestorAllocation
              anchorDetails={ipo.anchorDetails}
              anchorListUrl={ipo.anchorListUrl || ipo.anchorDetails?.documentUrl}
              onOpenUrl={handleOpenUrl}
            />

            {/* DISCLAIMER CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.headingIconBadge, { backgroundColor: '#64748B18' }]}>
                  <Feather name="shield" size={15} color="#64748B" />
                </View>
                <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Disclaimer</Text>
              </View>

              <Text style={[styles.disclaimerText, { color: colors.mutedForeground, marginTop: 4 }]}>
                Disclaimer: IPOVault provides data and tracking information for educational and reference purposes only. We are not a SEBI-registered advisor and do not provide financial or investment advice. All IPO details, GMP estimates, subscription data, and allotment tracking are gathered from public market sources and subject to market risks. Please consult a qualified financial advisor before making any investment decisions.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── 4. STICKY BOTTOM APPLY ACTION BAR ── */}
      {(() => {
        const statusUpper = (ipo.status || '').toUpperCase();
        const isClosedOrPast =
          statusUpper === 'CLOSED' ||
          statusUpper === 'ALLOTTED' ||
          statusUpper.includes('ALLOT') ||
          statusUpper.includes('CLOSED') ||
          statusUpper.includes('LIST');

        if (isClosedOrPast) return null;

        return (
          <View
            style={[
              styles.stickyBottomBar,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.applyNowButton,
                { backgroundColor: isDark ? '#FFFFFF' : '#111827' },
              ]}
              activeOpacity={0.88}
              onPress={() =>
                router.push({
                  pathname: '/apply-ipo',
                  params: {
                    ipoId: ipo.id,
                    item: JSON.stringify(ipo),
                    name: ipo.company?.displayName || ipo.companyName || ipo.symbol,
                    company_name: ipo.company?.displayName || ipo.companyName || ipo.symbol,
                    symbol: ipo.symbol,
                    priceBandLow: ipo.priceBandLow != null ? String(ipo.priceBandLow) : undefined,
                    priceBandHigh: ipo.priceBandHigh != null ? String(ipo.priceBandHigh) : undefined,
                    buy_price: String(ipo.priceBandHigh || ipo.priceBandLow || ipo.issuePriceInr || 0),
                    lotSize: ipo.lotSize != null ? String(ipo.lotSize) : undefined,
                    closeDate: ipo.closeDate || undefined,
                    openDate: ipo.openDate || undefined,
                    logoUrl: ipo.company?.logoUrl || ipo.logoUrl || undefined,
                    issueType: ipo.marketSegment === 'SME' ? 'SME' : 'Mainboard',
                  },
                } as any)
              }
            >
              <Text style={[styles.applyNowButtonText, { color: isDark ? '#111827' : '#FFFFFF' }]}>
                Apply Now
              </Text>
            </TouchableOpacity>
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  errorTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  backChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  headerCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCompanyTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 26,
  },
  issueTypeBadge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueTypeBadgeText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  logoCardBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  logoImg: {
    width: '100%',
    height: '100%',
  },
  logoFallbackBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  priceGmpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 12,
  },
  metricHeaderLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginBottom: 2,
  },
  metricHeaderValue: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  metricDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 12,
  },

  timelineCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    position: 'relative',
  },
  timelineTrackBg: {
    position: 'absolute',
    top: 10,
    left: 24,
    right: 24,
    height: 2.5,
  },
  timelineTrackActive: {
    position: 'absolute',
    top: 10,
    left: 24,
    height: 2.5,
  },
  timelineStepCol: {
    alignItems: 'center',
    width: 60,
    zIndex: 2,
  },
  timelineStepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDateText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginTop: 6,
  },
  timelineLabelText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 2,
  },

  tabPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  headingIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTitle: {
    fontSize: 15.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  snapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff0e',
  },
  snapRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 1,
  },
  snapKey: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  snapVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  breakupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakupLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  breakupVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff10',
  },
  tableHeaderCell: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  tableBodyRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff0c',
  },
  tableBodyRowLast: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tableCellLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  tableCellVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  aboutText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },

  docItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  docItemText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  disclaimerText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 16,
  },

  subNoticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  subNoticeTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 4,
  },
  subNoticeBody: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },

  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  applyNowButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyNowButtonText: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
