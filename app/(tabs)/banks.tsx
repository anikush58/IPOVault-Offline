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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useTheme } from '@/context/ThemeContext';
import { IconButton } from '@/components/ui/IconButton';
import { useDB, type BankAccount } from '@/context/DBContext';
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

          <TouchableOpacity onPress={handleSave} style={[ms.saveBtn, { overflow: 'hidden' }]}>
            <LinearGradient colors={[colors.primary, colors.primaryLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Text style={ms.saveBtnText}>{isAdd ? 'Add Bank Account' : 'Save Balance'}</Text>
          </TouchableOpacity>
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
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const effectiveBalance = Math.max(0, bank.balance);
  const { available, slots: availableSlots } = calcBankSlots(effectiveBalance, blocked, ipoPrice);
  const totalSlots = Math.floor(effectiveBalance / (ipoPrice > 0 ? ipoPrice : 15000));
  const utilizationPct = effectiveBalance > 0 ? Math.min(1, blocked / effectiveBalance) : 0;

  const cardGrad: [string, string] = isDark
    ? [colors.card, colors.surface]
    : ['#FFFFFF', '#FAF8F4'];

  return (
    <View style={[styles.bankCard, { borderColor: colors.border }]}>
      <LinearGradient colors={cardGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Stripe pattern */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <View key={i} pointerEvents="none" style={{
          position: 'absolute', left: i * 13 - 10, top: -20, width: 1, height: 160,
          backgroundColor: colors.primary, opacity: 0.025, transform: [{ rotate: '40deg' }],
        }} />
      ))}

      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <LinearGradient
            colors={[colors.primary + '30', colors.primary + '10']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.bankIcon}
          >
            <Feather name="credit-card" size={16} color={colors.primary} />
          </LinearGradient>
          <View>
            <Text style={[styles.bankName, { color: colors.foreground }]}>{bank.bank_name}</Text>
            <Text style={[styles.bankSub, { color: colors.mutedForeground }]}>
              {totalSlots} IPO {totalSlots === 1 ? 'slot' : 'slots'} total
            </Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={onEdit} style={[styles.actionBtn, { backgroundColor: colors.surface }]} hitSlop={8}>
            <Feather name="edit-2" size={13} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.actionBtn, { backgroundColor: colors.destructiveBg }]} hitSlop={8}>
            <Feather name="trash-2" size={13} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Metrics row */}
      <View style={[styles.metricsRow, { borderTopColor: colors.border }]}>
        <View style={styles.metricCell}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Balance</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{formatCurrency(effectiveBalance)}</Text>
        </View>
        <View style={[styles.metricSep, { backgroundColor: colors.border }]} />
        <View style={styles.metricCell}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Blocked</Text>
          <Text style={[styles.metricValue, { color: blocked > 0 ? colors.negative : colors.mutedForeground }]}>
            {blocked > 0 ? formatCurrency(blocked) : '—'}
          </Text>
        </View>
        <View style={[styles.metricSep, { backgroundColor: colors.border }]} />
        <View style={styles.metricCell}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Available</Text>
          <Text style={[styles.metricValue, { color: colors.positive }]}>{formatCurrency(available)}</Text>
        </View>
        <View style={[styles.metricSep, { backgroundColor: colors.border }]} />
        <View style={styles.metricCell}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Free Slots</Text>
          <Text style={[styles.metricValue, { color: colors.primary }]}>{availableSlots}</Text>
        </View>
      </View>

      {/* Utilisation bar */}
      {effectiveBalance > 0 && (
        <View style={styles.barWrap}>
          <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
            <LinearGradient
              colors={utilizationPct > 0.85 ? [colors.negative, colors.negative + 'AA'] : [colors.primary, colors.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barFill, { width: `${Math.round(utilizationPct * 100)}%` as any }]}
            />
          </View>
          <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>
            {Math.round(utilizationPct * 100)}% utilised
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BanksScreen() {
  const colors = useColors();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { bankAccounts, ipos, applications, isLoading, refresh, addBankAccount, updateBankBalance, deleteBankAccount } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);

  // Compute active IPO lot cost (default 15000 if none or 0)
  const activeIpo = ipos.find((i) => i.archived === 0);
  const activeIpoLotCost = (activeIpo && activeIpo.buy_price && activeIpo.quantity)
    ? activeIpo.buy_price * activeIpo.quantity
    : 15000;

  // Helper to compute blocked amount per bank from active Mandate Approved applications
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

  // KPI totals: Balance = sum of bank balances, Available = Balance - Blocked, Slots = floor(Available / IPO Lot Cost)
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
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={() => {
            if (from === 'bids') router.replace('/(tabs)/bids');
            else if (from === 'dashboard') router.replace('/(tabs)');
            else if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
        />

        <View style={{ flex: 1, alignItems: 'center' }}>
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
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
