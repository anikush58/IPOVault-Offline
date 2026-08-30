import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { DesignSystem } from '@/constants/DesignSystem';
import { Button } from '@/components/ui/Button';
import { AllotmentStatusBadge, AllotmentBadgeStatus } from './AllotmentStatusBadge';

interface ResultSavedModalProps {
  visible: boolean;
  onClose: () => void;
  userName: string;
  status: 'ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'NOT_ALLOTTED' | 'NO_RECORD';
  sharesAllotted: number;
}

export const ResultSavedModal: React.FC<ResultSavedModalProps> = ({
  visible,
  onClose,
  userName,
  status,
  sharesAllotted,
}) => {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header Icon Circle */}
          <View style={[styles.iconCircle, { backgroundColor: colors.positiveBg }]}>
            <Feather name="check" size={28} color={colors.positive} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>Result Saved</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Allotment status verified successfully
          </Text>

          {/* Details Box */}
          <View style={[styles.detailBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.userNameText, { color: colors.foreground }]}>{userName}</Text>

            <AllotmentStatusBadge status={status as AllotmentBadgeStatus} sharesAllotted={sharesAllotted} />

            {(status === 'ALLOTTED' || status === 'PARTIALLY_ALLOTTED') && (
              <Text style={[styles.sharesText, { color: colors.primary }]}>
                {sharesAllotted} {sharesAllotted === 1 ? 'share' : 'shares'} recorded
              </Text>
            )}

            <View style={styles.verifiedRow}>
              <Feather name="check-circle" size={12} color={colors.mutedForeground} />
              <Text style={[styles.verifiedText, { color: colors.mutedForeground }]}>Verified in database</Text>
            </View>
          </View>

          {/* Primary Action Button */}
          <Button variant="primary" size="md" title="Done" onPress={onClose} fullWidth />
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: DesignSystem.typography.size.body,
    fontFamily: DesignSystem.typography.fontRegular,
    textAlign: 'center',
    marginBottom: DesignSystem.spacing.xl,
  },
  detailBox: {
    width: '100%',
    borderRadius: DesignSystem.radius.md,
    borderWidth: 1,
    padding: DesignSystem.spacing.lg,
    alignItems: 'center',
    gap: DesignSystem.spacing.sm,
    marginBottom: DesignSystem.spacing.xl,
  },
  userNameText: {
    fontSize: DesignSystem.typography.size.subhead,
    fontFamily: DesignSystem.typography.fontBold,
  },
  sharesText: {
    fontSize: DesignSystem.typography.size.bodyLg,
    fontFamily: DesignSystem.typography.fontBold,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  verifiedText: {
    fontSize: DesignSystem.typography.size.bodySm,
    fontFamily: DesignSystem.typography.fontMedium,
  },
  actionBtn: {
    height: 50,
    borderRadius: DesignSystem.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionBtnText: {
    fontSize: DesignSystem.typography.size.subhead,
    fontFamily: DesignSystem.typography.fontBold,
    color: '#FFFFFF',
  },
});
