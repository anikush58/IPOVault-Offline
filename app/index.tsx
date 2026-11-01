import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAppExperience } from '@/context/AppExperienceContext';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { ONBOARDING_STORAGE_KEY } from '@/constants/onboarding';
import * as SplashScreen from 'expo-splash-screen';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/hooks/useColors';

const STARTUP_TIMEOUT_MS = 3500;

export default function RootIndexGate() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { isNonPro, isLoading: isExperienceLoading } = useAppExperience();
  const colors = useColors();

  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const checkOnboarding = useCallback(async () => {
    try {
      const value = await safeAsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      setHasOnboarded(!!value);
      setOnboardingChecked(true);
    } catch (err) {
      if (__DEV__) console.warn('[RootIndexGate] Onboarding check error:', err);
      // Graceful offline fallback: treat as onboarded if storage read fails to avoid blocking users
      setHasOnboarded(true);
      setOnboardingChecked(true);
    }
  }, []);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding, retryNonce]);

  // Bounded startup safety timeout: ensures splash screen is hidden on any timeout or stall
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasTimedOut(true);
      SplashScreen.hideAsync().catch(() => {});
    }, STARTUP_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [retryNonce]);

  // Hide native splash screen as soon as auth and onboarding are resolved
  useEffect(() => {
    if (!isAuthLoading && onboardingChecked && (!isExperienceLoading || hasTimedOut)) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isAuthLoading, onboardingChecked, isExperienceLoading, hasTimedOut]);

  const handleRetry = () => {
    setHasTimedOut(false);
    setOnboardingChecked(false);
    setRetryNonce((n) => n + 1);
  };

  const bgColor = colors.background;

  // 1. If startup timed out and critical state failed to resolve, show recoverable error state
  if (hasTimedOut && (isAuthLoading || !onboardingChecked)) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Unable to Launch IPOVault
          </Text>
          <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>
            Startup is taking longer than expected. Please verify your connection or tap below to retry.
          </Text>
          <Button
            title="Retry Launch"
            variant="primary"
            size="md"
            onPress={handleRetry}
            style={styles.retryButton}
          />
        </View>
      </View>
    );
  }

  // 2. While auth, onboarding, or experience is resolving within bounded deadline, render neutral background under splash
  if ((isAuthLoading || !onboardingChecked || isExperienceLoading) && !hasTimedOut) {
    return <View style={{ flex: 1, backgroundColor: bgColor }} />;
  }

  // 3. State is definitively resolved -> redirect to the ONE deterministic destination
  if (!hasOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  if (!user) {
    return <Redirect href="/auth" />;
  }

  // Authenticated user: Home ('/(tabs)') for Pro users, or IPO Hub ('/(tabs)/ipos') for Non-Pro users
  if (isNonPro) {
    return <Redirect href="/(tabs)/ipos" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  retryButton: {
    minWidth: 160,
  },
});
