import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { ScreenHeader } from '@/components/ui/ScreenHeader';

export default function SettingsAppearanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const activeColor = '#3B82F6';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        eyebrow="SETTINGS"
        title="Appearance"
        centerTitle
        showBack
        transparent
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: topPad + 60 + 12,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Choose how IPOVault looks on your device
        </Text>

        {/* Theme Selection */}
        <View style={styles.themeCardsRow}>
          {/* Light Theme Card */}
          <View
            style={[
              styles.themeCard,
              {
                backgroundColor: colors.card,
                borderColor: activeColor,
              },
              styles.themeCardActive,
            ]}
          >
            <View style={[styles.themeIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Icon name="sun" size={22} color="#F59E0B" />
            </View>
            <Text style={[styles.themeTitle, { color: colors.foreground }]}>Light Mode</Text>
            <Text style={[styles.themeSub, { color: colors.mutedForeground }]}>Clean, crisp and bright</Text>
            <View style={styles.checkSlot}>
              <View style={[styles.checkBadge, { backgroundColor: activeColor }]}>
                <Icon name="check" size={11} color="#FFFFFF" strokeWidth={2.5} />
              </View>
            </View>
          </View>
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
