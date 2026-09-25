import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
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
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { Button } from '@/components/ui/Button';
import { useDB, type ApplicationStatus, type ApplicationWithDetails } from '@/context/DBContext';
import { StatusBadge } from './StatusBadge';
import { formatCurrency, getResolvedLogoUrl, todayISO } from '@/utils/formatters';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';

type Props = { application: ApplicationWithDetails | null; onClose: () => void };

const STATUSES: ApplicationStatus[] = ['Applied', 'Mandate Approved', 'Allotted', 'Not Allotted', 'Holding', 'Sold'];

const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'],
  ['#10B981', '#047857'],
  ['#3B82F6', '#1D4ED8'],
  ['#F59E0B', '#B45309'],
  ['#EC4899', '#BE185D'],
  ['#6366F1', '#4338CA'],
  ['#14B8A6', '#0F766E'],
  ['#F43F5E', '#BE123C'],
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

export function UpdateApplicationModal({ application: app, onClose }: Props) {
  const colors = useColors();
  const { ipos, bankAccounts, updateApplication, partialSellApplication, deleteApplication } = useDB();
  const { showError, showConfirm, showSuccess } = useDialog();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<ApplicationStatus>('Applied');
  const [sellPrice, setSellPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [tax, setTax] = useState('0');
  const [userCut, setUserCut] = useState('0');
  const [soldShares, setSoldShares] = useState('');
  const [selectedBankName, setSelectedBankName] = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const matchingIPO = ipos.find(
    (i) => (app?.ipo_id && i.id === app.ipo_id) || (app?.ipo_name && i.ipo_name.toLowerCase().trim() === app.ipo_name.toLowerCase().trim())
  );
  const rawLogo = app?.ipo_logo_url || (app as any)?.logo_url || matchingIPO?.logo_url;
  const companyNameStr = app?.ipo_name || 'IPO';
  const logoUrl = getResolvedLogoUrl(rawLogo);
  const avatarGradient = getAvatarGradient(companyNameStr);
  const initials = companyNameStr
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    if (app) {
      setStatus(app.status);
      setSellPrice(app.sell_price?.toString() ?? '');
      setCurrentPrice(app.sell_price?.toString() ?? app.buy_price.toString());
      setSaleDate(app.sale_date ?? todayISO());
      setTax((app.tax ?? 0).toString());
      setUserCut((app.user_cut ?? 0).toString());
      setSoldShares(app.quantity?.toString() ?? '1');
      setSelectedBankName(app.user_bank_name ?? '');
      setShowBankPicker(false);
      setConfirmDelete(false);
      setLogoError(false);
    }
  }, [app]);

  const isSold = status === 'Sold';
  const isHolding = status === 'Holding';
  const availableStatuses: ApplicationStatus[] = STATUSES.filter((s) => s !== 'Applied');

  const totalQty = app?.quantity ?? 1;
  const soldQtyNum = Math.min(totalQty, Math.max(1, parseInt(soldShares, 10) || totalQty));
  const isPartial = isSold && soldQtyNum < totalQty;
  const remainingQty = totalQty - soldQtyNum;

  const buyValueForSold = app ? app.buy_price * soldQtyNum : 0;
  const buyValue = app ? calcBuyValue(app.buy_price, app.quantity) : 0;
  const previewSale = isSold && sellPrice ? calcSaleValue(parseFloat(sellPrice), soldQtyNum) : 0;
  const previewPL = isSold ? calcProfitLoss(previewSale, buyValueForSold) : 0;
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
      if (isSold) {
        const soldQtyNum = parseInt(soldShares, 10) || app.quantity;
        const sPrice = sellPrice.trim() !== '' ? parseFloat(sellPrice) : 0;
        const sDate = saleDate.trim() !== '' ? saleDate : todayISO();
        const taxVal = tax.trim() !== '' ? parseFloat(tax) : 0;
        const userCutVal = userCut.trim() !== '' ? parseFloat(userCut) : 0;

        if (app.status === 'Sold') {
          await updateApplication(
            app.id,
            'Sold',
            sPrice,
            sDate,
            taxVal,
            userCutVal,
            selectedBankName.trim() || undefined
          );
        } else {
          await partialSellApplication(
            app.id,
            soldQtyNum,
            app.quantity,
            sPrice,
            sDate,
            taxVal,
            userCutVal
          );
        }
      } else {
        const effectivePrice = isHolding
          ? (currentPrice.trim() !== '' ? parseFloat(currentPrice) : null)
          : null;

        await updateApplication(
          app.id,
          status,
          effectivePrice,
          null,
          tax.trim() !== '' ? parseFloat(tax) : 0,
          userCut.trim() !== '' ? parseFloat(userCut) : 0,
          selectedBankName.trim() || undefined
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      showError('Error', 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!app) return;
    showConfirm({
      title: 'Delete Application',
      message: 'Are you sure you want to delete this application record?',
      confirmText: 'Delete',
      isDanger: true,
      onConfirm: async () => {
        try {
          setSaving(true);
          await deleteApplication(app.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onClose();
        } catch {
          showError('Error', 'Failed to delete application.');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  return (
    <Modal visible={!!app} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Centered Modal Backdrop */}
        <View style={styles.centerModalOverlay}>
          {/* Backdrop Tap Target to Close Modal */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          {/* Centered Card Dialog Box (Plain View so touch gestures pass directly to ScrollView) */}
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header: Title on left, Close Cross Icon on top right */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Update Application</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {app ? (
              <ScrollView
                style={{ flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                {/* Info card with Company Logo Avatar */}
                <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.infoRow}>
                    <View style={[styles.modalLogoWrap, { borderColor: colors.border, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                      {logoUrl && !logoError ? (
                        <Image
                          source={{ uri: logoUrl }}
                          style={styles.modalLogoImage}
                          resizeMode="contain"
                          onError={() => setLogoError(true)}
                        />
                      ) : (
                        <LinearGradient
                          colors={avatarGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modalAvatar}
                        >
                          <Text style={styles.modalAvatarText}>{initials}</Text>
                        </LinearGradient>
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ipoName, { color: colors.foreground }]}>{app.ipo_name}</Text>
                      <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
                        {app.user_name} · {app.user_broker} · {app.user_bank_name}
                      </Text>
                    </View>
                    <StatusBadge status={app.status} />
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
                        <Text style={[styles.statusBtnText, { color: active ? '#fff' : colors.foreground }]}>{s}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Bank Account Selection Field */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BANK ACCOUNT</Text>
                  <TouchableOpacity
                    onPress={() => setShowBankPicker(!showBankPicker)}
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 14, color: selectedBankName ? colors.foreground : colors.mutedForeground, fontFamily: 'GoogleSansFlex_400Regular' }}>
                      {selectedBankName || 'Select Bank Account'}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  {showBankPicker && (
                    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, marginTop: 6, maxHeight: 160, overflow: 'hidden' }}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {bankAccounts.length === 0 ? (
                          <Text style={{ padding: 12, fontSize: 13, color: colors.mutedForeground }}>No bank accounts added.</Text>
                        ) : (
                          bankAccounts.map((b) => (
                            <TouchableOpacity
                              key={b.id}
                              onPress={() => {
                                setSelectedBankName(b.bank_name);
                                setShowBankPicker(false);
                              }}
                              style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                            >
                              <Text style={{ fontSize: 14, color: selectedBankName === b.bank_name ? colors.primary : colors.foreground, fontFamily: selectedBankName === b.bank_name ? 'GoogleSansFlex_600SemiBold' : 'GoogleSansFlex_400Regular' }}>
                                {b.bank_name}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    </View>
                  )}
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
                          paddingVertical: 14,
                        },
                      ]}
                    >
                      <View style={styles.previewRow}>
                        <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>Current Value</Text>
                        <Text style={[styles.previewVal, { color: colors.foreground, fontSize: 16 }]}>{formatCurrency(holdingValue)}</Text>
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

                {/* Sold fields (2 Columns x 2 Rows) */}
                {isSold ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SALE DETAILS</Text>
                    <View style={{ gap: 10, marginBottom: 12 }}>
                      {/* Row 0: Shares to Sell (Total holding) */}
                      <View>
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                          SHARES TO SELL (TOTAL ALLOTTED: {totalQty})
                        </Text>
                        <TextInput
                          style={[styles.input, { borderColor: colors.border + '40', backgroundColor: colors.surface, color: colors.foreground }]}
                          value={soldShares}
                          onChangeText={setSoldShares}
                          placeholder={`Max ${totalQty}`}
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="number-pad"
                        />
                        {isPartial ? (
                          <Text style={{ fontSize: 12, color: colors.primary, marginTop: 4, fontFamily: 'GoogleSansFlex_600SemiBold' }}>
                            💡 Partial Sell: {soldQtyNum} shares sold, {remainingQty} shares kept in Holdings.
                          </Text>
                        ) : null}
                      </View>

                      {/* Row 1: Sell Price & Sale Date */}
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Sell Price (₹)</Text>
                          <TextInput
                            style={[styles.input, { borderColor: colors.border + '40', backgroundColor: colors.surface, color: colors.foreground }]}
                            value={sellPrice}
                            onChangeText={setSellPrice}
                            placeholder="e.g. 85"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Sale Date (YYYY-MM-DD)</Text>
                          <TextInput
                            style={[styles.input, { borderColor: colors.border + '40', backgroundColor: colors.surface, color: colors.foreground }]}
                            value={saleDate}
                            onChangeText={setSaleDate}
                            placeholder={todayISO()}
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>
                      </View>

                      {/* Row 2: Tax / Charges & User Cut */}
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Tax / Charges (₹)</Text>
                          <TextInput
                            style={[styles.input, { borderColor: colors.border + '40', backgroundColor: colors.surface, color: colors.foreground }]}
                            value={tax}
                            onChangeText={setTax}
                            placeholder="0"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>User Cut (₹)</Text>
                          <TextInput
                            style={[styles.input, { borderColor: colors.border + '40', backgroundColor: colors.surface, color: colors.foreground }]}
                            value={userCut}
                            onChangeText={setUserCut}
                            placeholder="0"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </View>
                    </View>

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

                {/* Bottom Actions Row: Delete & Save Side-by-Side */}
                {confirmDelete ? (
                  <View style={[styles.confirmBox, { backgroundColor: colors.destructiveBg, borderColor: colors.destructive }]}>
                    <Text style={[styles.confirmText, { color: colors.foreground }]}>
                      Are you sure you want to delete {app.user_name}&apos;s application?
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
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                      onPress={handleDelete}
                      style={[styles.deleteBtnHalf, { borderColor: colors.destructive, backgroundColor: colors.destructiveBg }]}
                    >
                      <Feather name="trash-2" size={15} color={colors.destructive} />
                      <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Delete</Text>
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <Button
                        variant="primary"
                        size="md"
                        title="Save Changes"
                        loading={saving}
                        disabled={saving}
                        onPress={handleSave}
                      />
                    </View>
                  </View>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Centered Backdrop and Floating Modal Box
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    flexShrink: 1,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  content: { padding: 18, gap: 0 },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalLogoWrap: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  modalLogoImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  modalAvatar: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  modalAvatarText: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: '#FFFFFF' },
  ipoName: { fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  metaLine: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 3 },
  sectionLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1, marginBottom: 10, marginTop: 2, textTransform: 'uppercase' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statusBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1.5 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  statusBtnText: { fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium' },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', marginBottom: 6, letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular' },
  preview: { borderRadius: 14, padding: 14, marginBottom: 12, gap: 8, borderWidth: 1 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewNetRow: { paddingTop: 10, marginTop: 2, borderTopWidth: 1 },
  previewLabel: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular' },
  previewVal: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
  netVal: { fontSize: 20, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.5 },

  // Side-by-Side Action Buttons Container
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  deleteBtnHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    height: 44,
  },
  deleteBtnText: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
  confirmBox: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 16, gap: 10 },
  confirmText: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold', textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmCancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  confirmCancelText: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },
  confirmDeleteBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  confirmDeleteText: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold', color: '#fff' },
});
