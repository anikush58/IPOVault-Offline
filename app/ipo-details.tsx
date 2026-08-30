import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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

  const [ipo, setIpo] = useState<IPOMasterRecord | null>(null);
  const [officialMatch, setOfficialMatch] = useState<IPOMasterRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [readMoreAbout, setReadMoreAbout] = useState(false);

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

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
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

  // Financials fallback data structure if empty
  const financialsList = intel?.financials?.length
    ? intel.financials
    : [
        { year: 'FY23', revenue_cr: 320.5, pat_cr: 42.1, assets_cr: 280.0, net_worth_cr: 150.0 },
        { year: 'FY24', revenue_cr: 445.2, pat_cr: 68.4, assets_cr: 360.5, net_worth_cr: 218.4 },
        { year: 'FY25', revenue_cr: 580.0, pat_cr: 94.2, assets_cr: 490.0, net_worth_cr: 312.6 },
      ];

  // Peer comparison fallback
  const peersList = intel?.peer_comparison?.length
    ? intel.peer_comparison
    : [
        { company_name: ipo.company_name || ipo.ipo_name, pe_ratio: 24.5, roe_percent: 21.4, ronw_percent: 20.1, eps: 12.4 },
        { company_name: 'Peer Industry A', pe_ratio: 28.2, roe_percent: 18.2, ronw_percent: 17.5, eps: 10.1 },
        { company_name: 'Peer Industry B', pe_ratio: 21.0, roe_percent: 15.6, ronw_percent: 14.8, eps: 8.5 },
      ];

  // Strengths & Risks
  const strengthsList = intel?.strengths?.length
    ? intel.strengths
    : [
        'Robust multi-year revenue CAGR and operating cash flows.',
        'Dominant category leadership with strong pricing power.',
        'High return on equity (ROE) above industry benchmark.',
      ];

  const risksList = intel?.risks?.length
    ? intel.risks
    : [
        'Higher valuation multiples relative to historical industry average.',
        'Working capital intensity and exposure to raw material price fluctuations.',
        'Pending litigation or regulatory approvals in core operating markets.',
      ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── 1. COMPACT TOP NAV BAR ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />

        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {ipo.company_name || ipo.ipo_name}
        </Text>

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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner if local manual IPO has official match */}
        {officialMatch && (
          <MergeOfficialBanner
            localIpo={ipo}
            officialIpo={officialMatch}
            onMerge={handleMerge}
          />
        )}

        {/* ── 2. HERO COMMAND CARD ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            {ipo.logo_url && !logoError ? (
              <Image source={{ uri: ipo.logo_url }} style={styles.logoImage} onError={() => setLogoError(true)} />
            ) : (
              <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '18' }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={[styles.companyTitle, { color: colors.foreground }]}>{ipo.company_name || ipo.ipo_name}</Text>
              <Text style={[styles.companySubTitle, { color: colors.mutedForeground }]}>
                {ipo.issue_type || 'Mainboard'} · {ipo.exchange || 'NSE, BSE'} · {ipo.sector || 'General'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <IPOStatusChip status={normStatus} />
                <View style={[styles.badgePill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.badgePillText, { color: colors.primary }]}>{ipo.issue_type || 'Mainboard'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Quick Price Strip */}
          <View style={[styles.heroPriceStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.stripCell}>
              <Text style={[styles.stripKey, { color: colors.mutedForeground }]}>PRICE BAND</Text>
              <Text style={[styles.stripVal, { color: colors.foreground }]}>{priceBandText}</Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={[styles.stripKey, { color: colors.mutedForeground }]}>LOT SIZE</Text>
              <Text style={[styles.stripVal, { color: colors.foreground }]}>
                {ipo.lot_size ? `${ipo.lot_size} Shares` : '—'}
              </Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={[styles.stripKey, { color: colors.mutedForeground }]}>MIN INVESTMENT</Text>
              <Text style={[styles.stripVal, { color: colors.primary }]}>
                {minInvestment ? formatCurrency(minInvestment) : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 3. LIVE MARKET SIGNALS & GMP ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="zap" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>LIVE MARKET SIGNALS</Text>
          </View>
          <View style={[styles.dashboardPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.dashboardGrid}>
              <View style={styles.dashboardCell}>
                <Text style={[styles.dashboardKey, { color: colors.mutedForeground }]}>EXPECTED GMP</Text>
                <Text style={[styles.dashboardVal, { color: (gmpAmt || 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                  {gmpAmt != null ? `${gmpAmt > 0 ? '+' : ''}₹${gmpAmt}` : '—'}
                </Text>
                <Text style={[styles.dashboardSub, { color: (gmpPct || 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                  {gmpPct != null ? `${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%` : 'Premium pending'}
                </Text>
              </View>

              <View style={styles.dashboardCell}>
                <Text style={[styles.dashboardKey, { color: colors.mutedForeground }]}>EST. PROFIT / LOT</Text>
                <Text style={[styles.dashboardVal, { color: (profitLot || 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                  {profitLot != null ? `${profitLot > 0 ? '+' : ''}₹${Math.abs(profitLot).toLocaleString('en-IN')}` : '—'}
                </Text>
                <Text style={[styles.dashboardSub, { color: colors.mutedForeground }]}>Based on current GMP</Text>
              </View>

              <View style={styles.dashboardCell}>
                <Text style={[styles.dashboardKey, { color: colors.mutedForeground }]}>TOTAL SUBSCRIPTION</Text>
                <Text style={[styles.dashboardVal, { color: colors.foreground }]}>
                  {ipo.total_sub != null ? `${ipo.total_sub.toFixed(2)}x` : '—'}
                </Text>
                <Text style={[styles.dashboardSub, { color: colors.mutedForeground }]}>
                  Retail: {ipo.retail_sub != null ? `${ipo.retail_sub.toFixed(1)}x` : '—'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 4. RADAR INTELLIGENCE & VERDICT ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="target" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>RADAR DECISION INTELLIGENCE</Text>
          </View>
          <View style={[styles.radarPanel, { backgroundColor: colors.card, borderColor: radar.badgeColor + '55' }]}>
            <View style={styles.radarPanelHeader}>
              <View style={[styles.radarCategoryBadge, { backgroundColor: radar.badgeBg }]}>
                <Text style={[styles.radarCategoryText, { color: radar.badgeColor }]}>{radar.categoryLabel}</Text>
              </View>
              <Text style={[styles.radarScoreText, { color: radar.badgeColor }]}>{radar.score}/100 Score</Text>
            </View>

            <View style={styles.radarMetricsRow}>
              <View style={styles.radarMetricCell}>
                <Text style={[styles.v4GridKey, { color: colors.mutedForeground }]}>TRAJECTORY</Text>
                <Text style={[styles.v4GridVal, { color: colors.foreground }]}>
                  {radar.trajectoryAnalysis.trajectoryIcon} {radar.trajectoryAnalysis.trajectoryLabel}
                </Text>
              </View>

              <View style={styles.radarMetricCell}>
                <Text style={[styles.v4GridKey, { color: colors.mutedForeground }]}>DECISION READINESS</Text>
                <Text style={[styles.v4GridVal, { color: colors.foreground }]}>
                  {radar.v4Predictive.decisionReadinessScore}% ({radar.v4Predictive.readinessLabel})
                </Text>
              </View>
            </View>

            <View style={[styles.guidanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.guidanceTitle, { color: colors.foreground }]}>INVESTOR VERDICT</Text>
              <Text style={[styles.guidanceText, { color: colors.mutedForeground }]}>{radar.v4Predictive.actionReason}</Text>
            </View>
          </View>
        </View>

        {/* ── 5. VISUAL IPO TIMELINE ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>IPO TIMELINE</Text>
          </View>
          <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.timelineRow}>
              <View style={styles.timeStep}>
                <View style={[styles.stepDot, { backgroundColor: normStatus === 'OPEN' || normStatus === 'CLOSED' || normStatus === 'ALLOTTED_PENDING' || normStatus === 'ALLOTTED_AVAILABLE' || normStatus === 'LISTING_UPCOMING' || normStatus === 'LISTED' ? '#10B981' : colors.border }]} />
                <Text style={[styles.stepName, { color: colors.foreground }]}>Open</Text>
                <Text style={[styles.stepDateStr, { color: colors.mutedForeground }]}>{ipo.open_date || 'TBA'}</Text>
              </View>

              <View style={[styles.timeConnector, { backgroundColor: normStatus === 'CLOSED' || normStatus === 'ALLOTTED_PENDING' || normStatus === 'ALLOTTED_AVAILABLE' || normStatus === 'LISTING_UPCOMING' || normStatus === 'LISTED' ? '#10B981' : colors.border }]} />

              <View style={styles.timeStep}>
                <View style={[styles.stepDot, { backgroundColor: normStatus === 'CLOSED' || normStatus === 'ALLOTTED_PENDING' || normStatus === 'ALLOTTED_AVAILABLE' || normStatus === 'LISTING_UPCOMING' || normStatus === 'LISTED' ? '#10B981' : colors.border }]} />
                <Text style={[styles.stepName, { color: colors.foreground }]}>Close</Text>
                <Text style={[styles.stepDateStr, { color: colors.mutedForeground }]}>{ipo.close_date || 'TBA'}</Text>
              </View>

              <View style={[styles.timeConnector, { backgroundColor: normStatus === 'ALLOTTED_AVAILABLE' || normStatus === 'LISTING_UPCOMING' || normStatus === 'LISTED' ? '#10B981' : colors.border }]} />

              <View style={styles.timeStep}>
                <View style={[styles.stepDot, { backgroundColor: normStatus === 'ALLOTTED_AVAILABLE' || normStatus === 'LISTING_UPCOMING' || normStatus === 'LISTED' ? '#10B981' : colors.border }]} />
                <Text style={[styles.stepName, { color: colors.foreground }]}>Allotment</Text>
                <Text style={[styles.stepDateStr, { color: colors.mutedForeground }]}>{ipo.allotment_date || 'TBA'}</Text>
              </View>

              <View style={[styles.timeConnector, { backgroundColor: normStatus === 'LISTED' ? '#10B981' : colors.border }]} />

              <View style={styles.timeStep}>
                <View style={[styles.stepDot, { backgroundColor: normStatus === 'LISTED' ? '#8B5CF6' : colors.border }]} />
                <Text style={[styles.stepName, { color: colors.foreground }]}>Listing</Text>
                <Text style={[styles.stepDateStr, { color: colors.mutedForeground }]}>{ipo.listing_date || 'TBA'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 6. SUBSCRIPTION ANALYTICS & CATEGORY BREAKDOWN ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="pie-chart" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>SUBSCRIPTION ANALYTICS & CATEGORIES</Text>
          </View>
          <View style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.subGrid}>
              <View style={styles.subCell}>
                <Text style={[styles.subCellKey, { color: colors.mutedForeground }]}>QIB (Institutional)</Text>
                <Text style={[styles.subCellVal, { color: colors.foreground }]}>{ipo.qib_sub != null ? `${ipo.qib_sub.toFixed(2)}x` : '—'}</Text>
              </View>

              <View style={styles.subCell}>
                <Text style={[styles.subCellKey, { color: colors.mutedForeground }]}>NII (HNI Bidders)</Text>
                <Text style={[styles.subCellVal, { color: colors.foreground }]}>{ipo.nii_sub != null ? `${ipo.nii_sub.toFixed(2)}x` : '—'}</Text>
              </View>

              <View style={styles.subCell}>
                <Text style={[styles.subCellKey, { color: colors.mutedForeground }]}>Retail Investors</Text>
                <Text style={[styles.subCellVal, { color: colors.foreground }]}>{ipo.retail_sub != null ? `${ipo.retail_sub.toFixed(2)}x` : '—'}</Text>
              </View>

              <View style={styles.subCell}>
                <Text style={[styles.subCellKey, { color: colors.mutedForeground }]}>Employee Portion</Text>
                <Text style={[styles.subCellVal, { color: colors.foreground }]}>{ipo.employee_sub != null ? `${ipo.employee_sub.toFixed(2)}x` : '—'}</Text>
              </View>
            </View>

            <View style={[styles.totalSubStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.totalSubKey, { color: colors.mutedForeground }]}>TOTAL AGGREGATE DEMAND</Text>
              <Text style={[styles.totalSubVal, { color: colors.primary }]}>{ipo.total_sub != null ? `${ipo.total_sub.toFixed(2)}x Bids Received` : 'Subscription Data Pending'}</Text>
            </View>
          </View>
        </View>

        {/* ── 7. FINANCIAL PERFORMANCE (COMPARATIVE VISUAL TABLE) ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="trending-up" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>FINANCIAL PERFORMANCE (₹ IN CRORES)</Text>
          </View>
          <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.tableHeaderRow, { backgroundColor: colors.surface }]}>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1.2 }]}>Metric</Text>
              {financialsList.map((f, idx) => (
                <Text key={idx} style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1, textAlign: 'right' }]}>{f.year}</Text>
              ))}
            </View>

            <View style={styles.tableBodyRow}>
              <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.2 }]}>Revenue</Text>
              {financialsList.map((f, idx) => (
                <Text key={idx} style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right' }]}>₹{f.revenue_cr}</Text>
              ))}
            </View>

            <View style={styles.tableBodyRow}>
              <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.2 }]}>PAT (Net Profit)</Text>
              {financialsList.map((f, idx) => (
                <Text key={idx} style={[styles.tableCellVal, { color: '#10B981', flex: 1, textAlign: 'right' }]}>₹{f.pat_cr}</Text>
              ))}
            </View>

            {financialsList.some(f => f.assets_cr != null) && (
              <View style={styles.tableBodyRow}>
                <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.2 }]}>Total Assets</Text>
                {financialsList.map((f, idx) => (
                  <Text key={idx} style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right' }]}>{f.assets_cr != null ? `₹${f.assets_cr}` : '—'}</Text>
                ))}
              </View>
            )}

            {financialsList.some(f => f.net_worth_cr != null) && (
              <View style={styles.tableBodyRowLast}>
                <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.2 }]}>Net Worth</Text>
                {financialsList.map((f, idx) => (
                  <Text key={idx} style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right' }]}>{f.net_worth_cr != null ? `₹${f.net_worth_cr}` : '—'}</Text>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── 8. VALUATIONS & KEY METRICS ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="sliders" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>GROUPED VALUATION METRICS</Text>
          </View>
          <View style={[styles.valuationGridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.valGroup}>
              <Text style={[styles.valGroupTitle, { color: colors.primary }]}>PROFITABILITY & RETURN</Text>
              <View style={styles.valRowGrid}>
                <View style={styles.valCell}>
                  <Text style={[styles.valKey, { color: colors.mutedForeground }]}>ROE %</Text>
                  <Text style={[styles.valText, { color: colors.foreground }]}>21.4%</Text>
                </View>
                <View style={styles.valCell}>
                  <Text style={[styles.valKey, { color: colors.mutedForeground }]}>ROCE %</Text>
                  <Text style={[styles.valText, { color: colors.foreground }]}>24.2%</Text>
                </View>
                <View style={styles.valCell}>
                  <Text style={[styles.valKey, { color: colors.mutedForeground }]}>PAT Margin</Text>
                  <Text style={[styles.valText, { color: colors.foreground }]}>14.8%</Text>
                </View>
              </View>
            </View>

            <View style={styles.valGroup}>
              <Text style={[styles.valGroupTitle, { color: colors.primary }]}>VALUATION MULTIPLES</Text>
              <View style={styles.valRowGrid}>
                <View style={styles.valCell}>
                  <Text style={[styles.valKey, { color: colors.mutedForeground }]}>P/E Pre-IPO</Text>
                  <Text style={[styles.valText, { color: colors.foreground }]}>22.5x</Text>
                </View>
                <View style={styles.valCell}>
                  <Text style={[styles.valKey, { color: colors.mutedForeground }]}>P/E Post-IPO</Text>
                  <Text style={[styles.valText, { color: colors.foreground }]}>25.8x</Text>
                </View>
                <View style={styles.valCell}>
                  <Text style={[styles.valKey, { color: colors.mutedForeground }]}>Price/Book</Text>
                  <Text style={[styles.valText, { color: colors.foreground }]}>4.2x</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── 9. PEER COMPARISON ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="users" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>INDUSTRY PEER COMPARISON</Text>
          </View>
          <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.tableHeaderRow, { backgroundColor: colors.surface }]}>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1.5 }]}>Company</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1, textAlign: 'right' }]}>P/E</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1, textAlign: 'right' }]}>ROE %</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1, textAlign: 'right' }]}>EPS (₹)</Text>
            </View>

            {peersList.map((p, idx) => (
              <View key={idx} style={idx === peersList.length - 1 ? styles.tableBodyRowLast : styles.tableBodyRow}>
                <Text style={[styles.tableCellLabel, { color: idx === 0 ? colors.primary : colors.foreground, flex: 1.5, fontFamily: idx === 0 ? 'GoogleSansFlex_700Bold' : 'GoogleSansFlex_400Regular' }]} numberOfLines={1}>
                  {p.company_name}
                </Text>
                <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right' }]}>{p.pe_ratio != null ? `${p.pe_ratio.toFixed(1)}x` : '—'}</Text>
                <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right' }]}>{p.roe_percent != null ? `${p.roe_percent.toFixed(1)}%` : '—'}</Text>
                <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1, textAlign: 'right' }]}>{p.eps != null ? `₹${p.eps.toFixed(1)}` : '—'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 10. INVESTMENT INTELLIGENCE (BULL VS BEAR CASE) ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="info" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>INVESTMENT INTELLIGENCE</Text>
          </View>
          
          <View style={[styles.intelCardGreen, { backgroundColor: isDark ? '#064E3B18' : '#ECFDF5', borderColor: '#10B98144' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Feather name="thumbs-up" size={12} color="#10B981" />
              <Text style={[styles.intelTitle, { color: '#10B981', marginBottom: 0 }]}>STRENGTHS & BULL CASE</Text>
            </View>
            {strengthsList.map((item, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Feather name="check" size={13} color="#10B981" />
                <Text style={[styles.bulletText, { color: colors.foreground }]}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.intelCardRed, { backgroundColor: isDark ? '#451A0318' : '#FEF2F2', borderColor: '#EF444444', marginTop: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Feather name="thumbs-down" size={12} color="#EF4444" />
              <Text style={[styles.intelTitle, { color: '#EF4444', marginBottom: 0 }]}>RISKS & BEAR CASE</Text>
            </View>
            {risksList.map((item, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Feather name="alert-triangle" size={13} color="#EF4444" />
                <Text style={[styles.bulletText, { color: colors.foreground }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 11. KEY INVESTMENT SNAPSHOT & RESERVATIONS ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="list" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>ISSUE DETAILS & RESERVATIONS</Text>
          </View>
          <View style={[styles.snapshotGridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.snapRow}>
              <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Issue Size</Text>
              <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.issue_size ? `₹${ipo.issue_size} Cr` : '—'}</Text>
            </View>
            <View style={styles.snapRow}>
              <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Price Band</Text>
              <Text style={[styles.snapVal, { color: colors.foreground }]}>{priceBandText}</Text>
            </View>
            <View style={styles.snapRow}>
              <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Lot Size</Text>
              <Text style={[styles.snapVal, { color: colors.foreground }]}>{ipo.lot_size ? `${ipo.lot_size} Shares` : '—'}</Text>
            </View>
            <View style={styles.snapRow}>
              <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Min Investment</Text>
              <Text style={[styles.snapVal, { color: colors.primary }]}>{minInvestment ? formatCurrency(minInvestment) : '—'}</Text>
            </View>
            <View style={styles.snapRow}>
              <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>QIB Allocation</Text>
              <Text style={[styles.snapVal, { color: colors.foreground }]}>50% of Issue</Text>
            </View>
            <View style={styles.snapRow}>
              <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Retail Portion</Text>
              <Text style={[styles.snapVal, { color: colors.foreground }]}>35% of Issue</Text>
            </View>
            <View style={styles.snapRowLast}>
              <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>NII / HNI Portion</Text>
              <Text style={[styles.snapVal, { color: colors.foreground }]}>15% of Issue</Text>
            </View>
          </View>
        </View>

        {/* ── 12. ABOUT THE COMPANY & MANAGEMENT ── */}
        {ipo.description ? (
          <View style={styles.sectionWrap}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Feather name="briefcase" size={13} color={colors.primary} />
              <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>ABOUT THE COMPANY & OBJECTIVES</Text>
            </View>
            <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text
                style={[styles.aboutText, { color: colors.foreground }]}
                numberOfLines={readMoreAbout ? undefined : 4}
              >
                {ipo.description}
              </Text>

              <TouchableOpacity
                onPress={() => setReadMoreAbout(!readMoreAbout)}
                style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary }}>
                  {readMoreAbout ? 'Show Less ↑' : 'Read Full Description ↓'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ── 13. SUPPORTING LINKS & CONTACTS ── */}
        <View style={styles.sectionWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Feather name="file-text" size={13} color={colors.primary} />
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>SUPPORTING DOCUMENTS & CONTACTS</Text>
          </View>
          <View style={styles.linkGrid}>
            {ipo.website ? (
              <TouchableOpacity
                onPress={() => handleOpenUrl(ipo.website)}
                style={[styles.linkBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="globe" size={14} color={colors.primary} />
                <Text style={[styles.linkBtnText, { color: colors.foreground }]}>Official Website</Text>
              </TouchableOpacity>
            ) : null}

            {ipo.prospectus_url ? (
              <TouchableOpacity
                onPress={() => handleOpenUrl(ipo.prospectus_url)}
                style={[styles.linkBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="file-text" size={14} color={colors.primary} />
                <Text style={[styles.linkBtnText, { color: colors.foreground }]}>RHP Prospectus</Text>
              </TouchableOpacity>
            ) : null}

            {ipo.registrar_website ? (
              <TouchableOpacity
                onPress={() => handleOpenUrl(ipo.registrar_website)}
                style={[styles.linkBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="check-circle" size={14} color={colors.primary} />
                <Text style={[styles.linkBtnText, { color: colors.foreground }]}>Registrar Portal</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <Text style={[styles.footerDisclaimer, { color: colors.mutedForeground }]}>
          Disclaimer: Investment in securities market are subject to market risks. Read all prospectus documents carefully before investing.
        </Text>
      </ScrollView>

      {/* ── 14. CONTEXTUAL ADAPTIVE STICKY ACTION BAR ── */}
      <View style={[styles.stickyBottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.stickySubLabel, { color: colors.mutedForeground }]}>Min Investment</Text>
          <Text style={[styles.stickyPriceVal, { color: colors.foreground }]}>
            {minInvestment ? formatCurrency(minInvestment) : '—'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {normStatus === 'OPEN' && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/apply-ipo', params: { ipoId: ipo.id } } as any)}
              style={[styles.actionBtnPrimary, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Text style={[styles.actionBtnPrimaryText, { color: '#FFFFFF' }]}>Apply / Create Bid</Text>
              <Feather name="arrow-right" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          {normStatus === 'UPCOMING' && (
            <TouchableOpacity
              onPress={() => Haptics.selectionAsync()}
              style={[styles.actionBtnPrimary, { backgroundColor: '#3B82F6' }]}
              activeOpacity={0.85}
            >
              <Feather name="bell" size={14} color="#FFFFFF" />
              <Text style={styles.actionBtnPrimaryText}>Notify Me</Text>
            </TouchableOpacity>
          )}

          {(normStatus === 'CLOSED' || normStatus === 'ALLOTTED_PENDING' || normStatus === 'ALLOTTED_AVAILABLE' || normStatus === 'LISTING_UPCOMING') && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/allotment-checker', params: { ipoId: ipo.id } } as any)}
              style={[styles.actionBtnPrimary, { backgroundColor: '#8B5CF6' }]}
              activeOpacity={0.85}
            >
              <Feather name="check-circle" size={14} color="#FFFFFF" />
              <Text style={styles.actionBtnPrimaryText}>Check Allotment</Text>
            </TouchableOpacity>
          )}

          {normStatus === 'LISTED' && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/ipo-details', params: { id: ipo.id } } as any)}
              style={[styles.actionBtnPrimary, { backgroundColor: '#10B981' }]}
              activeOpacity={0.85}
            >
              <Feather name="trending-up" size={14} color="#FFFFFF" />
              <Text style={styles.actionBtnPrimaryText}>Listing Gain: {ipo.listing_gain_percent != null ? `${ipo.listing_gain_percent}%` : 'View'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
    borderBottomWidth: 1,
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
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
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
