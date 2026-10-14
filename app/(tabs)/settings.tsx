import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
import { ThemeToggleSwitch } from '@/components/ui/ThemeToggleSwitch';
import { IOSToggle } from '@/components/ui/IOSToggle';
import { AnimatedEntrance } from '@/components/ui/AnimatedEntrance';
import { ScoopedBottomSheet } from '@/components/ui/ScoopedBottomSheet';
import { useAdContext } from '@/context/AdContext';
import {
  getNotificationPreferences,
  setNotificationPreference,
} from '@/services/notifications/notificationEngine';

export interface SettingRowProps {
  icon: string;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
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
  badge,
  rightElement,
  onPress,
  danger = false,
  disabled = false,
  isLast = false,
}: SettingRowProps) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const defaultIconColor = isDark ? '#FFFFFF' : '#111827';
  const defaultIconBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(17, 24, 39, 0.06)';
  const resolvedIconColor = iconColor || defaultIconColor;
  const resolvedIconBg = iconBg || defaultIconBg;

  return (
    <TouchableOpacity
      activeOpacity={0.72}
      disabled={disabled || !onPress}
      onPress={() => {
        if (onPress) {
          try {
            Haptics.selectionAsync();
          } catch {}
          onPress();
        }
      }}
      style={[
        styles.navItemRow,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={[styles.navItemIconWrap, { backgroundColor: resolvedIconBg }]}>
        <Feather name={icon as any} size={17} color={resolvedIconColor} />
      </View>

      <View style={styles.navItemTextWrap}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.navItemTitle,
              { color: danger ? '#EF4444' : colors.foreground },
            ]}
          >
            {title}
          </Text>
          {badge && (
            <View style={[styles.inlineBadge, { backgroundColor: badge.bg || (isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9') }]}>
              {badge.dotColor && <View style={[styles.badgeDot, { backgroundColor: badge.dotColor }]} />}
              <Text style={[styles.badgeText, { color: badge.color || colors.primary }]}>{badge.text}</Text>
            </View>
          )}
        </View>
        {subtitle ? (
          <Text style={[styles.navItemSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        ) : null}
      </View>

      {rightElement || (
        <View style={styles.chevronWrap}>
          <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
        </View>
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

  const settingIconColor = isDark ? '#FFFFFF' : '#111827';
  const settingIconBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(17, 24, 39, 0.06)';

  const { user: authUser, signOut, resetPassword, updateProfile } = useAuth();
  const { applications, users, bankAccounts, clearAllData } = useDB();
  const { showConfirm, showSuccess, showError } = useDialog();

  const [busy, setBusy] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);

  // Bottom Sheet States
  const [showNotificationsSheet, setShowNotificationsSheet] = useState(false);
  const [showWhatsNewSheet, setShowWhatsNewSheet] = useState(false);
  const [showPrivacySheet, setShowPrivacySheet] = useState(false);
  const [showTermsSheet, setShowTermsSheet] = useState(false);
  const [showLicensesSheet, setShowLicensesSheet] = useState(false);
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);

  // Ad Context & Monetization
  const { isPremium, toggleDevMockPremium, showPrivacyOptions } = useAdContext();

  // Notification Toggle States
  const [ipoUpdates, setIpoUpdates] = useState(true);
  const [allotmentResults, setAllotmentResults] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [appUpdates, setAppUpdates] = useState(true);
  const [notificationSound, setNotificationSound] = useState(true);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const defaultDisplayName =
    (authUser?.displayName && authUser.displayName.trim()) ||
    (authUser?.email && authUser.email.includes('@') ? authUser.email.split('@')[0].trim() : '') ||
    'IPOVault User';

  const [avatarUri, setAvatarUri] = useState<string | null>(authUser?.photoURL || null);
  const [usernameStr, setUsernameStr] = useState(defaultDisplayName);
  const [editNameInput, setEditNameInput] = useState(defaultDisplayName);

  // Reactively synchronize local screen state whenever authUser profile updates (e.g. from cloud sync)
  useEffect(() => {
    if (authUser?.displayName && authUser.displayName.trim()) {
      const name = authUser.displayName.trim();
      setUsernameStr(name);
      setEditNameInput(name);
    }
    if (authUser?.photoURL && authUser.photoURL.trim()) {
      setAvatarUri(authUser.photoURL.trim());
    }
  }, [authUser?.displayName, authUser?.photoURL]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      safeAsyncStorage.getItem('@ipovault_username').then((stored) => {
        if (!isMounted) return;
        if (stored && stored.trim()) {
          setUsernameStr(stored.trim());
          setEditNameInput(stored.trim());
        } else {
          const fallback = (authUser?.displayName && authUser.displayName.trim()) || defaultDisplayName;
          setUsernameStr(fallback);
          setEditNameInput(fallback);
        }
      });
      safeAsyncStorage.getItem('@ipovault_avatar_uri').then((stored) => {
        if (!isMounted) return;
        if (stored && stored.trim()) {
          setAvatarUri(stored.trim());
        } else if (authUser?.photoURL && authUser.photoURL.trim()) {
          setAvatarUri(authUser.photoURL.trim());
        } else {
          setAvatarUri(null);
        }
      });
      getNotificationPreferences().then((prefs) => {
        if (!isMounted) return;
        setIpoUpdates(prefs.ipoUpdates);
        setAllotmentResults(prefs.allotmentResults);
        setPriceAlerts(prefs.priceAlerts);
        setAppUpdates(prefs.appUpdates);
        setNotificationSound(prefs.sound);
      });
      return () => {
        isMounted = false;
      };
    }, [defaultDisplayName, authUser?.displayName, authUser?.photoURL])
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
          setAvatarUri(null);
          await updateProfile(usernameStr || defaultDisplayName, null);
          showSuccess('Photo Removed', 'Profile photo has been reset.');
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
        const res = await updateProfile(usernameStr || defaultDisplayName, uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (res.error) {
          showSuccess('Photo Updated', 'Saved locally. Cloud sync will update once connected.');
        } else {
          showSuccess('Photo Updated', 'Your profile picture has been saved and synced to the cloud.');
        }
      }
    } catch (e: any) {
      showError('Error', e?.message || 'Could not select photo.');
    }
  };

  const handleSaveName = async (newName: string) => {
    const trimmed = newName.trim();
    const targetName = trimmed || defaultDisplayName;
    setUsernameStr(targetName);
    const effectiveAvatar = avatarUri || authUser?.photoURL || undefined;
    await updateProfile(targetName, effectiveAvatar);
  };

  const emailStr = authUser?.email?.trim() || 'Guest Account (Offline)';
  const initial = (usernameStr.replace(/[^a-zA-Z0-9]/g, '').charAt(0) || usernameStr.charAt(0) || 'U').toUpperCase();

  const navigateTo = (route: string) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    router.push(route as any);
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
          showSuccess('Logged Out', 'You have been safely signed out.');
        } catch (e: any) {
          showError('Sign Out Error', e?.message || 'Failed to sign out. Please try again.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({
    inputRange: [0, 24],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Floating Blurred Header Bar */}
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
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={[styles.headerEyebrow, { color: colors.primary }]}>PREFERENCES</Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
          </View>

          <ThemeToggleSwitch />
        </View>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: topPad + 68,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
      >
        {/* ── HERO PROFILE CARD ── */}
        <AnimatedEntrance delay={0} distance={14}>
          <View
            style={[
              styles.heroProfileCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.heroProfileTopRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowEditProfileModal(true)}
                style={styles.heroAvatarContainer}
              >
                <View
                  style={[
                    styles.heroAvatarCircle,
                    {
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
                      borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : '#C7D2FE',
                    },
                  ]}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.heroAvatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={[styles.heroAvatarText, { color: colors.primary }]}>{initial}</Text>
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.heroProfileInfo}>
                <View style={styles.heroNameRow}>
                  <Text style={[styles.heroName, { color: colors.foreground }]} numberOfLines={1}>
                    {usernameStr}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5' }]}>
                    <View style={styles.statusDotGreen} />
                    <Text style={styles.statusBadgeText}>PRO</Text>
                  </View>
                </View>
                <Text style={[styles.heroEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {emailStr}
                </Text>
              </View>

              {/* Right Side Action: Edit Profile */}
              <View style={styles.topCardActions}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowEditProfileModal(true)}
                  style={styles.topEditProfileBtn}
                  accessibilityLabel="Edit Profile"
                >
                  <Feather name="edit-2" size={11} color="#FFFFFF" />
                  <Text style={styles.topEditProfileText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Compact KPI Cards (White Background) */}
            <View style={[styles.compactKpiGrid, { borderTopColor: colors.border }]}>
              {/* Bids */}
              <View
                style={[
                  styles.compactKpiTile,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : '#E2E8F0',
                  },
                ]}
              >
                <View style={[styles.compactKpiIconWrap, { backgroundColor: settingIconBg }]}>
                  <Feather name="layers" size={12.5} color={settingIconColor} />
                </View>
                <View style={styles.compactKpiTextWrap}>
                  <Text style={[styles.compactKpiValue, { color: colors.foreground }]}>{applications.length}</Text>
                  <Text style={[styles.compactKpiLabel, { color: colors.mutedForeground }]}>BIDS</Text>
                </View>
              </View>

              {/* Profiles */}
              <View
                style={[
                  styles.compactKpiTile,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : '#E2E8F0',
                  },
                ]}
              >
                <View style={[styles.compactKpiIconWrap, { backgroundColor: settingIconBg }]}>
                  <Feather name="users" size={12.5} color={settingIconColor} />
                </View>
                <View style={styles.compactKpiTextWrap}>
                  <Text style={[styles.compactKpiValue, { color: colors.foreground }]}>{users.length}</Text>
                  <Text style={[styles.compactKpiLabel, { color: colors.mutedForeground }]}>PROFILES</Text>
                </View>
              </View>

              {/* Banks */}
              <View
                style={[
                  styles.compactKpiTile,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : '#E2E8F0',
                  },
                ]}
              >
                <View style={[styles.compactKpiIconWrap, { backgroundColor: settingIconBg }]}>
                  <Feather name="credit-card" size={12.5} color={settingIconColor} />
                </View>
                <View style={styles.compactKpiTextWrap}>
                  <Text style={[styles.compactKpiValue, { color: colors.foreground }]}>{bankAccounts.length}</Text>
                  <Text style={[styles.compactKpiLabel, { color: colors.mutedForeground }]}>BANKS</Text>
                </View>
              </View>
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── MEMBERSHIP & MONETIZATION ── */}
        <AnimatedEntrance delay={100} distance={12}>
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>MEMBERSHIP & AD-FREE</Text>
            </View>
            <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SettingRow
                icon="zap"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Ad-Free Premium"
                subtitle={isPremium ? 'Active (All advertisements suppressed)' : 'Enjoy IPOVault without advertisements'}
                badge={{
                  text: isPremium ? 'Active' : 'Free Tier',
                  color: isPremium ? '#10B981' : '#8B5CF6',
                  bg: isPremium
                    ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5')
                    : (isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF'),
                }}
                isLast
                onPress={() => setShowPremiumSheet(true)}
              />
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── PREFERENCES & ALERTS ── */}
        <AnimatedEntrance delay={110} distance={12}>
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>PREFERENCES & ALERTS</Text>
            </View>
            <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SettingRow
                icon="bell"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Notifications & Alerts"
                subtitle="IPO updates, allotments & sound"
                isLast
                onPress={() => setShowNotificationsSheet(true)}
              />
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── DATA & STORAGE ── */}
        <AnimatedEntrance delay={160} distance={12}>
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>DATA & STORAGE</Text>
            </View>
            <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SettingRow
                icon="cloud"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Data & Cloud Backup"
                subtitle="Local SQLite and encrypted Firestore sync"
                badge={{
                  text: 'Encrypted',
                  color: '#06B6D4',
                  bg: isDark ? 'rgba(6, 182, 212, 0.18)' : '#E0F7FA',
                  dotColor: '#06B6D4',
                }}
                isLast
                onPress={() => navigateTo('/settings-data-backup')}
              />
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── HELP & COMMUNITY ── */}
        <AnimatedEntrance delay={210} distance={12}>
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>HELP & COMMUNITY</Text>
            </View>
            <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SettingRow
                icon="compass"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Help Center"
                subtitle="Frequently asked questions & guides"
                onPress={() => navigateTo('/help-center')}
              />
              <SettingRow
                icon="message-circle"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Contact Support"
                subtitle="Get direct assistance from our team"
                onPress={() => navigateTo('/settings-contact-support')}
              />
              <SettingRow
                icon="zap"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="What's New in v2.3.0"
                subtitle="Recent performance & feature upgrades"
                badge={{
                  text: 'New',
                  color: '#EC4899',
                  bg: isDark ? 'rgba(236, 72, 153, 0.18)' : '#FCE7F3',
                }}
                isLast
                onPress={() => setShowWhatsNewSheet(true)}
              />
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── LEGAL & ABOUT ── */}
        <AnimatedEntrance delay={260} distance={12}>
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>LEGAL & ABOUT</Text>
            </View>
            <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SettingRow
                icon="shield"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Privacy Policy"
                subtitle="How we protect your financial data"
                onPress={() => setShowPrivacySheet(true)}
              />
              <SettingRow
                icon="file-text"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Terms of Service"
                subtitle="App usage rules & financial disclaimer"
                onPress={() => setShowTermsSheet(true)}
              />
              <SettingRow
                icon="code"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Open Source Licenses"
                subtitle="Third-party packages & software credits"
                onPress={() => setShowLicensesSheet(true)}
              />
              <SettingRow
                icon="shield"
                iconColor={settingIconColor}
                iconBg={settingIconBg}
                title="Ad Privacy & Consent"
                subtitle="Review personalized ad settings"
                isLast
                onPress={async () => {
                  const opened = await showPrivacyOptions();
                  if (!opened) {
                    showSuccess('Ad Privacy', 'Consent management is active and non-personalized in this mode.');
                  }
                }}
              />
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── BOTTOM LOG OUT BUTTON ── */}
        <AnimatedEntrance delay={290} distance={12}>
          <View style={styles.logoutSectionWrap}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleLogout}
              disabled={busy}
              style={styles.bottomLogoutBtn}
            >
              <Feather name="log-out" size={16} color="#FFFFFF" />
              <Text style={styles.bottomLogoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </AnimatedEntrance>
      </Animated.ScrollView>

      {/* ── EDIT PROFILE BOTTOM SHEET ── */}
      <ScoopedBottomSheet
        visible={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        maxHeight="86%"
      >
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.sheetHeaderTitleGroup}>
            <View style={[styles.sheetIconWrap, { backgroundColor: settingIconBg }]}>
              <Feather name="user" size={19} color={settingIconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Edit Profile</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                Personalize your avatar, name, and security
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.editProfileSheetContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. Hero Centered Avatar */}
          <View style={styles.editHeroAvatarSection}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handlePickAvatar}
              style={[
                styles.editAvatarOuterRing,
                {
                  borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : '#C7D2FE',
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.08)' : '#EEF2FF',
                },
              ]}
              accessibilityLabel="Change Profile Photo"
            >
              <View
                style={[
                  styles.editAvatarMainCircle,
                  {
                    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : '#E0E7FF',
                  },
                ]}
              >
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.editAvatarLargeImage} resizeMode="cover" />
                ) : (
                  <Text style={[styles.editAvatarLargeInitial, { color: colors.primary }]}>{initial}</Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Quick Action Pill Buttons */}
            <View style={styles.editAvatarPillRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={pickImage}
                style={[
                  styles.editPillBtn,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                    borderColor: colors.border,
                  },
                ]}
              >
                <Feather name="upload" size={12} color={colors.foreground} />
                <Text style={[styles.editPillBtnText, { color: colors.foreground }]}>
                  {avatarUri ? 'Change Photo' : 'Upload Photo'}
                </Text>
              </TouchableOpacity>

              {avatarUri ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={async () => {
                    setAvatarUri(null);
                    await updateProfile(usernameStr || defaultDisplayName, null);
                    showSuccess('Photo Removed', 'Profile photo has been reset.');
                  }}
                  style={[
                    styles.editPillBtn,
                    {
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                      borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FEE2E2',
                    },
                  ]}
                >
                  <Feather name="trash-2" size={12} color="#EF4444" />
                  <Text style={[styles.editPillBtnText, { color: '#EF4444' }]}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Account Email Badge */}
            <View
              style={[
                styles.editEmailBadge,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="shield" size={11} color="#10B981" />
              <Text style={[styles.editEmailBadgeText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {emailStr}
              </Text>
            </View>
          </View>

          {/* 2. Display Name */}
          <View style={styles.editSectionGroup}>
            <Text style={[styles.editSectionTitle, { color: colors.mutedForeground }]}>DISPLAY NAME</Text>
            <View style={[styles.editInputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View
                style={[
                  styles.editInputContainer,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.editInputIconWrap,
                    { backgroundColor: settingIconBg },
                  ]}
                >
                  <Feather name="user" size={14} color={settingIconColor} />
                </View>
                <TextInput
                  style={[styles.editTextInput, { color: colors.foreground }]}
                  value={editNameInput}
                  onChangeText={(val) => {
                    setEditNameInput(val);
                    handleSaveName(val);
                  }}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                />
                {editNameInput.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setEditNameInput('')}
                    hitSlop={8}
                    style={{ padding: 4 }}
                  >
                    <Feather name="x-circle" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={[styles.editInputHint, { color: colors.mutedForeground }]}>
                This name is displayed across your IPO bids, allotment alerts, and reports.
              </Text>
            </View>
          </View>

          {/* 3. Change Password */}
          <View style={styles.editSectionGroup}>
            <Text style={[styles.editSectionTitle, { color: colors.mutedForeground }]}>SECURITY</Text>
            <View style={[styles.editInputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setShowEditProfileModal(false);
                  handleResetPassword();
                }}
                style={styles.changePasswordRow}
              >
                <View
                  style={[
                    styles.changePasswordIconWrap,
                    { backgroundColor: settingIconBg },
                  ]}
                >
                  <Feather name="lock" size={17} color={settingIconColor} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.changePasswordTitle, { color: colors.foreground }]}>Change Password</Text>
                  <Text style={[styles.changePasswordSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    Send reset instructions to your verified email
                  </Text>
                </View>
                <View
                  style={[
                    styles.changePasswordActionBadge,
                    { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7' },
                  ]}
                >
                  <Text style={styles.changePasswordActionText}>Reset</Text>
                  <Feather name="arrow-right" size={11} color="#F59E0B" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Footer CTA */}
        <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.solidCTA, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {}
              const targetName = editNameInput.trim() || defaultDisplayName;
              setUsernameStr(targetName);
              const effectiveAvatar = avatarUri || authUser?.photoURL || undefined;
              const res = await updateProfile(targetName, effectiveAvatar);
              if (res.error) {
                showSuccess('Profile Saved', 'Saved locally. Cloud sync will update once connected.');
              } else {
                showSuccess('Profile Saved', 'Username and profile details saved and synced to the cloud.');
              }
              setShowEditProfileModal(false);
            }}
          >
            <Text style={[styles.solidCTAText, { color: colors.primaryForeground }]}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </ScoopedBottomSheet>
      <ScoopedBottomSheet
        visible={showNotificationsSheet}
        onClose={() => setShowNotificationsSheet(false)}
        maxHeight="86%"
      >
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.sheetHeaderTitleGroup}>
            <View style={[styles.sheetIconWrap, { backgroundColor: settingIconBg }]}>
              <Feather name="bell" size={18} color={settingIconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Notification Preferences</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                Tailor realtime updates & alerts
              </Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.sheetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* IPO Updates */}
            <View style={[styles.sheetRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.sheetRowIcon, { backgroundColor: settingIconBg }]}>
                <Feather name="bar-chart-2" size={16} color={settingIconColor} />
              </View>
              <View style={styles.sheetRowText}>
                <Text style={[styles.sheetRowTitle, { color: colors.foreground }]}>IPO Updates</Text>
                <Text style={[styles.sheetRowDesc, { color: colors.mutedForeground }]}>Opening and closing dates</Text>
              </View>
              <IOSToggle
                value={ipoUpdates}
                onValueChange={(val) => {
                  setIpoUpdates(val);
                  setNotificationPreference('IPO_UPDATES', val);
                }}
              />
            </View>

            {/* Allotment Results */}
            <View style={[styles.sheetRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.sheetRowIcon, { backgroundColor: settingIconBg }]}>
                <Feather name="award" size={16} color={settingIconColor} />
              </View>
              <View style={styles.sheetRowText}>
                <Text style={[styles.sheetRowTitle, { color: colors.foreground }]}>Allotment Results</Text>
                <Text style={[styles.sheetRowDesc, { color: colors.mutedForeground }]}>Status changes & allocations</Text>
              </View>
              <IOSToggle
                value={allotmentResults}
                onValueChange={(val) => {
                  setAllotmentResults(val);
                  setNotificationPreference('ALLOTMENT_RESULTS', val);
                }}
              />
            </View>

            {/* Price Alerts */}
            <View style={[styles.sheetRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.sheetRowIcon, { backgroundColor: settingIconBg }]}>
                <Feather name="trending-up" size={16} color={settingIconColor} />
              </View>
              <View style={styles.sheetRowText}>
                <Text style={[styles.sheetRowTitle, { color: colors.foreground }]}>Price Alerts</Text>
                <Text style={[styles.sheetRowDesc, { color: colors.mutedForeground }]}>Significant GMP & market moves</Text>
              </View>
              <IOSToggle
                value={priceAlerts}
                onValueChange={(val) => {
                  setPriceAlerts(val);
                  setNotificationPreference('PRICE_ALERTS', val);
                }}
              />
            </View>

            {/* App Updates */}
            <View style={[styles.sheetRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.sheetRowIcon, { backgroundColor: settingIconBg }]}>
                <Feather name="bell" size={16} color={settingIconColor} />
              </View>
              <View style={styles.sheetRowText}>
                <Text style={[styles.sheetRowTitle, { color: colors.foreground }]}>App Updates</Text>
                <Text style={[styles.sheetRowDesc, { color: colors.mutedForeground }]}>New features & improvements</Text>
              </View>
              <IOSToggle
                value={appUpdates}
                onValueChange={(val) => {
                  setAppUpdates(val);
                  setNotificationPreference('APP_UPDATES', val);
                }}
              />
            </View>

            {/* Notification Sound */}
            <View style={[styles.sheetRow, { borderBottomWidth: 0 }]}>
              <View style={[styles.sheetRowIcon, { backgroundColor: settingIconBg }]}>
                <Feather name="volume-2" size={16} color={settingIconColor} />
              </View>
              <View style={styles.sheetRowText}>
                <Text style={[styles.sheetRowTitle, { color: colors.foreground }]}>Notification Sound</Text>
                <Text style={[styles.sheetRowDesc, { color: colors.mutedForeground }]}>Play tone on important alerts</Text>
              </View>
              <IOSToggle
                value={notificationSound}
                onValueChange={(val) => {
                  setNotificationSound(val);
                  setNotificationPreference('SOUND', val);
                }}
              />
            </View>
          </View>
        </ScrollView>

        <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.solidCTA, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {}
              setShowNotificationsSheet(false);
            }}
          >
            <Text style={[styles.solidCTAText, { color: colors.primaryForeground }]}>Save Preferences</Text>
          </TouchableOpacity>
        </View>
      </ScoopedBottomSheet>

      {/* ── WHAT'S NEW BOTTOM SHEET ── */}
      <ScoopedBottomSheet
        visible={showWhatsNewSheet}
        onClose={() => setShowWhatsNewSheet(false)}
        maxHeight="86%"
      >
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.sheetHeaderTitleGroup}>
            <View style={[styles.sheetIconWrap, { backgroundColor: settingIconBg }]}>
              <Feather name="zap" size={18} color={settingIconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>What's New in v2.3.0</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                Performance upgrades & sleek new interface
              </Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12 }}>
            <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.featureIconBadge, { backgroundColor: settingIconBg }]}>
                <Feather name="layout" size={18} color={settingIconColor} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.featureTitle, { color: colors.foreground }]}>Bespoke Bottom Sheets</Text>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                  All bank account, user profile, and preference modals now use our signature scooped sheet design.
                </Text>
              </View>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.featureIconBadge, { backgroundColor: settingIconBg }]}>
                <Feather name="credit-card" size={18} color={settingIconColor} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.featureTitle, { color: colors.foreground }]}>Default UPI App Auto-Binding</Text>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                  Bind default payment apps directly to your bank accounts for one-tap automated bulk IPO bidding.
                </Text>
              </View>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.featureIconBadge, { backgroundColor: settingIconBg }]}>
                <Feather name="trending-up" size={18} color={settingIconColor} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.featureTitle, { color: colors.foreground }]}>Live Broker LTP Sync</Text>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                  Automatic Upstox quotes and real-time market valuations for your held shares.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.solidCTA, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => setShowWhatsNewSheet(false)}
          >
            <Text style={[styles.solidCTAText, { color: colors.primaryForeground }]}>Got it</Text>
          </TouchableOpacity>
        </View>
      </ScoopedBottomSheet>

      {/* ── PRIVACY POLICY BOTTOM SHEET ── */}
      <ScoopedBottomSheet
        visible={showPrivacySheet}
        onClose={() => setShowPrivacySheet(false)}
        maxHeight="86%"
      >
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.sheetHeaderTitleGroup}>
            <View style={[styles.sheetIconWrap, { backgroundColor: settingIconBg }]}>
              <Feather name="shield" size={18} color={settingIconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Privacy Policy</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                Your data stays private and safe
              </Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 14 }}>
            <View style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.legalCardTitle, { color: colors.foreground }]}>1. Local-First Architecture</Text>
              <Text style={[styles.legalCardText, { color: colors.mutedForeground }]}>
                All your IPO applications, PAN numbers, user profiles, and portfolio details are stored locally in SQLite on your device. We do not sell or monetize personal data.
              </Text>
            </View>

            <View style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.legalCardTitle, { color: colors.foreground }]}>2. Optional Encrypted Cloud Sync</Text>
              <Text style={[styles.legalCardText, { color: colors.mutedForeground }]}>
                Cloud synchronization to Google Cloud Firestore is strictly opt-in and bound to your authenticated user account.
              </Text>
            </View>

            <View style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.legalCardTitle, { color: colors.foreground }]}>3. Official Broker OAuth Protocols</Text>
              <Text style={[styles.legalCardText, { color: colors.mutedForeground }]}>
                IPOVault connects via official broker APIs. We never request, store, or log your broker passwords or trading PINs.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.solidCTA, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => setShowPrivacySheet(false)}
          >
            <Text style={[styles.solidCTAText, { color: colors.primaryForeground }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </ScoopedBottomSheet>

      {/* ── TERMS OF SERVICE BOTTOM SHEET ── */}
      <ScoopedBottomSheet
        visible={showTermsSheet}
        onClose={() => setShowTermsSheet(false)}
        maxHeight="86%"
      >
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.sheetHeaderTitleGroup}>
            <View style={[styles.sheetIconWrap, { backgroundColor: settingIconBg }]}>
              <Feather name="file-text" size={18} color={settingIconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Terms of Service</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                Usage guidelines & terms
              </Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 14 }}>
            <View style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.legalCardTitle, { color: colors.foreground }]}>1. Personal Portfolio Tracker</Text>
              <Text style={[styles.legalCardText, { color: colors.mutedForeground }]}>
                IPOVault is designed as a personal utility for tracking multi-account IPO applications, mandates, and allotments.
              </Text>
            </View>

            <View style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.legalCardTitle, { color: colors.foreground }]}>2. Financial Disclaimer</Text>
              <Text style={[styles.legalCardText, { color: colors.mutedForeground }]}>
                Information provided within the app does not constitute financial or investment advice. Always evaluate IPO prospectuses independently.
              </Text>
            </View>

            <View style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.legalCardTitle, { color: colors.foreground }]}>3. Data Responsibility</Text>
              <Text style={[styles.legalCardText, { color: colors.mutedForeground }]}>
                You are responsible for regularly exporting backups and safeguarding your device credentials.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.solidCTA, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => setShowTermsSheet(false)}
          >
            <Text style={[styles.solidCTAText, { color: colors.primaryForeground }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </ScoopedBottomSheet>

      {/* ── OPEN SOURCE LICENSES BOTTOM SHEET ── */}
      <ScoopedBottomSheet
        visible={showLicensesSheet}
        onClose={() => setShowLicensesSheet(false)}
        maxHeight="86%"
      >
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.sheetHeaderTitleGroup}>
            <View style={[styles.sheetIconWrap, { backgroundColor: settingIconBg }]}>
              <Feather name="code" size={18} color={settingIconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Open Source Software</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                Third-party packages & licenses
              </Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.legalCardTitle, { color: colors.foreground }]}>Open Source Credits</Text>
            <Text style={[styles.legalCardText, { color: colors.mutedForeground, lineHeight: 20 }]}>
              IPOVault is powered by React Native, Expo, SQLite, Firebase, Reanimated, and open-source contributions from the global developer community.{'\n\n'}
              All dependent packages are used in compliance with their respective MIT and Apache 2.0 licenses.
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.solidCTA, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => setShowLicensesSheet(false)}
          >
            <Text style={[styles.solidCTAText, { color: colors.primaryForeground }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </ScoopedBottomSheet>

      {/* ── AD-FREE PREMIUM & MONETIZATION SHEET ── */}
      <ScoopedBottomSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        maxHeight="86%"
      >
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.sheetHeaderTitleGroup}>
            <View style={[styles.sheetIconWrap, { backgroundColor: settingIconBg }]}>
              <Feather name="zap" size={18} color={settingIconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>IPOVault Ad-Free</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                {isPremium ? 'Active Subscription (Ad-Free Mode)' : 'Uninterrupted IPO tracking experience'}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 14 }}>
            {/* Feature Highlights */}
            <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.featureIconBadge, { backgroundColor: settingIconBg }]}>
                <Feather name="shield" size={18} color={settingIconColor} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.featureTitle, { color: colors.foreground }]}>Zero Advertisements</Text>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                  All banner ads and sponsored native cards are suppressed throughout IPO Hub and IPO browsing lists.
                </Text>
              </View>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.featureIconBadge, { backgroundColor: settingIconBg }]}>
                <Feather name="cpu" size={18} color={settingIconColor} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.featureTitle, { color: colors.foreground }]}>Preserved Offline Performance</Text>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                  Offline SQLite operations, Firestore sync, and broker LTP monitoring run cleanly without ad request latency.
                </Text>
              </View>
            </View>

            {/* Development Mock Entitlement Toggle */}
            <View style={[styles.featureCard, { backgroundColor: colors.card, borderColor: '#8B5CF6' }]}>
              <View style={[styles.featureIconBadge, { backgroundColor: settingIconBg }]}>
                <Feather name="toggle-right" size={18} color={settingIconColor} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.featureTitle, { color: colors.foreground }]}>Development Mock State</Text>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                  Toggle ad-free suppression on/off for instant UI validation. No fake purchases are processed.
                </Text>
              </View>
              <IOSToggle
                value={isPremium}
                onValueChange={async () => {
                  try {
                    Haptics.selectionAsync();
                  } catch {}
                  await toggleDevMockPremium();
                }}
                activeColor="#10B981"
              />
            </View>

            {/* Future Google Play Billing Architecture Notice */}
            <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.featureIconBadge, { backgroundColor: settingIconBg }]}>
                <Feather name="shopping-bag" size={18} color={settingIconColor} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.featureTitle, { color: colors.foreground }]}>Google Play Billing (Upcoming)</Text>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                  Official in-app purchases and auto-renewing subscriptions will be wired up via Google Play Developer API in a future release.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.solidCTA, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => setShowPremiumSheet(false)}
          >
            <Text style={[styles.solidCTAText, { color: colors.primaryForeground }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </ScoopedBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    height: 56,
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
    fontSize: 30,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.8,
    lineHeight: 34,
  },

  // ── Hero Profile Card (Matches App Card Architecture) ──
  heroProfileCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  heroProfileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 6,
  },
  heroAvatarContainer: {
    position: 'relative',
  },
  heroAvatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroAvatarImage: {
    width: '100%',
    height: '100%',
  },
  heroAvatarText: {
    fontSize: 21,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  heroProfileInfo: {
    flex: 1,
    gap: 3,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroName: {
    fontSize: 16.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
  },
  statusDotGreen: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  heroEmail: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  topCardActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  topEditProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 13,
    borderRadius: 9999,
    backgroundColor: '#000000',
  },
  topEditProfileText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },

  // ── Bottom Log Out Button ──
  logoutSectionWrap: {
    marginTop: 10,
    marginBottom: 8,
  },
  bottomLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 9999,
    gap: 8,
    backgroundColor: '#EF4444',
  },
  bottomLogoutText: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },

  // ── Edit Profile Sheet Styles ──
  editProfileSheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  editHeroAvatarSection: {
    alignItems: 'center',
    marginBottom: 22,
    marginTop: 4,
  },
  editAvatarOuterRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    padding: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarMainCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  editAvatarLargeImage: {
    width: '100%',
    height: '100%',
  },
  editAvatarLargeInitial: {
    fontSize: 34,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  editAvatarCameraPill: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  editPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  editPillBtnText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  editEmailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
  },
  editEmailBadgeText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  editSectionGroup: {
    marginBottom: 18,
  },
  editSectionTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingLeft: 2,
    textTransform: 'uppercase',
  },
  editInputCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  editInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    gap: 10,
  },
  editInputIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTextInput: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  editInputHint: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 15,
    paddingLeft: 2,
  },
  changePasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  changePasswordIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePasswordTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.1,
  },
  changePasswordSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1.5,
  },
  changePasswordActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  changePasswordActionText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#F59E0B',
  },

  // ── Compact KPI Grid ──
  compactKpiGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  compactKpiTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 13,
    borderWidth: 1,
    gap: 7,
  },
  compactKpiIconWrap: {
    width: 27,
    height: 27,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactKpiTextWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 0.5,
  },
  compactKpiValue: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  compactKpiLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
    lineHeight: 11,
  },

  // ── Sections & Clean Grouped Cards ──
  sectionWrap: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardGroup: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // ── Setting Row ──
  navItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 13,
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
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navItemTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.1,
  },
  navItemSubtitle: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 15,
  },
  inlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  badgeText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
  },
  chevronWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Sheet Components ──
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  sheetHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    lineHeight: 16,
  },
  sheetScroll: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 12,
  },
  sheetRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowText: {
    flex: 1,
    gap: 1.5,
  },
  sheetRowTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.1,
  },
  sheetRowDesc: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  sheetFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  solidCTA: {
    height: 48,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidCTAText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.1,
  },

  // ── Whats New & Legal Sheets ──
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  featureIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  featureDesc: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },
  legalCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  legalCardTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  legalCardText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
});
