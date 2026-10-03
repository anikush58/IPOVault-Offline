import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { IconButton } from '@/components/ui/IconButton';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { useAuth } from '@/context/AuthContext';
import { ApplicationCard } from '@/components/ApplicationCard';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import {
  enrichApplicationsWithBrokerData,
  resolveCanonicalBrokerUserId,
  extractHoldingInstrumentsForQuotes,
} from '@/utils/brokerMatching';
import {
  brokerApiService,
  type UserPortfolioSummaryResponse,
  type MarketQuotesMap,
} from '@/services/broker/BrokerApiService';

export default function FavoriteApplicationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const { applications, ipos, users, isLoading, refresh } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [selectedApp, setSelectedApp] = useState<ApplicationWithDetails | null>(null);
  const [brokerPortfolio, setBrokerPortfolio] = useState<UserPortfolioSummaryResponse | null>(null);
  const [marketQuotes, setMarketQuotes] = useState<MarketQuotesMap>({});

  const activeUserId = React.useMemo(() => {
    return resolveCanonicalBrokerUserId(authUser, users);
  }, [authUser, users]);

  React.useEffect(() => {
    if (!activeUserId) return;
    brokerApiService.getUserPortfolio(activeUserId).then((p) => {
      if (p) setBrokerPortfolio(p);
    }).catch(() => {});

    const holdingInstruments = extractHoldingInstrumentsForQuotes(applications, ipos);
    if (holdingInstruments.length > 0) {
      brokerApiService.getMarketQuotes(activeUserId, holdingInstruments).then((q) => {
        if (q && Object.keys(q).length > 0) setMarketQuotes(q);
      }).catch(() => {});
    }
  }, [activeUserId, applications, ipos]);

  const effectiveApplications = React.useMemo(() => {
    return enrichApplicationsWithBrokerData(
      applications,
      ipos,
      brokerPortfolio?.investments,
      marketQuotes,
    );
  }, [applications, ipos, brokerPortfolio, marketQuotes]);

  const favoriteApps = React.useMemo(() => {
    return effectiveApplications.filter((a) => a.is_favorite === 1);
  }, [effectiveApplications]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Page Header ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />

        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>SAVED</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Favorite Applications</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      {/* ── Favorites List ── */}
      <FlatList
        data={favoriteApps}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <ApplicationCard
            application={item}
            onPress={() => setSelectedApp(item)}
          />
        )}
        contentContainerStyle={{ paddingVertical: 12, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={() =>
          favoriteApps.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginHorizontal: 16 }]}>
              {favoriteApps.length} favorite {favoriteApps.length === 1 ? 'application' : 'applications'}
            </Text>
          ) : null
        }
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather name="star" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Favorites Yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Tap the star icon on any application to add it to your favorite applications list.
            </Text>
          </View>
        )}
      />

      <UpdateApplicationModal
        application={selectedApp}
        onClose={() => setSelectedApp(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  sectionLabel: { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  empty: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', marginBottom: 6 },
  emptyText: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 19 },
});
