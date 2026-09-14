import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { backendIpoApiService, normalizeBackendIpo } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { formatCurrency, formatDate } from '@/utils/formatters';

export default function BackendIpoDetailsScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; item?: string }>();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  type DetailTab = 'IPO' | 'GMP' | 'Subscription' | 'Company Info' | 'Docs';

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
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('IPO');

  useEffect(() => {
    if (params.id) {
      setLoading(true);
      backendIpoApiService
        .getBackendIpoDetail(params.id)
        .then((res) => {
          if (res) setIpo(res);
        })
        .finally(() => setLoading(false));
    }
  }, [params.id]);

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

      {/* Top 5 Detail Tabs (Pills matching applications page) */}
      <View style={[styles.detailTabBarWrap, { backgroundColor: colors.background, paddingVertical: 8, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: 'row' }}>
          {(['IPO', 'GMP', 'Subscription', 'Company Info', 'Docs'] as const).map((tabKey) => {
            const isActive = activeDetailTab === tabKey;
            return (
              <TouchableOpacity
                key={tabKey}
                onPress={() => {
                  setActiveDetailTab(tabKey);
                }}
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 100,
        }}
      >
        {/* TAB 1: IPO */}
        {activeDetailTab === 'IPO' && (
          <>
            {/* Status Header Card */}
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  LIFECYCLE STATUS
                </Text>
                <Text style={[styles.value, { color: colors.primary }]}>
                  {ipo.status}
                </Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  EXCHANGE
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {ipo.exchange || 'NSE / BSE'}
                </Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  SEGMENT
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {ipo.marketSegment}
                </Text>
              </View>
            </View>

            {/* Issue Structure & Terms */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              ISSUE STRUCTURE & TERMS
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  PRICE BAND
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {ipo.priceBandLow !== null && ipo.priceBandLow !== undefined && ipo.priceBandHigh !== null && ipo.priceBandHigh !== undefined
                    ? `₹${ipo.priceBandLow} - ₹${ipo.priceBandHigh}`
                    : 'Pending'}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  LOT SIZE
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {ipo.lotSize !== null && ipo.lotSize !== undefined
                    ? `${ipo.lotSize} shares`
                    : 'Pending'}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  FACE VALUE
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {ipo.faceValue !== null && ipo.faceValue !== undefined
                    ? `₹${ipo.faceValue} per share`
                    : 'N/A'}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  MINIMUM INVESTMENT
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {minInvestAmount !== null
                    ? formatCurrency(minInvestAmount)
                    : 'Pending'}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  TOTAL ISSUE SIZE
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {ipo.issueSize !== null && ipo.issueSize !== undefined
                    ? formatCurrency(Number(ipo.issueSize))
                    : 'Pending'}
                </Text>
              </View>
            </View>

            {/* Offer Breakup & Investment Category Breakdown */}
            <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Offer Breakup</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={styles.donutRingPlaceholder}>
                  <View style={[styles.donutInner, { backgroundColor: colors.card }]} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.foreground }]}>QIB</Text>
                    <Text style={[styles.value, { color: colors.foreground }]}>50%</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.foreground }]}>NII</Text>
                    <Text style={[styles.value, { color: colors.foreground }]}>15%</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.foreground }]}>RII</Text>
                    <Text style={[styles.value, { color: colors.foreground }]}>35%</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.foreground }]}>MM</Text>
                    <Text style={[styles.value, { color: colors.foreground }]}>0%</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Investment Category Breakdown Table */}
            <Text style={[styles.sectionTitleOrange, { color: colors.primary }]}>Investment Category Breakdown</Text>
            <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {ipo.lotSize && (ipo.priceBandHigh || ipo.priceBandLow) ? (
                <>
                  <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#37271E' : '#FDF2E9' }]}>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.6 }]}>Category</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 0.8, textAlign: 'center' }]}>Lot</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1, textAlign: 'center' }]}>Shares</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>Rates</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.5, textAlign: 'right' }]}>Amount</Text>
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

            {/* Disclaimer */}
            <View style={[styles.intelCardOrange, { backgroundColor: isDark ? '#37271E' : '#FFFBF8', borderColor: colors.primary + '44' }]}>
              <Text style={[styles.disclaimerTitle, { color: colors.primary }]}>Disclaimer</Text>
              <Text style={[styles.disclaimerBody, { color: colors.foreground }]}>
                IPO Ideas specializes in innovative investment solutions and personalized financial planning, ensuring sustainable growth for clients. With a focus on transparency and excellence, it empowers individuals and businesses to achieve their financial goals.
              </Text>
            </View>
          </>
        )}

        {/* TAB 2: GMP */}
        {activeDetailTab === 'GMP' && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>Expected Premium (GMP)</Text>
              {ipo.currentGmp ? (
                <>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>Exp. Premium:</Text>
                    <Text style={[styles.value, { color: '#10B981' }]}>
                      ₹ {ipo.currentGmp.gmpAmount} ({ipo.currentGmp.gmpPercentage ?? '—'}%) per share
                    </Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>As heard on:</Text>
                    <Text style={[styles.value, { color: colors.foreground }]}>
                      {ipo.currentGmp.observedAt ? formatDate(ipo.currentGmp.observedAt) : '—'}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.cardRow}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Exp. Premium:</Text>
                  <Text style={[styles.value, { color: colors.foreground }]}>—</Text>
                </View>
              )}
            </View>

            {/* GMP TREND GRAPH CARD */}
            <View style={[styles.chartContainerCard, { backgroundColor: isDark ? '#2A1D16' : '#FFF5EE', borderColor: colors.border }]}>
              <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary, marginBottom: 12 }}>GMP Trend Chart</Text>
              <View style={styles.chartPlotArea}>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, paddingVertical: 12 }}>
                  No historical GMP trend data available.
                </Text>
              </View>
            </View>

            <View style={[styles.intelCardOrange, { backgroundColor: isDark ? '#37271E' : '#FFFBF8', borderColor: colors.primary + '44' }]}>
              <Text style={[styles.disclaimerTitle, { color: colors.primary }]}>Disclaimer</Text>
              <Text style={[styles.disclaimerBody, { color: colors.foreground }]}>
                The GMP graph represents historical grey market trends collected from market sources. Grey market trading is unofficial and unregulated. Investors should conduct their own research and not rely solely on GMP while making investment decisions.
              </Text>
            </View>
          </>
        )}

        {/* TAB 3: SUBSCRIPTION */}
        {activeDetailTab === 'Subscription' && (
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
        )}

        {/* TAB 4: COMPANY INFO */}
        {activeDetailTab === 'Company Info' && (
          <>
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
              {ipo.financials && ipo.financials.length > 0 ? (
                <>
                  <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#37271E' : '#FDF2E9' }]}>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.5 }]}>Period</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>Assets</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>Revenue</Text>
                    <Text style={[styles.tableHeaderCell, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>Profit</Text>
                  </View>
                  {ipo.financials.map((row: any, idx: number) => (
                    <View key={idx} style={idx === ipo.financials!.length - 1 ? styles.tableBodyRowLast : styles.tableBodyRow}>
                      <Text style={[styles.tableCellLabel, { color: colors.foreground, flex: 1.5 }]}>{row.period || row.year || '—'}</Text>
                      <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.assets ?? '—'}</Text>
                      <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.revenue ?? '—'}</Text>
                      <Text style={[styles.tableCellVal, { color: colors.foreground, flex: 1.2, textAlign: 'right' }]}>{row.profit ?? '—'}</Text>
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
                <Text style={[styles.label, { color: colors.mutedForeground }]}>EBIDTA</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>{ipo.ebitdaPercent != null ? `${ipo.ebitdaPercent}%` : '—'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>ROE</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>{ipo.roePercent != null ? `${ipo.roePercent}%` : '—'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>PAT</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>{ipo.patPercent != null ? `${ipo.patPercent}%` : '—'}</Text>
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
                  <TouchableOpacity onPress={() => Linking.openURL(ipo.company!.website!)}>
                    <Text style={[styles.value, { color: colors.primary }]}>{ipo.company.website}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.value, { color: colors.foreground }]}>—</Text>
                )}
              </View>
            </View>
          </>
        )}

        {/* TAB 5: DOCS */}
        {activeDetailTab === 'Docs' && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitleOrange, { color: colors.primary, marginTop: 0 }]}>IPO Prospectus</Text>
            <TouchableOpacity
              onPress={() => (ipo.drhpUrl || ipo.rhpUrl || ipo.prospectusUrl) ? Linking.openURL(ipo.drhpUrl || ipo.rhpUrl || ipo.prospectusUrl!) : undefined}
              style={styles.docRowBtn}
            >
              <Feather name="file-text" size={16} color={colors.foreground} />
              <Text style={[styles.docBtnText, { color: colors.foreground }]}>
                DHRP / DRHP Prospectus {!(ipo.drhpUrl || ipo.rhpUrl || ipo.prospectusUrl) && '(—)'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom Sticky Action Bar — Login To Apply */}
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
