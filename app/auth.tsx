import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/sync/supabase';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/context/DialogContext';
import { IconButton } from '@/components/ui/IconButton';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { showError } = useDialog();

  const [authState, setAuthState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [authMessage, setAuthMessage] = useState('Connecting to Google...');
  const [userEmail, setUserEmail] = useState('');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const hasNavigatedRef = React.useRef(false);

  const handleNavigateReturn = React.useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    const target = (params.returnTo as string) || '/(tabs)/settings';
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(target as any);
    }
  }, [params.returnTo, router]);

  useEffect(() => {
    if (user && authState === 'idle') {
      setUserEmail(user.email || '');
      setAuthState('success');
      setAuthMessage('Authentication Successful!');
      const t = setTimeout(() => {
        handleNavigateReturn();
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [user, authState, handleNavigateReturn]);

  async function signInWithGoogle() {
    setAuthState('loading');
    setAuthMessage('Connecting to Google...');

    const redirectTo = makeRedirectUri({
      scheme: 'ipovault',
      path: 'auth/callback',
    });

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        showError('Google Sign-In Failed', error.message);
        setAuthState('idle');
        return;
      }

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        WebBrowser.dismissBrowser();

        if (res.type === 'success') {
          setAuthMessage('Verifying account & setting up session...');
          const { url } = res;
          const { params: urlParams, errorCode } = QueryParams.getQueryParams(url);

          if (errorCode) throw new Error(errorCode);

          let activeUser = null;
          if (urlParams?.code) {
            const { data: sessData, error: sessionError } = await supabase.auth.exchangeCodeForSession(urlParams.code);
            if (sessionError) throw sessionError;
            activeUser = sessData?.user || sessData?.session?.user;
          } else if (urlParams?.access_token && urlParams?.refresh_token) {
            const { data: sessData, error: sessionError } = await supabase.auth.setSession({
              access_token: urlParams.access_token,
              refresh_token: urlParams.refresh_token,
            });
            if (sessionError) throw sessionError;
            activeUser = sessData?.user || sessData?.session?.user;
          } else {
            const { data: fallbackData } = await supabase.auth.getSession();
            activeUser = fallbackData?.session?.user;
          }

          const resolvedEmail = activeUser?.email || user?.email || 'Google User';
          setUserEmail(resolvedEmail);
          setAuthState('success');
          setAuthMessage('Authentication Successful!');
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

          setTimeout(() => {
            handleNavigateReturn();
          }, 1200);
        } else {
          setAuthState('idle');
        }
      } else {
        setAuthState('idle');
      }
    } catch (err: any) {
      showError('Google Sign-In Failed', err?.message || 'Failed to complete Google Sign-In');
      setAuthState('idle');
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={handleNavigateReturn}
          disabled={authState !== 'idle'}
        />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>IPOVault</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Authentication</Text>
        </View>
        <View style={{ width: 44, height: 44 }} />
      </View>

      {/* Main Content Body */}
      <View style={styles.content}>
        {authState === 'loading' && (
          <View style={styles.stateCenterContainer}>
            <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.spinnerBadge, { backgroundColor: colors.primary + '15' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>
                Signing In
              </Text>
              <Text style={[styles.stateSubtitle, { color: colors.mutedForeground }]}>
                {authMessage}
              </Text>
            </View>
          </View>
        )}

        {authState === 'success' && (
          <View style={styles.stateCenterContainer}>
            <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: '#10B98150' }]}>
              <View style={styles.successBadge}>
                <Feather name="check" size={36} color="#FFFFFF" />
              </View>
              <Text style={[styles.successTitle, { color: colors.foreground }]}>
                Authentication Successful!
              </Text>
              {userEmail ? (
                <Text style={[styles.userEmailText, { color: colors.primary }]}>
                  Signed in as {userEmail}
                </Text>
              ) : null}
              <Text style={[styles.returningText, { color: colors.mutedForeground }]}>
                Returning to settings…
              </Text>
            </View>
          </View>
        )}

        {authState === 'idle' && (
          <>
            <View style={styles.heroSection}>
              <LinearGradient
                colors={[colors.primary + '33', colors.primary + '0A']}
                style={styles.logoBadge}
              >
                <Feather name="trending-up" size={42} color={colors.primary} />
              </LinearGradient>

              <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
                Welcome to IPOVault
              </Text>
              <Text style={[styles.welcomeSubtitle, { color: colors.mutedForeground }]}>
                Sign in with your Google account to sync your IPO applications, bank accounts, and family profiles seamlessly.
              </Text>
            </View>

            {/* Action Section */}
            <View style={styles.actionSection}>
              <TouchableOpacity
                style={[styles.googleButton, { backgroundColor: colors.primary }]}
                onPress={signInWithGoogle}
                activeOpacity={0.8}
              >
                <Feather name="globe" size={20} color={colors.primaryForeground} style={styles.googleIcon} />
                <Text style={[styles.googleButtonText, { color: colors.primaryForeground }]}>Continue with Google</Text>
              </TouchableOpacity>

              <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
                Secured by Supabase Authentication & Google OAuth
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  welcomeTitle: {
    fontSize: 26,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  actionSection: {
    width: '100%',
    alignItems: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    height: 54,
    width: '100%',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  disclaimerText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 18,
  },
  stateCenterContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  spinnerBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
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
  stateTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  stateSubtitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 20,
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
});
