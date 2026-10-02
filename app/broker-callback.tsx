import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import { brokerApiService } from '@/services/broker/BrokerApiService';

export default function BrokerCallbackScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { user: authUser } = useAuth();
  const { users } = useDB();

  const params = useLocalSearchParams<{
    status?: string;
    accountId?: string;
    error?: string;
    error_description?: string;
    message?: string;
  }>();

  const activeUserId = useMemo(() => {
    const firstUser = users?.[0] as
      | { owner_id?: string; id?: string }
      | undefined;
    return (
      authUser?.id || firstUser?.owner_id || firstUser?.id || 'default-user'
    );
  }, [authUser, users]);

  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSuccess =
    params.status === 'success' ||
    Boolean(params.accountId && !params.error && !errorMessage);

  useEffect(() => {
    let mounted = true;

    async function handleCallback() {
      try {
        if (params.error || params.error_description) {
          const err =
            params.error_description ||
            params.error ||
            'Broker connection failed or was cancelled.';
          if (mounted) {
            setErrorMessage(err);
            setIsProcessing(false);
          }
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          return;
        }

        // Trigger portfolio / accounts refresh in background
        if (activeUserId) {
          try {
            await Promise.allSettled([
              brokerApiService.getAccounts(activeUserId),
              brokerApiService.getUserPortfolio(activeUserId),
            ]);
          } catch {
            // Non-critical background refresh failure
          }
        }

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        if (mounted) {
          setIsProcessing(false);
        }

        // Auto redirect back to users / settings screen after 1.5s
        const timer = setTimeout(() => {
          if (mounted) {
            navigateBack();
          }
        }, 1500);

        return () => clearTimeout(timer);
      } catch (err: any) {
        if (mounted) {
          setErrorMessage(err?.message || 'Failed to complete broker connection');
          setIsProcessing(false);
        }
      }
    }

    handleCallback();

    return () => {
      mounted = false;
    };
  }, [params, activeUserId]);

  const navigateBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/users' as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <BlurView
        intensity={Platform.OS === 'web' ? 0 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? 'rgba(24, 25, 30, 0.85)' : 'rgba(255, 255, 255, 0.92)',
            borderColor: colors.border,
          },
        ]}
      >
        {isProcessing ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.foreground, marginTop: 16 }]}>
              Connecting Broker
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Finalizing secure authorization and syncing holdings…
            </Text>
          </View>
        ) : isSuccess ? (
          <View style={styles.centerContent}>
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                  borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
                },
              ]}
            >
              <MaterialCommunityIcons name="check-circle" size={48} color="#10B981" />
            </View>

            <Text style={[styles.title, { color: colors.foreground }]}>
              Broker Connected!
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Your broker account has been securely linked. Holdings and trades are now automatically synced.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={navigateBack}
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.actionButtonText, { color: colors.primaryForeground }]}>
                Continue
              </Text>
              <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.centerContent}>
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
                },
              ]}
            >
              <MaterialCommunityIcons name="alert-circle" size={48} color="#EF4444" />
            </View>

            <Text style={[styles.title, { color: colors.foreground }]}>
              Connection Failed
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {errorMessage || 'Unable to link broker account. Please try again.'}
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={navigateBack}
              style={[styles.actionButton, { backgroundColor: colors.destructive }]}
            >
              <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>
                Back to Users
              </Text>
              <Feather name="arrow-left" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  centerContent: {
    alignItems: 'center',
    width: '100%',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
