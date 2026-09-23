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
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
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
import { AnimatedSplashScreen } from '@/components/AnimatedSplashScreen';
import {
  registerDevicePushTokenAsync,
  setupNotificationPresentation,
  setupNotificationResponseListener,
} from '@/services/notifications/notificationEngine';
import { useAuth } from '@/context/AuthContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { resolvedScheme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    safeAsyncStorage.getItem(ONBOARDING_STORAGE_KEY).then((value) => {
      if (!value) {
        router.replace('/onboarding');
      }
    });
  }, []);

  useEffect(() => {
    setupNotificationPresentation();
    const subscription = setupNotificationResponseListener(router);
    return () => {
      if (subscription && subscription.remove) {
        subscription.remove();
      }
    };
  }, [router]);

  useEffect(() => {
    if (user?.id) {
      registerDevicePushTokenAsync(user.id).catch(() => {});
    }
  }, [user?.id]);

  return (
    <>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        initialRouteName="(tabs)"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 200,
          contentStyle: { backgroundColor: resolvedScheme === 'dark' ? '#121212' : '#F8F9FA' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="applications" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipos" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipo-details" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipo-compare" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipo-calendar" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="watchlist" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="users" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="banks" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="auth" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="allotment-checker" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="notifications" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="leaderboard" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="ipo-hub" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="new-ipos" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="backend-ipo-details" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="analytics-dashboard" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="privacy-security" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="help-center" options={{ headerShown: false, animation: 'fade' }} />
      </Stack>

    </>
  );
}

let hasShownInitialSplash = false;

export default function RootLayout() {
  const [splashFinished, setSplashFinished] = React.useState(hasShownInitialSplash);

  const [fontsLoaded, fontsError] = useFonts({
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    ...Feather.font,
  });

  const ready = fontsLoaded || !!fontsError;


  // Safety timeout: hide splash after 4s regardless of font state
  useEffect(() => {
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
                          {!splashFinished && (
                            <AnimatedSplashScreen
                              isReady={ready}
                              onAnimationComplete={() => {
                                hasShownInitialSplash = true;
                                setSplashFinished(true);
                              }}
                            />
                          )}
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
