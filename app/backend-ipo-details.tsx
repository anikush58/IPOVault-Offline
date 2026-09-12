import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { formatCurrency } from '@/utils/formatters';

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
        return JSON.parse(params.item);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(!ipo && !!params.id);

  useEffect(() => {
    if (!ipo && params.id) {
      setLoading(true);
      backendIpoApiService
        .getBackendIpoDetail(params.id)
        .then((res) => {
          if (res) setIpo(res);
        })
        .finally(() => setLoading(false));
    }
  }, [params.id, ipo]);

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
          paddingBottom: insets.bottom + 40,
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
              STATUS
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

        {/* Financial & Issue Structure Terms */}
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
              {ipo.priceBandLow && ipo.priceBandHigh
                ? `₹${ipo.priceBandLow} - ₹${ipo.priceBandHigh}`
                : 'Pending'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              LOT SIZE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.lotSize ? `${ipo.lotSize} shares` : 'Pending'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              TOTAL ISSUE SIZE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.issueSize
                ? formatCurrency(Number(ipo.issueSize))
                : 'Pending'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              FRESH ISSUE SIZE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.freshIssueSize
                ? formatCurrency(Number(ipo.freshIssueSize))
                : 'N/A'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              OFS SIZE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.ofsSize
                ? formatCurrency(Number(ipo.ofsSize))
                : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Share Quantities */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          SHARE QUANTITIES (SHARES)
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
              {ipo.issueShareCount
                ? `${Number(ipo.issueShareCount).toLocaleString()} shares`
                : 'N/A'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              FRESH SHARES
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.freshIssueShareCount
                ? `${Number(ipo.freshIssueShareCount).toLocaleString()} shares`
                : 'N/A'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              OFS SHARES
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.ofsShareCount
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
              {ipo.openDate
                ? new Date(ipo.openDate).toLocaleDateString()
                : 'Pending'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              CLOSE DATE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.closeDate
                ? new Date(ipo.closeDate).toLocaleDateString()
                : 'Pending'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              LISTING DATE
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {ipo.listingDate
                ? new Date(ipo.listingDate).toLocaleDateString()
                : 'Pending'}
            </Text>
          </View>
        </View>

        {/* Isolation disclaimer */}
        <View
          style={[
            styles.disclaimerBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Feather name="info" size={16} color={colors.mutedForeground} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
            Read-only backend IPO record. This item is not saved into your offline SQLite database.
          </Text>
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
  },
  label: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  value: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 20,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },
});
