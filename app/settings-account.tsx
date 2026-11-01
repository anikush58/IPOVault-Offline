import React, { useState, useEffect, useCallback } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from '@/components/ui/Icon';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { isCustomAvatarUrl } from '@/utils/avatarUtils';

export default function SettingsAccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const settingIconColor = isDark ? '#FFFFFF' : '#111827';
  const settingIconBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(17, 24, 39, 0.06)';

  const { user: authUser, signOut, resetPassword, updateProfile, deleteAccount } = useAuth();
  const { clearAllData } = useDB();
  const { showConfirm, showSuccess, showError, showInfo } = useDialog();

  const [busy, setBusy] = useState(false);
  const [showManageGoogleModal, setShowManageGoogleModal] = useState(false);
  const [showUidModal, setShowUidModal] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(authUser?.photoURL || null);
  const [customUsername, setCustomUsername] = useState<string | null>(authUser?.displayName || null);

  // Reactively synchronize local screen state whenever authUser profile updates (e.g. from cloud sync)
  useEffect(() => {
    if (authUser?.displayName && authUser.displayName.trim()) {
      setCustomUsername(authUser.displayName.trim());
    }
    if (authUser?.photoURL && isCustomAvatarUrl(authUser.photoURL)) {
      setAvatarUri(authUser.photoURL.trim());
    }
  }, [authUser?.displayName, authUser?.photoURL]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      safeAsyncStorage.getItem('@ipovault_avatar_uri').then((stored) => {
        if (isMounted) {
          if (stored && isCustomAvatarUrl(stored)) {
            setAvatarUri(stored.trim());
          } else if (authUser?.photoURL && isCustomAvatarUrl(authUser.photoURL)) {
            setAvatarUri(authUser.photoURL.trim());
          } else {
            setAvatarUri(null);
          }
        }
      });
      safeAsyncStorage.getItem('@ipovault_username').then((stored) => {
        if (isMounted) {
          const val = stored && stored.trim() ? stored.trim() : (authUser?.displayName ? authUser.displayName.trim() : null);
          setCustomUsername(val);
        }
      });
      return () => {
        isMounted = false;
      };
    }, [authUser?.displayName, authUser?.photoURL])
  );

  const handlePickAvatar = async () => {
    try {
      Haptics.selectionAsync();
    } catch {}

    if (avatarUri) {
      showConfirm({
        title: 'Profile Photo',
        message: 'Choose an action for your profile photo.',
        confirmText: 'Change Photo',
        cancelText: 'Remove Photo',
        onConfirm: async () => {
          await pickImage();
        },
        onCancel: async () => {
          setBusy(true);
          try {
            setAvatarUri(null);
            await updateProfile(customUsername || authUser?.displayName || undefined, null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showSuccess('Photo Removed', 'Profile photo has been removed and cloud updated.');
          } catch (e: any) {
            showError('Error', e?.message || 'Failed to remove photo.');
          } finally {
            setBusy(false);
          }
        },
      });
    } else {
      await pickImage();
    }
  };

  const pickImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        setAvatarUri(uri);
        setBusy(true);
        try {
          const res = await updateProfile(customUsername || authUser?.displayName || undefined, uri);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (res.error) {
            showSuccess('Photo Updated', 'Saved locally. Cloud sync will update once connected.');
          } else {
            showSuccess('Photo Updated', 'Profile photo saved and synced to your cloud account.');
          }
        } catch (saveErr: any) {
          showError('Error', saveErr?.message || 'Failed to update photo.');
        } finally {
          setBusy(false);
        }
      }
    } catch (e: any) {
      showError('Error', e?.message || 'Could not select photo.');
    }
  };

  const handleSaveUsername = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      showError('Invalid Name', 'Username cannot be blank.');
      return;
    }
    setBusy(true);
    try {
      setCustomUsername(trimmed);
      const effectiveAvatar = avatarUri || authUser?.photoURL || undefined;
      const res = await updateProfile(trimmed, effectiveAvatar);
      setShowEditNameModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (res.error) {
        showSuccess('Username Saved', 'Saved locally. Cloud sync will update once connected.');
      } else {
        showSuccess('Username Saved', 'Your username has been saved to your cloud profile.');
      }
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to save username.');
    } finally {
      setBusy(false);
    }
  };

  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const emailStr = authUser?.email?.trim() || 'Guest User';
  const nameStr =
    (customUsername && customUsername.trim()) ||
    (authUser?.displayName && authUser.displayName.trim()) ||
    (authUser?.email && authUser.email.includes('@') ? authUser.email.split('@')[0].trim() : '') ||
    'IPOVault User';
  const initial = (nameStr.replace(/[^a-zA-Z0-9]/g, '').charAt(0) || nameStr.charAt(0) || 'U').toUpperCase();

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
      message: `Send a password reset email to\n${authUser.email}?`,
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
              `A password reset link has been sent to\n${authUser.email}\n\nPlease check your email inbox to update your password.`
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
      message: 'Are you sure you want to sign out?\n\nYour cloud backup is safe. Local session data will be cleared on this device.',
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

  const handleDeleteAccount = () => {
    showConfirm({
      title: 'Delete Account',
      message:
        'Are you sure you want to permanently delete your IPOVault account?\n\nThis will permanently delete your authentication credentials, cloud sync profile, and all locally stored Demat, PAN, and IPO application records. This action is irreversible.',
      confirmText: 'Delete Account',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setBusy(true);
        const targetUid = authUser?.uid || null;
        try {
          const res = await deleteAccount();
          if (!res.success) {
            showError('Account Deletion Failed', res.error || 'Failed to delete account. Please try again.');
          } else {
            await clearAllData(targetUid || undefined, { skipCloudFlush: true });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showSuccess(
              'Account Deleted',
              'Your account and associated cloud data have been permanently deleted.'
            );
            router.replace('/auth');
          }
        } catch (e: any) {
          showError('Error', e?.message || 'Failed to delete account.');
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
      <ScreenHeader
        eyebrow="SETTINGS"
        title="Edit Profile"
        centerTitle
        showBack
        transparent
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: topPad + 60 + 12,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Manage your profile and account settings
        </Text>

        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePickAvatar}
            disabled={busy}
            style={[
              styles.avatarWrap,
              {
                backgroundColor: settingIconBg,
                borderColor: colors.border,
              },
            ]}
          >
            {isCustomAvatarUrl(avatarUri || authUser?.photoURL) ? (
              <Image source={{ uri: (avatarUri || authUser?.photoURL)! }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.avatarText, { color: settingIconColor }]}>{initial}</Text>
            )}
            <View style={[styles.avatarEditOverlay, { backgroundColor: colors.primary }]}>
              <Icon name="camera" size={10} color={colors.primaryForeground} />
            </View>
          </TouchableOpacity>

          <View style={styles.profileInfoWrap}>
            <View style={styles.profileNameRow}>
              <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>
                {nameStr}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setNameInput(nameStr);
                  setShowEditNameModal(true);
                }}
                hitSlop={8}
                style={[styles.editPencilBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}
              >
                <Icon name="edit-2" size={13} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
              {emailStr}
            </Text>
          </View>
        </View>

        {/* Options Card */}
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Username */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => {
              setNameInput(nameStr);
              setShowEditNameModal(true);
            }}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="user" size={17} color={settingIconColor} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Username</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {nameStr}
              </Text>
            </View>
            <View style={styles.rowRightPill}>
              <Text style={[styles.rowRightPillText, { color: colors.primary }]}>Edit</Text>
              <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          </TouchableOpacity>
          {/* Account ID (UID) */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setShowUidModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="link-2" size={17} color={settingIconColor} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Account ID (UID)</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>View your unique account ID</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Change Password */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={handleResetPassword}
            disabled={busy}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="lock" size={17} color={settingIconColor} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Change Password</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Update your account password</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Manage Google Account */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setShowManageGoogleModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="globe" size={17} color={settingIconColor} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Manage Google Account</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Switch or disconnect Google account</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Log Out */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={handleLogout}
            disabled={busy}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
              <Icon name="log-out" size={17} color="#EF4444" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: '#EF4444' }]}>Log Out</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Sign out from this device</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Delete Account (Google Play Compliance) - Authenticated users only */}
          {!!authUser && (
            <TouchableOpacity
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
              activeOpacity={0.7}
              onPress={handleDeleteAccount}
              disabled={busy}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(220, 38, 38, 0.2)' : '#FEE2E2' }]}>
                <Icon name="trash-2" size={17} color="#DC2626" />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={[styles.menuTitle, { color: '#DC2626' }]}>Delete Account</Text>
                <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Permanently delete account and all cloud data</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* UID Modal */}
      <Modal visible={showUidModal} transparent animationType="fade" onRequestClose={() => setShowUidModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowUidModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Account ID (UID)</Text>
              <TouchableOpacity onPress={() => setShowUidModal(false)} hitSlop={8}>
                <Icon name="x" size={18} color={colors.mutedForeground} />
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
              <Icon name="copy" size={16} color={colors.primaryForeground} />
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Copy Account ID</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Username Modal */}
      <Modal visible={showEditNameModal} transparent animationType="fade" onRequestClose={() => setShowEditNameModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowEditNameModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Username</Text>
              <TouchableOpacity onPress={() => setShowEditNameModal(false)} hitSlop={8}>
                <Icon name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Enter your display name. This will be displayed across IPOVault and synced to your cloud account.
            </Text>

            <View style={[styles.editInputBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC', borderColor: colors.border }]}>
              <Icon name="user" size={16} color={colors.primary} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.modalTextInput, { color: colors.foreground }]}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Enter username"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
              />
              {nameInput.length > 0 ? (
                <TouchableOpacity onPress={() => setNameInput('')} hitSlop={8}>
                  <Icon name="x-circle" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                style={[styles.secondaryModalBtn, { borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => setShowEditNameModal(false)}
              >
                <Text style={[styles.secondaryModalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryModalBtnFlex, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
                onPress={handleSaveUsername}
                disabled={busy}
              >
                <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>
                  {busy ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
            </View>
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
                <Icon name="x" size={18} color={colors.mutedForeground} />
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
                <View style={[styles.googleBadge, { marginTop: 4, backgroundColor: '#10B981', borderWidth: 0 }]}>
                  <Icon name="check-circle" size={10} color="#FFFFFF" />
                  <Text style={[styles.googleBadgeText, { color: '#FFFFFF' }]}>
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
                <Text style={[styles.switchBtnText, { color: '#3B82F6' }]}>Switch Google Account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.disconnectBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2', borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#FECACA' }]}
                activeOpacity={0.8}
                onPress={handleDisconnectGoogleAccount}
              >
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
  profileName: { fontSize: 16, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: -0.2 },
  profileEmail: { fontSize: 12.5, fontFamily: 'GoogleSansFlex_400Regular' },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
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
  codeText: { fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium', textAlign: 'center' },
  primaryModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 9999,
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
    borderRadius: 9999,
    borderWidth: 1,
  },
  switchBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 9999,
    borderWidth: 1,
  },
  disconnectBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  sheetFooterNote: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 14,
  },
  avatarEditOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editPencilBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowRightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowRightPillText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  editInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  modalTextInput: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  secondaryModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryModalBtnText: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  primaryModalBtnFlex: {
    flex: 1,
    height: 44,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
