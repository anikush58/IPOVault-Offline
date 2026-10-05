import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { ONBOARDING_STORAGE_KEY } from '@/constants/onboarding';

export default function RootIndexGate() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { resolvedScheme } = useTheme();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    safeAsyncStorage.getItem(ONBOARDING_STORAGE_KEY).then((value) => {
      if (isMounted) {
        setHasOnboarded(!!value);
        setOnboardingChecked(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const bgColor = resolvedScheme === 'dark' ? '#121212' : '#F8F9FA';

  // 1. While auth or onboarding state is resolving, render neutral background under native splash
  if (isAuthLoading || !onboardingChecked) {
    return <View style={{ flex: 1, backgroundColor: bgColor }} />;
  }

  // 2. State is definitively resolved -> redirect to the ONE deterministic destination
  if (!hasOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  if (!user) {
    return <Redirect href="/auth" />;
  }

  return <Redirect href="/(tabs)" />;
}
