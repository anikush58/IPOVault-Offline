import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';

export default function IPOHubScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            height: topPad + 60,
            backgroundColor: colors.background,
          },
        ]}
      >
        <IconButton
          name="arrow-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>
            IPOVAULT CLOUD
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            IPO Hub
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 40,
        }}
      >
        {/* Intro Card */}
        <BlurView
          intensity={Platform.OS === 'web' ? 0 : 35}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.introCard,
            {
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.04)'
                : 'rgba(255, 255, 255, 0.7)',
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.introTitle, { color: colors.foreground }]}>
            Cloud Analytics & Catalog Engine
          </Text>
          <Text style={[styles.introSub, { color: colors.mutedForeground }]}>
            Access live backend-powered IPO listings and unified data-quality telemetry. Your offline IPO Management remains completely independent.
          </Text>
        </BlurView>

        {/* Feature 1: New IPOs */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/new-ipos')}
          style={styles.cardContainer}
        >
          <LinearGradient
            colors={
              isDark
                ? ['#1F2937', '#111827']
                : ['#FFFFFF', '#F9FAFB']
            }
            style={[styles.featureCard, { borderColor: colors.border }]}
          >
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: colors.primary + '18' },
                ]}
              >
                <Feather name="globe" size={22} color={colors.primary} />
              </View>
              <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  BACKEND CATALOG
                </Text>
              </View>
            </View>

            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              New IPOs
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Browse canonical IPO filings, issue price bands, lot sizes, and share structures directly from IPOVault backend.
            </Text>

            <View style={styles.cardFooter}>
              <Text style={[styles.actionText, { color: colors.primary }]}>
                Explore Catalog
              </Text>
              <Feather name="arrow-right" size={16} color={colors.primary} />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Feature 2: Analytics */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/analytics-dashboard')}
          style={styles.cardContainer}
        >
          <LinearGradient
            colors={
              isDark
                ? ['#1F2937', '#111827']
                : ['#FFFFFF', '#F9FAFB']
            }
            style={[styles.featureCard, { borderColor: colors.border }]}
          >
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: '#10B98118' },
                ]}
              >
                <MaterialCommunityIcons
                  name="chart-box-outline"
                  size={24}
                  color="#10B981"
                />
              </View>
              <View style={[styles.badge, { backgroundColor: '#10B98120' }]}>
                <Text style={[styles.badgeText, { color: '#10B981' }]}>
                  PHASE 30 ANALYTICS
                </Text>
              </View>
            </View>

            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              Analytics & Data Quality
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Unified market trends, close-to-listing duration, descriptive allotment rates, and multi-dimension data-quality telemetry.
            </Text>

            <View style={styles.cardFooter}>
              <Text style={[styles.actionText, { color: '#10B981' }]}>
                View Dashboard
              </Text>
              <Feather name="arrow-right" size={16} color="#10B981" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Architecture Note */}
        <View style={[styles.noteBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="shield" size={16} color={colors.mutedForeground} />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
            Architecture Isolation: Read-only cloud catalog and analytics. Zero mutation of local SQLite offline data.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  introCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 4,
  },
  introSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  cardContainer: {
    marginBottom: 16,
  },
  featureCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 19,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 17,
  },
});
