import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { formatCurrency, todayISO } from '@/utils/formatters';
import { useSQLiteContext } from 'expo-sqlite';
import {
  CONTROLLED_EXCHANGES,
  CONTROLLED_ISSUE_TYPES,
  CONTROLLED_REGISTRARS,
  resolveExchangeCode,
  resolveIssueTypeCode,
  resolveRegistrarCode,
} from '@/constants/ipoControls';

import {
  mergeAndNormalizeIPOData,
  getSearchTokens,
  normalizeSearchTerm,
  logAutoFillAuditSummary,
} from '@/utils/ipoNormalizer';

type Props = { visible: boolean; onClose: () => void };

type DateField = 'openDate' | 'closeDate' | 'listingDate' | 'allotmentDate';

function isoToDate(iso: string): Date {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function dateToISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function AddIPOModal({ visible, onClose }: Props) {
  const db = useSQLiteContext();
  const colors = useColors();
  const { refresh } = useDB();
  const insets = useSafeAreaInsets();
  const today = todayISO();

  const [companyName, setCompanyName] = useState('');
  const [ipoName, setIpoName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [openDate, setOpenDate] = useState(today);
  const [closeDate, setCloseDate] = useState(today);
  const [listingDate, setListingDate] = useState('');
  const [allotmentDate, setAllotmentDate] = useState('');
  const [registrar, setRegistrar] = useState('KFINTECH');
  const [exchange, setExchange] = useState('NSE');
  const [issueType, setIssueType] = useState('MAINBOARD');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Date picker state
  const [pickerField, setPickerField] = useState<DateField | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const resetForm = () => {
    setCompanyName(''); setIpoName(''); setSymbol(''); setPrice(''); setQty('');
    setOpenDate(today); setCloseDate(today); setListingDate(''); setAllotmentDate('');
    setRegistrar('KFINTECH'); setExchange('NSE'); setIssueType('MAINBOARD');
  };

  const { showError, showSuccess } = useDialog();

  const handleFetchDetails = async () => {
    const searchTarget = companyName.trim() || ipoName.trim() || symbol.trim();
    if (!searchTarget) {
      showError('Required', 'Please enter a Company Name or Symbol first.');
      return;
    }
    setFetching(true);
    const searchTokens = getSearchTokens(searchTarget);
    const cleanedSearch = normalizeSearchTerm(searchTarget);

    try {
      // 1. Search local ipo_master table
      const allMaster = await db.getAllAsync<any>(
        'SELECT * FROM ipo_master WHERE deleted_at IS NULL'
      );
      let masterMatch = allMaster.find((row) => {
        const cName = normalizeSearchTerm(row.company_name || row.ipo_name || '');
        const sym = normalizeSearchTerm(row.symbol || '');
        if (cleanedSearch && (cName.includes(cleanedSearch) || sym.includes(cleanedSearch))) return true;
        if (searchTokens.length > 0) {
          return searchTokens.every((tok) => cName.includes(tok) || sym.includes(tok));
        }
        return false;
      });

      // 2. Search local ipo_listings table
      const allListings = await db.getAllAsync<any>(
        'SELECT * FROM ipo_listings WHERE deleted_at IS NULL'
      );
      let listingsMatch = allListings.find((row) => {
        const iName = normalizeSearchTerm(row.ipo_name || row.company_name || '');
        const sym = normalizeSearchTerm(row.symbol || '');
        if (cleanedSearch && (iName.includes(cleanedSearch) || sym.includes(cleanedSearch))) return true;
        if (searchTokens.length > 0) {
          return searchTokens.every((tok) => iName.includes(tok) || sym.includes(tok));
        }
        return false;
      });

      const normalized = mergeAndNormalizeIPOData([masterMatch, listingsMatch, null]);

      if (
        normalized.companyName ||
        normalized.cutoffPrice ||
        normalized.openDate ||
        normalized.registrar
      ) {
        if (normalized.companyName) {
          setCompanyName(normalized.companyName);
          setIpoName(`${normalized.companyName} IPO`);
        }
        if (normalized.symbol) setSymbol(normalized.symbol.toUpperCase());
        if (normalized.cutoffPrice != null) setPrice(String(normalized.cutoffPrice));
        if (normalized.lotSize != null) setQty(String(normalized.lotSize));
        if (normalized.openDate) setOpenDate(normalized.openDate);
        if (normalized.closeDate) setCloseDate(normalized.closeDate);
        if (normalized.allotmentDate) setAllotmentDate(normalized.allotmentDate);
        if (normalized.listingDate) setListingDate(normalized.listingDate);
        if (normalized.registrar) setRegistrar(resolveRegistrarCode(normalized.registrar));
        if (normalized.exchange) setExchange(resolveExchangeCode(normalized.exchange));
        if (normalized.issueType) setIssueType(resolveIssueTypeCode(normalized.issueType));

        logAutoFillAuditSummary(normalized);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess('Data Auto-Fetched', `Auto-filled details for ${searchTarget}.`);
      } else {
        showError('Not Found', `No matching IPO details found for "${searchTarget}". You can enter details manually.`);
      }
    } catch (err) {
      console.error('[AddIPOModal] Auto-fill error:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    const trimmedCompany = companyName.trim();
    const trimmedIpoName = ipoName.trim() || `${trimmedCompany} IPO`;
    const trimmedSymbol = symbol.trim().toUpperCase();
    const parsedPrice = parseFloat(price);
    const parsedQty = parseInt(qty, 10);

    // Strict Validations
    if (!trimmedCompany) {
      showError('Validation Error', 'Company Name is required.');
      return;
    }
    if (!trimmedSymbol) {
      showError('Validation Error', 'Exchange Symbol is required (e.g. JUNIPER).');
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      showError('Validation Error', 'Enter a valid cut-off price greater than 0.');
      return;
    }
    if (isNaN(parsedQty) || parsedQty <= 0) {
      showError('Validation Error', 'Enter a valid lot size quantity greater than 0.');
      return;
    }
    if (!openDate.trim()) {
      showError('Validation Error', 'Open Date is required.');
      return;
    }
    if (!closeDate.trim()) {
      showError('Validation Error', 'Close Date is required.');
      return;
    }
    if (closeDate < openDate) {
      showError('Validation Error', 'Close Date cannot be earlier than Open Date.');
      return;
    }

    setSaving(true);
    try {
      const newId = `ipo_${Date.now()}`;
      const now = new Date().toISOString();

      await db.runAsync(
        `INSERT INTO ipo_listings (
          id, backend_ipo_id, company_name, ipo_name, symbol, buy_price, quantity,
          registrar, exchange, issue_type, open_date, close_date, allotment_date, listing_date,
          logo_url, archived, is_favorite, created_at, updated_at
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, 0, ?, ?)`,
        [
          newId,
          trimmedCompany,
          trimmedIpoName,
          trimmedSymbol,
          parsedPrice,
          parsedQty,
          registrar,
          exchange,
          issueType,
          openDate,
          closeDate,
          allotmentDate,
          listingDate,
          now,
          now,
        ]
      );

      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      onClose();
    } catch (err) {
      console.error('Failed to add IPO:', err);
      showError('Error', 'Failed to add IPO into local database.');
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = (field: DateField) => {
    setPickerField(field);
    setShowPicker(true);
  };

  const getDateValue = (field: DateField): string => {
    if (field === 'openDate') return openDate;
    if (field === 'closeDate') return closeDate;
    if (field === 'listingDate') return listingDate;
    return allotmentDate;
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed') { setShowPicker(false); return; }
    if (!selected || !pickerField) return;
    const iso = dateToISO(selected);
    if (pickerField === 'openDate') setOpenDate(iso);
    else if (pickerField === 'closeDate') setCloseDate(iso);
    else if (pickerField === 'listingDate') setListingDate(iso);
    else setAllotmentDate(iso);
    if (Platform.OS === 'ios') setShowPicker(false);
  };

  const previewBuyValue = price && qty ? parseFloat(price) * parseInt(qty, 10) : null;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={[styles.flex, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: topPad + 14, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
            <IconButton name="x" variant="surface" size="sm" onPress={onClose} />
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Add IPO</Text>
            <Button
              variant="primary"
              size="sm"
              title="Save"
              loading={saving}
              disabled={saving}
              onPress={handleSave}
            />
          </View>

          <ScrollView contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
            {/* Company Name */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Company Name *</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                value={companyName}
                onChangeText={(text) => {
                  setCompanyName(text);
                  if (!ipoName || ipoName === `${companyName} IPO`) {
                    setIpoName(text.trim() ? `${text.trim()} IPO` : '');
                  }
                }}
                placeholder="e.g. Juniper Hotels Limited"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
              />
            </View>

            {/* IPO Display Name & Symbol side by side */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <View style={[styles.field, { flex: 1, marginBottom: 0 }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>IPO Display Name *</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                  value={ipoName}
                  onChangeText={setIpoName}
                  placeholder="e.g. Juniper Hotels IPO"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              <View style={[styles.field, { flex: 1, marginBottom: 0 }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Symbol *</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                  value={symbol}
                  onChangeText={(txt) => setSymbol(txt.toUpperCase())}
                  placeholder="e.g. JUNIPER"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Auto Fill Button */}
            <TouchableOpacity
              onPress={handleFetchDetails}
              disabled={fetching}
              style={[
                styles.fetchBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Text style={[styles.fetchBtnText, { color: colors.primary }]}>
                {fetching ? 'Auto Filling…' : 'Auto Fill IPO Details'}
              </Text>
            </TouchableOpacity>

            {previewBuyValue != null && !isNaN(previewBuyValue) && previewBuyValue > 0 ? (
              <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 20 }]}>
                <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>Buy value per lot</Text>
                <Text style={[styles.previewValue, { color: colors.primary }]}>
                  {formatCurrency(previewBuyValue)}
                </Text>
              </View>
            ) : null}

            {/* Numeric fields */}
            {[
              { label: 'Cut-off Price (₹) *', value: price, setter: setPrice, placeholder: 'e.g. 360', numeric: true },
              { label: 'Lot Size (Qty) *', value: qty, setter: setQty, placeholder: 'e.g. 40', numeric: true },
            ].map(({ label, value, setter, placeholder, numeric }) => (
              <View key={label} style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                  value={value}
                  onChangeText={setter}
                  placeholder={placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={numeric ? 'decimal-pad' : 'default'}
                />
              </View>
            ))}

            {/* Controlled Registrar Selection */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Registrar *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {CONTROLLED_REGISTRARS.map((r) => {
                  const selected = registrar === r.code;
                  return (
                    <TouchableOpacity
                      key={r.code}
                      onPress={() => setRegistrar(r.code)}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderWidth: 1.5,
                        borderRadius: 20,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: selected ? colors.primary : colors.surface,
                        borderColor: selected ? colors.primary : colors.border,
                      }}
                    >
                      {selected && <Feather name="check" size={12} color="#fff" style={{ marginRight: 4 }} />}
                      <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium', color: selected ? '#fff' : colors.foreground }}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Controlled Exchange & Issue Type */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <View style={[styles.field, { flex: 1, marginBottom: 0 }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Exchange *</Text>
                <View style={styles.issueTypeContainer}>
                  {CONTROLLED_EXCHANGES.map((ex) => (
                    <TouchableOpacity
                      key={ex.code}
                      onPress={() => setExchange(ex.code)}
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: exchange === ex.code ? colors.primary : colors.surface,
                          borderColor: exchange === ex.code ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.typePillText, { color: exchange === ex.code ? '#fff' : colors.foreground }]}>
                        {ex.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={[styles.field, { flex: 1, marginBottom: 0 }]}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Issue Type *</Text>
                <View style={styles.issueTypeContainer}>
                  {CONTROLLED_ISSUE_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.code}
                      onPress={() => setIssueType(t.code)}
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: issueType === t.code ? colors.primary : colors.surface,
                          borderColor: issueType === t.code ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.typePillText, { color: issueType === t.code ? '#fff' : colors.foreground }]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Date fields */}
            {[
              { label: 'Open Date *', field: 'openDate' as DateField, value: openDate },
              { label: 'Close Date *', field: 'closeDate' as DateField, value: closeDate },
              { label: 'Allotment Date', field: 'allotmentDate' as DateField, value: allotmentDate },
              { label: 'Listing Date', field: 'listingDate' as DateField, value: listingDate },
            ].map(({ label, field, value }) => (
              <View key={field} style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                <TouchableOpacity
                  onPress={() => openDatePicker(field)}
                  style={[styles.dateRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateText, { color: value ? colors.foreground : colors.mutedForeground }]}>
                    {value || 'Select date'}
                  </Text>
                  <Feather name="calendar" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Date picker */}
        {showPicker && pickerField && (
          <DateTimePicker
            value={isoToDate(getDateValue(pickerField))}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  form: { paddingHorizontal: 20, paddingTop: 24 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular' },
  fetchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 20,
  },
  fetchBtnText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  issueTypeContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  typePill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePillText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dateText: { fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular' },
  preview: { borderRadius: 16, padding: 20, marginTop: 4, alignItems: 'center', gap: 6, borderWidth: 1 },
  previewLabel: { fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium', letterSpacing: 0.3 },
  previewValue: { fontSize: 28, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.8 },
});
