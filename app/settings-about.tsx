import React, { useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { IconButton } from '@/components/ui/IconButton';

export default function SettingsAboutScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const [showWhatsNewModal, setShowWhatsNewModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showLicensesModal, setShowLicensesModal] = useState(false);

  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 56, backgroundColor: colors.background }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>SETTINGS</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>About IPOVault</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 40 }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Your IPO tracking companion
        </Text>

        {/* App Version Card */}
        <View style={[styles.appHeaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.appLogoWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF', borderColor: isDark ? '#334155' : '#DBEAFE' }]}>
            <Feather name="trending-up" size={26} color="#3B82F6" />
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.appName, { color: colors.foreground }]}>IPOVault</Text>
              <View style={[styles.upToDateBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5', borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0' }]}>
                <Feather name="check" size={11} color="#10B981" />
                <Text style={[styles.upToDateText, { color: isDark ? '#4ADE80' : '#15803D' }]}>Up to date</Text>
              </View>
            </View>
            <Text style={[styles.appVersion, { color: colors.mutedForeground }]}>Version 2.3.0</Text>
          </View>
        </View>

        {/* About Menu Card */}
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
          {/* What's New */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setShowWhatsNewModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }]}>
              <Feather name="star" size={17} color="#F59E0B" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>What's New</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>See what's new in this version</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Terms of Service */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setShowTermsModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF' }]}>
              <Feather name="file-text" size={17} color="#8B5CF6" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Terms of Service</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Read our terms and conditions</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Privacy Policy */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => router.push('/privacy-policy')}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
              <Feather name="shield" size={17} color="#3B82F6" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Privacy Policy</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>How your data is protected</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Open Source Licenses */}
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomWidth: 0 }]}
            activeOpacity={0.7}
            onPress={() => setShowLicensesModal(true)}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
              <Feather name="code" size={17} color="#10B981" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Open Source Licenses</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>MIT and Apache 2.0 open source licenses</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* What's New Sheet Modal */}
      <Modal visible={showWhatsNewModal} transparent animationType="fade" onRequestClose={() => setShowWhatsNewModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowWhatsNewModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>What's New</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Version 2.3.0 • Recent Updates
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowWhatsNewModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              <View style={{ gap: 14, paddingVertical: 6 }}>
                <View style={styles.whatsNewItem}>
                  <View style={[styles.whatsNewIconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                    <Feather name="zap" size={16} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.whatsNewItemTitle, { color: colors.foreground }]}>Faster Dashboard Loading</Text>
                    <Text style={[styles.whatsNewItemDesc, { color: colors.mutedForeground }]}>
                      Staged background sync for instantaneous post-login access to portfolio totals.
                    </Text>
                  </View>
                </View>

                <View style={styles.whatsNewItem}>
                  <View style={[styles.whatsNewIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
                    <Feather name="link-2" size={16} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.whatsNewItemTitle, { color: colors.foreground }]}>Improved Broker Integration</Text>
                    <Text style={[styles.whatsNewItemDesc, { color: colors.mutedForeground }]}>
                      Direct Upstox market quotes and live LTP enrichment for holding applications.
                    </Text>
                  </View>
                </View>

                <View style={styles.whatsNewItem}>
                  <View style={[styles.whatsNewIconWrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }]}>
                    <Feather name="bar-chart" size={16} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.whatsNewItemTitle, { color: colors.foreground }]}>New Performance Bar Chart</Text>
                    <Text style={[styles.whatsNewItemDesc, { color: colors.mutedForeground }]}>
                      Side-by-side performance bar graph with interactive tooltips and period filtering.
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
              activeOpacity={0.85}
              onPress={() => setShowWhatsNewModal(false)}
            >
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Terms of Service Modal */}
      <Modal visible={showTermsModal} transparent animationType="fade" onRequestClose={() => setShowTermsModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowTermsModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Terms of Service</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Last updated: 15 Dec 2024
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTermsModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              <View style={{ gap: 12, paddingVertical: 6 }}>
                <Text style={[styles.termsHeading, { color: colors.foreground }]}>1. Acceptance of Terms</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  By using IPOVault, you agree to these Terms of Service. If you do not agree, please do not use the application.
                </Text>

                <Text style={[styles.termsHeading, { color: colors.foreground }]}>2. Use of the App</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  IPOVault is a personal portfolio and IPO bidding tracker. You are responsible for all information you add and your connected broker integrations.
                </Text>

                <Text style={[styles.termsHeading, { color: colors.foreground }]}>3. Data & Privacy</Text>
                <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                  Your data is stored locally on your device with optional encrypted Cloud Firestore synchronization.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
              activeOpacity={0.85}
              onPress={() => setShowTermsModal(false)}
            >
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Licenses Modal */}
      <Modal visible={showLicensesModal} transparent animationType="fade" onRequestClose={() => setShowLicensesModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLicensesModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Open Source Licenses</Text>
              <TouchableOpacity onPress={() => setShowLicensesModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              <Text style={[styles.termsText, { color: colors.mutedForeground, lineHeight: 18 }]}>
                IPOVault is built with React Native, Expo, SQLite, Firebase, and open-source packages.{'\n\n'}
                All components and dependencies are licensed under standard MIT and Apache 2.0 open-source licenses.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryModalBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
              activeOpacity={0.85}
              onPress={() => setShowLicensesModal(false)}
            >
              <Text style={[styles.primaryModalBtnText, { color: colors.primaryForeground }]}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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

  appHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
  },
  appLogoWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  appVersion: { fontSize: 12.5, fontFamily: 'GoogleSansFlex_400Regular' },
  upToDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  upToDateText: { fontSize: 10.5, fontFamily: 'GoogleSansFlex_600SemiBold' },

  menuCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextWrap: { flex: 1 },
  menuTitle: { fontSize: 14.5, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  menuSub: { fontSize: 11.5, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '94%',
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  modalSubTitle: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },

  whatsNewItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  whatsNewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  whatsNewItemTitle: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  whatsNewItemDesc: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 16, marginTop: 2 },

  termsHeading: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  termsText: { fontSize: 12.5, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 18 },

  primaryModalBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryModalBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
});
