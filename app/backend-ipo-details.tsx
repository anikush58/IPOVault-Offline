import React, { useEffect, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { backendIpoApiService, normalizeBackendIpo } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { IPODetailsLayout } from '@/components/ipo/IPODetailsLayout';

export default function BackendIpoDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; item?: string }>();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

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
  const [isFavorite, setIsFavorite] = useState(false);

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
    const price = ipo.priceBandHigh || ipo.priceBandLow ? `₹${ipo.priceBandLow || ipo.priceBandHigh} – ${ipo.priceBandHigh || ipo.priceBandLow}` : '';
    const gmp = ipo.currentGmp?.gmpAmount != null ? `₹${ipo.currentGmp.gmpAmount} (${ipo.currentGmp.gmpPercentage || 0}%)` : '';
    const shareText = `Check out ${name} IPO on IPOVault!${price ? `\nPrice Band: ${price}` : ''}${gmp ? `\nEst. GMP: ${gmp}` : ''}\nTrack live on IPOVault.`;
    Share.share({ message: shareText }).catch(() => {});
  };

  const handleToggleFavorite = () => {
    setIsFavorite((prev) => !prev);
    try { Haptics.selectionAsync(); } catch {}
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
            Unable to load the requested IPO details.
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
