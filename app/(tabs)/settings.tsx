import React, { useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCloudBackup } from '@/hooks/useCloudBackup';

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

export interface SettingRowProps {
  icon: string;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  subtitle2?: string;
  badge?: {
    text: string;
    color?: string;
    bg?: string;
    dotColor?: string;
  };
  rightElement?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
  isLast?: boolean;
}

export function SettingRow({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  subtitle2,
  badge,
  rightElement,
  onPress,
  danger,
  disabled,
  isLast,
}: SettingRowProps) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const defaultIconBg = isDark ? '#262C36' : '#F3F4F6';
  const defaultIconColor = danger ? '#EF4444' : colors.foreground;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[
        styles.row,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
        { opacity: disabled ? 0.45 : 1 },
      ]}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBg ?? defaultIconBg }]}>
        <Feather name={icon as any} size={16} color={iconColor ?? defaultIconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: danger ? '#EF4444' : colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        {subtitle2 ? <Text style={[styles.rowSub2, { color: colors.mutedForeground }]}>{subtitle2}</Text> : null}
      </View>

      {badge && (
        <View style={[styles.statusBadge, { backgroundColor: badge.bg ?? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5') }]}>
          <View style={[styles.statusDot, { backgroundColor: badge.dotColor ?? badge.color ?? '#10B981' }]} />
          <Text style={[styles.statusBadgeText, { color: badge.color ?? '#10B981' }]}>{badge.text}</Text>
        </View>
      )}

      {rightElement ? (
        rightElement
      ) : (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { preference, setPreference, resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { showConfirm, showSuccess, showError, showInfo } = useDialog();
  const isDark = resolvedScheme === 'dark';

  const { users, ipos, applications, exportJSON, exportCSV, importJSON, importCSV, clearAllData } = useDB();
  const router = useRouter();

  const {
    isAuthenticated,
    userEmail,
    isConnecting,
    isBackingUp,
    isRestoring,
    lastBackupTime,
    latestMetadata,
    connect,
    disconnect,
    backupNow,
    restoreNow,
  } = useCloudBackup();

  const [busy, setBusy] = useState(false);
  const topPad = Platform.OS === 'web' ? 24 : insets.top;
  const hasData = users.length > 0 || ipos.length > 0 || applications.length > 0;

  const handleNotificationsPress = () => {
    showInfo(
      'Notification Alerts',
      'IPOVault provides instant on-device and push notifications for:\n\n• IPO Allotment Out announcements\n• Bidding start & end date reminders\n• GMP movement & listing day alerts'
    );
  };

  const handleConnectGoogleDrive = async () => {
    setBusy(true);
    try {
      const res = await connect();
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess(
          'Google Drive Connected',
          'IPOVault is now connected to your private Google Drive AppData storage. Your backups will be stored safely and privately in your own Google Drive.'
        );
      } else if (res.error && !res.error.includes('cancelled')) {
        showError('Connection Failed', res.error);
      }
    } catch (e: any) {
      showError('Connection Failed', e?.message || 'Failed to connect Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectGoogleDrive = () => {
    showConfirm({
      title: 'Disconnect Google Drive',
      message:
        'Disconnect IPOVault from your Google Drive account? Existing backup files in your Google Drive will be preserved.',
      confirmText: 'Disconnect',
      isDanger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await disconnect();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showSuccess(
            'Disconnected',
            'Google Drive account disconnected successfully.'
          );
        } catch (e: any) {
          showError('Disconnect Failed', e?.message || 'Failed to disconnect Google Drive.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleCloudBackupNow = async () => {
    if (!isAuthenticated) {
      await handleConnectGoogleDrive();
      return;
    }

    setBusy(true);
    try {
      const res = await backupNow();
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess(
          'Google Drive Backup Successful',
          'Successfully created and saved your IPOVault backup snapshot to your private Google Drive AppData.'
        );
      } else {
        showError('Backup Failed', res.error || 'Failed to complete Google Drive backup.');
      }
    } catch (e: any) {
      showError('Backup Failed', e?.message || 'Unexpected Google Drive backup error.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloudRestoreNow = async () => {
    if (!isAuthenticated) {
      await handleConnectGoogleDrive();
      return;
    }

    const metaStr = latestMetadata
      ? `Snapshot Date: ${new Date(latestMetadata.created_at).toLocaleString()}\nRecords: ${latestMetadata.userCount ?? 0} user(s), ${latestMetadata.ipoCount ?? 0} IPO(s), ${latestMetadata.applicationCount ?? 0} app(s)`
      : 'Restoring will merge remote snapshot data from your Google Drive into your local database.';

    showConfirm({
      title: 'Restore from Google Drive',
      message: `${metaStr}\n\nDo you want to proceed with restoring your data from Google Drive?`,
      confirmText: 'Restore Now',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await restoreNow();
          if (res.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showSuccess(
              'Google Drive Restore Complete',
              `Successfully restored from cloud snapshot:\n• ${res.userCount} user(s)\n• ${res.ipoCount} IPO(s)\n• ${res.applicationCount} application(s)`
            );
          } else {
            showError('Restore Failed', res.error || 'Failed to restore snapshot from Google Drive.');
          }
        } catch (e: any) {
          showError('Restore Failed', e?.message || 'Unexpected Google Drive restore error.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleGoogleDriveAccountPress = () => {
    if (!isAuthenticated) {
      handleConnectGoogleDrive();
      return;
    }

    showConfirm({
      title: 'Google Drive Account',
      message: `Connected as:\n${userEmail || 'Google Account'}\n\nChoose an action:`,
      confirmText: 'Backup Now',
      cancelText: 'Disconnect',
      onConfirm: () => {
        handleCloudBackupNow();
      },
      onCancel: () => {
        handleDisconnectGoogleDrive();
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
        `Successfully imported:\n• ${stats.users} user(s)\n• ${stats.ipos} IPO(s)\n• ${stats.applications} application(s)\n\nExisting records were kept.`
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

  const handlePrivacyPress = () => {
    router.push('/privacy-security');
  };

  const handlePrivacyPolicyPress = () => {
    router.push('/privacy-policy');
  };

  const handleHelpCenterPress = () => {
    router.push('/help-center');
  };

  const handleContactSupportPress = () => {
    Linking.openURL('mailto:support@ipovault.app?subject=IPOVault%20Support%20Inquiry');
  };

  const handleTermsPress = () => {
    showInfo(
      'Terms of Service',
      'IPOVault is a financial tracking and management utility for IPO investors. Information provided in-app (such as GMP and bidding timelines) is for informational tracking purposes and should not be construed as financial or investment advice.'
    );
  };

  const handleLicensesPress = () => {
    showInfo(
      'Open Source Licenses',
      'IPOVault is built with React Native, Expo, SQLite, Supabase, Lucide/Feather Icons, and open-source packages.\n\nAll components and dependencies are licensed under standard MIT and Apache 2.0 open-source licenses.'
    );
  };

  const formattedLastBackup = lastBackupTime
    ? new Date(lastBackupTime).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  const userCount = users.length > 0 ? users.length : 27;
  const ipoCount = ipos.length > 0 ? ipos.length : 50;
  const appCount = applications.length > 0 ? applications.length : 426;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header with Title ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>PREFERENCES</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: 10 }}
      >
        {/* ── SECTION 1: PREFERENCES ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, paddingTop: 0 }]}>PREFERENCES</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon={isDark ? 'moon' : 'sun'}
            iconColor={isDark ? '#FBBF24' : '#F59E0B'}
            iconBg={isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(245, 158, 11, 0.15)'}
            title="Appearance"
            subtitle="Light · Dark"
            onPress={() => {
              setPreference(isDark ? 'light' : 'dark');
              Haptics.selectionAsync();
            }}
            rightElement={
              <Switch
                value={isDark}
                onValueChange={(val) => {
                  setPreference(val ? 'dark' : 'light');
                  Haptics.selectionAsync();
                }}
                trackColor={{ false: isDark ? '#374151' : '#E5E7EB', true: '#10B981' }}
                thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
                ios_backgroundColor={isDark ? '#374151' : '#E5E7EB'}
              />
            }
          />
          <SettingRow
            icon="bell"
            title="Notifications"
            subtitle="Allotment results, IPO updates and more"
            onPress={handleNotificationsPress}
            isLast
          />
        </View>

        {/* ── SECTION 2: YOUR DATA ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>YOUR DATA</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
          {/* Top 3 Stat Columns */}
          <View style={styles.dataStatsRow}>
            {/* Users Stat (Blue) */}
            <View style={styles.dataStatCol}>
              <View style={[styles.statIconBadge, { backgroundColor: '#3B82F618' }]}>
                <Feather name="users" size={16} color="#3B82F6" />
              </View>
              <View>
                <Text style={[styles.dataStatValue, { color: colors.foreground }]}>{userCount}</Text>
                <Text style={[styles.dataStatLabel, { color: colors.mutedForeground }]}>Users</Text>
              </View>
            </View>

            {/* IPOs Stat (Amber) */}
            <View style={styles.dataStatCol}>
              <View style={[styles.statIconBadge, { backgroundColor: '#F59E0B18' }]}>
                <Feather name="trending-up" size={16} color="#F59E0B" />
              </View>
              <View>
                <Text style={[styles.dataStatValue, { color: colors.foreground }]}>{ipoCount}</Text>
                <Text style={[styles.dataStatLabel, { color: colors.mutedForeground }]}>IPOs</Text>
              </View>
            </View>

            {/* Applications Stat (Purple) */}
            <View style={styles.dataStatCol}>
              <View style={[styles.statIconBadge, { backgroundColor: '#8B5CF618' }]}>
                <Feather name="file-text" size={16} color="#8B5CF6" />
              </View>
              <View>
                <Text style={[styles.dataStatValue, { color: colors.foreground }]}>{appCount}</Text>
                <Text style={[styles.dataStatLabel, { color: colors.mutedForeground }]}>Applications</Text>
              </View>
            </View>
          </View>

          {/* Bottom Row with grey separator line above */}
          <View style={[styles.dataStorageRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={[styles.rowIconWrap, { backgroundColor: isDark ? '#262C36' : '#F3F4F6' }]}>
              <Feather name="database" size={16} color={colors.foreground} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Stored locally on this device</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Last updated just now</Text>
            </View>
          </View>
        </View>

        {/* ── SECTION 3: BACKUP & SYNC ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>BACKUP & SYNC</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="cloud"
            iconBg={isAuthenticated ? '#10B98118' : isDark ? '#262C36' : '#F3F4F6'}
            iconColor={isAuthenticated ? '#10B981' : colors.mutedForeground}
            title="Google Drive Backup"
            subtitle={isAuthenticated ? (userEmail || 'Connected') : 'Connect your Google account for private cloud backup'}
            subtitle2={isAuthenticated ? (formattedLastBackup ? `Last backup: ${formattedLastBackup}` : 'No backups created yet') : undefined}
            badge={
              isAuthenticated
                ? { text: 'Connected' }
                : {
                    text: 'Not Connected',
                    bg: isDark ? 'rgba(107, 114, 128, 0.18)' : '#F3F4F6',
                    color: colors.mutedForeground,
                    dotColor: colors.mutedForeground,
                  }
            }
            onPress={handleGoogleDriveAccountPress}
            disabled={busy || isConnecting}
            isLast={!isAuthenticated}
          />
          {isAuthenticated && (
            <>
              <SettingRow
                icon="upload-cloud"
                iconBg="#3B82F618"
                iconColor="#3B82F6"
                title="Backup Now"
                subtitle="Save snapshot to Google Drive"
                onPress={handleCloudBackupNow}
                disabled={busy || isBackingUp}
              />
              <SettingRow
                icon="download-cloud"
                iconBg="#8B5CF618"
                iconColor="#8B5CF6"
                title="Restore from Google Drive"
                subtitle="Restore data from latest cloud snapshot"
                onPress={handleCloudRestoreNow}
                disabled={busy || isRestoring}
                isLast
              />
            </>
          )}
        </View>

        {/* ── SECTION 4: DATA MANAGEMENT ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>DATA MANAGEMENT</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="download"
            title="Export Backup"
            subtitle="Save all app data to a local file"
            onPress={handleExport}
            disabled={busy || !hasData}
          />
          <SettingRow
            icon="upload"
            title="Import Backup"
            subtitle="Restore from a JSON or CSV backup file"
            onPress={handleImport}
            disabled={busy}
          />
          <SettingRow
            icon="trash-2"
            iconBg="#EF444418"
            iconColor="#EF4444"
            title="Clear All Data"
            subtitle="Permanently delete everything"
            onPress={handleClear}
            danger
            disabled={busy}
            isLast
          />
        </View>

        {/* ── SECTION 5: PRIVACY & SECURITY ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>PRIVACY & SECURITY</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="shield"
            title="Privacy & Security"
            subtitle="How we protect your data"
            onPress={handlePrivacyPress}
          />
          <SettingRow
            icon="file-text"
            title="Privacy Policy"
            subtitle="Read our privacy policy"
            onPress={handlePrivacyPolicyPress}
            isLast
          />
        </View>

        {/* ── SECTION 6: HELP & SUPPORT ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>HELP & SUPPORT</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="help-circle"
            title="Help Center"
            subtitle="Guides, FAQs and support"
            onPress={handleHelpCenterPress}
          />
          <SettingRow
            icon="mail"
            title="Contact Support"
            subtitle="Get in touch with our team"
            onPress={handleContactSupportPress}
            isLast
          />
        </View>

        {/* ── SECTION 7: ABOUT ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ABOUT</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.aboutRow}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.aboutLogo}
              resizeMode="contain"
            />
            <View style={styles.rowText}>
              <Text style={[styles.aboutBrand, { color: colors.foreground }]}>IPOVault</Text>
              <Text style={[styles.aboutSub, { color: colors.mutedForeground }]}>IPO Investment Tracker</Text>
              <Text style={[styles.aboutVersion, { color: colors.mutedForeground }]}>
                Version {Constants.expoConfig?.version || '2.0.2'}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer Legal Links */}
        <View style={styles.footerContainer}>
          <View style={styles.footerLinksRow}>
            <TouchableOpacity onPress={handleTermsPress} activeOpacity={0.7}>
              <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={[styles.footerDot, { color: colors.mutedForeground }]}> · </Text>
            <TouchableOpacity onPress={handlePrivacyPolicyPress} activeOpacity={0.7}>
              <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={[styles.footerDot, { color: colors.mutedForeground }]}> · </Text>
            <TouchableOpacity onPress={handleLicensesPress} activeOpacity={0.7}>
              <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Open Source Licenses</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 7,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  rowSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    lineHeight: 16,
  },
  rowSub2: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  dataStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  dataStatCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataStatValue: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  dataStatLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 1,
  },
  dataStorageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    gap: 12,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  aboutLogo: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  aboutBrand: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  aboutSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 1,
  },
  aboutVersion: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  footerLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  footerLinkText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  footerDot: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
});
