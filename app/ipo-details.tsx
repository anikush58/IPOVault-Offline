import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { IPOStatusChip } from '@/components/ipo/IPOStatusChip';
import { IPOSkeletonCard } from '@/components/ipo/IPOSkeleton';
import { evaluateIPORadarScore } from '@/services/ipo/radarScoringEngine';
import { calculateNormalizedIPOStatus } from '@/services/ipo/statusNormalizer';
import { formatCurrency } from '@/utils/formatters';
import { useCompare } from '@/context/CompareContext';
import { MergeOfficialBanner } from '@/components/ipo/MergeOfficialBanner';

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

  const mainScrollViewRef = useRef<ScrollView>(null);
  const tabScrollViewRef = useRef<ScrollView>(null);
  const sectionYMap = useRef<Record<string, number>>({});
  const isManualScrollingRef = useRef<boolean>(false);

  const [ipo, setIpo] = useState<IPOMasterRecord | null>(null);
  const [officialMatch, setOfficialMatch] = useState<IPOMasterRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [readMoreAbout, setReadMoreAbout] = useState(false);
  const [showEditGmpModal, setShowEditGmpModal] = useState(false);
  const [editGmpPercent, setEditGmpPercent] = useState('');
  const [editGmpAmount, setEditGmpAmount] = useState('');
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('IPO');

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
    const amt = editGmpAmount ? parseFloat(editGmpAmount) : null;
    const pct = editGmpPercent ? parseFloat(editGmpPercent) : null;
    const profitLot = (amt != null && ipo.lot_size != null) ? amt * ipo.lot_size : null;
    await repo.updateGmp(ipo.id, amt, pct, profitLot);
    const updated = await repo.getById(ipo.id);
    if (updated) setIpo(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEditGmpModal(false);
  };

  useEffect(() => {
    async function fetchDetails() {
      if (!id || id === 'undefined') {
        setLoading(false);
        router.back();
        return;
      }
      try {
        const record = await repo.getById(id);
        setIpo(record);

        if (record && record.source_type === 'LOCAL') {
          const dups = await repo.findDuplicates(record.company_name, record.symbol);
          const official = dups.find((d) => d.id !== record.id && d.source_type !== 'LOCAL');
          if (official) {
            setOfficialMatch(official);
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('[IPODetailsScreen] Failed to fetch IPO details', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [id, repo]);

  const handleToggleFav = async () => {
    if (!ipo) return;
    Haptics.selectionAsync();
    const isFav = ipo.is_favorite === 1;
    await repo.toggleFavorite(ipo.id, !isFav);
    setIpo({ ...ipo, is_favorite: isFav ? 0 : 1 });
  };

  const handleMerge = async (localId: string, official: IPOMasterRecord) => {
    await repo.mergeManualWithOfficial(localId, official);
    setIpo(official);
    setOfficialMatch(null);
  };

  const handleOpenUrl = (url?: string) => {
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

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPO Intelligence</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={{ padding: 16 }}>
          <IPOSkeletonCard />
          <IPOSkeletonCard />
        </View>
      </View>
    );
  }

  if (!ipo) {
    return (
      <View style={[styles.notFoundContainer, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={48} color={colors.mutedForeground} />
        <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>IPO Record Not Found</Text>
        <Text style={[styles.notFoundSub, { color: colors.mutedForeground }]}>
          The requested IPO intelligence record could not be loaded.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.backChipText, { color: colors.primary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const normStatus = calculateNormalizedIPOStatus(ipo);
  const radar = evaluateIPORadarScore(ipo);
  const intel = ipo.intelligence;

  const initials = (ipo.company_name || ipo.ipo_name || 'I')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const priceBandText =
    ipo.price_band_min && ipo.price_band_max
      ? ipo.price_band_min === ipo.price_band_max
        ? formatCurrency(ipo.price_band_max)
        : `${formatCurrency(ipo.price_band_min)} - ${formatCurrency(ipo.price_band_max)}`
      : ipo.price_band_max
      ? formatCurrency(ipo.price_band_max)
      : ipo.price_band_min
      ? formatCurrency(ipo.price_band_min)
      : 'TBA';

  const minInvestment =
    (ipo.price_band_max || ipo.price_band_min) && ipo.lot_size
      ? (ipo.price_band_max || ipo.price_band_min)! * ipo.lot_size
      : null;

  const gmpAmt = ipo.gmp_amount;
  const gmpPct = ipo.gmp_percent;
  const profitLot = ipo.profit_per_lot;
  const inComp = isInCompare(ipo.id);

  // Financials & Intelligence data structures from backend
  const financialsList = intel?.financials || [];
  const peersList = intel?.peer_comparison || [];
  const strengthsList = intel?.strengths || [];
  const risksList = intel?.risks || [];

  const leadManagersList = useMemo(() => {
    if (!ipo?.lead_manager) return [];
    return ipo.lead_manager
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [ipo?.lead_manager]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── 1. COMPACT TOP NAV BAR ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: 'center' }]} numberOfLines={1}>
            {ipo.company_name || ipo.ipo_name}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton
            name="columns"
            variant={inComp ? 'primary' : 'surface'}
            size="md"
            onPress={() => toggleCompare(ipo.id)}
          />

          <IconButton
            name="bookmark"
            variant={ipo.is_favorite === 1 ? 'primary' : 'surface'}
            size="md"
            onPress={handleToggleFav}
          />

          <IconButton
            name="share-2"
            variant="surface"
            size="md"
            onPress={() => Share.share({ message: `Check out ${ipo.company_name || ipo.ipo_name} on IPOVault!` })}
          />
        </View>
      </View>

      {/* ── 2. TOP TABS STRIP (Scroll-synced Pills with no bottom border line) ── */}
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
                  backgroundColor: isActive ? (isDark ? '#F8FAFC' : '#0B132B') : (isDark ? '#1E293B' : '#FFFFFF'),
                  borderColor: isActive ? (isDark ? '#F8FAFC' : '#0B132B') : (isDark ? '#334155' : '#E2E8F0'),
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontFamily: 'GoogleSansFlex_700Bold',
                    color: isActive ? (isDark ? '#0B132B' : '#FFFFFF') : (isDark ? '#F8FAFC' : '#0B132B'),
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner if local manual IPO has official match */}
        {officialMatch && (
          <MergeOfficialBanner
            localIpo={ipo}
            officialIpo={officialMatch}
            onMerge={handleMerge}
          />
        )}

        {/* ── SECTION 1: IPO OVERVIEW ── */}
        <View onLayout={(e) => { sectionYMap.current['IPO'] = e.nativeEvent.layout.y; }}>
          {/* HERO CARD (Redesigned with logo avatar & 2-column stats box) */}
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, borderRadius: 18 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <View style={{ width: 54, height: 54, borderRadius: 14, overflow: 'hidden', backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                {(ipo.logo_url || ipo.logoUrl || ipo.company?.logoUrl) && !logoError ? (
                  <Image source={{ uri: ipo.logo_url || ipo.logoUrl || ipo.company?.logoUrl }} style={{ width: 44, height: 44 }} resizeMode="contain" onError={() => setLogoError(true)} />
                ) : (
                  <Text style={{ fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary }}>{initials}</Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground, marginBottom: 4 }}>
                  {ipo.company_name || ipo.ipo_name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium', color: colors.mutedForeground }}>
                    {ipo.issue_type || 'Mainboard'}
                  </Text>
                  <IPOStatusChip status={normStatus} />
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium', color: colors.mutedForeground, marginBottom: 2 }}>
                  Bid Price
                </Text>
                <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground }}>
                  {priceBandText}
                </Text>
              </View>

              <View style={{ width: 1, backgroundColor: colors.border }} />

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium', color: colors.mutedForeground, marginBottom: 2 }}>
                  Est. GMP
                </Text>
                <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: gmpAmt != null ? '#10B981' : colors.foreground }}>
                  {gmpAmt != null ? `₹${gmpAmt}${gmpPct != null ? ` (${gmpPct}%)` : ''}` : '—'}
                </Text>
              </View>
            </View>
          </View>

          {/* IPO DETAILS CARD */}
          <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, borderRadius: 18, marginTop: 12 }]}>
            <Text style={{ fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary, marginBottom: 16 }}>
              IPO Details
            </Text>

            {/* TIMELINE STEPPER (Pixel-perfect alignment matching reference image) */}
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
              const isAllotted = norm.includes('ALLOT') || norm.includes('REFUND') || norm.includes('CREDIT');
              const isClosed = norm.includes('CLOSE');
              const isOpen = norm.includes('OPEN') || norm.includes('LIVE');

              const step0Achieved = isListed || isAllotted || isClosed || isOpen || checkDatePassed(ipo.open_date);
              const step1Achieved = isListed || isAllotted || isClosed || checkDatePassed(ipo.close_date);
              const step2Achieved = isListed || isAllotted || checkDatePassed(ipo.allotment_date);
              const step3Achieved = isListed || checkDatePassed(ipo.listing_date);

              const stepAchievements = [step0Achieved, step1Achieved, step2Achieved, step3Achieved];
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
                { label: 'Listing', date: formatDateShort(ipo.listing_date), isAchieved: step3Achieved },
              ];

              return (
                <View style={{ marginBottom: 22, paddingTop: 4 }}>
                  {/* Node circles and connecting bar */}
                  <View style={{ height: 26, justifyContent: 'center' }}>
                    <View style={{ position: 'absolute', left: 12, right: 12, height: 2.5, backgroundColor: isDark ? '#334155' : '#E2E8F0', top: 12 }} />
                    {maxContiguousAchieved > 0 && (
                      <View
                        style={{
                          position: 'absolute',
                          left: 12,
                          width: `${(maxContiguousAchieved / 3) * 94}%`,
                          height: 2.5,
                          backgroundColor: '#10B981',
                          top: 12,
                        }}
                      />
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      {timelineSteps.map((step, idx) => {
                        const isAchieved = step.isAchieved;
                        return (
                          <View
                            key={idx}
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
                        );
                      })}
                    </View>
                  </View>

                  {/* Dates & Labels row (Left aligned on start, right aligned on end, centered in middle) */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    {timelineSteps.map((step, idx) => {
                      const alignItem = idx === 0 ? 'flex-start' : idx === 3 ? 'flex-end' : 'center';
                      const textAlign = idx === 0 ? 'left' : idx === 3 ? 'right' : 'center';
                      return (
                        <View key={idx} style={{ flex: 1, alignItems: alignItem }}>
                          <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground, textAlign }}>
                            {step.date || 'TBA'}
                          </Text>
                          <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginTop: 2, textAlign }}>
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
              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Face Value</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>
                  {ipo.face_value != null ? `₹${ipo.face_value} Per Share` : '—'}
                </Text>
              </View>

              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Min. Investment</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>
                  {minInvestment != null ? `₹ ${minInvestment.toLocaleString('en-IN')}` : '—'}
                </Text>
              </View>

              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Issue Size</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>
                  {(() => {
                    if (ipo.issue_size == null) return '—';
                    const num = Number(ipo.issue_size);
                    const cr = num >= 1000000 ? num / 10000000 : num;
                    return `₹${cr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
                  })()}
                </Text>
              </View>

              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Min. Quantity</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>
                  {ipo.lot_size != null ? `${ipo.lot_size} Qty` : '—'}
                </Text>
              </View>

              <View style={styles.snapRowLast}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Listing at</Text>
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
          </View>

          {/* LEAD MANAGERS CARD */}
          <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, borderRadius: 18, marginTop: 12 }]}>
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

          {/* OFFER BREAKUP */}
          {(() => {
            const qibPct = ipo.qib_quota_percent ?? 50;
            const niiPct = ipo.nii_quota_percent ?? 15;
            const retailPct = ipo.retail_quota_percent ?? 35;
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
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Offer Breakup</Text>
                <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
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
                      <View style={styles.breakupRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={[styles.dotMarker, { backgroundColor: COLOR_QIB }]} />
                          <Text style={[styles.breakupLabel, { color: colors.foreground }]}>QIB</Text>
                        </View>
                        <Text style={[styles.breakupVal, { color: colors.foreground }]}>{qibPct}%</Text>
                      </View>
                      <View style={styles.breakupRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={[styles.dotMarker, { backgroundColor: COLOR_NII }]} />
                          <Text style={[styles.breakupLabel, { color: colors.foreground }]}>NII</Text>
                        </View>
                        <Text style={[styles.breakupVal, { color: colors.foreground }]}>{niiPct}%</Text>
                      </View>
                      <View style={styles.breakupRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={[styles.dotMarker, { backgroundColor: COLOR_RII }]} />
                          <Text style={[styles.breakupLabel, { color: colors.foreground }]}>RII</Text>
                        </View>
                        <Text style={[styles.breakupVal, { color: colors.foreground }]}>{retailPct}%</Text>
                      </View>
                      <View style={styles.breakupRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={[styles.dotMarker, { backgroundColor: COLOR_MM }]} />
                          <Text style={[styles.breakupLabel, { color: colors.foreground }]}>MM</Text>
                        </View>
                        <Text style={[styles.breakupVal, { color: colors.foreground }]}>{mmPct}%</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* INVESTMENT CATEGORY BREAKDOWN TABLE */}
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Investment Category Breakdown</Text>
            <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#37271E' : '#FDF2E9' }]}>
                <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.6 }]}>Category</Text>
                <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 0.8, textAlign: 'center' }]}>Lot</Text>
                <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1, textAlign: 'center' }]}>Shares</Text>
                <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>Rates</Text>
                <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.5, textAlign: 'right' }]}>Amount</Text>
              </View>

              {(() => {
                const lot = ipo.lot_size || 8;
                const price = ipo.price_band_max || ipo.price_band_min || 1785;
                const catRows = [
                  { category: 'Retail (Min)', lots: 1 },
                  { category: 'Retail (Max)', lots: 14 },
                  { category: 'S-HNI (Min)', lots: 15 },
                  { category: 'S-HNI (UPI)', lots: 35 },
                  { category: 'S-HNI (Max)', lots: 70 },
                  { category: 'B-HNI (Min)', lots: 71 },
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
            </View>
          </View>

          {/* REGISTRAR & CONTACT DETAILS */}
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Registrar Contact Details</Text>
            <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Name</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.registrar || 'Link Intime India Private Ltd'}</Text>
              </View>
              {ipo.registrar_phone || ipo.intelligence?.registrar_phone ? (
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Phone</Text>
                  <Text style={[styles.snapVal, { color: colors.primary }]}>{ipo.registrar_phone || ipo.intelligence?.registrar_phone}</Text>
                </View>
              ) : null}
              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Email</Text>
                <Text style={[styles.snapVal, { color: colors.primary }]}>{ipo.registrar_email || ipo.intelligence?.registrar_email || 'ipo.helpdesk@in.mpms.mufg.com'}</Text>
              </View>
              <View style={styles.snapRowLast}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Website</Text>
                <TouchableOpacity onPress={() => handleOpenUrl(ipo.registrar_website || 'https://linkintime.co.in')}>
                  <Text style={[styles.snapVal, { color: colors.primary }]} numberOfLines={1}>
                    {ipo.registrar_website || 'https://linkintime.co.in/Initial_Offer/public-issues.html'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* DISCLAIMER CARD */}
          <View style={[styles.intelCardOrange, { backgroundColor: isDark ? '#37271E' : '#FFFBF8', borderColor: colors.primary + '44' }]}>
            <Text style={[styles.disclaimerTitle, { color: colors.primary }]}>Disclaimer</Text>
            <Text style={[styles.disclaimerBody, { color: colors.foreground }]}>
              IPOVault specializes in innovative investment solutions and personalized financial planning, ensuring sustainable growth for clients. With a focus on transparency and excellence, it empowers individuals and businesses to achieve their financial goals.
            </Text>
          </View>
        </View>

        {/* ── SECTION 2: SUBSCRIPTION ── */}
        <View onLayout={(e) => { sectionYMap.current['Subscription'] = e.nativeEvent.layout.y; }} style={{ marginTop: 16 }}>
          <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>Subscription Figure</Text>
            
            {ipo.total_sub != null ? (
              <View style={{ gap: 10, marginTop: 6 }}>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Total Subscription</Text>
                  <Text style={[styles.snapVal, { color: colors.primary }]}>{ipo.total_sub.toFixed(2)}x</Text>
                </View>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>QIB (Institutional)</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.qib_sub ? `${ipo.qib_sub.toFixed(2)}x` : '—'}</Text>
                </View>
                <View style={styles.snapRow}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>NII (HNI Bidders)</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.nii_sub ? `${ipo.nii_sub.toFixed(2)}x` : '—'}</Text>
                </View>
                <View style={styles.snapRowLast}>
                  <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Retail Portion</Text>
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.retail_sub ? `${ipo.retail_sub.toFixed(2)}x` : '—'}</Text>
                </View>
              </View>
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
          <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>About Company</Text>
            <Text style={[styles.aboutText, { color: colors.foreground }]} numberOfLines={readMoreAbout ? undefined : 3}>
              {ipo.description || 'No description available.'}
            </Text>
            {ipo.description && (
              <TouchableOpacity onPress={() => setReadMoreAbout(!readMoreAbout)} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary }}>
                  {readMoreAbout ? 'Read Less ↑' : 'Read more'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* COMPANY FINANCIALS TABLE */}
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Company financials (Amount in ₹ Crore)</Text>
            <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {financialsList.length > 0 ? (
                <>
                  <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#37271E' : '#FDF2E9' }]}>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.5 }]}>Period</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>Assets</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>Revenue</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>Profit</Text>
                  </View>
                  {financialsList.map((row, idx) => (
                    <View key={idx} style={idx === financialsList.length - 1 ? styles.tableBodyRowLast : styles.tableBodyRow}>
                      <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.5 }]}>{row.year}</Text>
                      <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.assets_cr != null ? row.assets_cr : '—'}</Text>
                      <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.revenue_cr != null ? row.revenue_cr : '—'}</Text>
                      <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.pat_cr != null ? row.pat_cr : '—'}</Text>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, padding: 14 }}>
                  Financial data not available.
                </Text>
              )}
            </View>
          </View>

          {/* KEY FINANCIAL RATIOS */}
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Key Financial Ratios</Text>
            <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>EBIDTA</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.ebitda_percent != null ? `${ipo.ebitda_percent}%` : '—'}</Text>
              </View>
              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>ROE</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.roe_percent != null ? `${ipo.roe_percent}%` : '—'}</Text>
              </View>
              <View style={styles.snapRowLast}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>PAT</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.pat_percent != null ? `${ipo.pat_percent}%` : '—'}</Text>
              </View>
            </View>
          </View>

          {/* COMPANY CONTACT DETAILS */}
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Company Contact Details</Text>
            <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Name</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.company_name || ipo.ipo_name || '—'}</Text>
              </View>
              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Phone</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.company_phone || ipo.intelligence?.company_phone || '—'}</Text>
              </View>
              <View style={styles.snapRow}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Email</Text>
                <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.company_email || ipo.intelligence?.company_email || '—'}</Text>
              </View>
              <View style={styles.snapRowLast}>
                <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Website</Text>
                {ipo.website ? (
                  <TouchableOpacity onPress={() => handleOpenUrl(ipo.website)}>
                    <Text style={[styles.snapVal, { color: colors.primary }]}>{ipo.website}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.snapVal, { color: colors.foreground }]}>—</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ── SECTION 4: DOCS & DISCLAIMER ── */}
        <View onLayout={(e) => { sectionYMap.current['Docs'] = e.nativeEvent.layout.y; }} style={{ marginTop: 16 }}>
          <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>IPO Prospectus & Filings</Text>
            <TouchableOpacity
              onPress={() => (ipo.drhp_url || ipo.prospectus_url) ? handleOpenUrl(ipo.drhp_url || ipo.prospectus_url) : undefined}
              style={styles.docRowBtn}
            >
              <Feather name="file-text" size={16} color={colors.foreground} />
              <Text style={[styles.docBtnText, { color: colors.foreground }]}>
                DHRP / DRHP Prospectus {!(ipo.drhp_url || ipo.prospectus_url) && '(—)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (ipo.rhp_url || ipo.prospectus_url) ? handleOpenUrl(ipo.rhp_url || ipo.prospectus_url) : undefined}
              style={styles.docRowBtn}
            >
              <Feather name="file-text" size={16} color={colors.foreground} />
              <Text style={[styles.docBtnText, { color: colors.foreground }]}>
                RHP Prospectus {!(ipo.rhp_url || ipo.prospectus_url) && '(—)'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* OFFICIAL IPOVAULT DISCLAIMER CARD */}
          <View style={[styles.intelCardOrange, { backgroundColor: isDark ? '#37271E' : '#FFFBF8', borderColor: colors.primary + '44', marginTop: 16 }]}>
            <Text style={[styles.disclaimerTitle, { color: colors.primary }]}>Disclaimer</Text>
            <Text style={[styles.disclaimerBody, { color: colors.foreground }]}>
              Disclaimer: IPOVault provides data and tracking information for educational and reference purposes only. We are not a SEBI-registered advisor and do not provide financial or investment advice. All IPO details, GMP estimates, subscription data, and allotment tracking are gathered from public market sources and subject to market risks. Please consult a qualified financial advisor before making any investment decisions.
            </Text>
          </View>
        </View>

        <Text style={[styles.footerDisclaimer, { color: colors.mutedForeground }]}>
          Disclaimer: Investment in securities market are subject to market risks. Read all prospectus documents carefully before investing.
        </Text>
      </ScrollView>

      {/* ── Sticky Bottom Apply Action Bar ── */}
      <View
        style={[
          styles.stickyBottomBarSingle,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.fullWidthApplyBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.88}
          onPress={() =>
            router.push({
              pathname: '/apply-ipo',
              params: { ipoId: ipo.id },
            } as any)
          }
        >
          <Text style={styles.fullWidthApplyBtnText}>Apply Now</Text>
        </TouchableOpacity>
      </View>

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
                GMP PERCENTAGE (%)
              </Text>
              <TextInput
                value={editGmpPercent}
                onChangeText={handleEditGmpPercentChange}
                placeholder="e.g. 25"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: 'GoogleSansFlex_600SemiBold' }}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', color: colors.mutedForeground, textTransform: 'uppercase', marginBottom: 6 }}>
                GMP AMOUNT (₹ / SHARE)
              </Text>
              <TextInput
                value={editGmpAmount}
                onChangeText={handleEditGmpAmountChange}
                placeholder="Auto-calculated from %"
                keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground + '70'}
                style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: 'GoogleSansFlex_600SemiBold' }}
              />
            </View>

            {editGmpAmount && ipo.lot_size ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="trending-up" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground }}>
                  Estimated profit: <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary }}>₹{(parseFloat(editGmpAmount || '0') * ipo.lot_size).toLocaleString('en-IN')}</Text> / lot ({ipo.lot_size} shares)
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={saveGmp}
              style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold' }}>
                Save GMP Update
              </Text>
            </TouchableOpacity>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
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
  breakupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakupLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  breakupVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  dotMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
  stickyBottomBarSingle: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  fullWidthApplyBtn: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidthApplyBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  notFoundTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 16,
  },
  notFoundSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  backChip: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  backChipText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 12,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 46,
    height: 46,
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  companyTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  companySubTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePillText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  heroPriceStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  stripCell: {
    flex: 1,
    alignItems: 'center',
  },
  stripDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#374151',
  },
  stripKey: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  stripVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },

  sectionWrap: {
    marginBottom: 16,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    marginBottom: 8,
  },

  dashboardPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  dashboardGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  dashboardCell: {
    flex: 1,
    alignItems: 'center',
  },
  dashboardKey: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  dashboardVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },
  dashboardSub: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 1,
  },

  radarPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  radarPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radarCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  radarCategoryText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  radarScoreText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  radarMetricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  radarMetricCell: {
    flex: 1,
  },
  v4GridKey: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.4,
  },
  v4GridVal: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },
  guidanceCard: {
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
  },
  guidanceTitle: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  guidanceText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
    lineHeight: 14,
  },

  timelineCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeStep: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  stepName: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  stepDateStr: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  timeConnector: {
    flex: 1,
    height: 2,
    marginTop: -14,
  },

  subCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  subGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subCell: {
    width: '48%',
  },
  subCellKey: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  subCellVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },
  totalSubStrip: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  totalSubKey: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  totalSubVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
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

  valuationGridCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  valGroup: {
    gap: 6,
  },
  valGroupTitle: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  valRowGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  valCell: {
    flex: 1,
  },
  valKey: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  valText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
  },

  intelCardGreen: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  intelCardRed: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  intelTitle: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulletText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
  },

  snapshotGridCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  snapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff10',
  },
  snapRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  snapKey: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  snapVal: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  aboutCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  aboutText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },

  linkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  linkBtnText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  footerDisclaimer: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 13,
    textAlign: 'center',
    marginTop: 8,
  },

  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  stickySubLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  stickyPriceVal: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
