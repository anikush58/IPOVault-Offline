import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useDB, type ApplicationStatus, type ApplicationWithDetails } from '@/context/DBContext';
import { StatusBadge } from './StatusBadge';
import { formatCurrency, todayISO } from '@/utils/formatters';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';

type Props = { application: ApplicationWithDetails | null; onClose: () => void };

const STATUSES: ApplicationStatus[] = ['Applied', 'Mandate Approved', 'Allotted', 'Not Allotted', 'Holding', 'Sold'];

export function UpdateApplicationModal({ application: app, onClose }: Props) {
  const colors = useColors();
  const { updateApplication, deleteApplication } = useDB();
  const { showError, showConfirm, showSuccess } = useDialog();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<ApplicationStatus>('Applied');
  const [sellPrice, setSellPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [tax, setTax] = useState('0');
  const [userCut, setUserCut] = useState('0');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (app) {
      setStatus(app.status);
      setSellPrice(app.sell_price?.toString() ?? '');
      setCurrentPrice(app.sell_price?.toString() ?? app.buy_price.toString());
      setSaleDate(app.sale_date ?? todayISO());
      setTax((app.tax ?? 0).toString());
      setUserCut((app.user_cut ?? 0).toString());
      setConfirmDelete(false);
    }
  }, [app]);

  const isSold = status === 'Sold';
  const isHolding = status === 'Holding';
  const availableStatuses: ApplicationStatus[] = STATUSES.filter((s) => s !== 'Applied');

  const buyValue = app ? calcBuyValue(app.buy_price, app.quantity) : 0;
  const previewSale = isSold && sellPrice ? calcSaleValue(parseFloat(sellPrice), app?.quantity ?? 0) : 0;
  const previewPL = isSold ? calcProfitLoss(previewSale, buyValue) : 0;
  const previewNet = isSold ? calcNetProfit(previewPL, parseFloat(tax || '0'), parseFloat(userCut || '0')) : 0;
  const isProfit = previewNet >= 0;

  const curPriceNum = parseFloat(currentPrice) || (app?.buy_price ?? 0);
  const holdingValue = curPriceNum * (app?.quantity ?? 0);
  const holdingPL = holdingValue - buyValue;
  const holdingPLPct = buyValue > 0 ? (holdingPL / buyValue) * 100 : 0;
  const isHoldingProfit = holdingPL >= 0;

  const handleSave = async () => {
    if (!app) return;
    setSaving(true);
    try {
      const effectivePrice = isSold
        ? (sellPrice.trim() !== '' ? parseFloat(sellPrice) : null)
        : isHolding
        ? (currentPrice.trim() !== '' ? parseFloat(currentPrice) : null)
        : null;

      await updateApplication(
        app.id,
        status,
        effectivePrice,
        isSold ? (saleDate || null) : null,
        tax.trim() !== '' ? parseFloat(tax) : 0,
        userCut.trim() !== '' ? parseFloat(userCut) : 0
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      showError('Error', 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!app) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      setSaving(true);
      await deleteApplication(app.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setConfirmDelete(false);
      onClose();
    } catch {
      showError('Error', 'Failed to delete application.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!app} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(Math.round(insets.bottom * 0.5) + 8, 12) }]}>
            {/* Drag handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Header — same layout as AddIPOModal / AddUserModal */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <IconButton name="x" variant="surface" size="sm" onPress={onClose} />
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>Update Application</Text>
              <Button
                variant="primary"
                size="sm"
                title="Save"
                loading={saving}
                disabled={saving}
                onPress={handleSave}
              />
            </View>

            {app ? (
              <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: Math.max(Math.round(insets.bottom * 0.5) + 16, 24) }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Info card */}
                <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.infoRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ipoName, { color: colors.foreground }]}>{app.ipo_name}</Text>
                      <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
                        {app.user_name} · {app.user_broker} · {app.user_bank_name}
                      </Text>
                    </View>
                    <StatusBadge status={app.status} />
                  </View>
                  <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.infoStats}>
                    <View>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>PRICE × QTY</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>₹{app.buy_price} × {app.quantity}</Text>
                    </View>
                    <View style={[styles.statSep, { backgroundColor: colors.border }]} />
                    <View>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>BUY VALUE</Text>
                      <Text style={[styles.statVal, { color: colors.primary }]}>{formatCurrency(buyValue)}</Text>
                    </View>
                  </View>
                </View>

                {/* Status buttons */}
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CHANGE STATUS</Text>
                <View style={styles.statusGrid}>
                  {availableStatuses.map((s) => {
                    const active = s === status;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => {
                          setStatus(s);
                          if (s === 'Sold' && !sellPrice && currentPrice) {
                            setSellPrice(currentPrice);
                          }
                        }}
                        style={[styles.statusBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]}
                      >
                        {active && <View style={styles.statusDot} />}
                        <Text style={[styles.statusBtnText, { color: active ? '#fff' : colors.foreground }]}>{s}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Holding fields */}
                {isHolding ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HOLDING PERFORMANCE</Text>
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CURRENT PRICE (₹)</Text>
                      <TextInput
                        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                        value={currentPrice}
                        onChangeText={(val) => {
                          setCurrentPrice(val);
                          if (!sellPrice) setSellPrice(val);
                        }}
                        placeholder={`e.g. ${app.buy_price}`}
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View
                      style={[
                        styles.preview,
                        {
                          backgroundColor: isHoldingProfit ? colors.positiveBg : colors.negativeBg,
                          borderColor: isHoldingProfit ? colors.positiveDim : colors.negativeDim,
                          paddingVertical: 18,
                        },
                      ]}
                    >
                      <View style={styles.previewRow}>
                        <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>Current Value</Text>
                        <Text style={[styles.previewVal, { color: colors.foreground, fontSize: 17 }]}>{formatCurrency(holdingValue)}</Text>
                      </View>
                      <View style={[styles.previewRow, styles.previewNetRow, { borderTopColor: isHoldingProfit ? colors.positiveDim : colors.negativeDim }]}>
                        <View>
                          <Text style={[styles.previewLabel, { color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>Unrealized Profit</Text>
                          <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground }}>
                            {isHoldingProfit ? '+' : ''}{holdingPLPct.toFixed(2)}% return
                          </Text>
                        </View>
                        <Text style={[styles.netVal, { color: isHoldingProfit ? colors.positive : colors.negative }]}>
                          {isHoldingProfit ? '+' : ''}{formatCurrency(holdingPL)}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : null}

                {/* Sold fields */}
                {isSold ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SALE DETAILS</Text>
                    {([
                      { label: 'Sell Price (₹)', value: sellPrice, setter: setSellPrice, placeholder: 'e.g. 85' },
                      { label: 'Sale Date (YYYY-MM-DD)', value: saleDate, setter: setSaleDate, placeholder: todayISO() },
                      { label: 'Tax / Charges (₹)', value: tax, setter: setTax, placeholder: '0' },
                      { label: 'User Cut (₹)', value: userCut, setter: setUserCut, placeholder: '0' },
                    ] as any[]).map(({ label, value, setter, placeholder }) => (
                      <View key={label} style={styles.field}>
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                        <TextInput
                          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                          value={value}
                          onChangeText={setter}
                          placeholder={placeholder}
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}

                    {sellPrice ? (
                      <View style={[styles.preview, { backgroundColor: isProfit ? colors.positiveBg : colors.negativeBg, borderColor: isProfit ? colors.positiveDim : colors.negativeDim }]}>
                        <View style={styles.previewRow}>
                          <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>Sale Value</Text>
                          <Text style={[styles.previewVal, { color: colors.foreground }]}>{formatCurrency(previewSale)}</Text>
                        </View>
                        <View style={styles.previewRow}>
                          <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>Gross P/L</Text>
                          <Text style={[styles.previewVal, { color: previewPL >= 0 ? colors.positive : colors.negative }]}>{formatCurrency(previewPL)}</Text>
                        </View>
                        <View style={[styles.previewRow, styles.previewNetRow, { borderTopColor: isProfit ? colors.positiveDim : colors.negativeDim }]}>
                          <Text style={[styles.previewLabel, { color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>Net Profit</Text>
                          <Text style={[styles.netVal, { color: isProfit ? colors.positive : colors.negative }]}>
                            {formatCurrency(previewNet)}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </>
                ) : null}
                {confirmDelete ? (
                  <View style={[styles.confirmBox, { backgroundColor: colors.destructiveBg, borderColor: colors.destructive }]}>
                    <Text style={[styles.confirmText, { color: colors.foreground }]}>
                      Are you sure you want to delete {app.user_name}'s application?
                    </Text>
                    <View style={styles.confirmRow}>
                      <TouchableOpacity
                        onPress={() => setConfirmDelete(false)}
                        style={[styles.confirmCancelBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                      >
                        <Text style={[styles.confirmCancelText, { color: colors.foreground }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleDelete}
                        disabled={saving}
                        style={[styles.confirmDeleteBtn, { backgroundColor: colors.destructive }]}
                      >
                        <Text style={styles.confirmDeleteText}>{saving ? 'Deleting…' : 'Yes, Delete'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleDelete} style={[styles.deleteBtn, { borderColor: colors.destructive, backgroundColor: colors.destructiveBg }]}>
                    <Feather name="trash-2" size={15} color={colors.destructive} />
                    <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Delete Application</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    maxHeight: '92%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  saveChip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  saveBtnText: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
  content: { padding: 20, gap: 0 },
  infoCard: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 22 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  ipoName: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  metaLine: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 3 },
  infoDivider: { height: 1, marginBottom: 12 },
  infoStats: { flexDirection: 'row', alignItems: 'center' },
  statLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 0.8, marginBottom: 4, textTransform: 'uppercase' },
  statVal: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
  statSep: { width: 1, height: 28, marginHorizontal: 16 },
  sectionLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1, marginBottom: 12, marginTop: 4, textTransform: 'uppercase' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  statusBtnText: { fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium' },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular' },
  preview: { borderRadius: 16, padding: 16, marginBottom: 14, gap: 8, borderWidth: 1 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewNetRow: { paddingTop: 12, marginTop: 4, borderTopWidth: 1 },
  previewLabel: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' },
  previewVal: { fontSize: 15, fontFamily: 'GoogleSansFlex_600SemiBold' },
  netVal: { fontSize: 22, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.5 },
  row2: { flexDirection: 'row', gap: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, marginTop: 22 },
  deleteBtnText: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
  confirmBox: { borderWidth: 1.5, borderRadius: 16, padding: 16, marginTop: 22, gap: 12 },
  confirmText: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold', textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  confirmCancelText: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
  confirmDeleteBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  confirmDeleteText: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold', color: '#fff' },
});
