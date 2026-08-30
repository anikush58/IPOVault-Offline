import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import { syncStore } from '@/services/sync/syncStatus';
import { uploadService, refreshService, networkService } from '@/services/infrastructure';
import { ipoDiagnosticsStore } from '@/services/ipo/ipoUpdater';
import { SettingRow } from './(tabs)/settings';

const TABLES = ['users_table', 'bank_accounts', 'ipo_listings', 'ipo_applications', 'ipo_master'];

export default function SyncDebugScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const db = useSQLiteContext();
  const { session, user } = useAuth();
  const { users, applications, bankAccounts } = useDB();

  const [syncStatus, setSyncStatus] = useState(syncStore.getStatus());
  const [ipoStats, setIpoStats] = useState(ipoDiagnosticsStore.get());
  const [pendingRows, setPendingRows] = useState(0);
  const [failedRows, setFailedRows] = useState(0);
  const [isOnline, setIsOnline] = useState(networkService.isOnline());

  useEffect(() => {
    const unsub1 = syncStore.subscribe(setSyncStatus);
    const unsub2 = ipoDiagnosticsStore.subscribe(setIpoStats);
    const unsub3 = networkService.onReconnect(() => setIsOnline(true));
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  useEffect(() => {
    (async () => {
      let pendingTotal = 0;
      let failedTotal = 0;
      for (const table of TABLES) {
        try {
          const pendingRes = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${table} WHERE sync_status = 'PENDING'`
          );
          const failedRes = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${table} WHERE sync_status = 'FAILED'`
          );
          pendingTotal += pendingRes?.count || 0;
          failedTotal += failedRes?.count || 0;
        } catch (_) {}
      }
      setPendingRows(pendingTotal);
      setFailedRows(failedTotal);
    })();
  }, [db, users, applications, bankAccounts, syncStatus]);

  const brokersCount = new Set(users.map((u) => u.broker).filter(Boolean)).size;

  const handleRunSync = async () => {
    syncStore.update({ state: 'Syncing', lastTriggerSource: 'Developer Debug' });
    try {
      for (const table of TABLES) {
        await uploadService.uploadAllPending(db, table);
        await refreshService.refreshTable(db, table);
      }
      syncStore.update({
        state: 'Idle',
        lastSyncTimestamp: new Date().toISOString(),
        error: null,
      });
    } catch (err: any) {
      syncStore.update({
        state: 'Error',
        error: err?.message || 'Sync failed',
      });
    }
  };

  if (!__DEV__) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Stack.Screen options={{ title: 'Sync Debug' }} />
        <Text style={{ color: colors.foreground, margin: 20 }}>This screen is only available in development mode.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Developer Sync Debug' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, padding: 16 }}>
        <Text style={[styles.sectionHeader, { color: colors.primary }]}>AUTHENTICATION & NETWORK</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <SettingRow icon="user" title="Provider" subtitle={user?.app_metadata?.provider ? String(user.app_metadata.provider).toUpperCase() : 'None'} onPress={() => {}} disabled />
          <SettingRow icon="key" title="User ID" subtitle={user?.id ?? 'Not authenticated'} onPress={() => {}} disabled />
          <SettingRow icon="mail" title="Email" subtitle={user?.email ?? 'Unknown'} onPress={() => {}} disabled />
          <SettingRow icon="wifi" title="Network Status" subtitle={isOnline ? 'Online' : 'Offline'} onPress={() => {}} disabled />
          <SettingRow icon="clock" title="Token Expiry" subtitle={session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'No session'} onPress={() => {}} disabled />
        </View>

        <Text style={[styles.sectionHeader, { color: colors.destructive }]}>INFRASTRUCTURE SYNC</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.destructiveBg, borderWidth: 1.5 }]}>
          <SettingRow icon="play" title="Run Infrastructure Sync" subtitle={`State: ${syncStatus.state}`} onPress={handleRunSync} disabled={syncStatus.state === 'Syncing'} />
          <SettingRow icon="refresh-cw" title="Trigger Source" subtitle={syncStatus.lastTriggerSource || 'Manual'} onPress={() => {}} disabled />
          <SettingRow icon="clock" title="Last Auto Sync" subtitle={syncStatus.lastAutoSyncTimestamp ? new Date(syncStatus.lastAutoSyncTimestamp).toLocaleString() : 'Never'} onPress={() => {}} disabled />
          <SettingRow icon="calendar" title="Next Auto Sync" subtitle={syncStatus.nextScheduledSyncTimestamp ? new Date(syncStatus.nextScheduledSyncTimestamp).toLocaleString() : 'Disabled'} onPress={() => {}} disabled />
          <SettingRow icon="list" title="Pending Mutations" subtitle={`${pendingRows} rows pending`} onPress={() => {}} disabled />
          <SettingRow icon="alert-triangle" title="Failed Mutations" subtitle={`${failedRows} rows failed`} onPress={() => {}} disabled />
          <SettingRow icon="clock" title="Last Successful Sync" subtitle={syncStatus.lastSyncTimestamp ? new Date(syncStatus.lastSyncTimestamp).toLocaleString() : 'Never'} onPress={() => {}} disabled />
          <SettingRow icon="hard-drive" title="SQLite Cache Records" subtitle={`Users: ${users.length} | Apps: ${applications.length} | Banks: ${bankAccounts.length} | Brokers: ${brokersCount}`} onPress={() => {}} disabled />
        </View>

        <Text style={[styles.sectionHeader, { color: '#0ea5e9' }]}>IPO MASTER ENGINE</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: '#0ea5e9', borderWidth: 1.5 }]}>
          <SettingRow icon="clock" title="Last IPO Sync" subtitle={ipoStats.lastSuccessfulSync ? new Date(ipoStats.lastSuccessfulSync).toLocaleString() : 'Never'} onPress={() => {}} disabled />
          <SettingRow icon="plus-circle" title="Rows Upserted" subtitle={`${ipoStats.totalRowsUpserted} rows total`} onPress={() => {}} disabled />
          <SettingRow icon="activity" title="Sync Duration" subtitle={`${ipoStats.syncDurationMs} ms`} onPress={() => {}} disabled />
          <SettingRow icon="download" title="Downloaded / Updated" subtitle={`${ipoStats.recordsDownloaded} / ${ipoStats.recordsUpdated}`} onPress={() => {}} disabled />
          <SettingRow icon="x-circle" title="Last Sync Error" subtitle={ipoStats.syncError || 'None'} onPress={() => {}} disabled />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 16,
    opacity: 0.8,
  },
});
