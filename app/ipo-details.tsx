import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { IPOStatusChip } from '@/components/ipo/IPOStatusChip';
import { IPOSkeletonCard } from '@/components/ipo/IPOSkeleton';
import { AnchorInvestorAllocation } from '@/components/ipo/AnchorInvestorAllocation';
import { calculateNormalizedIPOStatus } from '@/services/ipo/statusNormalizer';
import { formatCurrency } from '@/utils/formatters';
import { useCompare } from '@/context/CompareContext';
import { MergeOfficialBanner } from '@/components/ipo/MergeOfficialBanner';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';

const TIMELINE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateShort(dateStr?: string | null): string {
  if (!dateStr) return 'TBA';
  const clean = dateStr.trim();
  if (!clean || clean.toUpperCase() === 'TBA' || clean.toUpperCase() === 'N/A') return 'TBA';

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/);
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (m >= 0 && m < 12 && !isNaN(d)) {
      return `${String(d).padStart(2, '0')} ${TIMELINE_MONTHS[m]}`;
    }
  }

  // YYYY-MM-DD or ISO string
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(clean)) {
    const datePart = clean.split('T')[0];
    const parts = datePart.split(/[-/]/);
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (m >= 0 && m < 12 && !isNaN(d)) {
      return `${String(d).padStart(2, '0')} ${TIMELINE_MONTHS[m]}`;
    }
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    return `${day} ${TIMELINE_MONTHS[d.getMonth()]}`;
  }
  return clean;
}

export default function IPODetailsScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { isInCompare, toggleCompare } = useCompare();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { id } = useLocalSearchParams<{ id: string }>();
  const repo = useMemo(() => new IPORepository(db), [db]);

  type DetailTab = 'IPO' | 'Subscription' | 'Company Info' | 'Docs';

  const { width: screenWidth } = useWindowDimensions();

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

  const handleTabPress = (idxOrKey: number | DetailTab) => {
    const tabKey = typeof idxOrKey === 'number' ? DETAIL_TABS[idxOrKey] : idxOrKey;
    const idx = typeof idxOrKey === 'number' ? idxOrKey : DETAIL_TABS.indexOf(idxOrKey);
    setActiveDetailTab(tabKey);
    try { Haptics.selectionAsync(); } catch {}

    if (idx !== -1) {
      tabScrollViewRef.current?.scrollTo({ x: Math.max(0, idx * 90 - 30), animated: true });
    }

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

  const [ipo, setIpo] = useState<IPOMasterRecord | null>(null);
  const [officialMatch, setOfficialMatch] = useState<IPOMasterRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [readMoreAbout, setReadMoreAbout] = useState(false);
  const [showAllLeadManagers, setShowAllLeadManagers] = useState(false);
  const [showEditGmpModal, setShowEditGmpModal] = useState(false);
  const [editGmpPercent, setEditGmpPercent] = useState('');
  const [editGmpAmount, setEditGmpAmount] = useState('');
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('IPO');

  const linkBlue = isDark ? '#60A5FA' : '#2563EB';

  const openGmpModal = () => {
    setEditGmpAmount(ipo?.gmp_amount != null ? String(ipo.gmp_amount) : '');
    setEditGmpPercent(ipo?.gmp_percent != null ? String(ipo.gmp_percent) : '');
    setShowEditGmpModal(true);
  };

  const handleEditGmpPercentChange = (val: string) => {
    setEditGmpPercent(val);
    const pct = parseFloat(val);
    const price = ipo?.price_band_max || ipo?.price_band_min || 0;
    if (!isNaN(pct) && price > 0) {
      const amt = (pct * price) / 100;
      setEditGmpAmount(Number.isInteger(amt) ? String(amt) : amt.toFixed(2).replace(/\.?0+$/, ''));
    } else if (!val) {
      setEditGmpAmount('');
    }
  };

  const handleEditGmpAmountChange = (val: string) => {
    setEditGmpAmount(val);
    const amt = parseFloat(val);
    const price = ipo?.price_band_max || ipo?.price_band_min || 0;
    if (!isNaN(amt) && price > 0) {
      const pct = (amt / price) * 100;
      setEditGmpPercent(Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, ''));
    } else if (!val) {
      setEditGmpPercent('');
    }
  };

  const saveGmp = async () => {
    if (!ipo) return;
    const gmpAmtNum = parseFloat(editGmpAmount);
    const gmpPctNum = parseFloat(editGmpPercent);
    const profitLot = !isNaN(gmpAmtNum) && ipo.lot_size ? gmpAmtNum * ipo.lot_size : null;
    try {
      await repo.updateGmp(
        ipo.id,
        !isNaN(gmpAmtNum) ? gmpAmtNum : null,
        !isNaN(gmpPctNum) ? gmpPctNum : null,
        profitLot
      );
      const updated = await repo.getById(ipo.id);
      if (updated) setIpo(updated);
      setShowEditGmpModal(false);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (e) {
      console.error('Failed to save GMP:', e);
    }
  };

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

  const loadData = async () => {
    if (!id) return;
    try {
      const record = await repo.getById(id);
      if (record) {
        setIpo(record);
        if (record.source_type === 'LOCAL') {
          const dups = await repo.findDuplicates(record.company_name || record.ipo_name, record.symbol);
          const official = dups.find((d) => d.id !== record.id && d.source_type !== 'LOCAL');
          setOfficialMatch(official || null);
        } else {
          setOfficialMatch(null);
        }
      }
    } catch (err) {
      console.error('Failed to load IPO detail:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [id])
  );

  useEffect(() => {
    const unsub = backendSyncEmitter.subscribe(() => {
      loadData();
    });
    return unsub;
  }, [id]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleToggleFav = async () => {
    if (!ipo) return;
    const nextFav = ipo.is_favorite === 1 ? 0 : 1;
    await repo.toggleFavorite(ipo.id, nextFav === 1);
    setIpo((prev) => (prev ? { ...prev, is_favorite: nextFav } : null));
    try { Haptics.selectionAsync(); } catch {}
  };

  const handleMerge = async () => {
    if (!ipo || !officialMatch) return;
    try {
      await repo.mergeManualWithOfficial(ipo.id, officialMatch);
      router.replace({
        pathname: '/ipo-details',
        params: { id: officialMatch.id },
      });
    } catch (err) {
      console.error('Failed to merge:', err);
    }
  };

  const handleShare = async () => {
    if (!ipo) return;
    const name = ipo.company_name || ipo.ipo_name;
    const price = ipo.price_band_max ? `₹${ipo.price_band_max}` : 'TBA';
    const gmp = ipo.gmp_amount ? ` | GMP: ₹${ipo.gmp_amount}` : '';
    try {
      await Share.share({
        message: `${name} IPO Details\nPrice: ${price}${gmp}\nTrack live on IPOVault!`,
      });
    } catch {}
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerCircleBtn}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <IPOSkeletonCard />
          <View style={{ height: 16 }} />
          <IPOSkeletonCard />
        </ScrollView>
      </View>
    );
  }

  if (!ipo) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerCircleBtn}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={styles.notFoundContainer}>
          <Feather name="alert-circle" size={48} color={colors.mutedForeground} />
          <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>IPO Not Found</Text>
          <Text style={[styles.notFoundSub, { color: colors.mutedForeground }]}>
            The requested IPO details could not be loaded.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backChip, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Text style={[styles.backChipText, { color: colors.foreground }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const normStatus = calculateNormalizedIPOStatus(ipo);
  const initials = (ipo.ipo_name || 'IP')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const priceBandText =
    ipo.price_band_min && ipo.price_band_max
      ? ipo.price_band_min === ipo.price_band_max
        ? `₹${ipo.price_band_max}`
        : `₹${ipo.price_band_min} - ₹${ipo.price_band_max}`
      : ipo.price_band_max
      ? `₹${ipo.price_band_max}`
      : 'TBA';

  const minInvestment =
    ipo.lot_size && (ipo.price_band_max || ipo.price_band_min)
      ? ipo.lot_size * (ipo.price_band_max || ipo.price_band_min || 0)
      : null;

  const intel = ipo.intelligence;
  const gmpAmt = ipo.gmp_amount;
  const gmpPct = ipo.gmp_percent;
  const inComp = isInCompare(ipo.id);

  // Financials & Intelligence data structures from backend
  const financialsList = intel?.financials || [];
  const leadManagersList = (ipo.lead_manager || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const issueTypeStr = ipo.issue_type || (ipo.ipo_name?.toLowerCase().includes('sme') ? 'SME' : 'Mainboard');
  const isSme = issueTypeStr.toUpperCase().includes('SME');
  const companyTitle = ipo.company_name || ipo.ipo_name;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => toggleCompare(ipo.id)}
            style={[
              styles.headerCircleBtn,
              {
                backgroundColor: inComp ? colors.primary : colors.card,
                borderColor: inComp ? colors.primary : colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <Feather name="columns" size={17} color={inComp ? colors.primaryForeground : colors.foreground} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleToggleFav}
            style={[
              styles.headerCircleBtn,
              {
                backgroundColor: ipo.is_favorite === 1 ? colors.primary : colors.card,
                borderColor: ipo.is_favorite === 1 ? colors.primary : colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <Feather name="bookmark" size={17} color={ipo.is_favorite === 1 ? colors.primaryForeground : colors.foreground} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShare}
            style={[styles.headerCircleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.8}
          >
            <Feather name="share-2" size={17} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 2. SCROLLABLE CONTENT WITH STICKY TABS ── */}
      <ScrollView
        ref={mainScrollViewRef}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        onScroll={handleVerticalScroll}
        scrollEventThrottle={16}
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
        {/* ── CHILD 0: TOP BRANDING, METRICS & TIMELINE CONTENT ── */}
        <View>
          {/* Banner if local manual IPO has official match */}
          {officialMatch && (
            <MergeOfficialBanner
              localIpo={ipo}
              officialIpo={officialMatch}
              onMerge={handleMerge}
            />
          )}

          {/* ── HERO BRANDING SECTION (Logo on Left, Single SME/Mainboard Badge) ── */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {/* Logo on Left - Image fills the box */}
              <View style={[styles.logoCardBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {ipo.logo_url && !logoError ? (
                  <Image
                    source={{ uri: ipo.logo_url }}
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
                  {companyTitle}
                </Text>

                {/* Badges Row (SME in Pink, Mainboard in Purple, matching height 22 & font) */}
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
                  <IPOStatusChip status={normStatus} />
                </View>
              </View>
            </View>
          </View>

          {/* ── PRICE BAND & EST. GMP 2-COLUMN CARD ── */}
          <View style={[styles.priceGmpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.metricHeaderLabel, { color: colors.mutedForeground }]}>
                {normStatus === 'LISTED' ? 'Listing Price' : 'Price Band'}
              </Text>
              <Text style={[styles.metricHeaderValue, { color: colors.foreground }]}>
                {normStatus === 'LISTED'
                  ? (ipo.listing_price != null ? `₹${ipo.listing_price}${ipo.listing_gain_percent != null ? ` (${ipo.listing_gain_percent > 0 ? '+' : ''}${ipo.listing_gain_percent}%)` : ''}` : 'TBA')
                  : priceBandText}
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

            <View style={{ flex: 1 }}>
              <Text style={[styles.metricHeaderLabel, { color: colors.mutedForeground }]}>
                {normStatus === 'LISTED' ? 'Est. Profit' : 'GMP'}
              </Text>
              <TouchableOpacity onPress={openGmpModal} activeOpacity={0.8}>
                <Text
                  style={[
                    styles.metricHeaderValue,
                    {
                      color: normStatus === 'LISTED'
                        ? (ipo.listing_gain_percent != null && ipo.listing_gain_percent >= 0 ? '#10B981' : '#EF4444')
                        : (gmpAmt != null ? (gmpAmt >= 0 ? '#10B981' : '#EF4444') : colors.foreground),
                    },
                  ]}
                >
                  {normStatus === 'LISTED'
                    ? ((ipo as any).profit_amount != null
                      ? `₹${Math.round((ipo as any).profit_amount).toLocaleString('en-IN')}${(ipo as any).profit_percent != null ? ` (${(ipo as any).profit_percent > 0 ? '+' : ''}${(ipo as any).profit_percent}%)` : ''}`
                      : (ipo.listing_price != null && ipo.price_band_max ? `₹${Math.round((ipo.listing_price - ipo.price_band_max) * (ipo.lot_size || 1)).toLocaleString('en-IN')}` : '—'))
                    : (gmpAmt != null ? `₹${gmpAmt}${gmpPct != null ? ` (${gmpPct}%)` : ''}` : '—')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 5-STEP TIMELINE STEPPER (Pixel-Perfect Spacing) ── */}
          {(() => {
            const norm = (normStatus || '').toUpperCase();

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

            const refundDateStr = ipo.refund_date || (ipo.allotment_date ? ipo.allotment_date : null);

            const step0Achieved = isOpen || checkDatePassed(ipo.open_date);
            const step1Achieved = isClosed || checkDatePassed(ipo.close_date);
            const step2Achieved = isAllotted || checkDatePassed(ipo.allotment_date);
            const step3Achieved = isRefunded || checkDatePassed(refundDateStr);
            const step4Achieved = isListed || checkDatePassed(ipo.listing_date);

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
              { label: 'Open', date: formatDateShort(ipo.open_date), isAchieved: step0Achieved },
              { label: 'Close', date: formatDateShort(ipo.close_date), isAchieved: step1Achieved },
              { label: 'Allotment', date: formatDateShort(ipo.allotment_date), isAchieved: step2Achieved },
              { label: 'Refund', date: formatDateShort(refundDateStr), isAchieved: step3Achieved },
              { label: 'Listing', date: formatDateShort(ipo.listing_date), isAchieved: step4Achieved },
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
                        {minInvestment != null ? `₹ ${minInvestment.toLocaleString('en-IN')}` : '—'}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="grid" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Min. Quantity</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {ipo.lot_size != null ? `${ipo.lot_size} Qty` : '—'}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="file-text" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Issue Size</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {formatIssueSizeVal(ipo.issue_size)}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="plus-circle" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Fresh Issue</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {formatIssueSizeVal((ipo as any).fresh_issue_size)}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="corner-up-right" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Offer for Sale</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {formatIssueSizeVal((ipo as any).ofs_size)}
                      </Text>
                    </View>

                    <View style={styles.snapRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="tag" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Face Value</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {ipo.face_value != null ? `₹${ipo.face_value} Per Share` : '—'}
                      </Text>
                    </View>

                    <View style={styles.snapRowLast}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="trending-up" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Listing at</Text>
                      </View>
                      <Text style={[styles.snapVal, { color: colors.foreground }]}>
                        {(() => {
                          const ex = (ipo.exchange || '').trim().toUpperCase();
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

                <View style={{ flex: 1, justifyContent: 'space-between', gap: 6, paddingTop: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]}>QIB</Text>
                    <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                      {ipo.qib_sub != null ? `${ipo.qib_sub.toFixed(2)}x` : '0.00x'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]}>OTHER</Text>
                    <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                      {ipo.nii_sub != null ? `${ipo.nii_sub.toFixed(2)}x` : '0.20x'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]}>RETAIL</Text>
                    <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                      {ipo.retail_sub != null ? `${ipo.retail_sub.toFixed(2)}x` : '0.69x'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.snapKey, { color: colors.mutedForeground, fontSize: 11.5 }]}>NII</Text>
                    <Text style={[styles.snapVal, { color: colors.foreground, fontSize: 11.5, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                      {ipo.nii_sub != null ? `${ipo.nii_sub.toFixed(2)}x` : '0.07x'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 2. OFFER BREAKUP (Compact Card) */}
              {(() => {
                const qibPct = ipo.qib_quota_percent ?? 29;
                const niiPct = ipo.nii_quota_percent ?? 21;
                const retailPct = ipo.retail_quota_percent ?? 50;
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
                  const lot = ipo.lot_size || 150;
                  const price = ipo.price_band_max || ipo.price_band_min || 99;
                  const catRows = [
                    { category: 'Retail (Min)', lots: 1 },
                    { category: 'Retail (Max)', lots: 13 },
                    { category: 'S-HNI (Min)', lots: 14 },
                    { category: 'S-HNI (Max)', lots: 67 },
                    { category: 'B-HNI (Min)', lots: 68 },
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

          {/* ── SECTION 2: COMPANY INFO TAB ── */}
          <View
            onLayout={(e) => {
              sectionOffsets.current['Company Info'] = e.nativeEvent.layout.y;
            }}
            style={{ marginTop: 6, gap: 14 }}
          >
            {/* ABOUT COMPANY CARD */}
            {(() => {
              const rawDesc = (ipo.description || '').trim();
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
                    {rawDesc || 'Integrated fabric manufacturing and processing company producing cotton, cotton blend, polyester blend and other finished fabrics.'}
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
                  nestedScrollEnabled={true}
                  directionalLockEnabled={true}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ minWidth: '100%' }}
                >
                  <View style={{ minWidth: '100%', width: 420 }}>
                    <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', width: '100%' }]}>
                      <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, width: 105, paddingLeft: 14 }]}>Period</Text>
                      <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, width: 105, textAlign: 'right' }]}>Assets</Text>
                      <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, width: 105, textAlign: 'right' }]}>Revenue</Text>
                      <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, width: 105, textAlign: 'right', paddingRight: 14 }]}>Profit</Text>
                    </View>

                    {financialsList.length > 0 ? (
                      financialsList.map((row, idx) => (
                        <View key={idx} style={[idx === financialsList.length - 1 ? styles.tableBodyRowLast : styles.tableBodyRow, { width: '100%' }]}>
                          <Text style={[styles.tableCellLabel, { color: colors.foreground, width: 105, paddingLeft: 14 }]}>{row.year}</Text>
                          <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>{row.assets_cr != null ? row.assets_cr.toFixed(2) : '—'}</Text>
                          <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>{row.revenue_cr != null ? row.revenue_cr.toFixed(2) : '—'}</Text>
                          <Text style={[styles.tableCellVal, { color: colors.foreground, width: 105, textAlign: 'right' }]}>{row.pat_cr != null ? row.pat_cr.toFixed(2) : '—'}</Text>
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
                    {ipo.pre_ipo_eps != null ? Number(ipo.pre_ipo_eps).toFixed(2) : '—'}
                  </Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right', fontSize: 12 }]}>
                    {ipo.post_ipo_eps != null ? Number(ipo.post_ipo_eps).toFixed(2) : (ipo.eps != null ? Number(ipo.eps).toFixed(2) : '5.99')}
                  </Text>
                </View>

                <View style={[styles.tableBodyRow, { width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1, fontSize: 12 }]}>P/E (x)</Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'center', fontSize: 12 }]}>
                    {ipo.pre_ipo_pe != null ? Number(ipo.pre_ipo_pe).toFixed(2) : '—'}
                  </Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right', fontSize: 12 }]}>
                    {ipo.post_ipo_pe != null ? Number(ipo.post_ipo_pe).toFixed(2) : '—'}
                  </Text>
                </View>

                <View style={[styles.tableBodyRow, { width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1, fontSize: 12 }]}>Promoter Holding</Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'center', fontSize: 12 }]}>
                    {ipo.pre_ipo_promoter_holding != null ? `${Number(ipo.pre_ipo_promoter_holding).toFixed(2)}%` : '—'}
                  </Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right', fontSize: 12 }]}>
                    {ipo.post_ipo_promoter_holding != null ? `${Number(ipo.post_ipo_promoter_holding).toFixed(2)}%` : '—'}
                  </Text>
                </View>

                <View style={[styles.tableBodyRowLast, { width: '100%', paddingHorizontal: 14 }]}>
                  <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1, fontSize: 12 }]}>Market Cap</Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'center', fontSize: 12 }]}>
                    {ipo.pre_ipo_market_cap != null ? `₹${Number(ipo.pre_ipo_market_cap).toFixed(2)} Cr.` : '—'}
                  </Text>
                  <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right', fontSize: 12 }]}>
                    {ipo.post_ipo_market_cap != null ? `₹${Number(ipo.post_ipo_market_cap).toFixed(2)} Cr.` : (ipo.market_cap != null ? `₹${Number(ipo.market_cap).toFixed(2)} Cr.` : '—')}
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
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.ebitda_percent != null ? `${ipo.ebitda_percent}` : '84.77'}</Text>
                </View>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>ROE %</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.roe_percent != null ? `${ipo.roe_percent}%` : '39.05%'}</Text>
                </View>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>PAT Margin %</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.pat_percent != null ? `${ipo.pat_percent}%` : '6.58%'}</Text>
                </View>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>EPS</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{(ipo as any).eps != null ? `₹${(ipo as any).eps}` : '₹5.99'}</Text>
                </View>
                <View style={styles.snapRowLast}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>ROCE %</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{(ipo as any).roce_percent != null ? `${(ipo as any).roce_percent}%` : '19.69%'}</Text>
                </View>
              </View>
            </View>

            {/* PROMOTER HOLDING CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.headingIconBadge, { backgroundColor: '#8B5CF618' }]}>
                  <Feather name="shield" size={15} color="#8B5CF6" />
                </View>
                <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Promoter Holding</Text>
              </View>

              <View style={{ gap: 6, marginTop: 4 }}>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Pre-Issue</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>
                    {ipo.pre_ipo_promoter_holding != null ? `${Number(ipo.pre_ipo_promoter_holding).toFixed(2)}%` : '100.00%'}
                  </Text>
                </View>
                <View style={styles.snapRowLast}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Post-Issue</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>
                    {ipo.post_ipo_promoter_holding != null ? `${Number(ipo.post_ipo_promoter_holding).toFixed(2)}%` : '73.50%'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── SECTION 3: DOCS & ALL DOCUMENTS GROUPED ── */}
          <View
            onLayout={(e) => {
              sectionOffsets.current['Docs'] = e.nativeEvent.layout.y;
            }}
            style={{ marginTop: 6, gap: 14 }}
          >
            {/* REGISTRAR INFORMATION CARD */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.headingIconBadge, { backgroundColor: '#6366F118' }]}>
                  <Feather name="user-check" size={15} color="#6366F1" />
                </View>
                <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Registrar Information</Text>
              </View>

              <View style={{ gap: 10, marginTop: 4 }}>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Name</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                    {ipo.registrar || 'Kfin Technologies Limited'}
                  </Text>
                </View>

                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Phone</Text>
                  <TouchableOpacity onPress={() => handleOpenUrl(`tel:${ipo.registrar_phone || '+91 40 6716 2222'}`)}>
                    <Text style={[styles.snapVal, { color: linkBlue }]}>
                      {ipo.registrar_phone || '+91 40 6716 2222'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Email</Text>
                  <TouchableOpacity onPress={() => handleOpenUrl(`mailto:${ipo.registrar_email || 'sona.ipo@kfintech.com'}`)}>
                    <Text style={[styles.snapVal, { color: linkBlue }]}>
                      {ipo.registrar_email || 'sona.ipo@kfintech.com'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.snapRowLast}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Website</Text>
                  <TouchableOpacity onPress={() => handleOpenUrl(ipo.registrar_website || 'https://www.kfintech.com')}>
                    <Text style={[styles.snapVal, { color: linkBlue }]} numberOfLines={1}>
                      {ipo.registrar_website || 'https://www.kfintech.com'}
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

            {/* GROUPED IPO DOCUMENTS CARD (DRHP, RHP, Prospectus, Anchor doc in same section) */}
            {(() => {
              const drhpUrl = (ipo.drhp_url || ipo.intelligence?.drhp_url || '').trim();
              const rhpUrl = (ipo.rhp_url || ipo.intelligence?.rhp_url || '').trim();
              const prospectusUrl = (ipo.prospectus_url || '').trim();
              const anchorDocUrl = (ipo.anchor_list_url || ipo.intelligence?.anchor_investors_url || '').trim();

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
              anchorDetails={ipo.anchor_details}
              anchorSub={ipo.anchor_sub}
              anchorListUrl={ipo.anchor_list_url || ipo.intelligence?.anchor_investors_url}
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
        const normUpper = (normStatus || '').toUpperCase();
        const rawUpper = (ipo.status || '').toUpperCase();
        const isClosedOrPast =
          normUpper === 'CLOSED' ||
          normUpper === 'ALLOTTED' ||
          normUpper === 'ALLOTTED_PENDING' ||
          normUpper === 'ALLOTTED_AVAILABLE' ||
          normUpper === 'LISTING_UPCOMING' ||
          normUpper === 'LISTED' ||
          rawUpper === 'CLOSED' ||
          rawUpper === 'ALLOTTED' ||
          rawUpper === 'LISTED' ||
          rawUpper.includes('CLOSED') ||
          rawUpper.includes('ALLOT');

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
                  params: { ipoId: ipo.id },
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

      {/* ── Quick Edit GMP Modal ── */}
      {ipo ? (
        <Modal visible={showEditGmpModal} transparent animationType="slide" onRequestClose={() => setShowEditGmpModal(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowEditGmpModal(false)} activeOpacity={1} />
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom + 12, 20) }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />

            <Text style={{ fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground, marginBottom: 4 }}>
              Update Expected GMP
            </Text>
            <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginBottom: 16 }}>
              {ipo.ipo_name} (Max Price: ₹{ipo.price_band_max || ipo.price_band_min || '—'})
            </Text>

            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', color: colors.mutedForeground, textTransform: 'uppercase', marginBottom: 6 }}>
                GMP (₹ per share)
              </Text>
              <TextInput
                style={[styles.gmpInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                keyboardType="numeric"
                placeholder="e.g. 50"
                placeholderTextColor={colors.mutedForeground}
                value={editGmpAmount}
                onChangeText={handleEditGmpAmountChange}
              />
            </View>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', color: colors.mutedForeground, textTransform: 'uppercase', marginBottom: 6 }}>
                GMP (% of Issue Price)
              </Text>
              <TextInput
                style={[styles.gmpInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                keyboardType="numeric"
                placeholder="e.g. 25.5"
                placeholderTextColor={colors.mutedForeground}
                value={editGmpPercent}
                onChangeText={handleEditGmpPercentChange}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowEditGmpModal(false)}
                style={[styles.modalBtnSecondary, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveGmp} style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]}>
                <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primaryForeground }}>Save GMP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
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

  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  notFoundTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 12,
  },
  notFoundSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 4,
  },
  backChip: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
    borderWidth: 1,
  },
  backChipText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  gmpInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  modalBtnSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
