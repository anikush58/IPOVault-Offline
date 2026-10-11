import React, { useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList as any);
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDB, type BankAccount } from '@/context/DBContext';
import { useDialog } from '@/context/DialogContext';
import { BanksOverviewCard } from '@/components/BanksOverviewCard';
import { BankSheet } from '@/components/BankSheet';
import { IconButton } from '@/components/ui/IconButton';
import { AnimatedEntrance } from '@/components/ui/AnimatedEntrance';
import { formatCurrency } from '@/utils/formatters';

const IPO_LOT_COST = 15000;

function calcBankSlots(balance: number, blocked: number, ipoPrice: number = IPO_LOT_COST) {
  const lotCost = ipoPrice > 0 ? ipoPrice : IPO_LOT_COST;
  const available = Math.max(0, balance - blocked);
  const slots = Math.floor(available / lotCost);
  return { available, slots };
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

  return (
    <View style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <View style={[styles.bankIcon, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF' }]}>
            <Feather name="credit-card" size={16} color="#3B82F6" />
          </View>
          <View>
            <Text style={[styles.bankName, { color: colors.foreground }]}>{bank.bank_name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <Text style={[styles.bankSub, { color: colors.mutedForeground }]}>
                {totalSlots} IPO {totalSlots === 1 ? 'slot' : 'slots'} total
              </Text>
              {bank.upi_app ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                  <Feather name="smartphone" size={10} color={colors.primary} />
                  <Text style={{ fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary }}>
                    {bank.upi_app}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={onEdit}
            activeOpacity={0.7}
            style={[styles.softActionBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF' }]}
          >
            <Feather name="edit-2" size={13} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            activeOpacity={0.7}
            style={[styles.softActionBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' }]}
          >
            <Feather name="trash-2" size={13} color="#EF4444" />
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
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { bankAccounts, ipos, applications, isLoading, refresh, addBankAccount, updateBankBalance, deleteBankAccount } = useDB();
  const { showError } = useDialog();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);

  // Find active retail Mainboard IPO with standard lot cost (₹10k - ₹16k), fallback to standard ₹15,000
  const activeRetailIpo = ipos.find((i) => {
    if (i.archived !== 0) return false;
    const lot = (i.buy_price || 0) * (i.quantity || 0);
    return lot >= 10000 && lot <= 16000;
  });
  const activeIpoLotCost = (activeRetailIpo && activeRetailIpo.buy_price && activeRetailIpo.quantity)
    ? activeRetailIpo.buy_price * activeRetailIpo.quantity
    : IPO_LOT_COST;

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

  const handleSave = async (name: string, balance: number, upiApp?: string) => {
    try {
      if (editingBank) {
        await updateBankBalance(editingBank.id, balance, name, upiApp);
      } else {
        await addBankAccount(name, balance, upiApp);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
    } catch (e: any) {
      showError('Error', e?.message?.includes('UNIQUE') ? 'A bank with that name already exists.' : 'Failed to save.');
    }
  };

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({
    inputRange: [0, 24],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Floating Blurred Header Bar */}
      <View
        style={[
          styles.floatingHeaderContainer,
          { paddingTop: topPad, height: topPad + 60 },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerBlurOpacity }]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 90 : 75}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={
              isDark
                ? ['rgba(14, 17, 23, 0.96)', 'rgba(14, 17, 23, 0.88)', 'rgba(14, 17, 23, 0.35)']
                : ['rgba(248, 249, 250, 0.96)', 'rgba(248, 249, 250, 0.88)', 'rgba(248, 249, 250, 0.35)']
            }
            locations={[0, 0.75, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.header}>
          <IconButton
            name="arrow-left"
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
      </View>

      <AnimatedFlatList
        data={bankAccounts}
        keyExtractor={(b: any) => b.id.toString()}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor={colors.primary}
            progressViewOffset={topPad + 60}
          />
        }
        contentContainerStyle={{
          paddingTop: topPad + 68,
          paddingBottom: insets.bottom + 90,
        }}
        ListHeaderComponent={() => (
          <>
            <AnimatedEntrance delay={0} distance={14}>
              <BanksOverviewCard
                totalBalance={totalBalance}
                totalBlocked={totalBlocked}
                totalAvailable={totalAvailable}
                totalSlots={totalSlots}
                activeIpoLotCost={activeIpoLotCost}
                accountsCount={bankAccounts.length}
              />
            </AnimatedEntrance>

            {bankAccounts.length > 0 && (
              <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ACCOUNTS</Text>
            )}
          </>
        )}
        renderItem={({ item, index }: { item: BankAccount; index: number }) => (
          <AnimatedEntrance delay={Math.min(index, 8) * 40} distance={12}>
            <BankCard
              bank={item}
              blocked={getBankBlocked(item.bank_name)}
              ipoPrice={activeIpoLotCost}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          </AnimatedEntrance>
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
            <TouchableOpacity
              onPress={openAdd}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Text style={[styles.emptyBtnText, { color: colors.primaryForeground }]}>Add Bank Account</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <BankSheet
        visible={modalVisible}
        bank={editingBank}
        onClose={() => {
          setModalVisible(false);
          setEditingBank(null);
        }}
        onSave={handleSave}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  floatingHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
  },

  kpiGrid: { paddingHorizontal: 16, paddingTop: 18, gap: 10 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  sectionHeader: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, textTransform: 'uppercase' },

  // Bank card
  bankCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 24,
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
  softActionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

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
  emptyBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'GoogleSansFlex_600SemiBold' },
});
