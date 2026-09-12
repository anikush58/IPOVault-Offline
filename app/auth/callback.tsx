import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
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

  useEffect(() => {
    let isMounted = true;

    async function handleSessionFromUrl(targetUrl: string) {
      const target = (params.returnTo as string) || '/(tabs)/settings';
      try {
        const { params: urlParams, errorCode } = QueryParams.getQueryParams(targetUrl);

        if (errorCode) {
          throw new Error(errorCode);
        }

        if (urlParams?.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(urlParams.code);
          if (error) throw error;
        } else if (urlParams?.access_token && urlParams?.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: urlParams.access_token,
            refresh_token: urlParams.refresh_token,
          });
          if (error) throw error;
        }

        if (isMounted) {
          router.replace(target as any);
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
          router.replace(target as any);
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
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.text, { color: colors.foreground }]}>Completing Google Sign-In...</Text>
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
  text: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
});
