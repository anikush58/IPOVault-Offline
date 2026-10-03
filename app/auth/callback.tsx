import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

export default function AuthCallbackScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      const target = (params.returnTo as string) || '/(tabs)/settings';
      if (user) {
        router.replace(target as any);
      } else {
        router.replace({ pathname: '/auth', params: { returnTo: target } });
      }
    }
  }, [user, isLoading, params.returnTo, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
        <Text style={[styles.title, { color: colors.foreground }]}>Redirecting</Text>
        <Text style={[styles.subText, { color: colors.mutedForeground }]}>
          Loading your session…
        </Text>
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
});
