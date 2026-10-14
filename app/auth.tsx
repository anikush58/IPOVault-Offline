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
} from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import { useDialog } from '@/context/DialogContext';
import { IconButton } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';

import { ThemeToggle } from '@/components/onboarding/ThemeToggle';

/**
 * IPOVault Brand Logo Icon (Uses app icon image asset)
 */
function IPOVaultBrandLogo({ isDark }: { isDark: boolean }) {
  return (
    <View style={styles.brandContainer}>
      <Image
        source={
          isDark
            ? require('@/assets/images/auth-brand-logo-dark.png')
            : require('@/assets/images/auth-brand-logo.png')
        }
        style={styles.brandIconImage}
        resizeMode="contain"
      />
      <Text
        style={[
          styles.brandLabel,
          { color: isDark ? 'rgba(255, 255, 255, 0.9)' : '#0F172A' },
        ]}
      >
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
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { user, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth();
  const { restoreCloudData } = useDB();
  const insets = useSafeAreaInsets();
  const { showError, showSuccess } = useDialog();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
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

  const handleNavigateReturn = React.useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    const target = (params.returnTo as string) || '/(tabs)';
    router.replace(target as any);
  }, [params.returnTo, router]);

  useEffect(() => {
    if (!user || hasNavigatedRef.current) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    handleNavigateReturn();
  }, [user, handleNavigateReturn]);

  const handleEmailAuth = async () => {
    setErrorMessage(null);
    if (mode === 'signup' && !fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setLoadingAction(mode === 'signin' ? 'Signing in…' : 'Creating account…');
    try {
      const res =
        mode === 'signin'
          ? await signInWithEmail(email.trim(), password)
          : await signUpWithEmail(email.trim(), password, fullName.trim());

      if (res.error) {
        setErrorMessage(res.error);
        showError(mode === 'signin' ? 'Sign In Failed' : 'Registration Failed', res.error);
      } else {
        handleNavigateReturn();
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
        handleNavigateReturn();
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
      {/* Full-Screen Ambient Background Asset */}
      <Image
        source={
          isDark
            ? require('@/assets/images/auth-bg-dark.png')
            : require('@/assets/images/auth-bg.png')
        }
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Top Bar for Back Navigation & Theme Toggle */}
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
        <ThemeToggle />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(topPad + 16, 36) + 100 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          {/* Brand Header */}
          <IPOVaultBrandLogo isDark={isDark} />

          <View style={styles.titleContainer}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
              {mode === 'signin'
                ? 'Sign in to manage your IPO portfolio,\ntrack applications and more.'
                : 'Sign up to manage your IPO portfolio,\ntrack applications and more.'}
            </Text>
          </View>

          {/* Mode Switcher Tabs (Matches App Tab Style) */}
          <View style={styles.tabWrapper}>
            <Tabs<'signin' | 'signup'>
              variant="pills"
              height={38}
              tabs={[
                { key: 'signin', label: 'Sign In' },
                { key: 'signup', label: 'Create Account' },
              ]}
              activeTab={mode}
              onChange={(newMode) => {
                setMode(newMode);
                setErrorMessage(null);
              }}
              textStyle={{ fontSize: 13 }}
            />
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

          {/* Full Name Field (Sign Up) */}
          {mode === 'signup' && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                FULL NAME
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
                <Feather name="user" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, { color: colors.foreground }]}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.mutedForeground}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </View>
            </View>
          )}

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
              {mode === 'signin' && (
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
              )}
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
                placeholder={mode === 'signup' ? 'Minimum 6 characters' : 'Enter your password'}
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

          {/* Submit Action Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
              },
            ]}
            onPress={handleEmailAuth}
            disabled={loadingAction !== null}
            activeOpacity={0.88}
          >
            {loadingAction && loadingAction !== 'Connecting with Google…' ? (
              <ActivityIndicator
                size="small"
                color={isDark ? '#000000' : '#FFFFFF'}
              />
            ) : (
              <Text
                style={[
                  styles.submitButtonText,
                  { color: isDark ? '#000000' : '#FFFFFF' },
                ]}
              >
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Or Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
              {mode === 'signin' ? 'OR CONTINUE WITH GOOGLE' : 'OR SIGN UP WITH GOOGLE'}
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
                <Text style={[styles.googleButtonText, { color: colors.foreground }]}>
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
                <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>
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
    paddingBottom: 40,
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
    marginBottom: 54,
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
  tabWrapper: {
    marginBottom: 20,
    width: '100%',
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
  googleButton: {
    flexDirection: 'row',
    height: 52,
    width: '100%',
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 22,
  },
  googleButtonText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
    height: 50,
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
  submitButton: {
    height: 52,
    width: '100%',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
  submitButtonText: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 15.5,
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
});
