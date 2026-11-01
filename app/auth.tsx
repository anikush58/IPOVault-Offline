import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import defaultColors from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/context/DialogContext';
import { IconButton } from '@/components/ui/IconButton';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { useAppExperience } from '@/context/AppExperienceContext';
import {
  userEntitlementService,
  UserEntitlementState,
} from '@/services/user/userEntitlementService';
import { appExperienceService } from '@/services/experience/appExperienceService';
import { AutoStatusBar } from '@/components/ui/AutoStatusBar';

/**
 * IPOVault Brand Logo Icon (Uses app icon image asset)
 */
function IPOVaultBrandLogo({ isSmallScreen }: { isSmallScreen?: boolean }) {
  const logoSize = isSmallScreen ? 108 : 136;
  const logoRadius = isSmallScreen ? 28 : 36;
  return (
    <View style={[styles.brandContainer, isSmallScreen && { marginTop: -25, marginBottom: 14 }]}>
      <Image
        source={require('@/assets/images/auth-brand-logo.png')}
        style={[styles.brandIconImage, { width: logoSize, height: logoSize, borderRadius: logoRadius }]}
        resizeMode="contain"
      />
      <Text style={[styles.brandLabel, { color: '#0F172A' }]}>
        IPOVAULT
      </Text>
    </View>
  );
}

/**
 * Polished Emerald Security Shield Icon with Checkmark
 */
function SecurityShieldIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Defs>
        <SvgLinearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#10B981" />
          <Stop offset="100%" stopColor="#059669" />
        </SvgLinearGradient>
      </Defs>
      <Path
        d="M10 1.5L3.5 4.5V9.5C3.5 14 6.3 17.5 10 18.5C13.7 17.5 16.5 14 16.5 9.5V4.5L10 1.5Z"
        fill="url(#shieldGrad)"
      />
      <Path
        d="M6.8 9.8L8.8 11.8L13.2 7.2"
        stroke="#FFFFFF"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Official Google Multi-color Logo Vector
 */
function GoogleLogoSvg({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </Svg>
  );
}

export default function AuthScreen() {
  const isDark = false;
  const colors = defaultColors.light;
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { user, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth();
  const insets = useSafeAreaInsets();
  const { showError, showSuccess } = useDialog();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isSmallScreen = windowHeight < 720;
  const isNarrow = windowWidth < 360;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dismiss native splash as soon as Auth screen is rendered
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const topPad = Platform.OS === 'web' ? 24 : insets.top;
  const hasNavigatedRef = React.useRef(false);
  const { isNonPro } = useAppExperience();

  const handleNavigateReturn = React.useCallback(
    async (overrideEnt?: UserEntitlementState) => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      if (params.returnTo) {
        router.replace(params.returnTo as any);
        return;
      }
      try {
        let ent = overrideEnt;
        if (!ent) {
          ent = await userEntitlementService.resolveEntitlementForLogin({
            uid: user?.uid,
            email: user?.email || email.trim() || null,
            username: user?.displayName || null,
          });
        }
        if (ent.isPro) {
          await appExperienceService.setExperienceMode('pro').catch(() => {});
          router.replace('/(tabs)' as any);
        } else {
          await appExperienceService.setExperienceMode('non_pro').catch(() => {});
          router.replace('/(tabs)/ipos' as any);
        }
      } catch {
        if (isNonPro) {
          router.replace('/(tabs)/ipos' as any);
        } else {
          router.replace('/(tabs)' as any);
        }
      }
    },
    [params.returnTo, router, isNonPro, user, email]
  );

  useEffect(() => {
    if (!user || hasNavigatedRef.current) return;
    if (loadingAction) return; // Allow manual action to finish resolving entitlement
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    handleNavigateReturn();
  }, [user, handleNavigateReturn, loadingAction]);

  const handleSignIn = async () => {
    setErrorMessage(null);
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setLoadingAction('Signing in…');
    try {
      const res = await signInWithEmail(email.trim(), password);
      if (res.error) {
        setErrorMessage(res.error);
        showError('Sign In Failed', res.error);
      } else {
        const resolvedEnt = await userEntitlementService.resolveEntitlementForLogin({
          uid: res.user?.uid,
          email: email.trim(),
          username: res.user?.displayName,
        });
        await handleNavigateReturn(resolvedEnt);
      }
    } catch (err: any) {
      const msg = err?.message || 'Authentication failed. Please try again.';
      setErrorMessage(msg);
      showError('Authentication Error', msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCreateAccount = async () => {
    setErrorMessage(null);
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setLoadingAction('Creating account…');
    try {
      const res = await signUpWithEmail(email.trim(), password);
      if (res.error) {
        setErrorMessage(res.error);
        showError('Registration Failed', res.error);
      } else {
        const resolvedEnt = await userEntitlementService.resolveEntitlementForLogin({
          uid: res.user?.uid,
          email: email.trim(),
          username: res.user?.displayName,
        });
        await handleNavigateReturn(resolvedEnt);
      }
    } catch (err: any) {
      const msg = err?.message || 'Authentication failed. Please try again.';
      setErrorMessage(msg);
      showError('Authentication Error', msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setLoadingAction('Connecting with Google…');
    try {
      const res = await signInWithGoogle();
      if (res.error) {
        if (!res.error.toLowerCase().includes('cancel')) {
          setErrorMessage(res.error);
          showError('Google Sign-In Failed', res.error);
        }
      } else {
        const resolvedEnt = await userEntitlementService.resolveEntitlementForLogin({
          uid: res.user?.uid,
          email: res.user?.email,
          username: res.user?.displayName,
        });
        await handleNavigateReturn(resolvedEnt);
      }
    } catch (err: any) {
      const msg = err?.message || 'Google Sign-In failed.';
      setErrorMessage(msg);
      showError('Google Sign-In Error', msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendResetEmail = async () => {
    if (!resetEmail.trim()) {
      showError('Reset Password', 'Please enter your email address to receive reset instructions.');
      return;
    }
    setResetLoading(true);
    try {
      const res = await resetPassword(resetEmail.trim());
      if (res.error) {
        showError('Password Reset Failed', res.error);
      } else {
        setShowForgotModal(false);
        showSuccess(
          'Check Your Inbox',
          `Password reset link has been sent to ${resetEmail.trim()}. Please check your email to create a new password.`,
        );
        setResetEmail('');
      }
    } catch (err: any) {
      showError('Reset Error', err?.message || 'Failed to send password reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Auto-adjusting Status Bar: Automatically detects light background and applies dark content */}
      <AutoStatusBar backgroundColor="#F9FBFE" />

      {/* Full-Screen Ambient Background Asset */}
      <Image
        source={require('@/assets/images/auth-bg.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Top Bar for Back Navigation */}
      <View style={[styles.topBar, { top: topPad + 8 }]}>
        {params.returnTo ? (
          <IconButton
            name="chevron-left"
            variant="surface"
            size="md"
            onPress={handleNavigateReturn}
            disabled={loadingAction !== null}
          />
        ) : (
          <View />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(topPad + 12, isSmallScreen ? 20 : 36) + (isSmallScreen ? 20 : 50),
            paddingHorizontal: isNarrow ? 16 : 24,
            paddingBottom: Math.max(insets.bottom + 24, 48),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          {/* Brand Header */}
          <IPOVaultBrandLogo isSmallScreen={isSmallScreen} />

          <View style={[styles.titleContainer, isSmallScreen && { marginBottom: 24 }]}>
            <Text
              style={[
                styles.headerTitle,
                { color: colors.foreground },
                isSmallScreen && { fontSize: 23, lineHeight: 29 },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              Welcome to IPOVault
            </Text>
            <Text
              style={[
                styles.headerSubtitle,
                { color: colors.mutedForeground },
                isSmallScreen && { fontSize: 12.5, lineHeight: 17 },
              ]}
            >
              Sign in or create an account to manage your IPO portfolio, track applications and more.
            </Text>
          </View>

          {/* Error Message Banner */}
          {errorMessage ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
                },
              ]}
            >
              <Feather name="alert-circle" size={16} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={[styles.errorBannerText, { color: '#EF4444' }]}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Email Address Field */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              EMAIL ADDRESS
            </Text>
            <View
              style={[
                styles.inputWrap,
                {
                  backgroundColor: isDark ? '#1A202C' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                },
              ]}
            >
              <Feather name="mail" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: colors.foreground }]}
                placeholder="name@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password Field */}
          <View style={styles.fieldGroup}>
            <View style={styles.passwordLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
                PASSWORD
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setResetEmail(email);
                  setShowForgotModal(true);
                }}
                hitSlop={8}
              >
                <Text style={[styles.forgotText, { color: colors.primary }]}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.inputWrap,
                {
                  backgroundColor: isDark ? '#1A202C' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                },
              ]}
            >
              <Feather name="lock" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: colors.foreground }]}
                placeholder="Enter your password"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={10}
                style={styles.eyeButton}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Dual Action Buttons: Create Account (First) & Sign In (Second), side by side, half half */}
          <View style={[styles.ctaRow, isNarrow && { gap: 8 }, isSmallScreen && { marginTop: 14, marginBottom: 24 }]}>
            <TouchableOpacity
              style={[
                styles.ctaButton,
                styles.createAccountButton,
                isNarrow && { paddingHorizontal: 6 },
                {
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(15, 23, 42, 0.5)',
                },
              ]}
              onPress={handleCreateAccount}
              disabled={loadingAction !== null}
              activeOpacity={0.85}
            >
              {loadingAction === 'Creating account…' ? (
                <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#0F172A'} />
              ) : (
                <Text
                  style={[
                    styles.createAccountButtonText,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                    isNarrow && { fontSize: 13.5 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.ctaButton,
                styles.signInButton,
                isNarrow && { paddingHorizontal: 6 },
                {
                  backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
                },
              ]}
              onPress={handleSignIn}
              disabled={loadingAction !== null}
              activeOpacity={0.88}
            >
              {loadingAction === 'Signing in…' ? (
                <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
              ) : (
                <Text
                  style={[
                    styles.signInButtonText,
                    { color: isDark ? '#000000' : '#FFFFFF' },
                    isNarrow && { fontSize: 13.5 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Sign In
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Or Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
              OR CONTINUE WITH GOOGLE
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]} />
          </View>

          {/* Native Google Sign-In Button */}
          <TouchableOpacity
            style={[
              styles.googleButton,
              {
                backgroundColor: isDark ? '#1E232D' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
              },
            ]}
            onPress={handleGoogleSignIn}
            disabled={loadingAction !== null}
            activeOpacity={0.85}
          >
            {loadingAction === 'Connecting with Google…' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <GoogleLogoSvg size={20} />
                <Text
                  style={[
                    styles.googleButtonText,
                    { color: colors.foreground },
                    isNarrow && { fontSize: 13.5 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Subtle Security Badge */}
          <View style={styles.securityRow}>
            <SecurityShieldIcon size={16} />
            <Text style={[styles.disclaimerText, { color: colors.mutedForeground, marginLeft: 4 }]}>
              Secured by Firebase Authentication & Google Identity Services
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowForgotModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconWrap, { backgroundColor: colors.primary + '18' }]}>
                <Feather name="key" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Reset Password</Text>
              <TouchableOpacity
                onPress={() => setShowForgotModal(false)}
                hitSlop={10}
                style={styles.modalClose}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Enter your registered email address. We will send you a secure link to reset your password.
            </Text>

            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="mail" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: colors.foreground }]}
                placeholder="name@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={resetEmail}
                onChangeText={setResetEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <TouchableOpacity
              style={[styles.resetSubmitButton, { backgroundColor: colors.primary }]}
              onPress={handleSendResetEmail}
              disabled={resetLoading}
              activeOpacity={0.8}
            >
              {resetLoading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.resetSubmitButtonText, { color: colors.primaryForeground }]}>
                  Send Reset Link
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 60,
    alignItems: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginTop: -50,
    marginBottom: 20,
  },
  brandIconImage: {
    width: 136,
    height: 136,
    borderRadius: 36,
    marginBottom: 7,
  },
  brandLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 2.2,
    textAlign: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 42,
  },
  headerTitle: {
    fontSize: 27,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.6,
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: 11,
  },
  headerSubtitle: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
    flex: 1,
    lineHeight: 18,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginTop: 20,
    marginBottom: 33,
  },
  ctaButton: {
    flex: 1,
    height: 52,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  createAccountButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  createAccountButtonText: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  signInButton: {
    borderWidth: 0,
  },
  signInButtonText: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  googleButton: {
    flexDirection: 'row',
    height: 52,
    width: '100%',
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 33,
  },
  googleButtonText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginHorizontal: 12,
    letterSpacing: 0.8,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 7,
  },
  forgotText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 11,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    height: '100%',
  },
  eyeButton: {
    padding: 6,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  disclaimerText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    flex: 1,
  },
  modalClose: {
    padding: 4,
  },
  modalDesc: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 19,
    marginBottom: 16,
  },
  resetSubmitButton: {
    height: 48,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  resetSubmitButtonText: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 15,
  },
});
