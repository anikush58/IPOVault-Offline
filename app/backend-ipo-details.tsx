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
        <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>
            {ipo.symbol} · {ipo.marketSegment}
          </Text>
          <Text
            style={[styles.headerTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {companyName}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 100,
        }}
      >
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

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              FRESH ISSUE SIZE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.freshIssueSize !== null && ipo.freshIssueSize !== undefined
                ? formatCurrency(Number(ipo.freshIssueSize))
                : 'N/A'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              OFS SIZE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.ofsSize !== null && ipo.ofsSize !== undefined
                ? formatCurrency(Number(ipo.ofsSize))
                : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Share Quantities */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          SHARE QUANTITIES
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              TOTAL SHARES
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.issueShareCount !== null && ipo.issueShareCount !== undefined
                ? `${Number(ipo.issueShareCount).toLocaleString()} shares`
                : 'N/A'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              FRESH SHARES
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.freshIssueShareCount !== null && ipo.freshIssueShareCount !== undefined
                ? `${Number(ipo.freshIssueShareCount).toLocaleString()} shares`
                : 'N/A'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              OFS SHARES
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.ofsShareCount !== null && ipo.ofsShareCount !== undefined
                ? `${Number(ipo.ofsShareCount).toLocaleString()} shares`
                : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Lifecycle Dates */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          LIFECYCLE TIMELINE
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              OPEN DATE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.openDate || ipo.lifecycle?.openDate
                ? formatDate(ipo.openDate || ipo.lifecycle?.openDate!)
                : 'Pending'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              CLOSE DATE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.closeDate || ipo.lifecycle?.closeDate
                ? formatDate(ipo.closeDate || ipo.lifecycle?.closeDate!)
                : 'Pending'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              ALLOTMENT DATE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.allotmentDate || ipo.lifecycle?.basisOfAllotmentDate || ipo.allotment?.expectedAllotmentDate || ipo.allotment?.expectedDate
                ? formatDate(ipo.allotmentDate || ipo.lifecycle?.basisOfAllotmentDate || ipo.allotment?.expectedAllotmentDate || ipo.allotment?.expectedDate!)
                : 'Pending'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              LISTING DATE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.listingDate || ipo.lifecycle?.listingDate
                ? formatDate(ipo.listingDate || ipo.lifecycle?.listingDate!)
                : 'Pending'}
            </Text>
          </View>
        </View>

        {/* Offer Breakup & Investment Limits */}
        {ipo.offerCategories && ipo.offerCategories.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              OFFER BREAKUP & CATEGORY LIMITS
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {ipo.offerCategories.map((cat, idx) => (
                <View key={cat.id || idx} style={styles.cardRow}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    {cat.category} ALLOCATION
                  </Text>
                  <Text style={[styles.value, { color: colors.foreground }]}>
                    {cat.allocationPct !== null && cat.allocationPct !== undefined
                      ? `${cat.allocationPct}%`
                      : 'N/A'}
                    {cat.minAmount ? ` (Min ₹${cat.minAmount})` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Grey Market Premium (GMP) */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          GREY MARKET PREMIUM (GMP)
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {ipo.currentGmp ? (
            <>
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  CURRENT GMP
                </Text>
                <Text style={[styles.value, { color: '#10B981' }]}>
                  +₹{ipo.currentGmp.gmpAmount}
                  {ipo.currentGmp.gmpPercentage ? ` (${ipo.currentGmp.gmpPercentage}%)` : ''}
                </Text>
              </View>
              {ipo.currentGmp.estProfitPerLot && (
                <View style={styles.cardRow}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    EST. PROFIT / LOT
                  </Text>
                  <Text style={[styles.value, { color: colors.foreground }]}>
                    ₹{ipo.currentGmp.estProfitPerLot}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <Text style={[styles.value, { color: colors.mutedForeground, textAlign: 'center' }]}>
              N/A (No GMP observations recorded)
            </Text>
          )}
        </View>

        {/* Subscription Status */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          SUBSCRIPTION STATUS
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {ipo.currentSubscription?.categories && ipo.currentSubscription.categories.length > 0 ? (
            ipo.currentSubscription.categories.map((sub, idx) => (
              <View key={idx} style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  {sub.category}
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {sub.subscriptionMultiple}x
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.value, { color: colors.mutedForeground, textAlign: 'center' }]}>
              Subscription data unavailable
            </Text>
          )}
        </View>

        {/* Registrar & Lead Managers */}
        {(registrar || (brlms && brlms.length > 0) || ipo.allotment) && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              REGISTRAR & LEAD MANAGERS
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  REGISTRAR
                </Text>
                <Text style={[styles.value, { color: colors.foreground }]}>
                  {registrar?.name || ipo.allotment?.registrar || 'N/A'}
                </Text>
              </View>
              {registrar?.phone && (
                <View style={styles.cardRow}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    PHONE
                  </Text>
                  <Text style={[styles.value, { color: colors.foreground }]}>
                    {registrar.phone}
                  </Text>
                </View>
              )}
              {registrar?.email && (
                <View style={styles.cardRow}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    EMAIL
                  </Text>
                  <Text style={[styles.value, { color: colors.foreground }]}>
                    {registrar.email}
                  </Text>
                </View>
              )}
              {brlms && brlms.length > 0 && (
                <View style={styles.cardRow}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    LEAD MANAGERS
                  </Text>
                  <Text style={[styles.value, { color: colors.foreground, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                    {brlms.map((b) => b.name).join(', ')}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Company Info & Financials */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          COMPANY DETAILS & FINANCIALS
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {ipo.company?.aboutDescription && (
            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 4 }]}>
                ABOUT THE COMPANY
              </Text>
              <Text style={[styles.disclaimerText, { color: colors.foreground }]}>
                {ipo.company.aboutDescription}
              </Text>
            </View>
          )}

          {ipo.company?.industry && (
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                INDUSTRY
              </Text>
              <Text style={[styles.value, { color: colors.foreground }]}>
                {ipo.company.industry}
              </Text>
            </View>
          )}

          {ipo.company?.website && (
            <View style={styles.cardRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                WEBSITE
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL(ipo.company!.website!)}>
                <Text style={[styles.value, { color: colors.primary }]}>
                  {ipo.company.website}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {ipo.company?.financials && ipo.company.financials.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 6 }]}>
                FINANCIAL HISTORY (₹ CR)
              </Text>
              {ipo.company.financials.map((fin, idx) => (
                <View key={fin.id || idx} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 }}>
                  <Text style={[styles.value, { color: colors.primary, fontSize: 12 }]}>
                    {fin.fiscalPeriod} ({fin.periodType || 'ANNUAL'})
                  </Text>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>Revenue</Text>
                    <Text style={[styles.value, { color: colors.foreground }]}>₹{fin.totalRevenue ?? 'N/A'}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>PAT</Text>
                    <Text style={[styles.value, { color: colors.foreground }]}>₹{fin.pat ?? 'N/A'}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>Net Worth</Text>
                    <Text style={[styles.value, { color: colors.foreground }]}>₹{fin.netWorth ?? 'N/A'}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Official Documents */}
        {ipo.documents && ipo.documents.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              OFFICIAL DOCUMENTS
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {ipo.documents.map((doc, idx) => (
                <View key={doc.id || idx} style={styles.cardRow}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    {doc.documentType} ({doc.fileName || 'Document'})
                  </Text>
                  {(doc.sourceUrl || doc.fileUrl || doc.documentUrl) ? (
                    <TouchableOpacity onPress={() => Linking.openURL((doc.sourceUrl || doc.fileUrl || doc.documentUrl)!)}>
                      <Text style={[styles.value, { color: colors.primary }]}>View PDF ↗</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.value, { color: colors.mutedForeground }]}>Uploaded</Text>
                  )}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom Sticky Action Bar — Login To Apply / Apply Now */}
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
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: '/apply-ipo',
              params: { ipoId: ipo.id },
            } as any)
          }
        >
          <Feather name="edit-3" size={18} color="#ffffff" style={{ marginRight: 8 }} />
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
  disclaimerText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
});
