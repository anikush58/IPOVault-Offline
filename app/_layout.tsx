import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  GoogleSansFlex_400Regular,
  GoogleSansFlex_500Medium,
  GoogleSansFlex_600SemiBold,
  GoogleSansFlex_700Bold,
} from '@expo-google-fonts/google-sans-flex';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { Stack, useRouter } from 'expo-router';
import { ONBOARDING_STORAGE_KEY } from '@/constants/onboarding';
import * as SplashScreen from 'expo-splash-screen';
import { DBProvider } from '@/context/DBContext';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { DialogProvider } from '@/context/DialogContext';
import { AppStoreProvider } from '@/store/useAppStore';
import { CompareProvider } from '@/context/CompareContext';
import { NotificationProvider } from '@/context/NotificationContext';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { resolvedScheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    safeAsyncStorage.getItem(ONBOARDING_STORAGE_KEY).then((value) => {
      if (!value) {
        router.replace('/onboarding');
      }
    });
  }, []);

  return (
    <>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 200,
          contentStyle: { backgroundColor: resolvedScheme === 'dark' ? '#121212' : '#F8F9FA' },
        }}
      >
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="applications" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipos" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipo-details" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipo-compare" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipo-calendar" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="watchlist" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="add-ipo-manual" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipo-management" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="users" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="banks" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="auth" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="allotment-checker" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="notifications" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="leaderboard" options={{ headerShown: false, animation: 'fade' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_700Bold,
    ...Feather.font,
  });

  const ready = fontsLoaded || !!fontsError;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  // Always render — fonts snap in once loaded; fallback to system fonts if they fail.
  // Never block on null to avoid infinite blank screen.
  useEffect(() => {
    // Safety timeout: hide splash after 4s regardless of font state
    const t = setTimeout(() => SplashScreen.hideAsync(), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <DialogProvider>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <AuthProvider>
                  <DBProvider>
                    <NotificationProvider>
                      <CompareProvider>
                        <AppStoreProvider>
                          <RootLayoutNav />
                        </AppStoreProvider>
                      </CompareProvider>
                    </NotificationProvider>
                  </DBProvider>
                </AuthProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </DialogProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
