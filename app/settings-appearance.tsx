import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { IconButton } from '@/components/ui/IconButton';

export default function SettingsAppearanceScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preference, setPreference, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const handleSelectTheme = (theme: 'light' | 'dark' | 'system') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreference(theme);
  };

  const activeColor = '#3B82F6';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 56, backgroundColor: colors.background }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>SETTINGS</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Appearance</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 40 }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Choose how IPOVault looks on your device
        </Text>

        {/* 3 Theme Selection Cards */}
        <View style={styles.themeCardsRow}>
          {/* Light Theme Card */}
          <TouchableOpacity
            style={[
              styles.themeCard,
              {
                backgroundColor: colors.card,
                borderColor: preference === 'light' ? activeColor : colors.border,
              },
              preference === 'light' && styles.themeCardActive,
            ]}
            activeOpacity={0.8}
            onPress={() => handleSelectTheme('light')}
          >
            <View style={[styles.themeIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="sun" size={22} color="#F59E0B" />
            </View>
            <Text style={[styles.themeTitle, { color: colors.foreground }]}>Light</Text>
            <Text style={[styles.themeSub, { color: colors.mutedForeground }]}>Clean and bright</Text>
            <View style={styles.checkSlot}>
              {preference === 'light' ? (
                <View style={[styles.checkBadge, { backgroundColor: activeColor }]}>
                  <Feather name="check" size={11} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.checkPlaceholder, { borderColor: isDark ? '#374151' : '#E5E7EB' }]} />
              )}
            </View>
          </TouchableOpacity>

          {/* Dark Theme Card */}
          <TouchableOpacity
            style={[
              styles.themeCard,
              {
                backgroundColor: colors.card,
                borderColor: preference === 'dark' ? activeColor : colors.border,
              },
              preference === 'dark' && styles.themeCardActive,
            ]}
            activeOpacity={0.8}
            onPress={() => handleSelectTheme('dark')}
          >
            <View style={[styles.themeIconWrap, { backgroundColor: isDark ? '#334155' : '#1E293B' }]}>
              <Feather name="moon" size={22} color="#F1F5F9" />
            </View>
            <Text style={[styles.themeTitle, { color: colors.foreground }]}>Dark</Text>
            <Text style={[styles.themeSub, { color: colors.mutedForeground }]}>Easy on eyes</Text>
            <View style={styles.checkSlot}>
              {preference === 'dark' ? (
                <View style={[styles.checkBadge, { backgroundColor: activeColor }]}>
                  <Feather name="check" size={11} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.checkPlaceholder, { borderColor: isDark ? '#374151' : '#E5E7EB' }]} />
              )}
            </View>
          </TouchableOpacity>

          {/* System Theme Card */}
          <TouchableOpacity
            style={[
              styles.themeCard,
              {
                backgroundColor: colors.card,
                borderColor: preference === 'system' ? activeColor : colors.border,
              },
              preference === 'system' && styles.themeCardActive,
            ]}
            activeOpacity={0.8}
            onPress={() => handleSelectTheme('system')}
          >
            <View style={[styles.themeIconWrap, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
              <Feather name="smartphone" size={22} color="#3B82F6" />
            </View>
            <Text style={[styles.themeTitle, { color: colors.foreground }]}>System</Text>
            <Text style={[styles.themeSub, { color: colors.mutedForeground }]}>Follow device</Text>
            <View style={styles.checkSlot}>
              {preference === 'system' ? (
                <View style={[styles.checkBadge, { backgroundColor: activeColor }]}>
                  <Feather name="check" size={11} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.checkPlaceholder, { borderColor: isDark ? '#374151' : '#E5E7EB' }]} />
              )}
            </View>
          </TouchableOpacity>
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
    justifyContent: 'space-between',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 16,
    paddingHorizontal: 4,
  },

  themeCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeCard: {
    flex: 1,
    minHeight: 156,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeCardActive: {
    borderWidth: 2,
  },
  themeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  themeTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
    marginBottom: 2,
    textAlign: 'center',
  },
  themeSub: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 14,
  },
  checkSlot: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    opacity: 0.35,
  },
});
