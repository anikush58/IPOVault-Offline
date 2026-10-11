import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { useFirestoreSync } from '@/hooks/useFirestoreSync';
import { useAuth } from '@/context/AuthContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';

async function shareFile(
  content: string,
  filename: string,
  mimeType: string,
  onSuccess?: (title: string, message: string) => void
): Promise<boolean> {
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
    if (onSuccess) {
      onSuccess('Backup Downloaded', `Downloaded ${filename} successfully.`);
    }
    return true;
  }

  if (Platform.OS === 'android') {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return false;

    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      filename,
      mimeType
    );
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    if (onSuccess) {
      onSuccess('Backup Saved', `Saved ${filename} to the folder you selected.`);
    }
    return true;
  }

  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(path, { mimeType, dialogTitle: 'Export IPO Data' });
  } else {
    if (onSuccess) {
      onSuccess('Saved', `File saved to:\n${path}`);
    }
  }
  return true;
}

export default function SettingsDataBackupScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const { users, ipos, applications, exportJSON, exportCSV, importJSON, importCSV, clearAllData } = useDB();
  const { showConfirm, showSuccess, showError } = useDialog();
  const { user: authUser } = useAuth();

  const {
    isAuthenticated: isCloudAuth,
    isSyncing,
    isRestoring,
    lastSyncTime,
    latestMetadata,
    syncNow,
    restoreNow,
  } = useFirestoreSync();

  const [busy, setBusy] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);

  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const handleExport = () => {
    try {
      Haptics.selectionAsync();
    } catch {}

    showConfirm({
      title: 'Export Local Backup',
      message: 'Choose a format to save all app data (users, IPOs, applications, broker accounts).',
      confirmText: 'JSON Backup',
      cancelText: 'CSV Files',
      onConfirm: async () => {
        setBusy(true);
        try {
          const jsonStr = await exportJSON();
          const dateStr = new Date().toISOString().slice(0, 10);
          await shareFile(jsonStr, `ipovault_backup_${dateStr}.json`, 'application/json', (title, msg) => {
            showSuccess(title, msg);
          });
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
            await shareFile(csvStr, `ipovault_${tbl}_${dateStr}.csv`, 'text/csv', (title, msg) => {
              showSuccess(title, msg);
            });
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
      Haptics.selectionAsync();
    } catch {}

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
        `Successfully imported:\n• ${stats.users} user(s)\n• ${stats.ipos} IPO(s)\n• ${stats.applications} application(s)\n\nData has been saved locally.`
      );
    } catch (e: any) {
      showError('Import Failed', e?.message ?? 'Could not read or parse the file. Make sure it was exported from this app.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloudSyncNow = async () => {
    try {
      Haptics.selectionAsync();
    } catch {}

    if (!isCloudAuth) {
      router.push('/auth');
      return;
    }

    setBusy(true);
    try {
      const res = await syncNow();
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess(
          'Cloud Sync Complete',
          'Successfully backed up all IPOVault data to Cloud Firestore.'
        );
      } else {
        showError('Sync Failed', res.error || 'Failed to sync with Cloud Firestore.');
      }
    } catch (e: any) {
      showError('Sync Failed', e?.message || 'Unexpected cloud sync error.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloudRestoreNow = async () => {
    try {
      Haptics.selectionAsync();
    } catch {}

    if (!isCloudAuth) {
      router.push('/auth');
      return;
    }

    const metaStr = latestMetadata
      ? `Last Synced: ${new Date(latestMetadata.last_synced_at).toLocaleString()}\nCloud Records: ${latestMetadata.userCount ?? 0} user(s), ${latestMetadata.ipoCount ?? 0} IPO(s), ${latestMetadata.applicationCount ?? 0} application(s)`
      : 'Restoring will download your data from Cloud Firestore into your local database.';

    showConfirm({
      title: 'Restore from Cloud Firestore',
      message: `${metaStr}\n\nDo you want to restore your cloud data into this device? This will update your local database.`,
      confirmText: 'Restore Now',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await restoreNow();
          if (res.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showSuccess(
              'Restore Complete',
              `Successfully restored from Cloud Firestore:\n• ${res.userCount ?? 0} user(s)\n• ${res.ipoCount ?? 0} IPO(s)\n• ${res.applicationCount ?? 0} application(s)`
            );
          } else {
            showError('Restore Failed', res.error || 'Failed to restore data from Cloud Firestore.');
          }
        } catch (e: any) {
          showError('Restore Failed', e?.message || 'Unexpected cloud restore error.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleConfirmClearData = async () => {
    setShowClearDataModal(false);
    setBusy(true);
    try {
      await clearAllData();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showSuccess('Data Cleared', 'All local users, IPOs, applications, and broker data have been removed.');
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to clear local data.');
    } finally {
      setBusy(false);
    }
  };

  const formattedLastSync = lastSyncTime
    ? new Date(lastSyncTime).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        eyebrow="SETTINGS"
        title="Data & Backup"
        centerTitle
        showBack
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: topPad + 60 + 12,
          paddingBottom: insets.bottom + 48,
        }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Manage your offline IPOVault database and cloud backups
        </Text>

        {/* ── SECTION 1: LOCAL DATA OVERVIEW ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LOCAL STORAGE</Text>
        <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.overviewHeader}>
            <View style={[styles.overviewIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
              <Feather name="hard-drive" size={18} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.overviewTitle, { color: colors.foreground }]}>Stored on this Device</Text>
              <Text style={[styles.overviewSub, { color: colors.mutedForeground }]}>
                Encrypted offline SQLite database with instant access.
              </Text>
            </View>
          </View>

          {/* Stats Chips Row */}
          <View style={styles.statChipsRow}>
            <View style={[styles.statChip, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF', borderColor: isDark ? 'rgba(59, 130, 246, 0.25)' : '#DBEAFE' }]}>
              <Feather name="users" size={13} color="#3B82F6" />
              <Text style={[styles.statChipVal, { color: colors.foreground }]}>{users.length}</Text>
              <Text style={[styles.statChipLabel, { color: colors.mutedForeground }]}>Users</Text>
            </View>

            <View style={[styles.statChip, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FEF3C7', borderColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FDE68A' }]}>
              <Feather name="trending-up" size={13} color="#F59E0B" />
              <Text style={[styles.statChipVal, { color: colors.foreground }]}>{ipos.length}</Text>
              <Text style={[styles.statChipLabel, { color: colors.mutedForeground }]}>IPOs</Text>
            </View>

            <View style={[styles.statChip, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF', borderColor: isDark ? 'rgba(139, 92, 246, 0.25)' : '#DDD6FE' }]}>
              <Feather name="file-text" size={13} color="#8B5CF6" />
              <Text style={[styles.statChipVal, { color: colors.foreground }]}>{applications.length}</Text>
              <Text style={[styles.statChipLabel, { color: colors.mutedForeground }]}>Bids</Text>
            </View>
          </View>
        </View>

        {/* ── SECTION 2: BACKUP DATA (SLICK GROUPED CARD) ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>BACKUP DATA</Text>
        <View style={[styles.slickGroupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Row 1: Local Device Backup */}
          <View style={styles.slickActionRow}>
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.14)' : '#EFF6FF' }]}>
              <Feather name="download" size={17} color="#3B82F6" />
            </View>
            <View style={styles.actionTextWrap}>
              <View style={styles.actionTitleRow}>
                <Text style={[styles.actionTitle, { color: colors.foreground }]}>Local Device Backup</Text>
                <View style={[styles.metaBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.14)' : '#EFF6FF' }]}>
                  <Text style={[styles.metaBadgeText, { color: '#3B82F6' }]}>OFFLINE</Text>
                </View>
              </View>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                Export full database as JSON or CSV
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.pillPrimaryBtn,
                { backgroundColor: colors.primary },
                busy && { opacity: 0.65 },
              ]}
              activeOpacity={0.8}
              onPress={handleExport}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="download" size={12.5} color={colors.primaryForeground} />
                  <Text style={[styles.pillPrimaryText, { color: colors.primaryForeground }]}>Export</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

          {/* Row 2: Cloud Firestore Sync */}
          <View style={styles.slickActionRow}>
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.14)' : '#EEF2FF' }]}>
              <Feather name="cloud" size={17} color="#6366F1" />
            </View>
            <View style={styles.actionTextWrap}>
              <View style={styles.actionTitleRow}>
                <Text style={[styles.actionTitle, { color: colors.foreground }]}>Cloud Firestore</Text>
                <View
                  style={[
                    styles.metaBadge,
                    {
                      backgroundColor: isCloudAuth
                        ? isDark
                          ? 'rgba(16, 185, 129, 0.15)'
                          : '#ECFDF5'
                        : isDark
                        ? 'rgba(245, 158, 11, 0.15)'
                        : '#FEF3C7',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.metaBadgeDot,
                      { backgroundColor: isCloudAuth ? '#10B981' : '#F59E0B' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.metaBadgeText,
                      { color: isCloudAuth ? '#10B981' : '#F59E0B' },
                    ]}
                  >
                    {isCloudAuth ? 'CONNECTED' : 'SETUP'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {formattedLastSync
                  ? `Synced: ${formattedLastSync}`
                  : isCloudAuth
                  ? authUser?.email || 'Encrypted cloud backup'
                  : 'Sign in to enable sync'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.pillPrimaryBtn,
                { backgroundColor: colors.primary },
                (busy || isSyncing) && { opacity: 0.65 },
              ]}
              activeOpacity={0.8}
              onPress={handleCloudSyncNow}
              disabled={busy || isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="cloud" size={12.5} color={colors.primaryForeground} />
                  <Text style={[styles.pillPrimaryText, { color: colors.primaryForeground }]}>
                    {isCloudAuth ? 'Sync' : 'Connect'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SECTION 3: RESTORE DATA (SLICK GROUPED CARD) ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>RESTORE DATA</Text>
        <View style={[styles.slickGroupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Row 1: Import Local Backup */}
          <View style={styles.slickActionRow}>
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.14)' : '#F5F3FF' }]}>
              <Feather name="upload" size={17} color="#8B5CF6" />
            </View>
            <View style={styles.actionTextWrap}>
              <View style={styles.actionTitleRow}>
                <Text style={[styles.actionTitle, { color: colors.foreground }]}>Import Backup File</Text>
                <View style={[styles.metaBadge, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.14)' : '#F5F3FF' }]}>
                  <Text style={[styles.metaBadgeText, { color: '#8B5CF6' }]}>JSON / CSV</Text>
                </View>
              </View>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                Load & restore records from file
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.pillPrimaryBtn,
                { backgroundColor: colors.primary },
                busy && { opacity: 0.65 },
              ]}
              activeOpacity={0.8}
              onPress={handleImport}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="upload" size={12.5} color={colors.primaryForeground} />
                  <Text style={[styles.pillPrimaryText, { color: colors.primaryForeground }]}>Import</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

          {/* Row 2: Restore from Cloud */}
          <View style={styles.slickActionRow}>
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.14)' : '#E0F2FE' }]}>
              <Feather name="refresh-cw" size={17} color="#0EA5E9" />
            </View>
            <View style={styles.actionTextWrap}>
              <View style={styles.actionTitleRow}>
                <Text style={[styles.actionTitle, { color: colors.foreground }]}>Restore from Cloud</Text>
                {latestMetadata ? (
                  <View style={[styles.metaBadge, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.14)' : '#E0F2FE' }]}>
                    <Text style={[styles.metaBadgeText, { color: '#0EA5E9' }]}>
                      {latestMetadata.applicationCount ?? 0} BIDS
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {isCloudAuth ? 'Download latest Firestore snapshot' : 'Sign in to access cloud'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.pillSecondaryBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                  borderColor: colors.border,
                },
                (busy || isRestoring) && { opacity: 0.65 },
              ]}
              activeOpacity={0.8}
              onPress={handleCloudRestoreNow}
              disabled={busy || isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <>
                  <Feather name="refresh-cw" size={12.5} color={colors.foreground} />
                  <Text style={[styles.pillSecondaryText, { color: colors.foreground }]}>
                    {isCloudAuth ? 'Restore' : 'Sign In'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SECTION 4: DATA MANAGEMENT (SLICK DANGER CARD) ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>DATA MANAGEMENT</Text>
        <View style={[styles.slickGroupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.slickActionRow}>
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2' }]}>
              <Feather name="trash-2" size={17} color="#EF4444" />
            </View>
            <View style={styles.actionTextWrap}>
              <View style={styles.actionTitleRow}>
                <Text style={[styles.actionTitle, { color: '#EF4444' }]}>Clear All Data</Text>
                <View style={[styles.metaBadge, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2' }]}>
                  <Text style={[styles.metaBadgeText, { color: '#EF4444' }]}>PERMANENT</Text>
                </View>
              </View>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                Purge users, bids and local database
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.pillDangerBtn,
                {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA',
                },
              ]}
              activeOpacity={0.8}
              onPress={() => setShowClearDataModal(true)}
            >
              <Feather name="trash-2" size={12.5} color="#EF4444" />
              <Text style={styles.pillDangerText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SECTION 5: SLICK PRIVACY BANNER ── */}
        <View
          style={[
            styles.privacyCard,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.35)',
            },
          ]}
        >
          {/* Header Row */}
          <View style={styles.privacyHeaderRow}>
            <View
              style={[
                styles.privacyShieldWrap,
                { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5' },
              ]}
            >
              <Feather name="shield" size={17} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.privacyTitleRow}>
                <Text style={[styles.privacyTitle, { color: colors.foreground }]}>
                  Bank-Grade Privacy
                </Text>
                <View style={[styles.metaBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5' }]}>
                  <Text style={[styles.metaBadgeText, { color: '#10B981' }]}>OFFLINE FIRST</Text>
                </View>
              </View>
              <Text style={[styles.privacySub, { color: colors.mutedForeground }]}>
                Your financial footprint remains strictly under your control.
              </Text>
            </View>
          </View>

          <View style={[styles.privacyDivider, { backgroundColor: colors.border }]} />

          <View style={styles.privacyPillarsList}>
            <View style={styles.pillarItem}>
              <View style={[styles.pillarIconBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                <Feather name="lock" size={11} color="#10B981" />
              </View>
              <Text style={[styles.pillarText, { color: colors.mutedForeground }]}>
                <Text style={[styles.pillarBold, { color: colors.foreground }]}>Local SQLite: </Text>
                Applications, PANs, and accounts never leave your device.
              </Text>
            </View>

            <View style={styles.pillarItem}>
              <View style={[styles.pillarIconBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                <Feather name="cloud" size={11} color="#3B82F6" />
              </View>
              <Text style={[styles.pillarText, { color: colors.mutedForeground }]}>
                <Text style={[styles.pillarBold, { color: colors.foreground }]}>Zero Tracking: </Text>
                Cloud sync is opt-in, encrypted, and isolated to your account.
              </Text>
            </View>

            <View style={styles.pillarItem}>
              <View style={[styles.pillarIconBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                <Feather name="check-circle" size={11} color="#8B5CF6" />
              </View>
              <Text style={[styles.pillarText, { color: colors.mutedForeground }]}>
                <Text style={[styles.pillarBold, { color: colors.foreground }]}>Zero Lock-In: </Text>
                Export raw files or wipe your database whenever you wish.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Clear All Data Modal */}
      <Modal visible={showClearDataModal} transparent animationType="fade" onRequestClose={() => setShowClearDataModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowClearDataModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={[styles.deleteIconWrap, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
                <Feather name="trash-2" size={26} color="#EF4444" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Clear All Data</Text>
              <Text style={[styles.deleteModalDesc, { color: colors.mutedForeground }]}>
                This will permanently delete all your local data including users, IPOs, applications, broker accounts and settings.
              </Text>

              <View style={[styles.dangerWarningBox, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2', borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA' }]}>
                <Feather name="alert-triangle" size={15} color="#EF4444" />
                <Text style={[styles.dangerWarningText, { color: '#EF4444' }]}>
                  This action cannot be undone.
                </Text>
              </View>
            </View>

            <View style={{ gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.deleteActionBtn, { backgroundColor: '#EF4444' }]}
                activeOpacity={0.85}
                onPress={handleConfirmClearData}
                disabled={busy}
              >
                <Text style={styles.deleteActionBtnText}>Delete All Data</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => setShowClearDataModal(false)}
              >
                <Text style={[styles.modalCancelBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.9,
    marginBottom: 8,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
  },

  // ── Overview Card ──
  overviewCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  overviewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.2,
  },
  overviewSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  statChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  statChipVal: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },
  statChipLabel: { fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium' },

  // ── Slick Grouped Card & Rows ──
  slickGroupCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  slickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 13,
    gap: 12,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextWrap: {
    flex: 1,
    gap: 2,
  },
  actionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.1,
  },
  actionSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 15,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 65,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  metaBadgeDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
  },
  metaBadgeText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
  },

  // ── Slick Pill CTAs ──
  pillPrimaryBtn: {
    height: 34,
    width: 86,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5.5,
  },
  pillPrimaryText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.1,
  },
  pillSecondaryBtn: {
    height: 34,
    width: 86,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5.5,
  },
  pillSecondaryText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.1,
  },
  pillDangerBtn: {
    height: 34,
    width: 86,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5.5,
  },
  pillDangerText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#EF4444',
  },

  // ── Privacy Card (Slick) ──
  privacyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  privacyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  privacyShieldWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  privacyTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.2,
  },
  privacySub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  privacyDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  privacyPillarsList: {
    gap: 9,
  },
  pillarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  pillarIconBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarText: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 15,
  },
  pillarBold: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  // ── Clear Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '94%',
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  deleteIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalDesc: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  dangerWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  dangerWarningText: { fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold' },
  deleteActionBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionBtnText: { color: '#FFFFFF', fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  modalCancelBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
});
