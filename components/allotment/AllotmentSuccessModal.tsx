import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { DesignSystem } from '@/constants/DesignSystem';
import { Button } from '@/components/ui/Button';
import { AllotmentStatusBadge, AllotmentBadgeStatus } from './AllotmentStatusBadge';

export interface ManagedAccountAllotmentResult {
  applicationId: string;
  userId: string;
  userName: string;
  status: 'ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'NOT_ALLOTTED' | 'NO_RECORD' | 'PENDING';
  sharesAllotted: number;
  allottedLots?: number;
  appliedQuantity?: number;
}

export interface AllotmentSuccessModalProps {
  visible: boolean;
  ipoId: string;
  ipoName: string;
  companyName?: string;
  results: ManagedAccountAllotmentResult[];
  onClose: () => void;
  onViewDetails?: () => void;
}

export const AllotmentSuccessModal: React.FC<AllotmentSuccessModalProps> = ({
  visible,
  ipoId,
  ipoName,
  companyName,
  results,
  onClose,
  onViewDetails,
}) => {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!visible || !results || results.length === 0) return null;

  const displayName = companyName || ipoName || 'IPO';
  const total = results.length;

  let allottedCount = 0;
  let partialCount = 0;
  let notAllottedCount = 0;
  let totalSharesAllotted = 0;

  results.forEach((res) => {
    const statusUpper = (res.status || '').toUpperCase();
    if (statusUpper === 'ALLOTTED') {
      allottedCount++;
      totalSharesAllotted += res.sharesAllotted || 0;
    } else if (statusUpper === 'PARTIALLY_ALLOTTED') {
      partialCount++;
      totalSharesAllotted += res.sharesAllotted || 0;
    } else {
      notAllottedCount++;
    }
  });

  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 8;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: bottomPad },
          ]}
        >
          {/* Header Badge Circle */}
          <View style={styles.headerSection}>
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircle}
            >
              <Feather name="award" size={28} color="#FFFFFF" />
            </LinearGradient>

            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              🎉 Allotment Confirmed!
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {displayName} Allotment Results Available
            </Text>
          </View>

          {/* Metrics summary banner */}
          <View style={styles.summaryGrid}>
            <View
              style={[
                styles.summaryBox,
                { backgroundColor: colors.positiveBg, borderColor: colors.positiveDim },
              ]}
            >
              <Text style={[styles.summaryVal, { color: colors.positive }]}>
                {allottedCount + partialCount}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.positive }]}>
                Allotted Account{allottedCount + partialCount === 1 ? '' : 's'}
              </Text>
            </View>

            {notAllottedCount > 0 && (
              <View
                style={[
                  styles.summaryBox,
                  { backgroundColor: colors.negativeBg, borderColor: colors.negativeDim },
                ]}
              >
                <Text style={[styles.summaryVal, { color: colors.negative }]}>
                  {notAllottedCount}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.negative }]}>
                  Not Allotted
                </Text>
              </View>
            )}

            {totalSharesAllotted > 0 && (
              <View
                style={[
                  styles.summaryBox,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.summaryVal, { color: colors.primary }]}>
                  {totalSharesAllotted}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                  Total Shares
                </Text>
              </View>
            )}
          </View>

          {/* Managed Accounts Breakdown List */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            MANAGED ACCOUNTS ({total})
          </Text>

          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {results.map((item) => {
              const statusUpper = (item.status || 'PENDING').toUpperCase() as AllotmentBadgeStatus;
              const isAllotted = statusUpper === 'ALLOTTED' || statusUpper === 'PARTIALLY_ALLOTTED';

              return (
                <View
                  key={item.applicationId}
                  style={[
                    styles.itemCard,
                    {
                      backgroundColor: isAllotted ? colors.positiveBg : colors.surface,
                      borderColor: isAllotted ? colors.positiveDim : colors.border,
                    },
                  ]}
                >
                  <View style={styles.itemLeft}>
                    <View style={[styles.avatarCircle, { backgroundColor: colors.border }]}>
                      <Text style={[styles.avatarText, { color: colors.foreground }]}>
                        {(item.userName || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.userName}
                      </Text>
                      {item.appliedQuantity ? (
                        <Text style={[styles.subText, { color: colors.mutedForeground }]}>
                          Applied for {item.appliedQuantity} shares
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <AllotmentStatusBadge
                    status={statusUpper}
                    sharesAllotted={item.sharesAllotted}
                    size="sm"
                  />
                </View>
              );
            })}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <Button
              variant="primary"
              size="md"
              title="Done"
              onPress={onClose}
              fullWidth
            />
            {onViewDetails && (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  onClose();
                  onViewDetails();
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                  View Allotment Checker
                </Text>
              </TouchableOpacity>
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
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: DesignSystem.spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    borderRadius: DesignSystem.radius.xl,
    borderWidth: 1,
    maxHeight: '88%',
    padding: DesignSystem.spacing.xl,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: DesignSystem.spacing.lg,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DesignSystem.spacing.md,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  headerTitle: {
    fontSize: DesignSystem.typography.size.title,
    fontFamily: DesignSystem.typography.fontBold,
    textAlign: 'center',
    marginBottom: 4,
  },
  headerSub: {
    fontSize: DesignSystem.typography.size.bodySm,
    fontFamily: DesignSystem.typography.fontMedium,
    textAlign: 'center',
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
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  summaryVal: {
    fontSize: DesignSystem.typography.size.title,
    fontFamily: DesignSystem.typography.fontBold,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: DesignSystem.typography.fontSemiBold,
    marginTop: 2,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: DesignSystem.typography.fontBold,
    letterSpacing: 0.6,
    marginBottom: DesignSystem.spacing.sm,
  },
  listContainer: {
    maxHeight: 220,
    marginBottom: DesignSystem.spacing.lg,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: DesignSystem.spacing.md,
    borderRadius: DesignSystem.radius.md,
    borderWidth: 1,
    marginBottom: DesignSystem.spacing.sm,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: DesignSystem.typography.size.bodySm,
    fontFamily: DesignSystem.typography.fontBold,
  },
  userName: {
    fontSize: DesignSystem.typography.size.body,
    fontFamily: DesignSystem.typography.fontSemiBold,
  },
  subText: {
    fontSize: DesignSystem.typography.size.bodySm,
    fontFamily: DesignSystem.typography.fontRegular,
    marginTop: 1,
  },
  footer: {
    paddingTop: 4,
    gap: DesignSystem.spacing.sm,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: DesignSystem.spacing.sm,
  },
  secondaryBtnText: {
    fontSize: DesignSystem.typography.size.bodySm,
    fontFamily: DesignSystem.typography.fontSemiBold,
  },
});
