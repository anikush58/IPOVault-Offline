import React, { useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';
import { IconButton } from '@/components/ui/IconButton';

export default function SettingsContactSupportScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { showSuccess } = useDialog();

  const [showInAppFeedbackModal, setShowInAppFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  const topPad = Platform.OS === 'web' ? 24 : insets.top;

  const handleEmailSupport = () => {
    Linking.openURL('mailto:support@ipovault.app?subject=IPOVault%20Support%20Inquiry');
  };

  const handleWhatsAppSupport = () => {
    Linking.openURL('https://wa.me/?text=Hello%20IPOVault%20Support');
  };

  const handleSubmitInAppFeedback = () => {
    if (!feedbackText.trim()) return;
    setShowInAppFeedbackModal(false);
    setFeedbackText('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess('Message Sent', 'Thank you for your feedback. Our team will review your message.');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 56, backgroundColor: colors.background }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>SETTINGS</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Contact Support</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 40 }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Get help from our team
        </Text>

        {/* Support Channels Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* In-App Support */}
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setShowInAppFeedbackModal(true)}
          >
            <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF' }]}>
              <Feather name="message-square" size={17} color="#8B5CF6" />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>In-App Support</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Send us a message from within the app
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Email Support */}
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={handleEmailSupport}
          >
            <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
              <Feather name="mail" size={17} color="#3B82F6" />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Email Support</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                support@ipovault.app
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* WhatsApp Support */}
          <TouchableOpacity
            style={[styles.row, { borderBottomWidth: 0 }]}
            activeOpacity={0.7}
            onPress={handleWhatsAppSupport}
          >
            <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
              <Feather name="message-circle" size={17} color="#10B981" />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>WhatsApp Support</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Chat with our support team
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Support Hours Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
            <Feather name="clock" size={17} color="#3B82F6" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Support Hours</Text>
            <Text style={[styles.infoSub, { color: colors.mutedForeground }]}>
              We typically respond within 24 hours{'\n'}Mon – Sat, 9:00 AM – 6:00 PM IST
            </Text>
          </View>
        </View>

        {/* Include Details Tip Card */}
        <View style={[styles.tipCard, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2', borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA', marginTop: 14 }]}>
          <Feather name="alert-triangle" size={18} color="#EF4444" style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.tipTitle, { color: '#EF4444' }]}>Include Details</Text>
            <Text style={[styles.tipSub, { color: colors.mutedForeground }]}>
              Please include screenshots and a brief description of the issue for faster resolution.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* In-App Support Message Modal */}
      <Modal visible={showInAppFeedbackModal} transparent animationType="fade" onRequestClose={() => setShowInAppFeedbackModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowInAppFeedbackModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>In-App Message</Text>
              <TouchableOpacity onPress={() => setShowInAppFeedbackModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Describe your issue, feedback, or feature request:
            </Text>

            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="Type your message here..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              style={[styles.textArea, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border, color: colors.foreground }]}
            />

            <View style={{ gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: feedbackText.trim() ? 1 : 0.6 }]}
                activeOpacity={0.85}
                disabled={!feedbackText.trim()}
                onPress={handleSubmitInAppFeedback}
              >
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Send Message</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => setShowInAppFeedbackModal(false)}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
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

  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  rowTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  rowSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  infoTitle: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold' },
  infoSub: { fontSize: 11.5, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 16, marginTop: 2 },

  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  tipTitle: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },
  tipSub: { fontSize: 11.5, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 16 },

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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  modalSub: { fontSize: 12.5, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 17, marginBottom: 12 },
  textArea: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlignVertical: 'top',
  },
  primaryBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
  secondaryBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 13.5, fontFamily: 'GoogleSansFlex_700Bold' },
});
