import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/sync/supabase';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import * as QueryParams from 'expo-auth-session/build/QueryParams';

export default function AuthCallbackScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const url = Linking.useURL();
  const { showError } = useDialog();

  const [state, setState] = useState<'loading' | 'success'>('loading');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function handleSessionFromUrl(targetUrl: string) {
      const target = (params.returnTo as string) || '/(tabs)/settings';
      try {
        const { params: urlParams, errorCode } = QueryParams.getQueryParams(targetUrl);

        if (errorCode) {
          throw new Error(errorCode);
        }

        let email = '';
        if (urlParams?.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(urlParams.code);
          if (error) throw error;
          email = data?.user?.email || data?.session?.user?.email || '';
        } else if (urlParams?.access_token && urlParams?.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: urlParams.access_token,
            refresh_token: urlParams.refresh_token,
          });
          if (error) throw error;
          email = data?.user?.email || data?.session?.user?.email || '';
        } else {
          const { data } = await supabase.auth.getSession();
          email = data?.session?.user?.email || '';
        }

        if (isMounted) {
          setUserEmail(email);
          setState('success');
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          setTimeout(() => {
            router.replace(target as any);
          }, 1200);
        }
      } catch (err: any) {
        console.error('[OAuth Callback] Error handling session:', err);
        if (isMounted) {
          showError('Sign In Failed', err?.message || 'Unable to process authentication response');
          router.replace({ pathname: '/auth', params: { returnTo: target } });
        }
      }
    }

    if (url) {
      handleSessionFromUrl(url);
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!isMounted) return;
        const target = (params.returnTo as string) || '/(tabs)/settings';
        if (session) {
          setUserEmail(session.user?.email || '');
          setState('success');
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          setTimeout(() => {
            router.replace(target as any);
          }, 1200);
        } else {
          router.replace({ pathname: '/auth', params: { returnTo: target } });
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [url, params.returnTo, router, showError]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {state === 'loading' ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={[styles.title, { color: colors.foreground }]}>Completing Sign-In</Text>
            <Text style={[styles.subText, { color: colors.mutedForeground }]}>Verifying Google credentials…</Text>
          </>
        ) : (
          <>
            <View style={styles.successBadge}>
              <Feather name="check" size={32} color="#FFFFFF" />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Authentication Successful!</Text>
            {userEmail ? (
              <Text style={[styles.emailText, { color: colors.primary }]}>Signed in as {userEmail}</Text>
            ) : null}
            <Text style={[styles.subText, { color: colors.mutedForeground }]}>Returning to settings…</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 6,
  },
  subText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#10B981',
    marginBottom: 6,
    textAlign: 'center',
  },
  emailText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginBottom: 10,
    textAlign: 'center',
  },
});
