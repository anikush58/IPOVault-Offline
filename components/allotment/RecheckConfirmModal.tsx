import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { DesignSystem } from '@/constants/DesignSystem';
import { Button } from '@/components/ui/Button';

interface RecheckConfirmModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirmRecheck: () => void;
  userName: string;
  currentStatus: string;
}

export const RecheckConfirmModal: React.FC<RecheckConfirmModalProps> = ({
  visible,
  onCancel,
  onConfirmRecheck,
  userName,
  currentStatus,
}) => {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Warning Icon Header */}
          <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
            <Feather name="alert-triangle" size={28} color="#B45309" />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>Recheck Allotment?</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            This application for <Text style={{ fontFamily: DesignSystem.typography.fontBold, color: colors.foreground }}>{userName}</Text> was previously verified manually as <Text style={{ fontFamily: DesignSystem.typography.fontBold, color: colors.primary }}>{currentStatus}</Text>.
          </Text>

          <View style={[styles.noticeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginTop: 2 }} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
              Rechecking will run an automated verification against the registrar adapter, which may update the current result.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.btnRow}>
            <Button
              variant="secondary"
              size="md"
              title="Cancel"
              onPress={onCancel}
              style={{ flex: 1 }}
            />

            <Button
              variant="primary"
              size="md"
              title="Recheck"
              onPress={onConfirmRecheck}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: DesignSystem.spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: DesignSystem.radius.xl,
    borderWidth: 1,
    padding: DesignSystem.spacing.xxl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DesignSystem.spacing.lg,
  },
  title: {
    fontSize: DesignSystem.typography.size.headline,
    fontFamily: DesignSystem.typography.fontBold,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: DesignSystem.typography.size.body,
    fontFamily: DesignSystem.typography.fontRegular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: DesignSystem.spacing.lg,
  },
  noticeBox: {
    flexDirection: 'row',
    gap: 8,
    padding: DesignSystem.spacing.md,
    borderRadius: DesignSystem.radius.sm,
    borderWidth: 1,
    marginBottom: DesignSystem.spacing.xl,
  },
  noticeText: {
    flex: 1,
    fontSize: DesignSystem.typography.size.caption,
    fontFamily: DesignSystem.typography.fontRegular,
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: DesignSystem.spacing.md,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: DesignSystem.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: DesignSystem.typography.size.subhead,
    fontFamily: DesignSystem.typography.fontSemiBold,
  },
  confirmBtn: {
    height: 48,
    borderRadius: DesignSystem.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: DesignSystem.typography.size.subhead,
    fontFamily: DesignSystem.typography.fontBold,
    color: '#FFFFFF',
  },
});
