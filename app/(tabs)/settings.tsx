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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { ThemeToggleSwitch } from '@/components/ui/ThemeToggleSwitch';
import { IOSToggle } from '@/components/ui/IOSToggle';

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
  iconColor = '#3B82F6',
  iconBg = 'rgba(59, 130, 246, 0.12)',
  title,
  subtitle,
  rightElement,
  onPress,
  danger = false,
  disabled = false,
  isLast = false,
}: SettingRowProps) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled || !onPress}
      onPress={() => {
        if (onPress) {
          Haptics.selectionAsync();
          onPress();
        }
      }}
      style={[
        styles.navItemRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? '#1F2937' : '#F3F4F6' },
      ]}
    >
      <View style={[styles.navItemIconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={18} color={iconColor} />
      </View>

      <View style={styles.navItemTextWrap}>
        <Text
          style={[
            styles.navItemTitle,
            { color: danger ? '#EF4444' : colors.foreground },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.navItemSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        ) : null}
      </View>

      {rightElement || (
        <Feather name="chevron-right" size={18} color={isDark ? '#4B5563' : '#9CA3AF'} />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { user: authUser, signOut, resetPassword } = useAuth();
  const { clearAllData } = useDB();
  const { showConfirm, showSuccess, showError } = useDialog();

  const [busy, setBusy] = useState(false);

  // Modal States
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showWhatsNewModal, setShowWhatsNewModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showLicensesModal, setShowLicensesModal] = useState(false);

  // Notification Toggle States
  const [ipoUpdates, setIpoUpdates] = useState(true);
  const [allotmentResults, setAllotmentResults] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [appUpdates, setAppUpdates] = useState(true);
  const [notificationSound, setNotificationSound] = useState(true);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const emailStr = authUser?.email || 'Guest User (Offline)';
  const nameStr = authUser?.displayName || (authUser?.email ? authUser.email.split('@')[0] : 'IPOVault User');
  const initial = nameStr.charAt(0).toUpperCase();

  const navigateTo = (route: string) => {
    Haptics.selectionAsync();
    router.push(route as any);
  };

  const handleResetPassword = () => {
    if (!authUser?.email) {
      showError('Error', 'No email address associated with this account.');
      return;
    }
    showConfirm({
      title: 'Reset Password',
      message: `Send a password reset email to ${authUser.email}?`,
      confirmText: 'Send Email',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await resetPassword(authUser.email!);
          if (res.error) {
            showError('Password Reset Failed', res.error);
          } else {
            showSuccess(
              'Reset Link Sent',
              `A password reset link has been sent to ${authUser.email}. Please check your email inbox to update your password.`
            );
          }
        } catch (e: any) {
          showError('Error', e?.message || 'Failed to send reset email.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleLogout = () => {
    showConfirm({
      title: 'Log Out',
      message: `Are you sure you want to sign out${authUser?.email ? ` (${authUser.email})` : ''}?\n\nYour cloud backup is safe. Local session data will be cleared on this device.`,
      confirmText: 'Log Out',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await clearAllData();
          await signOut();
          showSuccess('Logged Out', 'You have been safely signed out.');
        } catch (e: any) {
          showError('Sign Out Error', e?.message || 'Failed to sign out. Please try again.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>PREFERENCES</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
        </View>

        <ThemeToggleSwitch />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
      >
        {/* ACCOUNT SECTION: Email details, Reset Password, Log Out */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>ACCOUNT</Text>
          <View
            style={[
              styles.cardGroup,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {/* User Profile / Email Details */}
            <View
              style={[
                styles.accountCardRow,
                { borderBottomWidth: 1, borderBottomColor: isDark ? '#1F2937' : '#F3F4F6' },
              ]}
            >
              <View
                style={[
                  styles.avatarCircle,
                  {
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
                    borderColor: isDark ? '#3B82F644' : '#BFDBFE',
                  },
                ]}
              >
                <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
              </View>

              <View style={styles.accountTextWrap}>
                <Text style={[styles.accountName, { color: colors.foreground }]} numberOfLines={1}>
                  {nameStr}
                </Text>
                <Text style={[styles.accountEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {emailStr}
                </Text>
              </View>
            </View>

            {/* Reset Password */}
            <SettingRow
              icon="lock"
              iconColor="#F59E0B"
              iconBg={isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7'}
              title="Change Password"
              subtitle="Update your account password"
              onPress={handleResetPassword}
              disabled={busy}
            />

            {/* Log Out */}
            <SettingRow
              icon="log-out"
              iconColor="#EF4444"
              iconBg={isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2'}
              title="Log Out"
              subtitle="Sign out from this device"
              danger
              isLast
              onPress={handleLogout}
              disabled={busy}
            />
          </View>
        </View>

        {/* PREFERENCES SECTION */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>PREFERENCES</Text>
          <View
            style={[
              styles.cardGroup,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Notifications Row -> Opens Modal */}
            <SettingRow
              icon="bell"
              iconColor="#8B5CF6"
              iconBg={isDark ? 'rgba(139, 92, 246, 0.15)' : '#EDE9FE'}
              title="Notifications"
              subtitle="IPO updates, alerts & sounds"
              isLast
              onPress={() => setShowNotificationsModal(true)}
            />
          </View>
        </View>

        {/* DATA & BACKUP SECTION */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>DATA & BACKUP</Text>
          <View
            style={[
              styles.cardGroup,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <SettingRow
              icon="database"
              iconColor="#3B82F6"
              iconBg={isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF'}
              title="Data & Backup"
              subtitle="Local & cloud data"
              isLast
              onPress={() => navigateTo('/settings-data-backup')}
            />
          </View>
        </View>

        {/* HELP & LEGAL SECTION (Combined Help, Support, Privacy, Terms, Licenses) */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>HELP & LEGAL</Text>
          <View
            style={[
              styles.cardGroup,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <SettingRow
              icon="help-circle"
              iconColor="#8B5CF6"
              iconBg={isDark ? 'rgba(139, 92, 246, 0.15)' : '#EDE9FE'}
              title="Help Center"
              subtitle="FAQs & guides"
              onPress={() => navigateTo('/help-center')}
            />
            <SettingRow
              icon="message-square"
              iconColor="#10B981"
              iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5'}
              title="Contact Support"
              subtitle="Get help from our team"
              onPress={() => navigateTo('/settings-contact-support')}
            />
            <SettingRow
              icon="shield"
              iconColor="#3B82F6"
              iconBg={isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF'}
              title="Privacy Policy"
              subtitle="How we protect your data"
              onPress={() => setShowPrivacyModal(true)}
            />
            <SettingRow
              icon="file-text"
              iconColor="#F59E0B"
              iconBg={isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7'}
              title="Terms of Service"
              subtitle="Usage terms and conditions"
              onPress={() => setShowTermsModal(true)}
            />
            <SettingRow
              icon="code"
              iconColor="#6366F1"
              iconBg={isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF'}
              title="Open Source Licenses"
              subtitle="Third-party packages & licenses"
              isLast
              onPress={() => setShowLicensesModal(true)}
            />
          </View>
        </View>

        {/* ABOUT SECTION: App version & What's New on tap */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>ABOUT</Text>
          <View
            style={[
              styles.cardGroup,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <SettingRow
              icon="trending-up"
              iconColor="#3B82F6"
              iconBg={isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF'}
              title="IPOVault"
              subtitle="Version 2.3.0"
              isLast
              onPress={() => setShowWhatsNewModal(true)}
              rightElement={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium', color: colors.mutedForeground }}>
                    What's New
                  </Text>
                  <Feather name="chevron-right" size={18} color={isDark ? '#4B5563' : '#9CA3AF'} />
                </View>
              }
            />
          </View>
        </View>
      </ScrollView>

      {/* ── NOTIFICATIONS MODAL ── */}
      <Modal visible={showNotificationsModal} transparent animationType="fade" onRequestClose={() => setShowNotificationsModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotificationsModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Notifications</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Customize your alert preferences
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowNotificationsModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {/* IPO Updates */}
              <View style={[styles.modalRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.modalIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                  <Feather name="bar-chart-2" size={16} color="#3B82F6" />
                </View>
                <View style={styles.modalTextWrap}>
                  <Text style={[styles.modalRowTitle, { color: colors.foreground }]}>IPO Updates</Text>
                  <Text style={[styles.modalRowSub, { color: colors.mutedForeground }]}>Opening and closing dates</Text>
                </View>
                <IOSToggle value={ipoUpdates} onValueChange={setIpoUpdates} />
              </View>

              {/* Allotment Results */}
              <View style={[styles.modalRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.modalIconWrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }]}>
                  <Feather name="award" size={16} color="#F59E0B" />
                </View>
                <View style={styles.modalTextWrap}>
                  <Text style={[styles.modalRowTitle, { color: colors.foreground }]}>Allotment Results</Text>
                  <Text style={[styles.modalRowSub, { color: colors.mutedForeground }]}>Status changes & allocations</Text>
                </View>
                <IOSToggle value={allotmentResults} onValueChange={setAllotmentResults} />
              </View>

              {/* Price Alerts */}
              <View style={[styles.modalRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.modalIconWrap, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
                  <Feather name="trending-up" size={16} color="#EF4444" />
                </View>
                <View style={styles.modalTextWrap}>
                  <Text style={[styles.modalRowTitle, { color: colors.foreground }]}>Price Alerts</Text>
                  <Text style={[styles.modalRowSub, { color: colors.mutedForeground }]}>Significant market moves</Text>
                </View>
                <IOSToggle value={priceAlerts} onValueChange={setPriceAlerts} />
              </View>

              {/* App Updates */}
              <View style={[styles.modalRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.modalIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
                  <Feather name="bell" size={16} color="#10B981" />
                </View>
                <View style={styles.modalTextWrap}>
                  <Text style={[styles.modalRowTitle, { color: colors.foreground }]}>App Updates</Text>
                  <Text style={[styles.modalRowSub, { color: colors.mutedForeground }]}>New features & improvements</Text>
                </View>
                <IOSToggle value={appUpdates} onValueChange={setAppUpdates} />
              </View>

              {/* Notification Sound */}
              <View style={[styles.modalRow, { borderBottomWidth: 0 }]}>
                <View style={[styles.modalIconWrap, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#EDE9FE' }]}>
                  <Feather name="volume-2" size={16} color="#8B5CF6" />
                </View>
                <View style={styles.modalTextWrap}>
                  <Text style={[styles.modalRowTitle, { color: colors.foreground }]}>Notification Sound</Text>
                  <Text style={[styles.modalRowSub, { color: colors.mutedForeground }]}>Play tone on alert</Text>
                </View>
                <IOSToggle value={notificationSound} onValueChange={setNotificationSound} />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setShowNotificationsModal(false);
              }}
            >
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── WHAT'S NEW MODAL ── */}
      <Modal visible={showWhatsNewModal} transparent animationType="fade" onRequestClose={() => setShowWhatsNewModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowWhatsNewModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>What's New in v2.3.0</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Latest improvements & enhancements
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowWhatsNewModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 14, paddingVertical: 6 }}>
                <View style={styles.whatsNewItem}>
                  <View style={[styles.whatsNewIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                    <Feather name="zap" size={16} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.whatsNewItemTitle, { color: colors.foreground }]}>Streamlined Settings Hub</Text>
                    <Text style={[styles.whatsNewItemDesc, { color: colors.mutedForeground }]}>
                      Quick theme capsule toggle, consolidated account management, and fast modals.
                    </Text>
                  </View>
                </View>

                <View style={styles.whatsNewItem}>
                  <View style={[styles.whatsNewIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
                    <Feather name="link-2" size={16} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.whatsNewItemTitle, { color: colors.foreground }]}>Live Broker LTP Sync</Text>
                    <Text style={[styles.whatsNewItemDesc, { color: colors.mutedForeground }]}>
                      Authoritative Upstox market quotes and real-time valuation for holding applications.
                    </Text>
                  </View>
                </View>

                <View style={styles.whatsNewItem}>
                  <View style={[styles.whatsNewIconWrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }]}>
                    <Feather name="trending-up" size={16} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.whatsNewItemTitle, { color: colors.foreground }]}>Aligned Performance Charts</Text>
                    <Text style={[styles.whatsNewItemDesc, { color: colors.mutedForeground }]}>
                      Pixel-perfect X-axis month centering and responsive financial analytics.
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => setShowWhatsNewModal(false)}
            >
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── PRIVACY POLICY MODAL ── */}
      <Modal visible={showPrivacyModal} transparent animationType="fade" onRequestClose={() => setShowPrivacyModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPrivacyModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Privacy Policy</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Your data stays private and safe
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 10, paddingVertical: 4 }}>
                <Text style={[styles.termsHeading, { color: colors.foreground }]}>1. Local-First Architecture</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  All your IPO applications, PAN numbers, user profiles, and portfolio details are stored locally in SQLite on your device.
                </Text>

                <Text style={[styles.termsHeading, { color: colors.foreground }]}>2. Optional Encrypted Cloud Sync</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  Cloud synchronization to Google Cloud Firestore is strictly opt-in and bound to your authenticated account ID.
                </Text>

                <Text style={[styles.termsHeading, { color: colors.foreground }]}>3. Broker OAuth Privacy</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  IPOVault uses official broker OAuth protocols. We never store or log your broker passwords or PINs.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => setShowPrivacyModal(false)}
            >
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── TERMS OF SERVICE MODAL ── */}
      <Modal visible={showTermsModal} transparent animationType="fade" onRequestClose={() => setShowTermsModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowTermsModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Terms of Service</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Usage guidelines & terms
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTermsModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 10, paddingVertical: 4 }}>
                <Text style={[styles.termsHeading, { color: colors.foreground }]}>1. Personal Portfolio Tracker</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  IPOVault is designed as a personal financial tracker for IPO bidding and portfolio management.
                </Text>

                <Text style={[styles.termsHeading, { color: colors.foreground }]}>2. Financial Disclaimer</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  Information provided within the app does not constitute financial advice. Always perform your own research before bidding on IPOs.
                </Text>

                <Text style={[styles.termsHeading, { color: colors.foreground }]}>3. Data Responsibility</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  You are responsible for regularly exporting backups and safeguarding your device credentials.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => setShowTermsModal(false)}
            >
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── OPEN SOURCE LICENSES MODAL ── */}
      <Modal visible={showLicensesModal} transparent animationType="fade" onRequestClose={() => setShowLicensesModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLicensesModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Open Source Licenses</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Third-party software libraries
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowLicensesModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.termsText, { color: colors.mutedForeground, lineHeight: 18 }]}>
                IPOVault is built with React Native, Expo, SQLite, Firebase, and open-source packages.{'\n\n'}
                All components and dependencies are licensed under standard MIT and Apache 2.0 open-source licenses.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => setShowLicensesModal(false)}
            >
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
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
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.4,
  },
  sectionWrap: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.9,
    marginBottom: 8,
    paddingLeft: 4,
  },
  cardGroup: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accountCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  accountTextWrap: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 15.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  accountEmail: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  navItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  navItemIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemTextWrap: {
    flex: 1,
    gap: 1.5,
  },
  navItemTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.1,
  },
  navItemSubtitle: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  modalSubTitle: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTextWrap: {
    flex: 1,
    gap: 1.5,
  },
  modalRowTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.1,
  },
  modalRowSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  primaryModalBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryModalBtnText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  termsHeading: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 4,
    marginTop: 8,
  },
  termsText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  whatsNewItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  whatsNewIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  whatsNewItemTitle: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 2,
  },
  whatsNewItemDesc: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },
});
