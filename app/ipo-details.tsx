import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { IPODetailsLayout } from '@/components/ipo/IPODetailsLayout';

export default function IPODetailsScreen() {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const { id } = useLocalSearchParams<{ id: string }>();
  const repo = useMemo(() => new IPORepository(db), [db]);

  const [ipo, setIpo] = useState<IPOMasterRecord | null>(null);
  const [officialMatch, setOfficialMatch] = useState<IPOMasterRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 6, backgroundColor: colors.background }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.headerCircleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
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
        <View style={[styles.header, { paddingTop: topPad + 6, backgroundColor: colors.background }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.headerCircleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerContainer}>
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground, marginTop: 12 }]}>
            IPO Not Found
          </Text>
          <Text style={[styles.errorSubtitle, { color: colors.mutedForeground }]}>
            The requested IPO details could not be loaded.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.backBtnText, { color: colors.foreground }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <IPODetailsLayout
      ipo={ipo}
      onShare={handleShare}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      officialMatch={officialMatch}
      onMergeOfficial={handleMerge}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  errorTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  errorSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  backBtn: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
