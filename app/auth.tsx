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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import { useDialog } from '@/context/DialogContext';
import { IconButton } from '@/components/ui/IconButton';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

export default function AuthScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { user, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth();
  const insets = useSafeAreaInsets();
  const { showError, showSuccess } = useDialog();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const { restoreCloudData, users, applications } = useDB();
  const [isRestoringData, setIsRestoringData] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const hasNavigatedRef = React.useRef(false);

  const handleNavigateReturn = React.useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    const target = (params.returnTo as string) || '/(tabs)';
    router.replace(target as any);
  }, [params.returnTo, router]);

  useEffect(() => {
    if (!user || hasNavigatedRef.current) return;

    let isMounted = true;
    const restoreAndNavigate = async () => {
      // If local database is empty, restore from cloud before transitioning
      if (users.length === 0 && applications.length === 0) {
        setIsRestoringData(true);
        try {
          await restoreCloudData(user.id);
        } catch (e) {
          console.warn('[AuthScreen] Restore warning on auth state change:', e);
        } finally {
          if (isMounted) setIsRestoringData(false);
        }
      }

      if (isMounted) {
        setAuthSuccess(true);
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
        setTimeout(() => {
          if (isMounted) handleNavigateReturn();
        }, 400);
      }
    };

    restoreAndNavigate();
    return () => {
      isMounted = false;
    };
  }, [user, users.length, applications.length, restoreCloudData, handleNavigateReturn]);

  const handleEmailAuth = async () => {
    setErrorMessage(null);
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
          : await signUpWithEmail(email.trim(), password);

      if (res.error) {
        setErrorMessage(res.error);
        showError(mode === 'signin' ? 'Sign In Failed' : 'Registration Failed', res.error);
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background },
        ]}
      >
        {params.returnTo ? (
          <IconButton
            name="chevron-left"
            variant="surface"
            size="md"
            onPress={handleNavigateReturn}
            disabled={loadingAction !== null}
          />
        ) : (
          <View style={{ width: 44, height: 44 }} />
        )}
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>IPOVault</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Authentication</Text>
        </View>
        <View style={{ width: 44, height: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {authSuccess || user ? (
          <View style={styles.stateCenterContainer}>
            <View
              style={[
                styles.stateCard,
                { backgroundColor: colors.card, borderColor: '#10B98150' },
              ]}
            >
              <View style={styles.successBadge}>
                {isRestoringData ? (
                  <ActivityIndicator size="large" color="#FFFFFF" />
                ) : (
                  <Feather name="check" size={36} color="#FFFFFF" />
                )}
              </View>
              <Text style={[styles.successTitle, { color: colors.foreground }]}>
                {isRestoringData ? 'Restoring Cloud Data…' : 'Authentication Successful!'}
              </Text>
              {user?.email ? (
                <Text style={[styles.userEmailText, { color: colors.primary }]}>
                  Signed in as {user.email}
                </Text>
              ) : null}
              <Text style={[styles.returningText, { color: colors.mutedForeground }]}>
                {isRestoringData
                  ? 'Syncing your applications, users, and allotments from Cloud Firestore…'
                  : 'Opening your dashboard…'}
              </Text>

              {!isRestoringData && (
                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: colors.primary, marginTop: 20 }]}
                  onPress={handleNavigateReturn}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>
                    Continue to App
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.formContainer}>
            {/* Mode Switcher Tabs */}
            <View
              style={[
                styles.tabTrack,
                {
                  backgroundColor: isDark ? '#1E232D' : '#F1F3F6',
                  borderColor: colors.border,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  mode === 'signin' && {
                    backgroundColor: colors.card,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                  },
                ]}
                onPress={() => {
                  setMode('signin');
                  setErrorMessage(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: mode === 'signin' ? colors.foreground : colors.mutedForeground,
                      fontFamily: mode === 'signin' ? 'GoogleSansFlex_700Bold' : 'GoogleSansFlex_500Medium',
                    },
                  ]}
                >
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabButton,
                  mode === 'signup' && {
                    backgroundColor: colors.card,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                  },
                ]}
                onPress={() => {
                  setMode('signup');
                  setErrorMessage(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: mode === 'signup' ? colors.foreground : colors.mutedForeground,
                      fontFamily: mode === 'signup' ? 'GoogleSansFlex_700Bold' : 'GoogleSansFlex_500Medium',
                    },
                  ]}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error Message Box */}
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

            {/* Native Google Sign-In Button */}
            <TouchableOpacity
              style={[
                styles.googleButton,
                {
                  backgroundColor: isDark ? '#262C36' : '#FFFFFF',
                  borderColor: colors.border,
                },
              ]}
              onPress={handleGoogleSignIn}
              disabled={loadingAction !== null}
              activeOpacity={0.8}
            >
              {loadingAction === 'Connecting with Google…' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Feather name="globe" size={18} color={colors.primary} style={styles.googleIcon} />
                  <Text style={[styles.googleButtonText, { color: colors.foreground }]}>
                    Continue with Google
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Or Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
                or with email
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                EMAIL ADDRESS
              </Text>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
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
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
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
                    backgroundColor: colors.card,
                    borderColor: colors.border,
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
              style={[styles.submitButton, { backgroundColor: colors.primary }]}
              onPress={handleEmailAuth}
              disabled={loadingAction !== null}
              activeOpacity={0.8}
            >
              {loadingAction && loadingAction !== 'Connecting with Google…' ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
              Secured by Firebase Authentication & Google Identity Services
            </Text>
          </View>
        )}
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
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.8,
    lineHeight: 32,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  formContainer: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  tabTrack: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonText: {
    fontSize: 14,
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
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
  },
  googleIcon: {
    marginRight: 10,
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
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 6,
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
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_400Regular',
    height: '100%',
  },
  eyeButton: {
    padding: 4,
  },
  submitButton: {
    height: 52,
    width: '100%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  submitButtonText: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 16,
  },
  disclaimerText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
  stateCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  stateCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#10B981',
  },
  userEmailText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textAlign: 'center',
    marginBottom: 14,
  },
  returningText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
});
