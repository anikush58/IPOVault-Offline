import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList as any);
import * as Linking from 'expo-linking';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';
import { useAuth } from '@/context/AuthContext';
import { useDB, type User } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { UserCard } from '@/components/UserCard';
import { AnimatedEntrance } from '@/components/ui/AnimatedEntrance';
import { AddUserModal } from '@/components/AddUserModal';
import { UsersSkeleton } from '@/components/users/UsersSkeleton';


import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { Tabs } from '@/components/ui/Tabs';
import { useAppExperience } from '@/context/AppExperienceContext';

export default function UsersScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const { isNonPro } = useAppExperience();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const {
    users,
    applications,
    isLoading,
    refresh,
    deleteUser,
    archiveUser,
    unarchiveUser,
  } = useDB();
  const { showConfirm, showError } = useDialog();
  const insets = useSafeAreaInsets();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } catch (err) {
      if (__DEV__) console.warn('[UsersScreen] Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  const { activeUsers, archivedUsers } = useMemo(() => {
    const active: User[] = [];
    const archived: User[] = [];
    for (const u of users) {
      if (u.archived === 1) archived.push(u);
      else active.push(u);
    }
    return { activeUsers: active, archivedUsers: archived };
  }, [users]);

  const displayedUsers = activeTab === 'active' ? activeUsers : archivedUsers;

  // Precomputed O(1) user stats map derived from applications
  const statsByUser = useMemo(() => {
    const map = new Map<string, { applied: number; allotted: number; decided: number }>();
    for (const a of applications) {
      let s = map.get(a.user_id);
      if (!s) {
        s = { applied: 0, allotted: 0, decided: 0 };
        map.set(a.user_id, s);
      }
      s.applied++;
      const st = a.status;
      if (st === 'Allotted' || st === 'Holding' || st === 'Sold') {
        s.allotted++;
        s.decided++;
      } else if (st === 'Not Allotted') {
        s.decided++;
      }
    }
    return map;
  }, [applications]);

  const handleArchive = useCallback(async (user: User) => {
    try {
      await archiveUser(user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showError('Error', 'Failed to archive user.');
    }
  }, [archiveUser, showError]);

  const handleUnarchive = useCallback(async (user: User) => {
    try {
      await unarchiveUser(user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showError('Error', 'Failed to unarchive user.');
    }
  }, [unarchiveUser, showError]);

  const handleDelete = useCallback((user: User) => {
    showConfirm({
      title: 'Delete User',
      message: `Remove ${user.name} and all their applications?`,
      confirmText: 'Delete',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteUser(user.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {
          showError('Error', 'Failed to delete user.');
        }
      },
    });
  }, [deleteUser, showConfirm, showError]);

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => setActiveTab('archived'),
    onSwipeRight: () => setActiveTab('active'),
  });

  const openAddUser = useCallback(() => {
    setEditingUser(null);
    setShowModal(true);
  }, []);

  const openEditUser = useCallback((user: User) => {
    setEditingUser(user);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingUser(null);
  }, []);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({
    inputRange: [0, 24],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

    const renderItem = useCallback(
    ({ item, index }: { item: User; index: number }) => {
      const stats = statsByUser.get(item.id) || { applied: 0, allotted: 0, decided: 0 };
      return (
        <AnimatedEntrance delay={Math.min(index, 8) * 40} distance={12}>
          <UserCard
            user={item}
            applied={stats.applied}
            allotted={stats.allotted}
            decided={stats.decided}
            onEdit={openEditUser}
            onArchive={activeTab === 'active' ? handleArchive : undefined}
            onUnarchive={activeTab === 'archived' ? handleUnarchive : undefined}
            onDelete={handleDelete}
          />
        </AnimatedEntrance>
      );
    },
    [statsByUser, openEditUser, activeTab, handleArchive, handleUnarchive, handleDelete]
  );

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      {...swipeHandlers}
    >
      {/* Floating Blurred Header Bar & Tabs */}
      <View
        style={[
          styles.floatingHeaderContainer,
          { paddingTop: topPad },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerBlurOpacity }]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 90 : 75}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={
              isDark
                ? ['rgba(14, 17, 23, 0.96)', 'rgba(14, 17, 23, 0.88)', 'rgba(14, 17, 23, 0.35)']
                : ['rgba(248, 249, 250, 0.96)', 'rgba(248, 249, 250, 0.88)', 'rgba(248, 249, 250, 0.35)']
            }
            locations={[0, 0.75, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.header}>
          {!isNonPro || from ? (
            <View style={{ marginRight: 12 }}>
              <IconButton
                name="arrow-left"
                variant="surface"
                size="md"
                onPress={() => {
                  if (from === 'bids') router.replace('/(tabs)/bids');
                  else if (from === 'dashboard') router.replace('/(tabs)');
                  else if (router.canGoBack()) router.back();
                  else router.replace('/(tabs)');
                }}
              />
            </View>
          ) : null}

          <View
            style={(!isNonPro || from) ? styles.headerCenterPro : { flex: 1, justifyContent: 'center' }}
            pointerEvents={(!isNonPro || from) ? 'none' : undefined}
          >
            <Text
              style={[
                styles.headerEyebrow,
                { color: colors.primary },
                (!isNonPro || from) && styles.headerEyebrowPro,
              ]}
            >
              INVESTOR PROFILES
            </Text>
            <Text
              style={[
                styles.headerTitle,
                { color: colors.foreground },
                (!isNonPro || from) && styles.headerTitlePro,
              ]}
            >
              Users
            </Text>
          </View>

          <IconButton
            name="plus"
            variant="surface"
            size="md"
            onPress={openAddUser}
          />
        </View>

        {/* Pill Style Tab Control Bar */}
        <View style={{ paddingHorizontal: 16, marginTop: 4, marginBottom: 12 }}>
          <Tabs
            variant="pills"
            height={36}
            tabs={[
              { key: 'active', label: 'Active', count: activeUsers.length },
              { key: 'archived', label: 'Archived', count: archivedUsers.length },
            ]}
            activeTab={activeTab}
            onChange={(newTab) => setActiveTab(newTab as 'active' | 'archived')}
          />
        </View>
      </View>

      {/* Users list */}
      {isLoading && users.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: topPad + 120,
            paddingBottom: insets.bottom + (isNonPro ? 90 : 20),
          }}
          showsVerticalScrollIndicator={false}
        >
          <UsersSkeleton />
        </ScrollView>
      ) : (
        <AnimatedFlatList
          data={displayedUsers}
          keyExtractor={(item: any) => item.id}
        contentContainerStyle={{
          paddingTop: topPad + 120,
          paddingBottom: insets.bottom + (isNonPro ? 90 : 20),
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            progressViewOffset={topPad + 123}
          />
        }
        renderItem={renderItem}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.surface },
              ]}
            >
              <Feather
                name={activeTab === 'archived' ? 'archive' : 'users'}
                size={28}
                color={colors.mutedForeground}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeTab === 'archived' ? 'No Archived Users' : 'No Users Added'}
            </Text>
            <Text
              style={[styles.emptySubtitle, { color: colors.mutedForeground }]}
            >
              {activeTab === 'archived'
                ? 'Users you archive will appear here to keep your active list clean.'
                : 'Add family members or accounts to manage their IPO applications.'}
            </Text>
            {activeTab === 'active' && (
              <TouchableOpacity
                onPress={openAddUser}
                style={[
                  styles.emptyAddBtn,
                  { backgroundColor: colors.primary },
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.emptyAddBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Add First User
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
      )}

      <AddUserModal
        visible={showModal}
        user={editingUser}
        onClose={closeModal}
      />


    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  floatingHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  headerCenterPro: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
    textAlign: 'left',
  },
  headerEyebrowPro: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.8,
    lineHeight: 34,
    textAlign: 'left',
  },
  headerTitlePro: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    lineHeight: 24,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
