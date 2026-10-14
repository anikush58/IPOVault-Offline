import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
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
import { brokerApiService, getCanonicalBroker } from '@/services/broker/BrokerApiService';
import { resolveCanonicalBrokerUserId } from '@/utils/brokerMatching';

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
    profileId?: string;
    broker?: string;
    error?: string;
    error_description?: string;
    message?: string;
  }>();

  const brokerName = useMemo(() => {
    if (params.broker) return params.broker.trim();
    return 'Upstox';
  }, [params.broker]);

  const activeUserId = useMemo(() => {
    return resolveCanonicalBrokerUserId(authUser, users);
  }, [authUser, users]);

  const [isProcessing, setIsProcessing] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifiedAccount, setVerifiedAccount] = useState<any | null>(null);
  const [verifiedUserName, setVerifiedUserName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function handleCallback() {
      if (hasProcessedRef.current) return;
      hasProcessedRef.current = true;

      try {
        if (params.error || params.error_description || params.status === 'error') {
          const err =
            params.error_description ||
            params.error ||
            'Broker connection failed or was cancelled.';
          if (mounted) {
            setErrorMessage(err);
            setIsSuccess(false);
            setIsProcessing(false);
          }
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          return;
        }

        const targetAccountId = params.accountId?.trim();
        if (!targetAccountId && params.status !== 'success') {
          if (mounted) {
            setErrorMessage('No broker account identifier received.');
            setIsSuccess(false);
            setIsProcessing(false);
          }
          return;
        }

        // Wait for authenticated user ID if it is currently hydrating from session
        let currentUserId = activeUserId;
        if (!currentUserId) {
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 200));
            if (!mounted) return;
            currentUserId = resolveCanonicalBrokerUserId(authUser, users);
            if (currentUserId) break;
          }
        }

        if (!currentUserId) {
          if (mounted) {
            setErrorMessage('Sign-in required to confirm broker account connection.');
            setIsSuccess(false);
            setIsProcessing(false);
          }
          return;
        }

        // Query backend with retries to safely handle delayed backend persistence / eventual consistency
        let verifiedAcc: any | null = null;
        const maxAttempts = 4;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const accounts = await brokerApiService.getAccounts(currentUserId);
            let candidate: any | undefined;
            if (targetAccountId) {
              candidate = accounts.find((a) => a.id === targetAccountId);
              if (!candidate) {
                candidate = (await brokerApiService.getAccount(currentUserId, targetAccountId)) || undefined;
              }
            } else if (params.profileId) {
              const canonical = getCanonicalBroker(params.broker || brokerName);
              candidate = accounts.find(
                (a) =>
                  a.profileId === params.profileId &&
                  (!canonical || a.broker === canonical.brokerType),
              );
            }

            if (
              candidate &&
              candidate.isActive &&
              candidate.connection?.status === 'CONNECTED'
            ) {
              // 1. Verify account identifier match
              if (targetAccountId && candidate.id !== targetAccountId) {
                throw new Error('Broker account ID mismatch.');
              }
              // 2. Verify family profile mapping match (cannot match another family member)
              if (params.profileId && candidate.profileId !== params.profileId) {
                throw new Error('Broker account is linked to a different family profile.');
              }
              // 3. Verify broker type consistency
              const canonical = getCanonicalBroker(params.broker || brokerName);
              if (canonical && candidate.broker !== canonical.brokerType) {
                throw new Error('Broker account does not match requested broker type.');
              }
              verifiedAcc = candidate;
              break;
            }
          } catch (fetchErr: any) {
            if (attempt === maxAttempts) throw fetchErr;
          }

          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 500));
            if (!mounted) return;
          }
        }

        if (!verifiedAcc) {
          throw new Error('Broker account connection could not be verified with the server.');
        }

        // Resolve matching local user name for UI clarity
        const matchedLocalUser = users.find((u) => u.id === verifiedAcc!.profileId);
        const resolvedName = matchedLocalUser?.name || verifiedAcc.accountName || null;

        // Emit global event with verified account payload so listeners update immediately
        DeviceEventEmitter.emit('BROKER_ACCOUNT_UPDATED', {
          broker: brokerName,
          accountId: verifiedAcc.id,
          profileId: verifiedAcc.profileId,
          account: verifiedAcc,
          status: 'success',
        });

        // Trigger portfolio refresh in background
        brokerApiService.getUserPortfolio(currentUserId).catch(() => {});

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Return directly to the originating screen without intermediate screens or delay
        if (mounted) {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/users' as any);
          }
        }
      } catch (err: any) {
        if (mounted) {
          setErrorMessage(err?.message || 'Failed to complete broker connection');
          setIsSuccess(false);
          setIsProcessing(false);
        }
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    }

    handleCallback();

    return () => {
      mounted = false;
    };
  }, [params, activeUserId, authUser, users, brokerName]);

  const navigateBack = () => {
    if (verifiedAccount) {
      DeviceEventEmitter.emit('BROKER_ACCOUNT_UPDATED', {
        broker: brokerName,
        accountId: verifiedAccount.id,
        profileId: verifiedAccount.profileId,
        account: verifiedAccount,
        status: 'success',
      });
    }
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
              {brokerName} Connected!
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Your {brokerName} account has been securely linked.
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
    borderRadius: 9999,
    width: '100%',
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
