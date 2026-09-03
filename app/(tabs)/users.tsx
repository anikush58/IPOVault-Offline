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
import { Tabs } from '@/components/ui/Tabs';

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

  const handleArchive = async (user: User) => {
    try {
      await archiveUser(user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showError('Error', 'Failed to archive user.');
    }
  };

  const handleUnarchive = async (user: User) => {
    try {
      await unarchiveUser(user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showError('Error', 'Failed to unarchive user.');
    }
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

  const openAddUser = () => {
    setEditingUser(null);
    setShowModal(true);
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setShowModal(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...swipeHandlers}>
      {/* Custom Header */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
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

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>PROFILES</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Users</Text>
        </View>

        <IconButton
          name="plus"
          variant="surface"
          size="md"
          onPress={openAddUser}
        />
      </View>

      {/* Pill Style Tab Control Bar */}
      <View style={{ paddingHorizontal: 10, marginTop: 10, marginBottom: 4 }}>
        <Tabs
          variant="pills"
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
              onEdit={() => openEditUser(item)}
              onArchive={activeTab === 'active' ? () => handleArchive(item) : undefined}
              onUnarchive={activeTab === 'archived' ? () => handleUnarchive(item) : undefined}
              onDelete={() => handleDelete(item)}
            />
          );
        }}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface }]}>
              <Feather
                name={activeTab === 'archived' ? 'archive' : 'users'}
                size={28}
                color={colors.mutedForeground}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeTab === 'archived' ? 'No Archived Users' : 'No Users Added'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              {activeTab === 'archived'
                ? 'Users you archive will appear here to keep your active list clean.'
                : 'Add family members or accounts to manage their IPO applications.'}
            </Text>
            {activeTab === 'active' && (
              <TouchableOpacity
                onPress={openAddUser}
                style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Feather name="plus" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyAddBtnText}>Add First User</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingTop: 6 }}
      />

      <AddUserModal
        visible={showModal}
        user={editingUser}
        onClose={() => {
          setShowModal(false);
          setEditingUser(null);
        }}
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
  headerEyebrow: { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2, textAlign: 'center' },
  headerTitle: { fontSize: 28, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.6, lineHeight: 32, textAlign: 'center' },
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
    borderRadius: 14,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
