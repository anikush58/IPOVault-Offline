import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/context/NotificationContext';
import { IconButton } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { AnimatedEntrance } from '@/components/ui/AnimatedEntrance';
import {
  NotificationRecord,
  NotificationType,
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from '@/services/notifications/notificationEngine';
import { NotificationsSkeleton } from '@/components/notifications/NotificationsSkeleton';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList as any);

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
  const [hasSystemPermission, setHasSystemPermission] = useState<boolean | null>(null);

  useEffect(() => {
    getNotificationPermissionStatus().then((res) => {
      setHasSystemPermission(res.granted);
    });
  }, []);

  const handleEnableSystemNotifications = async () => {
    const granted = await requestNotificationPermission(true);
    setHasSystemPermission(granted);
  };

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'UNREAD') {
      return notifications.filter((n) => !n.read_at);
    }
    return notifications;
  }, [notifications, activeTab]);

  const renderPermissionBanner = () => {
    if (hasSystemPermission !== false) return null;
    return (
      <View
        style={[
          styles.permissionBanner,
          {
            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF',
            borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
          },
        ]}
      >
        <View style={[styles.permissionBannerIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE' }]}>
          <Icon name="bell-off" size={16} color="#3B82F6" />
        </View>
        <View style={styles.permissionBannerTextWrap}>
          <Text style={[styles.permissionBannerTitle, { color: colors.foreground }]}>
            System notifications are off
          </Text>
          <Text style={[styles.permissionBannerSub, { color: colors.mutedForeground }]}>
            Enable device notifications to receive allotment and IPO closing alerts.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.permissionBannerBtn, { backgroundColor: colors.primary }]}
          onPress={handleEnableSystemNotifications}
          activeOpacity={0.8}
        >
          <Text style={[styles.permissionBannerBtnText, { color: colors.primaryForeground }]}>Enable</Text>
        </TouchableOpacity>
      </View>
    );
  };

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
        return {
          name: 'zap',
          color: isDark ? '#60A5FA' : '#2563EB',
          bg: isDark ? 'rgba(37, 99, 235, 0.16)' : '#EFF6FF',
        };
      case 'IPO_OPEN':
        return {
          name: 'play-circle',
          color: isDark ? '#4ADE80' : '#16A34A',
          bg: isDark ? 'rgba(22, 163, 74, 0.16)' : '#DCFCE7',
        };
      case 'IPO_CLOSING_SOON':
        return {
          name: 'clock',
          color: isDark ? '#FB923C' : '#EA580C',
          bg: isDark ? 'rgba(234, 88, 12, 0.16)' : '#FFEDD5',
        };
      case 'IPO_CLOSING_TODAY':
        return {
          name: 'alert-circle',
          color: isDark ? '#F87171' : '#DC2626',
          bg: isDark ? 'rgba(220, 38, 38, 0.16)' : '#FEE2E2',
        };
      case 'ALLOTTED':
        return {
          name: 'award',
          color: isDark ? '#4ADE80' : '#16A34A',
          bg: isDark ? 'rgba(22, 163, 74, 0.16)' : '#DCFCE7',
        };
      case 'PARTIALLY_ALLOTTED':
        return {
          name: 'pie-chart',
          color: isDark ? '#34D399' : '#059669',
          bg: isDark ? 'rgba(5, 150, 105, 0.16)' : '#D1FAE5',
        };
      case 'NOT_ALLOTTED':
        return {
          name: 'x-circle',
          color: isDark ? '#9CA3AF' : '#6B7280',
          bg: isDark ? 'rgba(107, 114, 128, 0.16)' : '#F3F4F6',
        };
      case 'GMP_CHANGE':
        return {
          name: 'trending-up',
          color: isDark ? '#A78BFA' : '#7C3AED',
          bg: isDark ? 'rgba(124, 58, 237, 0.16)' : '#F3E8FF',
        };
      case 'RADAR_UPGRADE':
        return {
          name: 'shield',
          color: isDark ? '#60A5FA' : '#2563EB',
          bg: isDark ? 'rgba(37, 99, 235, 0.16)' : '#EFF6FF',
        };
      default:
        return {
          name: 'bell',
          color: isDark ? '#93C5FD' : '#2563EB',
          bg: isDark ? 'rgba(37, 99, 235, 0.16)' : '#EFF6FF',
        };
    }
  };

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({
    inputRange: [0, 24],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          <View style={styles.headerSide}>
            <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
          </View>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerEyebrow, { color: colors.primary }]}>ALERTS</Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Notifications</Text>
          </View>

          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            <TouchableOpacity
              onPress={markAllAsRead}
              disabled={unreadCount === 0}
              style={{ opacity: unreadCount === 0 ? 0.35 : 1 }}
              hitSlop={8}
            >
              <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Tabs matching App Design System */}
        <View style={styles.tabsWrap}>
          <Tabs
            variant="pills"
            height={36}
            tabs={[
              { id: 'ALL', key: 'ALL', label: 'All', count: notifications.length },
              { id: 'UNREAD', key: 'UNREAD', label: 'Unread', count: unreadCount },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </View>
      </View>

      {/* Body List */}
      {isLoading ? (
        <View style={{ paddingTop: topPad + 115 }}>
          <NotificationsSkeleton />
        </View>
      ) : filteredNotifications.length === 0 ? (
        <View style={[styles.emptyView, { paddingTop: topPad + 115 }]}>
          {renderPermissionBanner()}
          <Icon name="bell-off" size={44} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Notifications</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {activeTab === 'UNREAD'
              ? 'You have caught up with all unread notifications.'
              : 'New market alerts and allotment updates will appear here automatically.'}
          </Text>
        </View>
      ) : (
        <AnimatedFlatList
          data={filteredNotifications}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={[styles.listContainer, { paddingTop: topPad + 115 }]}
          ListHeaderComponent={renderPermissionBanner}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          renderItem={({ item, index }: { item: NotificationRecord; index: number }) => {
            const iconConfig = getNotificationIcon(item.type);
            const isUnread = !item.read_at;

            return (
              <AnimatedEntrance delay={Math.min(index, 8) * 40} distance={12}>
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
                    <Icon name={iconConfig.name as any} size={20} color={iconConfig.color} />
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

                  {isUnread && <View style={styles.dotIndicator} />}

                  <TouchableOpacity
                    onPress={() => deleteNotification(item.id)}
                    style={styles.deleteBtn}
                    hitSlop={8}
                  >
                    <Icon name="trash-2" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </TouchableOpacity>
              </AnimatedEntrance>
            );
          }}
        />
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  headerSide: {
    minWidth: 80,
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  markAllText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  tabsWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },

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
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginTop: 6,
  },
  deleteBtn: { padding: 4, marginLeft: 2 },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 12,
  },
  permissionBannerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBannerTextWrap: {
    flex: 1,
    gap: 2,
  },
  permissionBannerTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  permissionBannerSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 15,
  },
  permissionBannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  permissionBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
