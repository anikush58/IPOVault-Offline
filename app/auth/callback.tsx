import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/sync/supabase';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import * as QueryParams from 'expo-auth-session/build/QueryParams';

export default function AuthCallbackScreen() {
  const colors = useColors();
  const router = useRouter();
  const url = Linking.useURL();
  const { showError } = useDialog();

  useEffect(() => {
    async function handleSessionFromUrl(targetUrl: string) {
      try {
        const { params, errorCode } = QueryParams.getQueryParams(targetUrl);

        if (errorCode) {
          throw new Error(errorCode);
        }

        if (params?.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
        } else if (params?.access_token && params?.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) throw error;
        }
      } catch (err: any) {
        console.error('[OAuth Callback] Error handling session:', err);
        showError('Sign In Failed', err?.message || 'Unable to process authentication response');
      } finally {
        router.replace('/(tabs)');
      }
    }

    if (url) {
      handleSessionFromUrl(url);
    } else {
      // Fallback check: if session already exists, proceed to tabs
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace('/(tabs)');
        } else {
          router.replace('/auth');
        }
      });
    }
  }, [url]);

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
