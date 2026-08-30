import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '@/sync/supabase';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/context/DialogContext';
import { IconButton } from '@/components/ui/IconButton';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const { showError } = useDialog();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  function handleNavigateHome() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }

  useEffect(() => {
    if (user) {
      handleNavigateHome();
    }
  }, [user]);

  async function signInWithGoogle() {
    setLoading(true);
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
        setLoading(false);
        return;
      }

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        WebBrowser.dismissBrowser();

        if (res.type === 'success') {
          const { url } = res;
          const { params, errorCode } = QueryParams.getQueryParams(url);

          if (errorCode) throw new Error(errorCode);

          if (params?.code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(params.code);
            if (sessionError) throw sessionError;
            handleNavigateHome();
          } else if (params?.access_token && params?.refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
            if (sessionError) throw sessionError;
            handleNavigateHome();
          } else {
            showError('Auth Error', 'No session tokens returned in response.');
          }
        }
      }
    } catch (err: any) {
      showError('Google Sign-In Failed', err?.message || 'Failed to complete Google Sign-In');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={handleNavigateHome}
        />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>IPOVault</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Authentication</Text>
        </View>
        <View style={{ width: 44, height: 44 }} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
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
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="globe" size={20} color="#FFFFFF" style={styles.googleIcon} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
            Secured by Supabase Authentication & Google OAuth
          </Text>
        </View>
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
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
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
    paddingTop: 48,
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
});
