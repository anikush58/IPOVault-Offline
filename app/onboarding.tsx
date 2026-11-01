import React, { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { OnboardingScreenView } from '@/screens/Onboarding';
import { AutoStatusBar } from '@/components/ui/AutoStatusBar';

export default function OnboardingScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <>
      <AutoStatusBar backgroundColor="#F9FBFE" />
      <OnboardingScreenView />
    </>
  );
}
