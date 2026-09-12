import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { formatCurrency } from '@/utils/formatters';

type SegmentFilter = 'ALL' | 'MAINBOARD' | 'SME';

export default function NewIposScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [ipos, setIpos] = useState<BackendIpo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [segment, setSegment] = useState<SegmentFilter>('ALL');

  const fetchBackendIpos = useCallback(async () => {
    try {
      setError(null);
      const data = await backendIpoApiService.listBackendIpos({
        q: searchQuery.trim() || undefined,
        marketSegment: segment !== 'ALL' ? segment : undefined,
      });
      setIpos(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to connect to IPOVault backend API');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, segment]);

  useEffect(() => {
    setLoading(true);
    fetchBackendIpos();
  }, [fetchBackendIpos]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBackendIpos();
  };

  const renderItem = ({ item }: { item: BackendIpo }) => {
    const companyName =
      item.company?.displayName || item.companyName || item.symbol;
    const priceRangeStr =
      item.priceBandLow && item.priceBandHigh
        ? `₹${item.priceBandLow} - ₹${item.priceBandHigh}`
        : item.priceBandHigh
          ? `₹${item.priceBandHigh}`
          : 'Price band pending';

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() =>
          router.push({
            pathname: '/backend-ipo-details',
            params: { id: item.id, item: JSON.stringify(item) },
          })
        }
        style={[
          styles.itemCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.itemHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.symbolText, { color: colors.primary }]}>
              {item.symbol}
            </Text>
            <Text
              style={[styles.companyText, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {companyName}
            </Text>
          </View>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.segmentBadge,
                { backgroundColor: colors.surface },
              ]}
            >
              <Text
                style={[styles.segmentBadgeText, { color: colors.foreground }]}
              >
                {item.marketSegment}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    item.status === 'OPEN'
                      ? '#10B98120'
                      : item.status === 'UPCOMING'
                        ? '#3B82F620'
                        : colors.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color:
                      item.status === 'OPEN'
                        ? '#10B981'
                        : item.status === 'UPCOMING'
                          ? '#3B82F6'
                          : colors.mutedForeground,
                  },
                ]}
              >
                {item.status}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.itemMetrics}>
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
              PRICE BAND
            </Text>
            <Text style={[styles.metricVal, { color: colors.foreground }]}>
              {priceRangeStr}
            </Text>
          </View>

          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
              LOT SIZE
            </Text>
            <Text style={[styles.metricVal, { color: colors.foreground }]}>
              {item.lotSize ? `${item.lotSize} shares` : 'N/A'}
            </Text>
          </View>

          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
              ISSUE SIZE
            </Text>
            <Text style={[styles.metricVal, { color: colors.foreground }]}>
              {item.issueSize
                ? formatCurrency(Number(item.issueSize))
                : 'N/A'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
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
            BACKEND CATALOG
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            New IPOs
          </Text>
        </View>
      </View>

      {/* Search & Segment Bar */}
      <View style={styles.filterBar}>
        <View
          style={[
            styles.searchInputWrap,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by company or symbol…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>

        <View style={styles.segmentRow}>
          {(['ALL', 'MAINBOARD', 'SME'] as SegmentFilter[]).map((seg) => (
            <TouchableOpacity
              key={seg}
              onPress={() => setSegment(seg)}
              style={[
                styles.segmentPill,
                {
                  backgroundColor:
                    segment === seg ? colors.primary : colors.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.segmentPillText,
                  {
                    color:
                      segment === seg
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                  },
                ]}
              >
                {seg}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Fetching backend IPO catalog…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Feather name="wifi-off" size={32} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            API Connection Error
          </Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '600' }}>
              Retry API Request
            </Text>
          </TouchableOpacity>
        </View>
      ) : ipos.length === 0 ? (
        <View style={styles.centerContainer}>
          <Feather name="inbox" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No Backend IPOs Found
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            No matching IPO records returned from backend catalog.
          </Text>
        </View>
      ) : (
        <FlatList
          data={ipos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
        />
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
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  segmentPillText: {
    fontSize: 12,
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
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  errorSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },
  itemCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  symbolText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  companyText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  segmentBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  itemMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.15)',
    paddingTop: 10,
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.8,
  },
  metricVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginTop: 2,
  },
});
