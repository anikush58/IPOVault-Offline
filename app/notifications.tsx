import React, { useState, useMemo } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useNotifications } from '@/context/NotificationContext';
import { IconButton } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { NotificationRecord, NotificationType } from '@/services/notifications/notificationEngine';

// Format relative time (e.g. "2m ago", "1h ago", "Yesterday")
function formatRelativeTime(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

export default function NotificationCenterScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD'>('ALL');

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'UNREAD') {
      return notifications.filter((n) => !n.read_at);
    }
    return notifications;
  }, [notifications, activeTab]);

  const handleNotificationPress = async (item: NotificationRecord) => {
    if (!item.read_at) {
      await markAsRead(item.id);
    }

    // Deep-linking logic
    if (item.type === 'ALLOTTED' || item.type === 'PARTIALLY_ALLOTTED' || item.type === 'NOT_ALLOTTED') {
      if (item.ipo_id) {
        router.push({ pathname: '/allotment-checker', params: { ipoId: item.ipo_id } } as any);
      } else {
        router.push('/applications' as any);
      }
    } else if (item.ipo_id) {
      router.push({ pathname: '/ipo-details', params: { id: item.ipo_id } } as any);
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'NEW_IPO':
        return { name: 'calendar', color: '#3B82F6', bg: '#EFF6FF' };
      case 'IPO_OPEN':
        return { name: 'play-circle', color: '#22C55E', bg: '#DCFCE7' };
      case 'IPO_CLOSING_SOON':
        return { name: 'clock', color: colors.primary, bg: colors.primary + '18' };
      case 'IPO_CLOSING_TODAY':
        return { name: 'alert-circle', color: '#EF4444', bg: '#FEE2E2' };
      case 'ALLOTTED':
        return { name: 'award', color: '#22C55E', bg: '#DCFCE7' };
      case 'PARTIALLY_ALLOTTED':
        return { name: 'pie-chart', color: '#10B981', bg: '#D1FAE5' };
      case 'NOT_ALLOTTED':
        return { name: 'x-circle', color: '#6B7280', bg: '#F3F4F6' };
      case 'GMP_CHANGE':
        return { name: 'trending-up', color: '#8B5CF6', bg: '#F3E8FF' };
      case 'RADAR_UPGRADE':
        return { name: 'zap', color: '#F97316', bg: '#FFEDD5' };
      default:
        return { name: 'bell', color: colors.primary, bg: colors.primary + '18' };
    }
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />

        <View style={styles.titleRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.unreadBadgeText, { color: '#FFFFFF' }]}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={markAllAsRead}
          disabled={unreadCount === 0}
          style={{ opacity: unreadCount === 0 ? 0.4 : 1 }}
        >
          <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Tabs
          variant="underline"
          tabs={[
            { key: 'ALL', label: `ALL (${notifications.length})` },
            { key: 'UNREAD', label: `UNREAD (${unreadCount})` },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </View>

      {/* Body List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredNotifications.length === 0 ? (
        <View style={styles.emptyView}>
          <Feather name="bell-off" size={44} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Notifications</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {activeTab === 'UNREAD'
              ? 'You have caught up with all unread notifications.'
              : 'New market alerts and allotment updates will appear here automatically.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const iconConfig = getNotificationIcon(item.type);
            const isUnread = !item.read_at;

            return (
              <TouchableOpacity
                onPress={() => handleNotificationPress(item)}
                style={[
                  styles.card,
                  {
                    backgroundColor: isUnread ? colors.surface : colors.card,
                    borderColor: colors.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrap, { backgroundColor: iconConfig.bg }]}>
                  <Feather name={iconConfig.name as any} size={20} color={iconConfig.color} />
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
                      {formatRelativeTime(item.created_at)}
                    </Text>
                  </View>

                  <Text style={[styles.cardText, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                </View>

                {isUnread && <View style={[styles.dotIndicator, { backgroundColor: colors.primary }]} />}

                <TouchableOpacity
                  onPress={() => deleteNotification(item.id)}
                  style={styles.deleteBtn}
                  hitSlop={8}
                >
                  <Feather name="trash-2" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
  headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  unreadBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  unreadBadgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold' },
  markAllText: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.5 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyView: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', marginBottom: 6 },
  emptySub: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 18 },

  listContainer: { padding: 16, gap: 10, paddingBottom: 60 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 3 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', flex: 1, marginRight: 8 },
  timeText: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular' },
  cardText: { fontSize: 12.5, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 17 },
  dotIndicator: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  deleteBtn: { padding: 4, marginLeft: 2 },
});
