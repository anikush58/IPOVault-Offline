import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { useAppExperience } from '@/context/AppExperienceContext';

import { ApplicationCard } from '@/components/ApplicationCard';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import { ApplicationsSkeleton } from '@/components/applications/ApplicationsSkeleton';

function FavoriteApplicationsScreenContent() {
  const colors = useColors();

  const { applications, isLoading, refresh, toggleFavorite, updateApplication } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const [selectedApp, setSelectedApp] = useState<ApplicationWithDetails | null>(null);

  const favoriteApps = React.useMemo(() => {
    return applications.filter((a) => a.is_favorite === 1);
  }, [applications]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Floating Top Header ── */}
      <ScreenHeader
        eyebrow="SAVED"
        title="Favorite Applications"
        centerTitle
        showBack
      />

      {/* ── Favorites List ── */}
      {isLoading && favoriteApps.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: topPad + 60 + 12,
            paddingBottom: insets.bottom + 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          <ApplicationsSkeleton />
        </ScrollView>
      ) : (
        <FlatList
          data={favoriteApps}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refresh}
              tintColor={colors.primary}
              progressViewOffset={topPad + 60}
            />
          }
          renderItem={({ item }) => (
            <ApplicationCard
              application={item}
              onPress={() => setSelectedApp(item)}
              onToggleFavorite={toggleFavorite}
              onUpdateStatus={updateApplication}
            />
          )}
          contentContainerStyle={{
            paddingTop: topPad + 60 + 12,
            paddingBottom: insets.bottom + 40,
          }}
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
      )}

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

export default function FavoriteApplicationsScreen() {
  const { isNonPro, isLoading: isExperienceLoading } = useAppExperience();
  const router = useRouter();

  React.useEffect(() => {
    if (!isExperienceLoading && isNonPro) {
      if (typeof (router as any).navigate === 'function') {
        (router as any).navigate('/(tabs)/ipos');
      } else {
        router.replace('/(tabs)/ipos');
      }
    }
  }, [isNonPro, isExperienceLoading, router]);

  if (isNonPro) {
    return null;
  }

  return <FavoriteApplicationsScreenContent />;
}
