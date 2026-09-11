import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { ThemeToggle } from '@/components/onboarding/ThemeToggle';
import { useRouter } from 'expo-router';
import { useCloudBackup } from '@/hooks/useCloudBackup';

const TABLES = ['users_table', 'bank_accounts', 'ipo_listings', 'ipo_applications', 'ipo_master'];

async function shareFile(content: string, filename: string, mimeType: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  if (Platform.OS === 'android') {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return false;

    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      filename,
      mimeType,
    );
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert('Backup Saved', `Saved ${filename} to the folder you selected.`);
    return true;
  }

  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(path, { mimeType, dialogTitle: 'Export IPO Data' });
  } else {
    Alert.alert('Saved', `File saved to:\n${path}`);
  }
  return true;
}

export function SettingRow({ icon, iconBg, title, subtitle, onPress, danger, disabled }: {
  icon: string; iconBg?: string; title: string; subtitle?: string; onPress: () => void; danger?: boolean; disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.row, { borderBottomColor: colors.border, opacity: disabled ? 0.45 : 1 }]}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBg ?? (danger ? colors.destructiveBg : colors.surface) }]}>
        <Feather name={icon as any} size={17} color={danger ? colors.destructive : colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: danger ? colors.destructive : colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { showConfirm, showSuccess, showError } = useDialog();

  const { users, ipos, applications, exportJSON, exportCSV, importJSON, importCSV, clearAllData } = useDB();
  const router = useRouter();

  const {
    isAuthenticated,
    userEmail,
    isBackingUp,
    isRestoring,
    lastBackupTime,
    latestMetadata,
    backupNow,
    restoreNow,
  } = useCloudBackup();

  const [busy, setBusy] = useState(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const hasData = users.length > 0 || ipos.length > 0 || applications.length > 0;

  const handleCloudBackupNow = async () => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    setBusy(true);
    try {
      const res = await backupNow();
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess(
          'Cloud Backup Successful',
          `Successfully saved snapshot to Supabase Cloud.\n\nUploaded Assets: ${res.imagesUploaded} image(s).`
        );
      } else {
        showError('Cloud Backup Failed', res.error || 'Failed to complete cloud backup.');
      }
    } catch (e: any) {
      showError('Cloud Backup Failed', e?.message || 'Unexpected cloud backup error.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloudRestoreNow = async () => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    const metaStr = latestMetadata
      ? `Snapshot Date: ${new Date(latestMetadata.created_at).toLocaleString()}\nRecords: ${latestMetadata.userCount || 0} users, ${latestMetadata.ipoCount || 0} IPOs, ${latestMetadata.applicationCount || 0} apps`
      : 'Restoring will merge remote snapshot data into your local database.';

    showConfirm({
      title: 'Restore Cloud Backup',
      message: `${metaStr}\n\nDo you want to proceed with restoring from Supabase Cloud?`,
      confirmText: 'Restore Now',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await restoreNow();
          if (res.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showSuccess(
              'Cloud Restore Complete',
              `Successfully restored from cloud snapshot:\n• ${res.userCount} user(s)\n• ${res.ipoCount} IPO(s)\n• ${res.applicationCount} application(s)\n• ${res.imagesRestored} image file(s)`
            );
          } else {
            showError('Cloud Restore Failed', res.error || 'Failed to restore snapshot from cloud.');
          }
        } catch (e: any) {
          showError('Cloud Restore Failed', e?.message || 'Unexpected cloud restore error.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleExport = () => {
    showConfirm({
      title: 'Export Backup',
      message: 'Choose a format to save all app data (users, IPOs, applications).',
      confirmText: 'JSON Backup',
      cancelText: 'CSV Files',
      onConfirm: async () => {
        setBusy(true);
        try {
          const jsonStr = await exportJSON();
          const dateStr = new Date().toISOString().slice(0, 10);
          const sizeKb = (new Blob([jsonStr]).size / 1024).toFixed(1);
          console.log(`[IPOVault] Generated JSON backup: ipovault_backup_${dateStr}.json (${sizeKb} KB)`);
          await shareFile(jsonStr, `ipovault_backup_${dateStr}.json`, 'application/json');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
          showError('Export Failed', e?.message ?? 'Could not generate backup file.');
        } finally {
          setBusy(false);
        }
      },
      onCancel: async () => {
        setBusy(true);
        try {
          const csvMap = await exportCSV();
          const dateStr = new Date().toISOString().slice(0, 10);
          for (const [tbl, csvStr] of Object.entries(csvMap)) {
            await shareFile(csvStr, `ipovault_${tbl}_${dateStr}.csv`, 'text/csv');
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
          showError('Export Failed', e?.message ?? 'Could not export CSV files.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setBusy(true);
      let text: string;
      if (Platform.OS === 'web') {
        const response = await fetch(result.assets[0].uri);
        text = await response.text();
      } else {
        text = await FileSystem.readAsStringAsync(result.assets[0].uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const isJSON = result.assets[0].name?.endsWith('.json') || text.trimStart().startsWith('{');
      const stats = isJSON ? await importJSON(text) : await importCSV(text);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccess(
        'Import Complete',
        `Successfully imported:\n• ${stats.users} user(s)\n• ${stats.ipos} IPO(s)\n• ${stats.applications} application(s)\n\nExisting records were kept.`,
      );
    } catch (e: any) {
      showError('Import Failed', e?.message ?? 'Could not read or parse the file. Make sure it was exported from this app.');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    showConfirm({
      title: 'Clear All Data',
      message: 'Permanently deletes all users, IPOs, and applications. Cannot be undone.',
      confirmText: 'Clear Everything',
      isDanger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await clearAllData();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const stats = [
    { label: 'Users', value: users.length, icon: 'users' },
    { label: 'IPOs', value: ipos.length, icon: 'trending-up' },
    { label: 'Applications', value: applications.length, icon: 'file-text' },
  ];

  const formattedLastBackup = lastBackupTime
    ? new Date(lastBackupTime).toLocaleString()
    : 'Never';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Custom Header with Top-Right Pill Theme Switcher (from Onboarding) ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>App</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
        </View>

        {/* Top-Right Pill Shape Theme Toggle */}
        <ThemeToggle />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingTop: 8 }}>
        {/* 1. Database Stats Overview */}
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.databaseHeaderRow}>
            <Text style={[styles.statsEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>DATABASE OVERVIEW</Text>
            <Text style={[styles.syncTimeBadge, { color: colors.primary }]}>
              Local Storage
            </Text>
          </View>

          <View style={styles.statsRow}>
            {stats.map((s) => (
              <View key={s.label} style={styles.statItem}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.surface }]}>
                  <Feather name={s.icon as any} size={18} color={colors.primary} />
                </View>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 2. Cloud Backup & Sync Section */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>SUPABASE CLOUD BACKUP</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
          <SettingRow
            icon={isAuthenticated ? 'user-check' : 'log-in'}
            title={isAuthenticated ? 'Account Session' : 'Sign In to Supabase'}
            subtitle={isAuthenticated ? `Signed in as ${userEmail}` : 'Connect your account to backup to cloud'}
            onPress={() => router.push('/auth')}
          />
          <SettingRow
            icon="cloud-upload"
            title="Backup to Cloud Now"
            subtitle={isBackingUp ? 'Uploading snapshot...' : `Last backup: ${formattedLastBackup}`}
            onPress={handleCloudBackupNow}
            disabled={busy || isBackingUp || isRestoring}
          />
          <SettingRow
            icon="cloud-download"
            title="Restore from Cloud"
            subtitle={isRestoring ? 'Downloading snapshot...' : 'Restore latest snapshot from Supabase Cloud'}
            onPress={handleCloudRestoreNow}
            disabled={busy || isBackingUp || isRestoring}
          />
        </View>

        {/* 3. Local Data Management Section */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>LOCAL BACKUP & EXPORT</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
          <SettingRow
            icon="download"
            title="Export JSON Backup"
            subtitle="Save all app data as a local JSON file"
            onPress={handleExport}
            disabled={busy || !hasData}
          />
          <SettingRow
            icon="upload"
            title="Import Local File"
            subtitle="Restore from a JSON or CSV backup file"
            onPress={handleImport}
            disabled={busy}
          />
          <SettingRow
            icon="trash-2"
            title="Clear All Data"
            subtitle="Permanently delete everything"
            onPress={handleClear}
            danger
            disabled={busy}
          />
        </View>

        {/* Footer */}
        <View style={[styles.footerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.footerBrand, { color: colors.primary }]}>IPOVault</Text>
          <Text style={[styles.footerTitle, { color: colors.foreground }]}>IPO Investment Tracker</Text>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            Local-first architecture with automatic Cloud Backup.{'\n'}Full offline support maintained.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerEyebrow: { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 30, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.8, lineHeight: 34 },
  statsCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  databaseHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  syncTimeBadge: { fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium' },
  statsEyebrow: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 8 },
  statIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 30, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.8 },
  statLabel: { fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium' },
  sectionHeader: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1, paddingHorizontal: 20, paddingBottom: 10, textTransform: 'uppercase' },
  section: { marginHorizontal: 16, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 14 },
  rowIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_500Medium' },
  rowSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2, lineHeight: 17 },
  footerCard: { marginHorizontal: 16, marginTop: 0, marginBottom: 16, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 10 },
  footerBrand: { fontSize: 22, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.5, marginBottom: 2 },
  footerTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  footerSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 19 },
});
