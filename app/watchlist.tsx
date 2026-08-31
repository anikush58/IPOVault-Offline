import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { IPOCard } from '@/components/ipo/IPOCard';
import { IPOEmptyState } from '@/components/ipo/IPOEmptyState';

export default function WatchlistScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const repo = useMemo(() => new IPORepository(db), [db]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watchlist, setWatchlist] = useState<IPOMasterRecord[]>([]);

  const loadWatchlist = useCallback(async () => {
    try {
      const [up, op, cl, li] = await Promise.all([
        repo.getUpcoming(),
        repo.getOpen(),
        repo.getClosed(),
        repo.getListed(),
      ]);
      const map = new Map<string, IPOMasterRecord>();
      [...op, ...up, ...cl, ...li].forEach((r) => {
        if (r.is_favorite === 1) {
          map.set(r.id, r);
        }
      });
      setWatchlist(Array.from(map.values()));
    } catch (err) {
      if (__DEV__) console.warn('[WatchlistScreen] Failed to load watchlist', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadWatchlist();
  }, [loadWatchlist]);

  const handleToggleFavorite = useCallback(
    async (id: string, isFav: boolean) => {
      Haptics.selectionAsync();
      await repo.toggleFavorite(id, isFav);
      if (!isFav) {
        setWatchlist((prev) => prev.filter((item) => item.id !== id));
      } else {
        loadWatchlist();
      }
    },
    [repo, loadWatchlist]
  );

  const handleCardPress = useCallback(
    (ipo: IPOMasterRecord) => {
      Haptics.selectionAsync();
      router.push({
        pathname: '/ipo-details',
        params: { id: ipo.id },
      });
    },
    [router]
  );

  // Group metrics for editorial header card
  const metrics = useMemo(() => {
    const openCount = watchlist.filter((r) => r.status?.toLowerCase() === 'open' || r.status?.toLowerCase() === 'active').length;
    const upcomingCount = watchlist.filter((r) => r.open_date && r.open_date >= new Date().toISOString().split('T')[0] && r.status?.toLowerCase() !== 'open').length;
    return { openCount, upcomingCount };
  }, [watchlist]);

  const renderItem = useCallback(
    ({ item }: { item: IPOMasterRecord }) => (
      <IPOCard ipo={item} onPress={handleCardPress} onToggleFavorite={handleToggleFavorite} />
    ),
    [handleCardPress, handleToggleFavorite]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Standardized Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background },
        ]}
      >
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />

        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          Watchlist
        </Text>

        <IconButton
          name="bookmark"
          variant="surface"
          size="md"
          disabled
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading your watchlist...</Text>
        </View>
      ) : (
        <FlatList
          data={watchlist}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPadding}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            watchlist.length > 0 ? (
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.summaryTop}>
                  <View style={[styles.bookmarkCircle, { backgroundColor: colors.primary + '18' }]}>
                    <Feather name="bookmark" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryTitle, { color: colors.foreground }]}>
                      {watchlist.length} Saved {watchlist.length === 1 ? 'Opportunity' : 'Opportunities'}
                    </Text>
                    <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
                      Track opening dates, prices & live subscription signals.
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryStatsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.statCell}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>OPEN FOR BIDS</Text>
                    <Text style={[styles.statVal, { color: isDark ? '#34D399' : '#059669' }]}>
                      {metrics.openCount} IPOs
                    </Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>UPCOMING</Text>
                    <Text style={[styles.statVal, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                      {metrics.upcomingCount} IPOs
                    </Text>
                  </View>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <IPOEmptyState
              type="favorites"
              actionText="Explore IPO Hub"
              onAction={() => router.push('/ipos' as any)}
            />
          }
        />
      )}
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
    paddingBottom: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  listPadding: {
    paddingVertical: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookmarkCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  summarySub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  statVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },
});
