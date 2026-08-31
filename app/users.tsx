import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';
import { useDB, type User } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { UserCard } from '@/components/UserCard';
import { AddUserModal } from '@/components/AddUserModal';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';

export default function UsersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { users, applications, isLoading, refresh, deleteUser, archiveUser, unarchiveUser } = useDB();
  const { showConfirm, showError } = useDialog();
  const insets = useSafeAreaInsets();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { activeUsers, archivedUsers } = React.useMemo(() => {
    const active: User[] = [];
    const archived: User[] = [];
    for (const u of users) {
      if (u.archived === 1) archived.push(u);
      else active.push(u);
    }
    return { activeUsers: active, archivedUsers: archived };
  }, [users]);

  const displayedUsers = activeTab === 'active' ? activeUsers : archivedUsers;

  // Per-user strike rate stats derived from applications
  const statsForUser = (userId: string) => {
    const userApps = applications.filter((a) => a.user_id === userId);
    const applied = userApps.length;
    const allotted = userApps.filter((a) => a.status === 'Allotted' || a.status === 'Holding' || a.status === 'Sold').length;
    const decided = userApps.filter((a) => a.status === 'Allotted' || a.status === 'Holding' || a.status === 'Sold' || a.status === 'Not Allotted').length;
    return { applied, allotted, decided };
  };

  const handleArchive = (user: User) => {
    showConfirm({
      title: 'Archive User',
      message: `Archive ${user.name}? They will be moved to the Archived tab.`,
      confirmText: 'Archive',
      onConfirm: async () => {
        try {
          await archiveUser(user.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          showError('Error', 'Failed to archive user.');
        }
      },
    });
  };

  const handleUnarchive = (user: User) => {
    showConfirm({
      title: 'Unarchive User',
      message: `Restore ${user.name} back to Active users?`,
      confirmText: 'Restore',
      onConfirm: async () => {
        try {
          await unarchiveUser(user.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          showError('Error', 'Failed to unarchive user.');
        }
      },
    });
  };

  const handleDelete = (user: User) => {
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
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => setActiveTab('archived'),
    onSwipeRight: () => setActiveTab('active'),
  });

  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...swipeHandlers}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={() => {
            if (from === 'bids') router.replace('/(tabs)/bids');
            else if (from === 'dashboard') router.replace('/(tabs)');
            else if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
        />

        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>PROFILES</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Users</Text>
        </View>

        <IconButton
          name="plus"
          variant="surface"
          size="md"
          onPress={() => router.push('/add-user')}
        />
      </View>

      {/* Segmented Control Bar */}
      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <SegmentedTabControl
          variant="primary"
          tabs={[
            { key: 'active', label: 'Active', count: activeUsers.length },
            { key: 'archived', label: 'Archived', count: archivedUsers.length },
          ]}
          activeTab={activeTab}
          onChange={(newTab) => setActiveTab(newTab as 'active' | 'archived')}
        />
      </View>

      {/* Users list */}
      <FlatList
        data={displayedUsers}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => {
          const stats = statsForUser(item.id);
          return (
            <UserCard
              user={item}
              applied={stats.applied}
              allotted={stats.allotted}
              decided={stats.decided}
              onEdit={() => router.push({ pathname: '/add-user', params: { userId: item.id } })}
              onArchive={() => handleArchive(item)}
              onUnarchive={() => handleUnarchive(item)}
              onDelete={() => handleDelete(item)}
            />
          );
        }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 90 }}
        ListHeaderComponent={() =>
          displayedUsers.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {displayedUsers.length} {displayedUsers.length === 1 ? 'user' : 'users'}
            </Text>
          ) : null
        }
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather name="users" size={28} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeTab === 'active' ? 'No Active Users' : 'No Archived Users'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {activeTab === 'active'
                ? 'Add users to start tracking their IPO applications and allotment strike rate.'
                : 'Archived users will appear here for record keeping.'}
            </Text>
            {activeTab === 'active' && (
              <TouchableOpacity
                onPress={() => router.push('/add-user')}
                style={[styles.emptyBtn, { overflow: 'hidden' }]}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Add First User</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#D4A017',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  headerEyebrow: { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2, textAlign: 'center' },
  headerTitle: { fontSize: 28, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.6, lineHeight: 32, textAlign: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },

  // Tabs
  tabBarWrap: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
  },
  tabSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
  },
  tabSegmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  tabLabel: { fontSize: 13 },
  tabBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100 },
  tabBadgeText: { fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold' },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'GoogleSansFlex_600SemiBold' },
});
