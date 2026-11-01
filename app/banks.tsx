import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAppExperience } from '@/context/AppExperienceContext';
import { BanksOverviewCard } from '@/components/BanksOverviewCard';
import { BankSheet } from '@/components/BankSheet';
import { BanksSkeleton } from '@/components/banks/BanksSkeleton';
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

const BankCard = React.memo(function BankCard({
  bank,
  blocked,
  ipoPrice = 15000,
  isDeleting = false,
  onEdit,
  onDelete,
}: {
  bank: BankAccount;
  blocked: number;
  ipoPrice?: number;
  isDeleting?: boolean;
  onEdit: (bank: BankAccount) => void;
  onDelete: (bank: BankAccount) => void;
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
            onPress={() => onEdit(bank)}
            activeOpacity={0.7}
            disabled={isDeleting}
            style={[styles.softActionBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF', opacity: isDeleting ? 0.5 : 1 }]}
          >
            <Feather name="edit-2" size={13} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(bank)}
            activeOpacity={0.7}
            disabled={isDeleting}
            style={[styles.softActionBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2', opacity: isDeleting ? 0.5 : 1 }]}
          >
            {isDeleting ? (
              <ActivityIndicator size={12} color="#EF4444" />
            ) : (
              <Feather name="trash-2" size={13} color="#EF4444" />
            )}
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
});

// ── Screen ────────────────────────────────────────────────────────────────────

function BanksScreenContent() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();

  const { from } = useLocalSearchParams<{ from?: string }>();
  const { bankAccounts, ipos, applications, isLoading, refresh, addBankAccount, updateBankBalance, deleteBankAccount } = useDB();
  const { showConfirm, showError } = useDialog();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);

  // Find active retail Mainboard IPO with standard lot cost (₹10k - ₹16k), fallback to standard ₹15,000
  const activeIpoLotCost = React.useMemo(() => {
    const active = ipos.find((i) => {
      if (i.archived !== 0) return false;
      const lot = (i.buy_price || 0) * (i.quantity || 0);
      return lot >= 10000 && lot <= 16000;
    });
    return (active && active.buy_price && active.quantity)
      ? active.buy_price * active.quantity
      : IPO_LOT_COST;
  }, [ipos]);

  // Precomputed O(1) blocked capital map for banks
  const blockedByBank = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const a of applications) {
      if (a.status === 'Mandate Approved') {
        const key = (a.user_bank_name || '').trim().toLowerCase();
        if (key) {
          map.set(key, (map.get(key) || 0) + (a.buy_price || 0) * (a.quantity || 0));
        }
      }
    }
    return map;
  }, [applications]);

  const getBankBlocked = React.useCallback(
    (bankName: string) => blockedByBank.get((bankName || '').trim().toLowerCase()) || 0,
    [blockedByBank]
  );

  const { totalBalance, totalBlocked, totalAvailable, totalSlots } = React.useMemo(() => {
    let balanceSum = 0;
    let blockedSum = 0;
    let slotsSum = 0;
    const lotCost = activeIpoLotCost > 0 ? activeIpoLotCost : 15000;

    for (const b of bankAccounts) {
      balanceSum += b.balance;
      const blocked = blockedByBank.get((b.bank_name || '').trim().toLowerCase()) || 0;
      blockedSum += blocked;
      const avail = Math.max(0, b.balance - blocked);
      slotsSum += Math.floor(avail / lotCost);
    }

    return {
      totalBalance: balanceSum,
      totalBlocked: blockedSum,
      totalAvailable: Math.max(0, balanceSum - blockedSum),
      totalSlots: slotsSum,
    };
  }, [bankAccounts, blockedByBank, activeIpoLotCost]);

  const openAdd = React.useCallback(() => {
    setEditingBank(null);
    setModalVisible(true);
  }, []);

  const openEdit = React.useCallback((bank: BankAccount) => {
    setEditingBank(bank);
    setModalVisible(true);
  }, []);

  const closeModal = React.useCallback(() => {
    setModalVisible(false);
    setEditingBank(null);
  }, []);

  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);

  const handleDelete = React.useCallback((bank: BankAccount) => {
    if (deletingBankId) return;
    const targetKey = (bank.bank_name || '').trim().toLowerCase();
    const referencedApps = applications.filter(
      (a) =>
        ((a.user_bank_name || '').trim().toLowerCase() === targetKey ||
          ((a as any).bank_name || '').trim().toLowerCase() === targetKey) &&
        a.status !== 'Cancelled'
    );
    if (referencedApps.length > 0) {
      showError(
        'Cannot Delete Bank',
        `"${bank.bank_name}" is currently referenced by ${referencedApps.length} active IPO ${
          referencedApps.length === 1 ? 'application' : 'applications'
        }. Please reassign or update those applications before deleting this bank.`
      );
      return;
    }

    showConfirm({
      title: 'Delete Bank Account',
      message: `Remove "${bank.bank_name}" from your tracked accounts?`,
      confirmText: 'Delete',
      isDanger: true,
      onConfirm: async () => {
        try {
          setDeletingBankId(bank.id);
          await deleteBankAccount(bank.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {
          showError('Delete Failed', 'Could not delete bank account. Please try again.');
        } finally {
          setDeletingBankId(null);
        }
      },
    });
  }, [deletingBankId, applications, showError, showConfirm, deleteBankAccount]);

  const handleSave = React.useCallback(async (name: string, balance: number, upiApp?: string) => {
    try {
      if (editingBank) {
        await updateBankBalance(editingBank.id, balance, name, upiApp);
      } else {
        await addBankAccount(name, balance, upiApp);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      setEditingBank(null);
    } catch (e: any) {
      showError('Error', e?.message?.includes('UNIQUE') ? 'A bank with that name already exists.' : 'Failed to save.');
    }
  }, [editingBank, updateBankBalance, addBankAccount, showError]);

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

          <View style={styles.headerCenter} pointerEvents="none">
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

      {isLoading && bankAccounts.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: topPad + 68,
            paddingBottom: insets.bottom + 90,
          }}
          showsVerticalScrollIndicator={false}
        >
          <BanksSkeleton />
        </ScrollView>
      ) : (
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
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        renderItem={({ item, index }: { item: BankAccount; index: number }) => (
          <AnimatedEntrance delay={Math.min(index, 8) * 40} distance={12}>
            <BankCard
              bank={item}
              blocked={getBankBlocked(item.bank_name)}
              ipoPrice={activeIpoLotCost}
              isDeleting={deletingBankId === item.id}
              onEdit={openEdit}
              onDelete={handleDelete}
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
      )}

      <BankSheet
        visible={modalVisible}
        bank={editingBank}
        onClose={closeModal}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    lineHeight: 24,
    textAlign: 'center',
  },
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
  emptyBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 9999 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'GoogleSansFlex_600SemiBold' },
});

export default function BanksScreen() {
  const { isNonPro, isLoading: isExperienceLoading } = useAppExperience();
  const router = useRouter();

  React.useEffect(() => {
    if (!isExperienceLoading && isNonPro) {
      if (typeof (router as any).navigate === 'function') {
        (router as any).navigate('/(tabs)/ipos');
      } else {
        router.replace('/(tabs)/ipos');
      }
    }
  }, [isNonPro, isExperienceLoading, router]);

  if (isNonPro) {
    return null;
  }

  return <BanksScreenContent />;
}
