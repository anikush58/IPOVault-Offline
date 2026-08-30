import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { IPOService } from '@/services/ipo/ipoService';
import { ipoDiagnosticsStore, mapSyncErrorToUserMessage, IPODiagnostics } from '@/services/ipo/ipoUpdater';

export type CardState = 'local' | 'live' | 'refreshing' | 'sync_failed' | 'empty';

/**
 * Reusable Status Badge Component
 */
export function StatusBadge({ state }: { state: CardState }) {
  const colors = useColors();

  const config = {
    local: { label: 'Offline (Local Database)', color: '#D97706', bg: 'rgba(245, 158, 11, 0.12)', border: '#F59E0B' },
    live: { label: 'Live Connected', color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)', border: '#10B981' },
    refreshing: { label: 'Refreshing…', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)', border: '#3B82F6' },
    sync_failed: { label: 'Offline (Local Database)', color: '#D97706', bg: 'rgba(245, 158, 11, 0.12)', border: '#F59E0B' },
    empty: { label: 'Database Empty', color: colors.mutedForeground, bg: colors.surface, border: colors.border },
  }[state];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

/**
 * Reusable Information Banner Component
 */
export function InfoBanner({
  title = 'Using your local IPO database',
  description = 'Your IPO data is available offline. Live synchronization will be available in a future update.',
  icon = 'info',
}: {
  title?: string;
  description?: string;
  icon?: string;
}) {
  return (
    <View style={styles.banner}>
      <Feather name={icon as any} size={16} color="#D97706" style={{ marginTop: 1 }} accessibilityLabel="Information" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerSub}>{description}</Text>
      </View>
    </View>
  );
}

function formatLastChecked(lastSyncISO: string | null): string {
  if (!lastSyncISO) return 'Not checked yet';
  const date = new Date(lastSyncISO);
  if (isNaN(date.getTime())) return 'Not checked yet';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) {
    return `Today ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${timeStr}`;
  }

  if (diffDays > 1 && diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

/**
 * Premium IPO Database Status Card
 */
export function DatabaseStatusCard() {
  const colors = useColors();
  const db = useSQLiteContext();
  const [masterCount, setMasterCount] = useState<number>(0);
  const [diag, setDiag] = useState<IPODiagnostics>(ipoDiagnosticsStore.get());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const res = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM ipo_master WHERE deleted_at IS NULL');
      setMasterCount(res?.cnt ?? 0);
    } catch {
      setMasterCount(0);
    }
  }, [db]);

  useEffect(() => {
    fetchCount();
    const unsub = ipoDiagnosticsStore.subscribe((d) => setDiag(d));
    return () => { unsub(); };
  }, [fetchCount]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    Haptics.selectionAsync();
    try {
      const service = new IPOService(db);
      await service.updater.runUpdate();
      await fetchCount();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      if (__DEV__) console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const syncUrl = process.env.EXPO_PUBLIC_IPO_SYNC_URL;
  const isLiveConfigured = Boolean(
    syncUrl && syncUrl.trim().length > 0 && !syncUrl.includes('api.ipovault.app')
  );

  let cardState: CardState = 'local';
  if (isRefreshing) {
    cardState = 'refreshing';
  } else if (masterCount === 0) {
    cardState = 'empty';
  } else if (isLiveConfigured && !diag.syncError) {
    cardState = 'live';
  } else if (diag.syncError) {
    cardState = 'sync_failed';
  }

  const lastCheckedText = formatLastChecked(diag.lastSuccessfulSync);

  const bannerDescription = diag.syncError
    ? mapSyncErrorToUserMessage(diag.syncError)
    : 'Your IPO data is available offline. Live synchronization will be available in a future update.';

  return (
    <View style={[styles.card, { borderColor: colors.border, marginTop: 14 }]}>
      <LinearGradient
        colors={[colors.primary + '14', colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
      />

      {/* ── Card Header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <Feather name="database" size={15} color={colors.primary} accessibilityLabel="Database" />
          <Text style={[styles.headerTitleText, { color: colors.foreground }]}>IPO Database</Text>
        </View>
        <StatusBadge state={cardState} />
      </View>

      {/* ── Statistics Row (Exactly 3 Metrics) ── */}
      <View style={[styles.statsRow, { marginTop: 16 }]}>
        <View style={styles.statCell}>
          <Text style={[styles.statValueText, { color: colors.foreground }]}>{masterCount}</Text>
          <Text style={[styles.statLabelText, { color: colors.mutedForeground }]}>Total IPOs</Text>
        </View>

        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

        <View style={styles.statCell}>
          <Text style={[styles.statValueText, { color: colors.foreground }]}>SQLite</Text>
          <Text style={[styles.statLabelText, { color: colors.mutedForeground }]}>Database</Text>
        </View>

        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

        <View style={styles.statCell}>
          <Text style={[styles.statValueText, { color: colors.foreground }]} numberOfLines={1}>
            {lastCheckedText}
          </Text>
          <Text style={[styles.statLabelText, { color: colors.mutedForeground }]}>Last Checked</Text>
        </View>
      </View>

      {/* ── Information Banner (Amber Themed) ── */}
      <View style={{ marginTop: 16 }}>
        <InfoBanner description={bannerDescription} />
      </View>

      {/* ── Refresh Section ── */}
      {isLiveConfigured ? (
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={isRefreshing}
          style={[styles.refreshBtn, { borderColor: colors.primary, backgroundColor: colors.surface }]}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Refresh IPO Database"
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name="refresh-cw" size={14} color={colors.primary} />
          )}
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.refreshBtnText, { color: colors.primary }]}>
              {isRefreshing ? 'Syncing Market Data…' : 'Refresh IPO Database'}
            </Text>
            <Text style={[styles.refreshBtnSub, { color: colors.mutedForeground }]}>
              Check for newly available IPOs.
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.disabledSyncHint}>
          <Text style={[styles.disabledSyncText, { color: colors.mutedForeground }]}>
            Live synchronization is not available yet.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.2,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  statValueText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  statLabelText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  bannerTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#D97706',
  },
  bannerSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    color: '#B45309',
    lineHeight: 17,
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  refreshBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  refreshBtnSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },

  disabledSyncHint: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  disabledSyncText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },
});
