import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';
import { useAuth } from '@/context/AuthContext';
import { useDB, type User } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { UserCard } from '@/components/UserCard';
import { AddUserModal } from '@/components/AddUserModal';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { Tabs } from '@/components/ui/Tabs';
import {
  BrokerAccountItem,
  brokerApiService,
  DerivedInvestmentSummary,
  getCanonicalBroker,
  parseQueryParams,
} from '@/services/broker/BrokerApiService';

WebBrowser.maybeCompleteAuthSession();

export default function UsersScreen() {
  const colors = useColors();
  const router = useRouter();
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
  const { user: authUser } = useAuth();
  const { showConfirm, showError } = useDialog();
  const insets = useSafeAreaInsets();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccountItem[]>([]);
  const [investmentsByProfile, setInvestmentsByProfile] = useState<
    Record<string, DerivedInvestmentSummary[]>
  >({});
  const [brokerActionUserId, setBrokerActionUserId] = useState<string | null>(
    null,
  );
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Active user ID for backend scoping
  const activeUserId = useMemo(() => {
    const firstUser = users[0] as
      | { owner_id?: string; id?: string }
      | undefined;
    return (
      authUser?.id || firstUser?.owner_id || firstUser?.id || 'default-user'
    );
  }, [authUser, users]);

  // Load broker accounts & investment summaries for connected user profiles
  const loadBrokerAccounts = useCallback(async () => {
    if (!activeUserId) return;
    try {
      const accounts = await brokerApiService.getAccounts(activeUserId);
      setBrokerAccounts(accounts);

      // Fetch investment summaries for all connected accounts
      const connectedAccounts = accounts.filter(
        (acc) => acc.connection?.status === 'CONNECTED' && acc.isActive,
      );

      const summariesMap: Record<string, DerivedInvestmentSummary[]> = {};
      await Promise.all(
        connectedAccounts.map(async (acc) => {
          const userApps = applications.filter(
            (a) => a.user_id === acc.profileId && a.ipo_id,
          );
          if (!userApps.length) return;

          const summaries: DerivedInvestmentSummary[] = [];
          for (const app of userApps) {
            const summary = await brokerApiService.getInvestmentSummary(
              activeUserId,
              acc.id,
              app.ipo_id,
            );
            if (summary) {
              summaries.push({
                ...summary,
                ipoName: app.ipo_name,
              });
            }
          }
          if (summaries.length > 0) {
            summariesMap[acc.profileId] = summaries;
          }
        }),
      );

      setInvestmentsByProfile((prev) => ({
        ...prev,
        ...summariesMap,
      }));
    } catch (err) {
      console.warn('[UsersScreen] Failed to load broker accounts / investments:', err);
    }
  }, [activeUserId, applications]);

  useEffect(() => {
    loadBrokerAccounts();
  }, [loadBrokerAccounts]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), loadBrokerAccounts()]);
  }, [refresh, loadBrokerAccounts]);

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

  // Per-user strike rate stats derived from applications
  const statsForUser = (userId: string) => {
    const userApps = applications.filter((a) => a.user_id === userId);
    const applied = userApps.length;
    const allotted = userApps.filter(
      (a) =>
        a.status === 'Allotted' ||
        a.status === 'Holding' ||
        a.status === 'Sold',
    ).length;
    const decided = userApps.filter(
      (a) =>
        a.status === 'Allotted' ||
        a.status === 'Holding' ||
        a.status === 'Sold' ||
        a.status === 'Not Allotted',
    ).length;
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

  // Handle incoming deep link when returning from external browser or OAuth redirect
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (!url) return;
      const query = parseQueryParams(url);
      const hasToken =
        query.code ||
        query.tokenId ||
        query.token_id ||
        query.auth_code ||
        query.authCode ||
        query.request_token ||
        query.requestToken;

      if (query.error || query.error_description || query.status === 'cancelled') {
        const isCancel =
          query.error === 'access_denied' ||
          query.error === 'user_cancelled' ||
          query.status === 'cancelled';
        if (!isCancel) {
          showError(
            'Connection Failed',
            query.error_description ||
              query.error ||
              'Broker authorization was rejected.',
          );
        }
        await loadBrokerAccounts();
        return;
      }

      if (hasToken) {
        await loadBrokerAccounts();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    return () => {
      subscription.remove();
    };
  }, [loadBrokerAccounts, showError]);

  const handleConnectBroker = async (targetUser: User) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const canonical = getCanonicalBroker(targetUser.broker);
    if (!canonical) {
      showError(
        'Unsupported Broker',
        `Connecting to ${
          targetUser.broker || 'this broker'
        } is not supported yet.`,
      );
      return;
    }

    setBrokerActionUserId(targetUser.id);
    try {
      // 1. Create or retrieve existing backend BrokerAccount
      const account = await brokerApiService.createAccount(activeUserId, {
        profileId: targetUser.id,
        broker: canonical.brokerType,
        accountName: targetUser.name,
        clientId: targetUser.client_id,
      });

      // 2. Fetch OAuth authorization URL
      const { authorizationUrl } = await brokerApiService.getAuthorizationUrl(
        activeUserId,
        account.id,
        canonical.slug,
      );

      if (!authorizationUrl) {
        throw new Error('No authorization URL returned by broker service');
      }

      // 3. Open authorization session
      const redirectUri = Linking.createURL('broker-callback');
      let authResult: WebBrowser.WebBrowserAuthSessionResult;

      try {
        authResult = await WebBrowser.openAuthSessionAsync(
          authorizationUrl,
          redirectUri,
        );
      } catch (browserErr) {
        console.warn(
          '[UsersScreen] openAuthSessionAsync failed, falling back to Linking.openURL:',
          browserErr,
        );
        await Linking.openURL(authorizationUrl);
        authResult = { type: WebBrowser.WebBrowserResultType.DISMISS };
      }

      // 4. Handle returned auth session result
      if (authResult.type === 'success' && authResult.url) {
        const query = parseQueryParams(authResult.url);

        // Check for error parameters
        if (query.error || query.error_description || query.status === 'cancelled') {
          const isCancel =
            query.error === 'access_denied' ||
            query.error === 'user_cancelled' ||
            query.status === 'cancelled';
          if (!isCancel) {
            throw new Error(
              query.error_description ||
                query.error ||
                'Broker authorization was rejected.',
            );
          }
        } else {
          // Extract auth code / tokens
          const code = query.code;
          const tokenId = query.tokenId || query.token_id;
          const authCode = query.auth_code || query.authCode;
          const requestToken = query.request_token || query.requestToken;
          const state = query.state;

          if (code || tokenId || authCode || requestToken) {
            await brokerApiService.completeOAuthCallback(
              activeUserId,
              account.id,
              canonical.slug,
              { code, tokenId, authCode, requestToken, state },
            );
          }
        }
      }

      // 5. Refresh broker accounts and provide success feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadBrokerAccounts();
    } catch (err: any) {
      console.error('[UsersScreen] handleConnectBroker error:', err);
      const errMsg = err?.message || '';
      if (errMsg.includes('not configured') || errMsg.includes('API key') || errMsg.includes('partner ID')) {
        showError(
          `${canonical.displayName} Integration (Preview)`,
          `Connecting ${canonical.displayName} for ${targetUser.name} will enable automatic post-listing holding & PnL sync.\n\nLive OAuth consent for ${canonical.displayName} requires broker API partner credentials on the server. Post-listing sync will become active automatically once configured.`,
        );
      } else {
        showError(
          'Connection Failed',
          errMsg || 'Failed to complete broker authentication flow.',
        );
      }
    } finally {
      setBrokerActionUserId(null);
    }
  };

  const handleDisconnectBroker = (targetUser: User, accountId: string) => {
    showConfirm({
      title: 'Disconnect Broker',
      message: `Disconnect ${targetUser.broker || 'broker'} account for ${
        targetUser.name
      }? Historical portfolio data will be preserved.`,
      confirmText: 'Disconnect',
      isDanger: true,
      onConfirm: async () => {
        setBrokerActionUserId(targetUser.id);
        try {
          await brokerApiService.disconnectAccount(activeUserId, accountId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await loadBrokerAccounts();
        } catch (err: any) {
          showError(
            'Error',
            err?.message || 'Failed to disconnect broker account.',
          );
        } finally {
          setBrokerActionUserId(null);
        }
      },
    });
  };

  const handleSyncBroker = async (targetUser: User, accountId: string) => {
    setBrokerActionUserId(targetUser.id);
    try {
      const res = await brokerApiService.syncAccount(activeUserId, accountId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadBrokerAccounts();
      showConfirm({
        title: 'Sync Completed',
        message: `Successfully synced ${
          res?.syncedInvestmentsCount ?? 0
        } post-listing investments for ${targetUser.name}.`,
        confirmText: 'OK',
        isDanger: false,
        onConfirm: async () => {},
      });
    } catch (err: any) {
      showError(
        'Sync Failed',
        err?.message || 'Failed to sync broker portfolio data.',
      );
    } finally {
      setBrokerActionUserId(null);
    }
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => setActiveTab('archived'),
    onSwipeRight: () => setActiveTab('active'),
  });

  const openAddUser = () => {
    setEditingUser(null);
    setShowModal(true);
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setShowModal(true);
  };

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      {...swipeHandlers}
    >
      {/* Custom Header */}
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
          onPress={() => {
            if (from === 'bids') router.replace('/(tabs)/bids');
            else if (from === 'dashboard') router.replace('/(tabs)');
            else if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
        />

        <View style={{ flex: 1, justifyContent: 'center', marginLeft: 8 }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>
            PROFILES
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
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
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => {
          const stats = statsForUser(item.id);
          const canonical = getCanonicalBroker(item.broker);
          const matchedAccount = brokerAccounts.find(
            (acc) =>
              acc.profileId === item.id &&
              (!canonical || acc.broker === canonical.brokerType) &&
              acc.isActive,
          );

          return (
            <UserCard
              user={item}
              applied={stats.applied}
              allotted={stats.allotted}
              decided={stats.decided}
              brokerAccount={matchedAccount}
              investments={investmentsByProfile[item.id] || []}
              onEdit={() => openEditUser(item)}
              onArchive={
                activeTab === 'active' ? () => handleArchive(item) : undefined
              }
              onUnarchive={
                activeTab === 'archived'
                  ? () => handleUnarchive(item)
                  : undefined
              }
              onDelete={() => handleDelete(item)}
              onConnectBroker={handleConnectBroker}
              onDisconnectBroker={handleDisconnectBroker}
              onSyncBroker={handleSyncBroker}
              isBrokerActionLoading={brokerActionUserId === item.id}
            />
          );
        }}
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
                <Feather
                  name="plus"
                  size={16}
                  color={colors.primaryForeground}
                  style={{ marginRight: 6 }}
                />
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
        contentContainerStyle={{
          paddingBottom: insets.bottom + 90,
          paddingTop: 6,
        }}
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
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.6,
    lineHeight: 32,
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
    borderRadius: 14,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
