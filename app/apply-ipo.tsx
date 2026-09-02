import React, { useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency } from '@/utils/formatters';

const DEFAULT_UPI_APPS = ['HDFC UPI', 'GPay', 'PhonePe', 'BHIM', 'Paytm', 'ICICI iMobile', 'BoB ASBA', 'IDFC ASBA', 'Other'];

export default function ApplyIPOScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ ipoId?: string; id?: string; name?: string; ipo_name?: string; company_name?: string }>();
  const { showSuccess, showError } = useDialog();
  const { users, ipos, applications, bankAccounts, addBulkApplications } = useDB();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const targetParamId = params.ipoId || params.id || params.name || params.ipo_name || params.company_name || null;
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(targetParamId);
  const [masterRecord, setMasterRecord] = useState<IPOMasterRecord | null>(null);
  const [userLotQuantities, setUserLotQuantities] = useState<Record<string, number>>({});
  const [userSelectedBank, setUserSelectedBank] = useState<Record<string, string>>({});
  const [userSelectedUPI, setUserSelectedUPI] = useState<Record<string, string>>({});
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Pickers State
  const [showIPOPicker, setShowIPOPicker] = useState(false);
  const [activeLotPickerUserId, setActiveLotPickerUserId] = useState<string | null>(null);
  const [activeBankPickerUserId, setActiveBankPickerUserId] = useState<string | null>(null);

  const repo = useMemo(() => new IPORepository(db), [db]);
  const activeUsers = useMemo(() => users.filter((u) => u.archived !== 1), [users]);
  const activeIPOs = useMemo(() => ipos.filter((ipo) => ipo.archived === 0), [ipos]);

  // Fetch record from ipo_master if selectedIpoId is passed
  useEffect(() => {
    async function resolveMaster() {
      if (!selectedIpoId) return;
      try {
        const found = await repo.getById(selectedIpoId);
        if (found) {
          setMasterRecord(found);
        } else {
          const searchResults = await repo.search(selectedIpoId);
          if (searchResults && searchResults.length > 0) {
            setMasterRecord(searchResults[0]);
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('[ApplyIPO] Could not fetch master IPO record', err);
      }
    }
    resolveMaster();
  }, [selectedIpoId, repo]);

  // Match selected IPO by id, company_name, or ipo_name from master or local listings
  const selectedIPO = useMemo(() => {
    if (!selectedIpoId) return undefined;
    const target = selectedIpoId.toLowerCase().trim();

    // Check master record fetched from ipo_master
    if (masterRecord) {
      const price = masterRecord.price_band_max || masterRecord.price_band_min || 0;
      return {
        id: masterRecord.id,
        company_name: masterRecord.company_name || masterRecord.ipo_name,
        ipo_name: masterRecord.company_name || masterRecord.ipo_name,
        buy_price: price,
        quantity: masterRecord.lot_size || 1,
        issue_type: masterRecord.issue_type || 'Mainboard',
        exchange: masterRecord.exchange || 'NSE, BSE',
        close_date: masterRecord.close_date || '',
        open_date: masterRecord.open_date || '',
      };
    }

    // Check local ipo_listings from useDB()
    const fromListings = ipos.find(
      (i) =>
        i.id?.toLowerCase() === target ||
        (i as any).company_name?.toLowerCase().trim() === target ||
        i.ipo_name?.toLowerCase().trim() === target
    );
    if (fromListings) {
      return {
        id: fromListings.id,
        company_name: fromListings.ipo_name,
        ipo_name: fromListings.ipo_name,
        buy_price: fromListings.buy_price,
        quantity: fromListings.quantity,
        issue_type: fromListings.issue_type,
        exchange: fromListings.exchange,
        close_date: fromListings.close_date,
        open_date: fromListings.open_date,
      };
    }

    return undefined;
  }, [ipos, selectedIpoId, masterRecord]);

  React.useEffect(() => {
    if (params.ipoId) {
      setSelectedIpoId(params.ipoId);
    } else if (!selectedIpoId && activeIPOs.length > 0) {
      setSelectedIpoId(activeIPOs[0].id);
    }
  }, [params.ipoId, activeIPOs]);

  // Set default lot = 1 and pre-select all eligible users whenever target IPO changes
  React.useEffect(() => {
    if (!selectedIpoId) return;

    const defaultLots: Record<string, number> = {};
    const defaultSelected = new Set<string>();

    users.forEach((u) => {
      const isAlreadyApplied = applications.some((a) => a.ipo_id === selectedIpoId && a.user_id === u.id);
      if (!isAlreadyApplied) {
        defaultLots[u.id] = 1; // Default lot = 1
        defaultSelected.add(u.id); // Auto select user
      }
    });

    setUserLotQuantities(defaultLots);
    setSelectedUserIds(defaultSelected);
  }, [selectedIpoId, users, applications]);

  // Aggregate Order Summary Calculation
  const orderSummary = useMemo(() => {
    let totalLots = 0;
    let totalShares = 0;
    let totalAmount = 0;
    const lotSize = selectedIPO?.quantity || 1;
    const unitPrice = selectedIPO?.buy_price || 0;

    selectedUserIds.forEach((uid) => {
      const lots = userLotQuantities[uid] || 0;
      totalLots += lots;
      totalShares += lots * lotSize;
      totalAmount += lots * lotSize * unitPrice;
    });

    return {
      applicantCount: selectedUserIds.size,
      totalLots,
      totalShares,
      totalAmount,
    };
  }, [selectedUserIds, userLotQuantities, selectedIPO]);

  const handleBulkSubmit = async () => {
    if (!selectedIpoId) {
      showError('', 'Please select an IPO first.');
      return;
    }
    if (selectedUserIds.size === 0) {
      showError('', 'Please select bid quantity for at least one applicant.');
      return;
    }
    setLoading(true);
    try {
      await addBulkApplications(selectedIpoId, Array.from(selectedUserIds));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/bids');
    } catch (err: any) {
      if (__DEV__) console.error('[ApplyIPO] Bulk application submission error:', err);
      showError('Submission Error', 'Failed to submit IPO applications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── App Bar Header ── */}
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
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />

        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>DIRECT BID ENGINE</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Apply IPO</Text>
        </View>

        <View style={{ width: 44, height: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        {/* ── Step Progress Indicator ── */}
        <View style={[styles.stepBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.stepItem}>
            <View style={[styles.stepNumActive, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumTextActive}>1</Text>
            </View>
            <Text style={[styles.stepLabel, { color: colors.foreground }]}>Select IPO</Text>
          </View>

          <View style={[styles.stepConnector, { backgroundColor: selectedIPO ? colors.primary : colors.border }]} />

          <View style={styles.stepItem}>
            <View style={[styles.stepNum, { backgroundColor: selectedUserIds.size > 0 ? colors.primary : colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.stepNumText, { color: selectedUserIds.size > 0 ? '#FFFFFF' : colors.mutedForeground }]}>2</Text>
            </View>
            <Text style={[styles.stepLabel, { color: selectedUserIds.size > 0 ? colors.foreground : colors.mutedForeground }]}>Configure Bids</Text>
          </View>

          <View style={[styles.stepConnector, { backgroundColor: selectedUserIds.size > 0 ? colors.primary : colors.border }]} />

          <View style={styles.stepItem}>
            <View style={[styles.stepNum, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.stepNumText, { color: colors.mutedForeground }]}>3</Text>
            </View>
            <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>Mandate</Text>
          </View>
        </View>

        {/* ── UPI Mandate Notice ── */}
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: isDark ? '#2D2206' : '#FFFDF0',
              borderColor: isDark ? '#D4A01744' : '#FCD34D',
            },
          ]}
        >
          <View style={styles.noticeIconWrap}>
            <Feather name="clock" size={16} color="#D4A017" />
          </View>
          <Text style={[styles.noticeText, { color: isDark ? '#FDE68A' : '#92400E' }]}>
            Bids submitted after 5:00 PM will trigger UPI Mandate requests at 10:00 AM on the next exchange working day.
          </Text>
        </View>

        {/* ── Selected IPO Showcase Card ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TARGET IPO</Text>
        </View>

        <View
          style={[styles.ipoShowcaseCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.ipoShowcaseTop}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.ipoShowcaseTitle, { color: colors.foreground }]} numberOfLines={1}>
                {selectedIPO ? (selectedIPO.company_name || selectedIPO.ipo_name) : 'No IPO Selected'}
              </Text>
              <Text style={[styles.ipoShowcaseSub, { color: colors.mutedForeground }]}>
                {selectedIPO?.issue_type || 'Mainboard'} · {selectedIPO?.exchange || 'NSE, BSE'}
              </Text>
            </View>

            <View style={[styles.statusBadgeLive, { borderColor: '#10B981', borderWidth: 1 }]}>
              <Text style={[styles.liveBadgeText, { color: '#10B981' }]}>LIVE BID</Text>
            </View>
          </View>

          {selectedIPO ? (
            <View style={[styles.metricsBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.metricCell}>
                <Text style={[styles.metricKey, { color: colors.mutedForeground }]}>PRICE BAND</Text>
                <Text style={[styles.metricVal, { color: colors.foreground }]}>
                  {masterRecord?.price_band_max
                    ? masterRecord.price_band_min === masterRecord.price_band_max
                      ? `₹${masterRecord.price_band_max}`
                      : `₹${masterRecord.price_band_min} - ₹${masterRecord.price_band_max}`
                    : selectedIPO.buy_price
                    ? `₹${selectedIPO.buy_price}`
                    : 'TBA'}
                </Text>
              </View>

              <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

              <View style={styles.metricCell}>
                <Text style={[styles.metricKey, { color: colors.mutedForeground }]}>LOT SIZE</Text>
                <Text style={[styles.metricVal, { color: colors.foreground }]}>
                  {selectedIPO.quantity ? `${selectedIPO.quantity} Shares` : masterRecord?.lot_size ? `${masterRecord.lot_size} Shares` : '1 Lot'}
                </Text>
              </View>

              <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

              <View style={styles.metricCell}>
                <Text style={[styles.metricKey, { color: colors.mutedForeground }]}>CLOSING DATE</Text>
                <Text style={[styles.metricVal, { color: isDark ? '#F87171' : '#DC2626' }]}>
                  {selectedIPO.close_date || masterRecord?.close_date || 'Open'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Applicants List ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            APPLICANTS ({selectedUserIds.size} SELECTED)
          </Text>
          <TouchableOpacity onPress={() => router.push('/users')}>
            <Text style={[styles.changeIpoText, { color: colors.primary }]}>+ Add Applicant</Text>
          </TouchableOpacity>
        </View>

        {activeUsers.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="users" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No investor profiles found. Create user profiles to apply.
            </Text>
          </View>
        ) : (
          activeUsers.map((u) => {
            const currentLots = userLotQuantities[u.id] || 0;
            const lotSize = selectedIPO?.quantity || 1;
            const unitPrice = selectedIPO?.buy_price || 0;
            const totalShares = currentLots * lotSize;
            const totalAmt = totalShares * unitPrice;
            const isAppliedForThisIpo = Boolean(selectedIpoId && applications.some((a) => a.ipo_id === selectedIpoId && a.user_id === u.id));
            const selectedBank = userSelectedBank[u.id] || u.bank_name || (bankAccounts[0]?.bank_name ?? 'Default Bank');
            const selectedUPI = userSelectedUPI[u.id] || u.upi_id || u.upi_app || 'HDFC UPI';

            return (
              <View
                key={u.id}
                style={[
                  styles.applicantCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: currentLots > 0 ? colors.primary : colors.border,
                    opacity: isAppliedForThisIpo ? 0.6 : 1,
                  },
                ]}
              >
                {/* Applicant Header */}
                <View style={styles.applicantHeader}>
                  <View style={styles.applicantAvatarRow}>
                    <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '18' }]}>
                      <Text style={[styles.avatarText, { color: colors.primary }]}>
                        {u.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={[styles.applicantName, { color: colors.foreground }]}>{u.name}</Text>
                      <Text style={[styles.applicantMeta, { color: colors.mutedForeground }]}>
                        PAN: {u.pan_number ? u.pan_number : '-'} · Demat: {u.client_id ? u.client_id : '-'}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.brokerBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.brokerText, { color: colors.mutedForeground }]}>
                      {u.broker ? u.broker.toUpperCase() : 'CDSL'}
                    </Text>
                  </View>
                </View>

                {/* Account & Mandate Config Row */}
                <View style={[styles.configRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TouchableOpacity
                    onPress={() => setActiveBankPickerUserId(u.id)}
                    style={styles.configItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="credit-card" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.configText, { color: colors.foreground }]} numberOfLines={1}>
                      {selectedBank}
                    </Text>
                    <Feather name="chevron-down" size={12} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  <View style={[styles.configDivider, { backgroundColor: colors.border }]} />

                  <TouchableOpacity
                    onPress={() => {
                      const nextUpiIndex = (DEFAULT_UPI_APPS.indexOf(selectedUPI) + 1) % DEFAULT_UPI_APPS.length;
                      setUserSelectedUPI((prev) => ({ ...prev, [u.id]: DEFAULT_UPI_APPS[nextUpiIndex] }));
                      Haptics.selectionAsync();
                    }}
                    style={styles.configItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="smartphone" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.configText, { color: colors.foreground }]} numberOfLines={1}>
                      {selectedUPI}
                    </Text>
                    <Feather name="refresh-cw" size={10} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* Lot Selection Row */}
                {isAppliedForThisIpo ? (
                  <View style={[styles.appliedNoticeRow, { borderTopColor: colors.border }]}>
                    <Feather name="check-circle" size={14} color={isDark ? '#34D399' : '#059669'} />
                    <Text style={[styles.appliedNoticeText, { color: isDark ? '#34D399' : '#059669' }]}>
                      Application already submitted for this IPO
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.lotSelectionRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.lotSelectKey, { color: colors.mutedForeground }]}>BID QUANTITY</Text>
                    <TouchableOpacity
                      onPress={() => setActiveLotPickerUserId(u.id)}
                      activeOpacity={0.8}
                      style={[
                        styles.lotSelectTrigger,
                        {
                          borderColor: currentLots > 0 ? colors.primary : colors.border,
                          backgroundColor: currentLots > 0 ? colors.primary + '12' : colors.surface,
                        },
                      ]}
                    >
                      <Text style={[styles.lotSelectVal, { color: currentLots > 0 ? colors.primary : colors.foreground }]}>
                        {currentLots > 0 ? `${currentLots} Lot (${totalShares} Shares) · ${formatCurrency(totalAmt)}` : 'Select Lots →'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}

      </ScrollView>

      {/* ── Sticky Order Summary Footer ── */}
      <View
        style={[
          styles.stickyFooter,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.footerSummaryRow}>
          <View>
            <Text style={[styles.footerSummaryKey, { color: colors.mutedForeground }]}>TOTAL INVESTMENT</Text>
            <Text style={[styles.footerSummaryVal, { color: colors.foreground }]}>
              {formatCurrency(orderSummary.totalAmount)}
            </Text>
            <Text style={[styles.footerSummarySub, { color: colors.mutedForeground }]}>
              {orderSummary.applicantCount} Applicant{orderSummary.applicantCount !== 1 ? 's' : ''} · {orderSummary.totalLots} Lots ({orderSummary.totalShares} Shares)
            </Text>
          </View>

          <Button
            variant="primary"
            size="md"
            title="Submit Bids →"
            loading={loading}
            disabled={loading || !selectedIpoId || selectedUserIds.size === 0}
            onPress={handleBulkSubmit}
          />
        </View>
      </View>

      {/* ── Active IPO Selector Modal ── */}
      <Modal visible={showIPOPicker} transparent animationType="fade" onRequestClose={() => setShowIPOPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowIPOPicker(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Target IPO</Text>
              <TouchableOpacity onPress={() => setShowIPOPicker(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {activeIPOs.length === 0 ? (
                <Text style={[styles.modalEmptyText, { color: colors.mutedForeground }]}>No active IPOs available.</Text>
              ) : (
                activeIPOs.map((ipo) => (
                  <TouchableOpacity
                    key={ipo.id}
                    onPress={() => {
                      setSelectedIpoId(ipo.id);
                      setShowIPOPicker(false);
                    }}
                    style={[
                      styles.modalOptionRow,
                      { borderBottomColor: colors.border, backgroundColor: selectedIpoId === ipo.id ? colors.surface : 'transparent' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalOptionName, { color: colors.foreground }]}>{ipo.ipo_name}</Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                        Price: ₹{ipo.buy_price || '-'} · Lot Size: {ipo.quantity || '-'}
                      </Text>
                    </View>
                    {selectedIpoId === ipo.id && <Feather name="check" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Lot Selector Modal ── */}
      <Modal visible={Boolean(activeLotPickerUserId)} transparent animationType="fade" onRequestClose={() => setActiveLotPickerUserId(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActiveLotPickerUserId(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: 420, padding: 0 }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {Array.from({ length: 20 }, (_, i) => i).map((lotCount) => {
                const lotSize = selectedIPO?.quantity || 1;
                const unitPrice = selectedIPO?.buy_price || 0;
                const totalShares = lotCount * lotSize;
                const totalCost = totalShares * unitPrice;
                const userId = activeLotPickerUserId;
                const isSelected = userId ? (userLotQuantities[userId] || 0) === lotCount : false;

                return (
                  <TouchableOpacity
                    key={lotCount}
                    onPress={() => {
                      if (userId) {
                        setUserLotQuantities((prev) => ({ ...prev, [userId]: lotCount }));
                        setSelectedUserIds((prev) => {
                          const n = new Set(prev);
                          if (lotCount > 0) n.add(userId);
                          else n.delete(userId);
                          return n;
                        });
                      }
                      setActiveLotPickerUserId(null);
                    }}
                    style={[
                      styles.modalOptionRow,
                      { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.surface : 'transparent' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.lotOptionText,
                        { color: isSelected ? colors.primary : colors.foreground },
                        isSelected && { fontFamily: 'GoogleSansFlex_700Bold' },
                      ]}
                    >
                      {lotCount === 0 ? '0 Lots (Remove)' : `${lotCount} Lot (${totalShares} Shares) · ${formatCurrency(totalCost)}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Bank Selector Modal ── */}
      <Modal visible={Boolean(activeBankPickerUserId)} transparent animationType="fade" onRequestClose={() => setActiveBankPickerUserId(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActiveBankPickerUserId(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select ASBA Bank Account</Text>
              <TouchableOpacity onPress={() => setActiveBankPickerUserId(null)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {bankAccounts.length === 0 ? (
                <Text style={[styles.modalEmptyText, { color: colors.mutedForeground }]}>No bank accounts added yet.</Text>
              ) : (
                bankAccounts.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => {
                      if (activeBankPickerUserId) {
                        setUserSelectedBank((prev) => ({ ...prev, [activeBankPickerUserId]: b.bank_name }));
                      }
                      setActiveBankPickerUserId(null);
                    }}
                    style={[styles.modalOptionRow, { borderBottomColor: colors.border }]}
                  >
                    <Text style={[styles.modalOptionName, { color: colors.foreground }]}>{b.bank_name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  headerLinkText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },

  // Step bar
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepNumActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumTextActive: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  stepConnector: {
    flex: 1,
    height: 1.5,
    marginHorizontal: 8,
  },

  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  noticeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D4A01720',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    lineHeight: 18,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  changeIpoText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // IPO Showcase Card
  ipoShowcaseCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  ipoShowcaseTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ipoShowcaseTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  ipoShowcaseSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  statusBadgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
  },

  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricKey: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  metricDivider: {
    width: 1,
    height: 24,
  },

  emptyBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },

  // Applicant Card
  applicantCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  applicantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  applicantAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  applicantName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  applicantMeta: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  brokerBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  brokerText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  configItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  configText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
  },
  configDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 8,
  },

  appliedNoticeRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedNoticeText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  lotSelectionRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lotSelectKey: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  lotSelectTrigger: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lotSelectVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  bottomShortcuts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 4,
  },
  shortcutText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textDecorationLine: 'underline',
  },

  // Sticky Summary Footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerSummaryKey: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  footerSummaryVal: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
  },
  footerSummarySub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },

  submitGoldBtn: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitGoldBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalEmptyText: {
    padding: 20,
    textAlign: 'center',
    fontStyle: 'italic',
    fontSize: 13,
  },
  modalOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalOptionName: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  lotOptionText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
});

