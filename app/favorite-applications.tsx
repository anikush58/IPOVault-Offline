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
import { ApplicationCard } from '@/components/ApplicationCard';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';

export default function FavoriteApplicationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { applications, isLoading, refresh } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [selectedApp, setSelectedApp] = useState<ApplicationWithDetails | null>(null);

  const favoriteApps = React.useMemo(() => {
    return applications.filter((a) => a.is_favorite === 1);
  }, [applications]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Page Header ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
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
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={() =>
          favoriteApps.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
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
    borderBottomWidth: 1,
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
