import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useTheme } from '@/context/ThemeContext';
import { useDB, type BankAccount } from '@/context/DBContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { KPICard } from '@/components/KPICard';
import { formatCurrency } from '@/utils/formatters';
import { calcBankSlots } from '@/utils/calculations';

// ── Helpers ───────────────────────────────────────────────────────────────────

const IPO_LOT_COST = 15000;

// ── Balance Modal ─────────────────────────────────────────────────────────────

function BankModal({
  visible,
  bank,
  onClose,
  onSave,
}: {
  visible: boolean;
  bank: BankAccount | null; // null = add mode
  onClose: () => void;
  onSave: (name: string, balance: number) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const isAdd = bank === null;

  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');

  React.useEffect(() => {
    if (visible) {
      setName(bank?.bank_name ?? '');
      setBalance(bank ? String(bank.balance) : '');
    }
  }, [visible, bank]);

  const { showError } = useDialog();

  const handleSave = () => {
    const trimmed = name.trim();
    const num = parseFloat(balance.replace(/,/g, ''));
    if (isAdd && !trimmed) {
      showError('Required', 'Enter a bank name.'); return;
    }
    if (isNaN(num) || num < 0) {
      showError('Invalid', 'Enter a valid balance amount.'); return;
    }
    onSave(trimmed, num);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <TouchableOpacity style={ms.overlay} onPress={onClose} activeOpacity={1} />
        <View style={[ms.sheet, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(Math.round(insets.bottom * 0.5) + 12, 18) }]}>
          <View style={[ms.handle, { backgroundColor: colors.border }]} />

          <Text style={[ms.title, { color: colors.foreground }]}>
            {isAdd ? 'Add Bank Account' : 'Update Balance'}
          </Text>
          <Text style={[ms.subtitle, { color: colors.mutedForeground }]}>
            {isAdd ? 'Add a bank account to track your available capital.' : `Update current balance for ${bank?.bank_name}.`}
          </Text>

          {isAdd && (
            <View style={ms.fieldGroup}>
              <Text style={[ms.fieldLabel, { color: colors.mutedForeground }]}>BANK NAME</Text>
              <TextInput
                style={[ms.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                placeholder="e.g. HDFC Bank"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={ms.fieldGroup}>
            <Text style={[ms.fieldLabel, { color: colors.mutedForeground }]}>CURRENT BALANCE (₹)</Text>
            <TextInput
              style={[ms.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
              placeholder="e.g. 75000"
              placeholderTextColor={colors.mutedForeground}
              value={balance}
              onChangeText={setBalance}
              keyboardType="numeric"
              autoFocus={!isAdd}
            />
          </View>

          {balance.length > 0 && !isNaN(parseFloat(balance)) && (
            <View style={[ms.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="trending-up" size={14} color={colors.primary} />
              <Text style={[ms.previewText, { color: colors.mutedForeground }]}>
                IPO capacity:{' '}
                <Text style={[ms.previewBold, { color: colors.primary }]}>
                  {Math.floor(parseFloat(balance) / IPO_LOT_COST)} lots
                </Text>
                {' '}at ₹{IPO_LOT_COST.toLocaleString()} each
              </Text>
            </View>
          )}

          <Button
            variant="primary"
            size="lg"
            title={isAdd ? 'Add Bank Account' : 'Save Balance'}
            onPress={handleSave}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Bank Card ─────────────────────────────────────────────────────────────────

function BankCard({
  bank,
  blocked,
  ipoPrice = 15000,
  onEdit,
  onDelete,
}: {
  bank: BankAccount;
  blocked: number;
  ipoPrice?: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const balance = bank.balance || 0;
  const available = Math.max(0, balance - blocked);
  const slots = Math.floor(available / (ipoPrice > 0 ? ipoPrice : 15000));

  return (
    <View style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <View style={[styles.bankIcon, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="credit-card" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bankName, { color: colors.foreground }]}>{bank.bank_name}</Text>
            <Text style={[styles.bankSub, { color: colors.mutedForeground }]}>
              {slots} {slots === 1 ? 'lot capacity' : 'lots capacity'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <IconButton name="edit-2" variant="primary" size="sm" onPress={onEdit} />
          <IconButton name="trash-2" variant="destructive" size="sm" onPress={onDelete} />
        </View>
      </View>

      <View style={[styles.metricsRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View style={styles.metricCell}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL BALANCE</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{formatCurrency(balance)}</Text>
        </View>
        <View style={[styles.metricSep, { backgroundColor: colors.border }]} />
        <View style={styles.metricCell}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>BLOCKED</Text>
          <Text style={[styles.metricValue, { color: blocked > 0 ? colors.negative : colors.mutedForeground }]}>
            {blocked > 0 ? formatCurrency(blocked) : '—'}
          </Text>
        </View>
        <View style={[styles.metricSep, { backgroundColor: colors.border }]} />
        <View style={styles.metricCell}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>AVAILABLE</Text>
          <Text style={[styles.metricValue, { color: colors.positive }]}>{formatCurrency(available)}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BanksScreen() {
  const colors = useColors();
  const router = useRouter();
  const { bankAccounts, ipos, applications, isLoading, refresh, addBankAccount, updateBankBalance, deleteBankAccount } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);

  const activeIpo = ipos.find((i) => i.archived === 0);
  const activeIpoLotCost = (activeIpo && activeIpo.buy_price && activeIpo.quantity)
    ? activeIpo.buy_price * activeIpo.quantity
    : 15000;

  const getBankBlocked = (bankName: string) => {
    const targetKey = (bankName || '').trim().toLowerCase();
    return applications
      .filter(
        (a) =>
          a.status === 'Mandate Approved' &&
          (a.user_bank_name || '').trim().toLowerCase() === targetKey
      )
      .reduce((sum, a) => sum + (a.buy_price || 0) * (a.quantity || 0), 0);
  };

  const totalBalance = bankAccounts.reduce((s, b) => s + b.balance, 0);
  const totalBlocked = bankAccounts.reduce((s, b) => s + getBankBlocked(b.bank_name), 0);
  const totalAvailable = Math.max(0, totalBalance - totalBlocked);
  const totalSlots = bankAccounts.reduce((sum, b) => {
    const blocked = getBankBlocked(b.bank_name);
    const avail = Math.max(0, b.balance - blocked);
    return sum + Math.floor(avail / (activeIpoLotCost > 0 ? activeIpoLotCost : 15000));
  }, 0);

  const openAdd = () => {
    setEditingBank(null);
    setModalVisible(true);
  };

  const openEdit = (bank: BankAccount) => {
    setEditingBank(bank);
    setModalVisible(true);
  };

  const { showConfirm } = useDialog();

  const handleDelete = (bank: BankAccount) => {
    showConfirm({
      title: 'Delete Bank Account',
      message: `Remove "${bank.bank_name}" from your tracked accounts?`,
      confirmText: 'Delete',
      isDanger: true,
      onConfirm: async () => {
        await deleteBankAccount(bank.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      },
    });
  };

  const handleSave = async (name: string, balance: number) => {
    try {
      if (editingBank) {
        await updateBankBalance(editingBank.id, balance, name);
      } else {
        await addBankAccount(name, balance);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message?.includes('UNIQUE') ? 'A bank with that name already exists.' : 'Failed to save.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />

        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>CAPITAL</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Banks</Text>
        </View>

        <IconButton
          name="plus"
          variant="surface"
          size="md"
          onPress={openAdd}
        />
      </View>

      <FlatList
        data={bankAccounts}
        keyExtractor={(b) => b.id.toString()}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />}
        ListHeaderComponent={() => (
          <>
            {/* KPI 2×2 grid */}
            <View style={styles.kpiGrid}>
              <View style={styles.kpiRow}>
                <KPICard label="Total Balance" value={formatCurrency(totalBalance)} />
                <KPICard
                  label="Total Blocked"
                  value={formatCurrency(totalBlocked)}
                  isNegative={totalBlocked > 0}
                />
              </View>
              <View style={styles.kpiRow}>
                <KPICard label="Available" value={formatCurrency(totalAvailable)} isPositive={totalAvailable > 0} />
                <KPICard
                  label="IPO Slots"
                  value={String(totalSlots)}
                  isPositive={totalSlots > 0}
                  isNegative={totalSlots === 0 && totalBalance > 0}
                />
              </View>
            </View>

            {bankAccounts.length > 0 && (
              <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ACCOUNTS</Text>
            )}
          </>
        )}
        renderItem={({ item }) => (
          <BankCard
            bank={item}
            blocked={getBankBlocked(item.bank_name)}
            ipoPrice={activeIpoLotCost}
            onEdit={() => openEdit(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather name="credit-card" size={28} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Bank Accounts</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Add your bank accounts to track available capital and how many IPOs you can apply for.
            </Text>
            <TouchableOpacity onPress={openAdd} style={[styles.emptyBtn, { overflow: 'hidden' }]}>
              <LinearGradient colors={[colors.primary, colors.primaryLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Add Bank Account</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      />

      <BankModal
        visible={modalVisible}
        bank={editingBank}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2, textAlign: 'center' },
  headerTitle: { fontSize: 28, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.6, lineHeight: 32, textAlign: 'center' },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#D4A017',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  kpiGrid: { paddingHorizontal: 16, paddingTop: 18, gap: 10 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  sectionHeader: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, textTransform: 'uppercase' },

  // Bank card
  bankCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 14,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  bankIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bankName: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  bankSub: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  metricsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  metricCell: { flex: 1, gap: 3 },
  metricSep: { width: 1, marginHorizontal: 10, alignSelf: 'stretch' },
  metricLabel: { fontSize: 9, fontFamily: 'GoogleSansFlex_500Medium', letterSpacing: 0.4, textTransform: 'uppercase' },
  metricValue: { fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold' },

  barWrap: { paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  barLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_400Regular' },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'GoogleSansFlex_600SemiBold' },
});

// ── Modal styles ──────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    padding: 24,
    paddingBottom: 36,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.4, marginBottom: 6 },
  subtitle: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 19, marginBottom: 24 },
  fieldGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 0.9, marginBottom: 8, textTransform: 'uppercase' },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  previewText: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', flex: 1 },
  previewBold: { fontFamily: 'GoogleSansFlex_700Bold' },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.1 },
});
