import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { DesignSystem } from '@/constants/DesignSystem';
import { Button } from '@/components/ui/Button';
import { AllotmentRequest, AllotmentResult, EngineProgress } from '@/lib/allotment/types';
import { AllotmentStatusBadge, AllotmentBadgeStatus } from './AllotmentStatusBadge';

interface CheckAllProgressModalProps {
  visible: boolean;
  onClose: () => void;
  onCancel: () => void;
  isChecking: boolean;
  progress: EngineProgress;
  requests: AllotmentRequest[];
}

export const CheckAllProgressModal: React.FC<CheckAllProgressModalProps> = ({
  visible,
  onClose,
  onCancel,
  isChecking,
  progress,
  requests,
}) => {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const total = requests.length || progress.total || 1;
  const completed = progress.completed || 0;
  const percent = Math.min(100, Math.round((completed / total) * 100));
  const isFinished = !isChecking;

  // Calculate summary metrics
  let allottedCount = 0;
  let partialCount = 0;
  let notAllottedCount = 0;
  let pendingNoRecordCount = 0;

  progress.results.forEach((res) => {
    if (res.status === 'ALLOTTED') allottedCount++;
    else if (res.status === 'PARTIALLY_ALLOTTED') partialCount++;
    else if (res.status === 'NOT_ALLOTTED') notAllottedCount++;
    else if (res.status === 'NO_RECORD' || res.status === 'PENDING') pendingNoRecordCount++;
  });

  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 12;

  const handleHeaderClose = () => {
    if (isChecking) {
      onCancel();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={handleHeaderClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: bottomPad }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                {isFinished ? 'Allotment Check Complete' : 'Checking Allotments'}
              </Text>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
                {isFinished
                  ? `Verified ${completed} of ${total} application${total > 1 ? 's' : ''}`
                  : `Currently checking ${progress.currentIpoName || 'IPO applications...'}`}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleHeaderClose}
              style={[styles.closeBtn, { backgroundColor: colors.background }]}
              hitSlop={8}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressTextRow}>
              <Text style={[styles.progressCounter, { color: colors.foreground }]}>
                {completed} of {total} checked
              </Text>
              <Text style={[styles.progressPercent, { color: colors.primary }]}>{percent}%</Text>
            </View>

            <View style={[styles.track, { backgroundColor: colors.border }]}>
              <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
            </View>
          </View>

          {/* Summary Badges Grid */}
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryBox, { backgroundColor: colors.positiveBg, borderColor: colors.positiveDim }]}>
              <Text style={[styles.summaryVal, { color: colors.positive }]}>{allottedCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.positive }]}>Allotted</Text>
            </View>

            {partialCount > 0 && (
              <View style={[styles.summaryBox, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]}>
                <Text style={[styles.summaryVal, { color: '#047857' }]}>{partialCount}</Text>
                <Text style={[styles.summaryLabel, { color: '#065F46' }]}>Partially</Text>
              </View>
            )}

            <View style={[styles.summaryBox, { backgroundColor: colors.negativeBg, borderColor: colors.negativeDim }]}>
              <Text style={[styles.summaryVal, { color: colors.negative }]}>{notAllottedCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.negative }]}>Not Allotted</Text>
            </View>

            <View style={[styles.summaryBox, { backgroundColor: colors.statusPendingBg, borderColor: colors.border }]}>
              <Text style={[styles.summaryVal, { color: colors.statusPending }]}>{pendingNoRecordCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.statusPending }]}>Needs Review</Text>
            </View>
          </View>

          {/* Items Live List */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {requests.map((req) => {
              const res: AllotmentResult | undefined = progress.results.get(req.applicationId);
              const isCurrent = isChecking && progress.currentApplication?.applicationId === req.applicationId;

              let badgeStatus: AllotmentBadgeStatus = 'PENDING';
              let sharesAllotted = 0;

              if (isCurrent) {
                badgeStatus = 'CHECKING';
              } else if (res) {
                badgeStatus = res.status as AllotmentBadgeStatus;
                sharesAllotted = res.sharesAllotted;
                if (badgeStatus as any === 'ERROR' || badgeStatus as any === 'UNAVAILABLE') {
                  badgeStatus = 'NEEDS_REVIEW';
                }
              }

              return (
                <View
                  key={req.applicationId}
                  style={[
                    styles.itemCard,
                    {
                      backgroundColor: isCurrent ? colors.background : colors.surface,
                      borderColor: isCurrent ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: colors.foreground }]}>{req.userName}</Text>
                    <Text style={[styles.ipoSub, { color: colors.mutedForeground }]}>{req.ipoName}</Text>
                  </View>

                  <AllotmentStatusBadge status={badgeStatus} sharesAllotted={sharesAllotted} size="sm" />
                </View>
              );
            })}
          </ScrollView>

          {/* Action Button Footer */}
          <View style={styles.footer}>
            {isFinished ? (
              <Button variant="primary" size="md" title="Done" onPress={onClose} fullWidth />
            ) : (
              <Button variant="secondary" size="md" title="Cancel Checking" onPress={onCancel} fullWidth />
            )}
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
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: DesignSystem.radius.xl,
    borderTopRightRadius: DesignSystem.radius.xl,
    borderWidth: 1,
    maxHeight: '95%',
    padding: DesignSystem.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: DesignSystem.spacing.lg,
  },
  headerTitle: {
    fontSize: DesignSystem.typography.size.headline,
    fontFamily: DesignSystem.typography.fontBold,
  },
  headerSub: {
    fontSize: DesignSystem.typography.size.body,
    fontFamily: DesignSystem.typography.fontMedium,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSection: {
    marginBottom: DesignSystem.spacing.lg,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressCounter: {
    fontSize: DesignSystem.typography.size.body,
    fontFamily: DesignSystem.typography.fontSemiBold,
  },
  progressPercent: {
    fontSize: DesignSystem.typography.size.body,
    fontFamily: DesignSystem.typography.fontBold,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: DesignSystem.spacing.sm,
    marginBottom: DesignSystem.spacing.lg,
  },
  summaryBox: {
    flex: 1,
    borderRadius: DesignSystem.radius.md,
    borderWidth: 1,
    paddingVertical: DesignSystem.spacing.sm,
    alignItems: 'center',
  },
  summaryVal: {
    fontSize: DesignSystem.typography.size.title,
    fontFamily: DesignSystem.typography.fontBold,
  },
  summaryLabel: {
    fontSize: DesignSystem.typography.size.eyebrow,
    fontFamily: DesignSystem.typography.fontSemiBold,
    marginTop: 2,
  },
  listContainer: {
    maxHeight: 390,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: DesignSystem.spacing.md,
    borderRadius: DesignSystem.radius.md,
    borderWidth: 1,
    marginBottom: DesignSystem.spacing.sm,
  },
  userName: {
    fontSize: DesignSystem.typography.size.bodyLg,
    fontFamily: DesignSystem.typography.fontBold,
  },
  ipoSub: {
    fontSize: DesignSystem.typography.size.bodySm,
    fontFamily: DesignSystem.typography.fontRegular,
    marginTop: 2,
  },
  footer: {
    marginTop: DesignSystem.spacing.xl,
    paddingTop: 4,
  },
  actionBtn: {
    height: 56,
    borderRadius: DesignSystem.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: DesignSystem.typography.size.subhead,
    fontFamily: DesignSystem.typography.fontBold,
    color: '#FFFFFF',
  },
  cancelBtn: {
    height: 50,
    borderRadius: DesignSystem.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: DesignSystem.typography.size.subhead,
    fontFamily: DesignSystem.typography.fontSemiBold,
  },
});
