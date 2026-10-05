import React, { useState } from 'react';
import {
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
import { IconButton } from '@/components/ui/IconButton';

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
  const { showConfirm, showSuccess, showError, showInfo } = useDialog();
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
  const [showLocalBackupModal, setShowLocalBackupModal] = useState(false);
  const [showCloudBackupModal, setShowCloudBackupModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);

  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const handleExport = () => {
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
    if (!isCloudAuth) {
      router.push('/auth');
      return;
    }

    const metaStr = latestMetadata
      ? `Last Synced: ${new Date(latestMetadata.last_synced_at).toLocaleString()}\nCloud Records: ${latestMetadata.userCount ?? 0} user(s), ${latestMetadata.ipoCount ?? 0} IPO(s), ${latestMetadata.applicationCount ?? 0} application(s)`
      : 'Restoring will download your data from Cloud Firestore into your local database.';

    showConfirm({
      title: 'Restore from Cloud Firestore',
      message: `${metaStr}\n\nDo you want to restore your cloud data into this device?`,
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 56, backgroundColor: colors.background }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>SETTINGS</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Data & Backup</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 40 }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Manage your IPOVault data and keep it safe
        </Text>

        {/* ── SECTION 1: LOCAL DATA ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LOCAL DATA</Text>
        <View style={[styles.localDataCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.localDataHeader}>
            <View style={[styles.localIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
              <Feather name="hard-drive" size={18} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.localTitle, { color: colors.foreground }]}>Stored on this Device</Text>
              <Text style={[styles.localSub, { color: colors.mutedForeground }]}>
                Your data is stored locally on this device using SQLite.
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
              <Text style={[styles.statChipLabel, { color: colors.mutedForeground }]}>Applications</Text>
            </View>
          </View>
        </View>

        {/* ── SECTION 2: BACKUP & RESTORE ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>BACKUP & RESTORE</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Local Backup */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setShowLocalBackupModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
              <Feather name="download" size={17} color="#3B82F6" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Local Backup</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Create and manage backups on this device</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Cloud Backup */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomWidth: 0 }]}
            activeOpacity={0.7}
            onPress={() => setShowCloudBackupModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
              <Feather name="cloud" size={17} color="#3B82F6" />
            </View>
            <View style={styles.menuTextWrap}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.menuTitle, { color: colors.foreground }]}>Cloud Backup</Text>
                <View style={[styles.cloudBadge, { backgroundColor: isCloudAuth ? (isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5') : (isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7') }]}>
                  <Text style={[styles.cloudBadgeText, { color: isCloudAuth ? '#10B981' : '#F59E0B' }]}>
                    {isCloudAuth ? 'Active' : 'Setup'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>
                Sync your data securely with Google Firebase
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* ── SECTION 3: DATA MANAGEMENT ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>DATA MANAGEMENT</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomWidth: 0 }]}
            activeOpacity={0.7}
            onPress={() => setShowClearDataModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
              <Feather name="trash-2" size={17} color="#EF4444" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: '#EF4444' }]}>Clear All Data</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Permanently delete all local data</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* ── SECTION 4: YOUR PRIVACY ── */}
        <View style={[styles.privacyCard, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : '#F0F7FF', borderColor: isDark ? 'rgba(59, 130, 246, 0.25)' : '#DBEAFE', marginTop: 18 }]}>
          <Feather name="shield" size={18} color="#3B82F6" style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.privacyTitle, { color: colors.foreground }]}>Your Privacy</Text>
            <Text style={[styles.privacySub, { color: colors.mutedForeground }]}>
              All your data is stored locally on this device. Cloud backup (Firebase) is optional, encrypted, and enables multi-device recovery.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Local Backup Sheet Modal */}
      <Modal visible={showLocalBackupModal} transparent animationType="fade" onRequestClose={() => setShowLocalBackupModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLocalBackupModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Local Backup</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Save a copy of your data on this device
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowLocalBackupModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={[styles.infoBanner, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF', borderColor: isDark ? 'rgba(59, 130, 246, 0.25)' : '#DBEAFE' }]}>
              <Feather name="info" size={16} color="#3B82F6" />
              <Text style={[styles.infoBannerText, { color: colors.foreground }]}>
                A backup includes all your IPOVault data such as users, IPOs, applications, broker accounts and settings.
              </Text>
            </View>

            <View style={{ gap: 10, marginVertical: 14 }}>
              <TouchableOpacity
                style={[styles.primaryModalBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
                onPress={() => {
                  setShowLocalBackupModal(false);
                  handleExport();
                }}
              >
                <Feather name="download" size={16} color={colors.primaryForeground} />
                <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Create New Backup</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryModalBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => {
                  setShowLocalBackupModal(false);
                  handleImport();
                }}
              >
                <Feather name="upload" size={16} color={colors.foreground} />
                <Text style={[styles.secondaryModalBtnText, { color: colors.foreground }]}>Import Backup File</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cloud Backup Sheet Modal */}
      <Modal visible={showCloudBackupModal} transparent animationType="fade" onRequestClose={() => setShowCloudBackupModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCloudBackupModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Cloud Backup</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Sync your data securely with Google Firebase
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCloudBackupModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.cloudBenefitsList}>
              <View style={styles.benefitRow}>
                <Feather name="check-circle" size={16} color="#10B981" />
                <Text style={[styles.benefitText, { color: colors.foreground }]}>Automatic sync across devices</Text>
              </View>
              <View style={styles.benefitRow}>
                <Feather name="check-circle" size={16} color="#10B981" />
                <Text style={[styles.benefitText, { color: colors.foreground }]}>Keep your data safe and secure</Text>
              </View>
              <View style={styles.benefitRow}>
                <Feather name="check-circle" size={16} color="#10B981" />
                <Text style={[styles.benefitText, { color: colors.foreground }]}>Easy restore when you get a new device</Text>
              </View>
            </View>

            {lastSyncTime && (
              <View style={[styles.lastSyncBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: colors.border }]}>
                <Text style={[styles.lastSyncLabel, { color: colors.mutedForeground }]}>
                  Last Synced: {new Date(lastSyncTime).toLocaleString()}
                </Text>
              </View>
            )}

            <View style={{ gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.primaryModalBtn, { backgroundColor: '#3B82F6' }]}
                activeOpacity={0.8}
                onPress={() => {
                  setShowCloudBackupModal(false);
                  handleCloudSyncNow();
                }}
                disabled={isSyncing || busy}
              >
                <Feather name="cloud" size={16} color="#FFFFFF" />
                <Text style={[styles.primaryModalBtnText, { color: '#FFFFFF' }]}>
                  {isSyncing ? 'Syncing...' : 'Sync to Cloud Now'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryModalBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => {
                  setShowCloudBackupModal(false);
                  handleCloudRestoreNow();
                }}
                disabled={isRestoring || busy}
              >
                <Feather name="refresh-cw" size={16} color={colors.foreground} />
                <Text style={[styles.secondaryModalBtnText, { color: colors.foreground }]}>
                  {isRestoring ? 'Restoring...' : 'Restore from Cloud'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
                style={[styles.secondaryModalBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => setShowClearDataModal(false)}
              >
                <Text style={[styles.secondaryModalBtnText, { color: colors.foreground }]}>Cancel</Text>
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
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  localDataCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  localDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  localIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  localSub: {
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

  menuCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextWrap: { flex: 1 },
  menuTitle: { fontSize: 14.5, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  menuSub: { fontSize: 11.5, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },
  cloudBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cloudBadgeText: { fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold' },

  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  privacyTitle: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },
  privacySub: { fontSize: 11.5, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  modalSubTitle: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoBannerText: { flex: 1, fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 16 },
  primaryModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
  },
  primaryModalBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  secondaryModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryModalBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },

  cloudBenefitsList: { gap: 10, marginVertical: 8 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { fontSize: 12.5, fontFamily: 'GoogleSansFlex_500Medium' },
  lastSyncBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    alignItems: 'center',
  },
  lastSyncLabel: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular' },

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
});
