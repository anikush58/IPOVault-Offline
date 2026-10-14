import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function BrokerCallbackScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const handleReturn = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
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
        <View style={styles.centerContent}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
                borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
              },
            ]}
          >
            <MaterialCommunityIcons name="archive-arrow-down-outline" size={44} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            Broker Integration Archived
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            External broker OAuth and live price polling are archived in this version of IPOVault. All your saved applications and manual holdings remain intact.
          </Text>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleReturn}
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
          >
            <Feather name="arrow-left" size={16} color={colors.primaryForeground} />
            <Text style={[styles.actionButtonText, { color: colors.primaryForeground }]}>
              Return to App
            </Text>
          </TouchableOpacity>
        </View>
      </BlurView>
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
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
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
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
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
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 8,
    width: '100%',
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
