import React, { useState } from 'react';
import {
  Image,
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
import { IconButton } from '@/components/ui/IconButton';

export default function SettingsAccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const { user: authUser, signOut, resetPassword } = useAuth();
  const { clearAllData } = useDB();
  const { showConfirm, showSuccess, showError, showInfo } = useDialog();

  const [busy, setBusy] = useState(false);
  const [showManageGoogleModal, setShowManageGoogleModal] = useState(false);
  const [showUidModal, setShowUidModal] = useState(false);

  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const emailStr = authUser?.email || 'Guest User';
  const nameStr = authUser?.displayName || (authUser?.email ? authUser.email.split('@')[0] : 'IPOVault User');
  const initial = nameStr.charAt(0).toUpperCase();

  const handleCopyUid = async () => {
    if (!authUser?.uid) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(authUser.uid);
      }
      Haptics.selectionAsync();
      showSuccess('User ID Copied', `Firebase UID copied to clipboard:\n${authUser.uid}`);
    } catch {
      showInfo('User ID', authUser.uid);
    }
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showSuccess('Signed Out', 'You have been signed out successfully.');
          router.replace('/auth');
        } catch (e: any) {
          showError('Sign Out Error', e?.message || 'Failed to sign out. Please try again.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleSwitchGoogleAccount = async () => {
    setShowManageGoogleModal(false);
    showConfirm({
      title: 'Switch Account',
      message: 'Signing in with another account will clear the current local session. Proceed?',
      confirmText: 'Switch Account',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await clearAllData();
          await signOut();
          router.replace('/auth');
        } catch (e: any) {
          showError('Error', e?.message || 'Failed to initiate account switch.');
        }
      },
    });
  };

  const handleDisconnectGoogleAccount = async () => {
    setShowManageGoogleModal(false);
    handleLogout();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar with Back Button */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>SETTINGS</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Account</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 40 }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Manage your profile and account settings
        </Text>

        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View
            style={[
              styles.avatarWrap,
              {
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
                borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : '#BFDBFE',
              },
            ]}
          >
            {authUser?.photoURL ? (
              <Image source={{ uri: authUser.photoURL }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.avatarText, { color: '#3B82F6' }]}>{initial}</Text>
            )}
          </View>

          <View style={styles.profileInfoWrap}>
            <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>
              {nameStr}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
              {emailStr}
            </Text>
          </View>
        </View>

        {/* Options Card */}
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Account ID (UID) */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setShowUidModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
              <Feather name="link-2" size={17} color="#3B82F6" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Account ID (UID)</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>View your unique account ID</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Change Password */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={handleResetPassword}
            disabled={busy}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }]}>
              <Feather name="lock" size={17} color="#F59E0B" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Change Password</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Update your account password</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Manage Google Account */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setShowManageGoogleModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
              <Feather name="globe" size={17} color="#10B981" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Manage Google Account</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Switch or disconnect Google account</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Log Out */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomWidth: 0 }]}
            activeOpacity={0.7}
            onPress={handleLogout}
            disabled={busy}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
              <Feather name="log-out" size={17} color="#EF4444" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: '#EF4444' }]}>Log Out</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Sign out from this device</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* UID Modal */}
      <Modal visible={showUidModal} transparent animationType="fade" onRequestClose={() => setShowUidModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowUidModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Account ID (UID)</Text>
              <TouchableOpacity onPress={() => setShowUidModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              This is your unique Firebase UID associated with your cloud synchronization.
            </Text>

            <View style={[styles.codeBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border }]}>
              <Text style={[styles.codeText, { color: colors.foreground }]} selectable>
                {authUser?.uid || 'Not signed in'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
              onPress={() => {
                handleCopyUid();
                setShowUidModal(false);
              }}
            >
              <Feather name="copy" size={16} color={colors.primaryForeground} />
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Copy Account ID</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manage Google Account Sheet Modal */}
      <Modal visible={showManageGoogleModal} transparent animationType="fade" onRequestClose={() => setShowManageGoogleModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowManageGoogleModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Manage Google Account</Text>
              <TouchableOpacity onPress={() => setShowManageGoogleModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetProfileRow}>
              <View
                style={[
                  styles.avatarWrapSmall,
                  {
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
                    borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : '#BFDBFE',
                  },
                ]}
              >
                <Text style={[styles.avatarTextSmall, { color: '#3B82F6' }]}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>
                  {nameStr}
                </Text>
                <Text style={[styles.profileEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {emailStr}
                </Text>
                <View style={[styles.googleBadge, { marginTop: 4, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4', borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0' }]}>
                  <Feather name="check-circle" size={10} color="#10B981" />
                  <Text style={[styles.googleBadgeText, { color: isDark ? '#4ADE80' : '#15803D' }]}>
                    Currently Signed In
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                style={[styles.switchBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF', borderColor: isDark ? 'rgba(59,130,246,0.3)' : '#BFDBFE' }]}
                activeOpacity={0.8}
                onPress={handleSwitchGoogleAccount}
              >
                <Feather name="refresh-cw" size={15} color="#3B82F6" />
                <Text style={[styles.switchBtnText, { color: '#3B82F6' }]}>Switch Google Account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.disconnectBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2', borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#FECACA' }]}
                activeOpacity={0.8}
                onPress={handleDisconnectGoogleAccount}
              >
                <Feather name="trash-2" size={15} color="#EF4444" />
                <Text style={[styles.disconnectBtnText, { color: '#EF4444' }]}>Disconnect Account</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sheetFooterNote, { color: colors.mutedForeground }]}>
              This will sign you out. Your local data will remain on this device.
            </Text>
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
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 16,
    paddingHorizontal: 4,
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
  },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 22, fontFamily: 'GoogleSansFlex_700Bold' },
  profileInfoWrap: { flex: 1, gap: 2 },
  profileName: { fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  profileEmail: { fontSize: 12.5, fontFamily: 'GoogleSansFlex_400Regular' },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  googleBadgeText: { fontSize: 10.5, fontFamily: 'GoogleSansFlex_600SemiBold' },

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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  modalSub: { fontSize: 12.5, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 18, marginBottom: 14 },
  codeBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  codeText: { fontSize: 12, fontFamily: 'SpaceMono_400Regular', textAlign: 'center' },
  primaryModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
  },
  primaryModalBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },

  sheetProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  avatarWrapSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: { fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold' },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  switchBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  disconnectBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  sheetFooterNote: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 14,
  },
});
