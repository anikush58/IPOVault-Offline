import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOOverviewTab } from '@/components/ipo/IPOOverviewTab';
import { IconButton } from '@/components/ui/IconButton';
import { formatCurrency } from '@/utils/formatters';

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[sc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={sc.header}>
        <View style={[sc.iconWrap, { backgroundColor: colors.primary + '18' }]}>
          <Feather name={icon as any} size={17} color={colors.primary} />
        </View>
        <Text style={[sc.title, { color: colors.foreground }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 20, borderWidth: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FormsScreen() {
  const colors = useColors();
  const { showConfirm, showSuccess, showError } = useDialog();
  const router = useRouter();
  const { users, ipos, applications, bankAccounts, addBulkApplications, updateApplication } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Bulk apply state
  const [bulkIPOId, setBulkIPOId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkBankName, setBulkBankName] = useState<string | null>(null);
  const [bulkUPIApp, setBulkUPIApp] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Collapsible sections state (collapsed by default as required by Sprint 13)
  const [isBulkExpanded, setIsBulkExpanded] = useState(false);
  const [isStatusExpanded, setIsStatusExpanded] = useState(false);

  // Pickers
  const [showIPOPicker, setShowIPOPicker] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showUPIPicker, setShowUPIPicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);

  const UPI_APPS = ['GPay', 'BHIM', 'PayTM', 'PhonePe', 'IDFC ASBA', 'BoB ASBA'];

  const appliedApps = applications.filter((a) => a.status === 'Applied');
  const activeIPOs = ipos.filter((ipo) => ipo.archived === 0);
  const selectedIPO = ipos.find((i) => i.id === bulkIPOId);
  const selectedBank = bankAccounts.find((b) => b.bank_name === bulkBankName) ?? null;

  // Active users filtered to exclude those who have already applied for the selected IPO
  const filteredUsers = React.useMemo(() => {
    const activeUsers = users.filter((u) => u.archived !== 1);
    if (!bulkIPOId) return activeUsers;
    const appliedUserIds = new Set(
      applications
        .filter((a) => a.ipo_id === bulkIPOId)
        .map((a) => a.user_id)
    );
    return activeUsers.filter((u) => !appliedUserIds.has(u.id));
  }, [users, applications, bulkIPOId]);

  // Clean up selected user IDs if filteredUsers changes
  React.useEffect(() => {
    const validUserIds = new Set(filteredUsers.map((u) => u.id));
    setSelectedUserIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (validUserIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [filteredUsers]);

  const handleBankSelect = (bankName: string) => {
    setBulkBankName(bankName);
    setShowBankPicker(false);
  };

  const handleUPISelect = (upiApp: string) => {
    setBulkUPIApp(upiApp);
    setShowUPIPicker(false);
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Bank balance impact for currently selected IPO + users
  const holdingNow = selectedBank
    ? applications
        .filter((a) => a.status === 'Holding' && (a.user_bank_name || '').trim().toLowerCase() === (bulkBankName || '').trim().toLowerCase())
        .reduce((s, a) => s + a.buy_price * a.quantity, 0)
    : 0;

  const blockedNow = selectedBank
    ? applications
        .filter((a) => a.status === 'Mandate Approved' && (a.user_bank_name || '').trim().toLowerCase() === (bulkBankName || '').trim().toLowerCase())
        .reduce((s, a) => s + a.buy_price * a.quantity, 0)
    : 0;

  const willBlock = selectedIPO
    ? selectedUserIds.size * selectedIPO.buy_price * selectedIPO.quantity
    : 0;

  const effectiveBankBalance = selectedBank ? Math.max(0, selectedBank.balance - holdingNow) : 0;
  const balanceAfter = selectedBank ? effectiveBankBalance - blockedNow - willBlock : 0;

  const handleBulkCreate = async () => {
    if (!bulkIPOId) { showError('', 'Please select an IPO first.'); return; }
    if (selectedUserIds.size === 0) { showError('', 'Select at least one user.'); return; }
    setBulkLoading(true);
    try {
      await addBulkApplications(bulkIPOId, Array.from(selectedUserIds), bulkBankName ?? undefined, bulkUPIApp ?? undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedUserIds(new Set());
    } catch {
      showError('Error', 'Failed to create applications.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleQuickStatus = (app: ApplicationWithDetails, newStatus: 'Allotted' | 'Not Allotted') => {
    showConfirm({
      title: `Mark as ${newStatus}?`,
      message: `${app.user_name} — ${app.ipo_name}`,
      confirmText: newStatus,
      onConfirm: async () => {
        await updateApplication(app.id, newStatus);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary, marginTop: -2 }]}>IPO MARKET</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPO Hub</Text>
        </View>

        <IconButton
          name="plus"
          variant="surface"
          size="md"
          onPress={() => router.push('/ipos')}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 90, gap: 18 }}>

        {/* Render Curated IPO Hub Overview Tab */}
        <IPOOverviewTab repo={new IPORepository(useSQLiteContext())} onOpenManualAdd={() => router.push('/ipos')} />

        {/* ── SECTION 8: BULK APPLICATION CREATOR (COLLAPSED BY DEFAULT) ── */}
        <View style={[styles.collapsibleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setIsBulkExpanded((prev) => !prev);
            }}
            style={styles.collapsibleHeader}
            activeOpacity={0.8}
          >
            <View style={styles.collapsibleTitleRow}>
              <View style={[styles.collapsibleIcon, { backgroundColor: colors.primary + '18' }]}>
                <Feather name="layers" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.collapsibleTitle, { color: colors.foreground }]}>Bulk Application Creator</Text>
                <Text style={[styles.collapsibleSub, { color: colors.mutedForeground }]}>
                  Create applications for multiple users
                </Text>
              </View>
            </View>
            <Feather name={isBulkExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          {isBulkExpanded && (
            <View style={styles.collapsibleBody}>
              {/* Row 1: SELECT IPO & SELECT USERS side-by-side */}
              <View style={styles.formRow}>
                {/* IPO Selector */}
                <View style={styles.formCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT IPO</Text>
                  <TouchableOpacity
                    onPress={() => setShowIPOPicker(true)}
                    style={[styles.selector, { borderColor: selectedIPO ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                  >
                    <Text style={[styles.selectorText, { color: selectedIPO ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {selectedIPO ? selectedIPO.ipo_name : 'Select IPO…'}
                    </Text>
                    <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* Users Selector */}
                <View style={styles.formCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT USERS</Text>
                  <TouchableOpacity
                    onPress={() => setShowUserPicker(true)}
                    style={[styles.selector, { borderColor: selectedUserIds.size > 0 ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                  >
                    <View style={styles.selectorInner}>
                      {selectedUserIds.size > 0 ? (
                        <View style={[styles.bankDot, { backgroundColor: colors.primary }]} />
                      ) : (
                        <Feather name="users" size={13} color={colors.mutedForeground} />
                      )}
                      <Text style={[styles.selectorText, { color: selectedUserIds.size > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                        {filteredUsers.length === 0 && bulkIPOId
                          ? 'All applied'
                          : selectedUserIds.size === 0
                          ? 'Select users…'
                          : selectedUserIds.size === filteredUsers.length
                          ? `All (${filteredUsers.length})`
                          : `${selectedUserIds.size} users`}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Row 2: SELECT BANK & SELECT UPI APP side-by-side */}
              <View style={styles.formRow}>
                {/* Bank Selector */}
                <View style={styles.formCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT BANK</Text>
                  <TouchableOpacity
                    onPress={() => setShowBankPicker(true)}
                    style={[styles.selector, { borderColor: selectedBank ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                  >
                    <View style={styles.selectorInner}>
                      {selectedBank ? (
                        <View style={[styles.bankDot, { backgroundColor: colors.primary }]} />
                      ) : (
                        <Feather name="credit-card" size={13} color={colors.mutedForeground} />
                      )}
                      <Text style={[styles.selectorText, { color: selectedBank ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                        {selectedBank ? selectedBank.bank_name : 'Select bank…'}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* UPI App Selector */}
                <View style={styles.formCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT UPI / ASBA</Text>
                  <TouchableOpacity
                    onPress={() => setShowUPIPicker(true)}
                    style={[styles.selector, { borderColor: bulkUPIApp ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                  >
                    <View style={styles.selectorInner}>
                      {bulkUPIApp ? (
                        <View style={[styles.bankDot, { backgroundColor: colors.primary }]} />
                      ) : (
                        <Feather name="smartphone" size={13} color={colors.mutedForeground} />
                      )}
                      <Text style={[styles.selectorText, { color: bulkUPIApp ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                        {bulkUPIApp ? bulkUPIApp : 'Select UPI…'}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Balance impact card */}
              {selectedBank && (
                <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 16 }]}>
                  <View style={styles.balanceRow}>
                    <Text style={[styles.balanceKey, { color: colors.mutedForeground }]}>Bank Balance</Text>
                    <Text style={[styles.balanceVal, { color: colors.foreground }]}>{formatCurrency(selectedBank.balance)}</Text>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={[styles.balanceKey, { color: colors.mutedForeground }]}>Already Blocked</Text>
                    <Text style={[styles.balanceVal, { color: blockedNow > 0 ? colors.negative : colors.mutedForeground }]}>
                      {blockedNow > 0 ? `− ${formatCurrency(blockedNow)}` : '—'}
                    </Text>
                  </View>
                  {willBlock > 0 && (
                    <View style={styles.balanceRow}>
                      <Text style={[styles.balanceKey, { color: colors.mutedForeground }]}>
                        Will Block ({selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''})
                      </Text>
                      <Text style={[styles.balanceVal, { color: colors.negative }]}>− {formatCurrency(willBlock)}</Text>
                    </View>
                  )}
                  <View style={[styles.balanceSep, { backgroundColor: colors.border }]} />
                  <View style={styles.balanceRow}>
                    <Text style={[styles.balanceKey, { color: colors.mutedForeground, fontFamily: 'GoogleSansFlex_700Bold' }]}>Remaining</Text>
                    <Text style={[styles.balanceVal, {
                      color: balanceAfter < 0 ? colors.negative : balanceAfter < 15000 ? colors.statusApplied : colors.positive,
                      fontFamily: 'GoogleSansFlex_700Bold',
                    }]}>
                      {formatCurrency(Math.max(0, balanceAfter))}
                      {balanceAfter < 0 && ' ⚠'}
                    </Text>
                  </View>
                </View>
              )}

              <TouchableOpacity
                onPress={handleBulkCreate}
                disabled={bulkLoading || !bulkIPOId || selectedUserIds.size === 0}
                style={[
                  styles.primaryBtn,
                  {
                    marginTop: 16,
                    overflow: 'hidden',
                    backgroundColor: (bulkLoading || !bulkIPOId || selectedUserIds.size === 0) ? colors.surface : colors.primary,
                    borderColor: (bulkLoading || !bulkIPOId || selectedUserIds.size === 0) ? colors.border : colors.primary,
                    borderWidth: 1,
                  },
                ]}
              >
                {(!bulkLoading && bulkIPOId && selectedUserIds.size > 0) && (
                  <LinearGradient colors={[colors.primary, colors.primaryLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                )}
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: (bulkLoading || !bulkIPOId || selectedUserIds.size === 0) ? colors.mutedForeground : '#fff' },
                  ]}
                >
                  {bulkLoading ? 'Creating…' : `Create Applications${selectedUserIds.size > 0 ? ` (${selectedUserIds.size})` : ''}`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── SECTION 9: QUICK STATUS SWITCHER (COLLAPSED BY DEFAULT) ── */}
        <View style={[styles.collapsibleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setIsStatusExpanded((prev) => !prev);
            }}
            style={styles.collapsibleHeader}
            activeOpacity={0.8}
          >
            <View style={styles.collapsibleTitleRow}>
              <View style={[styles.collapsibleIcon, { backgroundColor: '#3B82F618' }]}>
                <Feather name="toggle-left" size={18} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.collapsibleTitle, { color: colors.foreground }]}>Applications Status</Text>
                <Text style={[styles.collapsibleSub, { color: colors.mutedForeground }]}>
                  {appliedApps.length} Pending • {applications.filter(a => a.status === 'Allotted').length} Allotted
                </Text>
              </View>
            </View>
            <Feather name={isStatusExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          {isStatusExpanded && (
            <View style={styles.collapsibleBody}>
              {appliedApps.length === 0 ? (
                <View style={[styles.emptySmall, { backgroundColor: colors.surface }]}>
                  <Feather name="check-circle" size={24} color={colors.mutedForeground} />
                  <Text style={[styles.emptySmallText, { color: colors.mutedForeground }]}>No pending applications</Text>
                </View>
              ) : (
            appliedApps.map((app, idx) => (
              <View
                key={app.id}
                style={[styles.quickRow, { borderBottomColor: colors.border }, idx === appliedApps.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.quickLeft}>
                  <Text style={[styles.quickTitle, { color: colors.foreground }]}>{app.user_name}</Text>
                  <Text style={[styles.quickSub, { color: colors.mutedForeground }]}>
                    {app.ipo_name} · {formatCurrency(app.buy_price * app.quantity)}
                  </Text>
                </View>
                <View style={styles.quickBtns}>
                  <TouchableOpacity onPress={() => handleQuickStatus(app, 'Allotted')} style={[styles.quickBtn, { backgroundColor: colors.statusAllottedBg }]}>
                    <Feather name="check" size={16} color={colors.statusAllotted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleQuickStatus(app, 'Not Allotted')} style={[styles.quickBtn, { backgroundColor: colors.statusNotAllottedBg }]}>
                    <Feather name="x" size={16} color={colors.statusNotAllotted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Modals ── */}

      {/* IPO Picker */}
      <Modal visible={showIPOPicker} transparent animationType="slide" onRequestClose={() => setShowIPOPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowIPOPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(Math.round(insets.bottom * 0.5) + 8, 12) }]} onPress={() => {}}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.pickerTitleRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerRowTitle, { color: colors.foreground }]}>Select IPO</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(Math.round(insets.bottom * 0.5), 8) }}>
              {activeIPOs.length === 0 ? (
                <Text style={[styles.noData, { color: colors.mutedForeground, padding: 24 }]}>No active IPOs added yet.</Text>
              ) : (
                activeIPOs.map((ipo) => (
                  <TouchableOpacity
                    key={ipo.id}
                    onPress={() => { setBulkIPOId(ipo.id); setShowIPOPicker(false); }}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: bulkIPOId === ipo.id ? colors.surface : 'transparent' }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{ipo.ipo_name}</Text>
                      <Text style={[styles.pickerRowSub, { color: colors.mutedForeground }]}>
                        {formatCurrency(ipo.buy_price)} × {ipo.quantity} = {formatCurrency(ipo.buy_price * ipo.quantity)}
                      </Text>
                    </View>
                    {bulkIPOId === ipo.id && <Feather name="check" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bank Picker */}
      <Modal visible={showBankPicker} transparent animationType="slide" onRequestClose={() => setShowBankPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowBankPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(Math.round(insets.bottom * 0.5) + 8, 12) }]} onPress={() => {}}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.pickerTitleRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerRowTitle, { color: colors.foreground }]}>Select Bank</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(Math.round(insets.bottom * 0.5), 8) }}>
              {bankAccounts.length === 0 ? (
                <Text style={[styles.noData, { color: colors.mutedForeground, padding: 24 }]}>
                  No bank accounts added yet — go to the Banks tab.
                </Text>
              ) : (
                bankAccounts.map((bank) => {
                  const targetKey = (bank.bank_name || '').trim().toLowerCase();
                  const holding = applications
                    .filter((a) => a.status === 'Holding' && (a.user_bank_name || '').trim().toLowerCase() === targetKey)
                    .reduce((s, a) => s + a.buy_price * a.quantity, 0);
                  const effectiveBal = Math.max(0, bank.balance - holding);
                  const blocked = applications
                    .filter((a) => a.status === 'Mandate Approved' && (a.user_bank_name || '').trim().toLowerCase() === targetKey)
                    .reduce((s, a) => s + a.buy_price * a.quantity, 0);
                  const available = Math.max(0, effectiveBal - blocked);
                  const appliedCount = applications.filter(
                    (a) => (a.status === 'Applied' || a.status === 'Mandate Approved') && (a.user_bank_name || '').trim().toLowerCase() === targetKey
                  ).length;
                  const ipoCost = selectedIPO ? (selectedIPO.buy_price * selectedIPO.quantity) : 15000;
                  const canApplyCount = Math.floor(available / ipoCost);

                  return (
                    <TouchableOpacity
                      key={bank.id}
                      onPress={() => handleBankSelect(bank.bank_name)}
                      style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: bulkBankName === bank.bank_name ? colors.surface : 'transparent' }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{bank.bank_name}</Text>
                        <Text style={[styles.pickerRowSub, { color: colors.mutedForeground }]}>
                          Available {formatCurrency(available)} · {appliedCount} Applied · {canApplyCount} can be applied
                        </Text>
                      </View>
                      {bulkBankName === bank.bank_name && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* UPI App Picker */}
      <Modal visible={showUPIPicker} transparent animationType="slide" onRequestClose={() => setShowUPIPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowUPIPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(Math.round(insets.bottom * 0.5) + 8, 12) }]} onPress={() => {}}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.pickerTitleRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerRowTitle, { color: colors.foreground }]}>Select UPI App / ASBA</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(Math.round(insets.bottom * 0.5), 8) }}>
              {UPI_APPS.map((app) => (
                <TouchableOpacity
                  key={app}
                  onPress={() => handleUPISelect(app)}
                  style={[
                    styles.pickerRow,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor: bulkUPIApp === app ? colors.surface : 'transparent',
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{app}</Text>
                  </View>
                  {bulkUPIApp === app && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* User Picker */}
      <Modal visible={showUserPicker} transparent animationType="slide" onRequestClose={() => setShowUserPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowUserPicker(false)}>
          <Pressable
            style={[
              styles.pickerSheet,
              {
                backgroundColor: colors.background,
                borderTopColor: colors.border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            {/* Header row with title + select-all */}
            <View style={[styles.pickerHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerSheetTitleInline, { color: colors.foreground }]}>Select Users</Text>
              <TouchableOpacity
                onPress={() =>
                  setSelectedUserIds(
                    selectedUserIds.size === filteredUsers.length
                      ? new Set()
                      : new Set(filteredUsers.map((u) => u.id))
                  )
                }
                style={[styles.selectAllBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.selectAllBtnText, { color: colors.primary }]}>
                  {selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0
                    ? 'Deselect All'
                    : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
              {filteredUsers.map((u) => {
                const isSelected = selectedUserIds.has(u.id);
                const perAccountBlock = selectedIPO ? selectedIPO.buy_price * selectedIPO.quantity : null;
                return (
                  <TouchableOpacity
                    key={u.id}
                    onPress={() => toggleUser(u.id)}
                    style={[
                      styles.pickerRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected ? colors.primary + '0E' : 'transparent',
                      },
                    ]}
                  >
                    {/* Checkbox */}
                    <View style={[
                      styles.checkbox,
                      {
                        borderColor: isSelected ? colors.primary : colors.mutedForeground,
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                      },
                    ]}>
                      {isSelected && <Feather name="check" size={11} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{u.name}</Text>
                      <Text style={[styles.pickerRowSub, { color: colors.mutedForeground }]}>
                        {u.broker || 'No broker'}
                      </Text>
                    </View>
                    {perAccountBlock && isSelected && (
                      <Text style={[styles.userBlockAmt, { color: colors.negative }]}>
                        −{formatCurrency(perAccountBlock)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Done button */}
            <View style={[styles.pickerDoneWrap, { paddingBottom: Math.max(insets.bottom, 4) + 6 }]}>
              <TouchableOpacity
                onPress={() => setShowUserPicker(false)}
                style={[styles.pickerDoneBtn, { overflow: 'hidden' }]}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.pickerDoneBtnText}>
                  {selectedUserIds.size === 0
                    ? 'Done'
                    : `Done — ${selectedUserIds.size} user${selectedUserIds.size !== 1 ? 's' : ''} selected`}
                </Text>
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
  header: { paddingHorizontal: 16, overflow: 'hidden', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 30, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.8, lineHeight: 34 },
  desc: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', marginBottom: 16, lineHeight: 20 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingVertical: 14 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.1 },

  // Collapsible Cards
  collapsibleCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  collapsibleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  collapsibleIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsibleTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  collapsibleSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  collapsibleBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },

  // Bulk apply
  // Form grid rows & columns
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  formCol: {
    flex: 1,
  },
  fieldLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 0.9, marginBottom: 8, textTransform: 'uppercase' },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 },
  selectorInner: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 4 },
  selectorText: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', flex: 1 },
  bankDot: { width: 8, height: 8, borderRadius: 4 },

  // Balance impact
  balanceCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
    marginBottom: 6,
    gap: 9,
  },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceKey: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular' },
  balanceVal: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },
  balanceSep: { height: 1, marginVertical: 2 },

  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  userBlockAmt: { fontSize: 12, fontFamily: 'GoogleSansFlex_600SemiBold' },
  pickerHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  pickerSheetTitleInline: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  selectAllBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  selectAllBtnText: { fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium' },
  pickerDoneWrap: { padding: 16 },
  pickerDoneBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  pickerDoneBtnText: { color: '#fff', fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.1 },
  noData: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', fontStyle: 'italic' },
  emptySmall: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 12 },
  emptySmallText: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' },

  quickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1 },
  quickLeft: { flex: 1 },
  quickTitle: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
  quickSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },
  quickBtns: { flexDirection: 'row', gap: 8 },
  quickBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  // Modals
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: 620, borderTopWidth: 1 },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  pickerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  pickerRowTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  pickerSheetTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', padding: 20, paddingBottom: 14, borderBottomWidth: 1, letterSpacing: -0.3 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, gap: 12 },
  pickerRowName: { fontSize: 15, fontFamily: 'GoogleSansFlex_500Medium' },
  pickerRowSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },

});
