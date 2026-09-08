import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { DatePickerModal } from '@/components/DatePickerModal';
import { ensureBase64DataUrl } from '@/utils/imageUtils';
import {
  CONTROLLED_EXCHANGES,
  CONTROLLED_ISSUE_TYPES,
  CONTROLLED_REGISTRARS,
  resolveExchangeCode,
  resolveIssueTypeCode,
  resolveRegistrarCode,
} from '@/constants/ipoControls';

type CatalogItem = {
  name: string;
  symbol: string;
  price: number;
  lot: number;
  registrar: string;
  exchange: string;
  issueType: 'MAINBOARD' | 'SME';
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  listingDate?: string;
};

const INDIAN_IPO_CATALOG: CatalogItem[] = [
  { name: 'Advit Jewels', symbol: 'ADVIT', price: 75, lot: 1600, registrar: 'BIGSHARE', exchange: 'BSE', issueType: 'SME', openDate: '2025-11-06', closeDate: '2025-11-10', allotmentDate: '2025-11-13', listingDate: '2025-11-18' },
  { name: 'HDB Financial Services', symbol: 'HDBFS', price: 740, lot: 20, registrar: 'KFINTECH', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2025-10-24', closeDate: '2025-10-28', allotmentDate: '2025-11-01', listingDate: '2025-11-05' },
  { name: 'Ola Electric Mobility', symbol: 'OLAELEC', price: 76, lot: 195, registrar: 'LINK_INTIME', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2025-10-10', closeDate: '2025-10-14', allotmentDate: '2025-10-18', listingDate: '2025-10-22' },
  { name: 'Swiggy Limited', symbol: 'SWIGGY', price: 390, lot: 38, registrar: 'LINK_INTIME', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-11-06', closeDate: '2024-11-08', allotmentDate: '2024-11-11', listingDate: '2024-11-13' },
  { name: 'Hyundai Motor India', symbol: 'HYUNDAI', price: 1960, lot: 7, registrar: 'KFINTECH', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-10-15', closeDate: '2024-10-17', allotmentDate: '2024-10-18', listingDate: '2024-10-22' },
  { name: 'NTPC Green Energy', symbol: 'NTPCGREEN', price: 108, lot: 138, registrar: 'KFINTECH', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-11-19', closeDate: '2024-11-22', allotmentDate: '2024-11-25', listingDate: '2024-11-27' },
  { name: 'Acme Solar Holdings', symbol: 'ACMESOLAR', price: 289, lot: 51, registrar: 'KFINTECH', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-11-06', closeDate: '2024-11-08', allotmentDate: '2024-11-11', listingDate: '2024-11-13' },
  { name: 'Waaree Energies', symbol: 'WAAREE', price: 1503, lot: 9, registrar: 'LINK_INTIME', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-10-21', closeDate: '2024-10-23', allotmentDate: '2024-10-24', listingDate: '2024-10-28' },
  { name: 'Bajaj Housing Finance', symbol: 'BAJAJHFL', price: 70, lot: 214, registrar: 'KFINTECH', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-09-09', closeDate: '2024-09-11', allotmentDate: '2024-09-12', listingDate: '2024-09-16' },
  { name: 'Premier Energies', symbol: 'PREMIERENE', price: 450, lot: 33, registrar: 'KFINTECH', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-08-27', closeDate: '2024-08-29', allotmentDate: '2024-08-30', listingDate: '2024-09-03' },
  { name: 'Sagility India', symbol: 'SAGILITY', price: 30, lot: 500, registrar: 'LINK_INTIME', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-11-05', closeDate: '2024-11-07', allotmentDate: '2024-11-08', listingDate: '2024-11-12' },
  { name: 'KRN Heat Exchanger', symbol: 'KRN', price: 220, lot: 65, registrar: 'BIGSHARE', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-09-25', closeDate: '2024-09-27', allotmentDate: '2024-09-30', listingDate: '2024-10-03' },
  { name: 'Juniper Hotels Limited', symbol: 'JUNIPER', price: 360, lot: 40, registrar: 'KFINTECH', exchange: 'NSE', issueType: 'MAINBOARD', openDate: '2024-02-21', closeDate: '2024-02-23', allotmentDate: '2024-02-26', listingDate: '2024-02-28' },
];

export default function AddIPOScreen() {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { showError, showSuccess } = useDialog();
  const { ipos, refresh } = useDB();

  const params = useLocalSearchParams<{ ipoId?: string }>();
  const editingIPO = params.ipoId ? ipos.find((i) => i.id === params.ipoId) ?? null : null;
  const isEditing = !!editingIPO;

  // Form state
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formIpoName, setFormIpoName] = useState('');
  const [formSymbol, setFormSymbol] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formLotSize, setFormLotSize] = useState('');
  const [formRegistrar, setFormRegistrar] = useState('KFINTECH');
  const [formExchange, setFormExchange] = useState('NSE');
  const [formIssueType, setFormIssueType] = useState('MAINBOARD');
  const [formOpenDate, setFormOpenDate] = useState('');
  const [formCloseDate, setFormCloseDate] = useState('');
  const [formAllotmentDate, setFormAllotmentDate] = useState('');
  const [formListingDate, setFormListingDate] = useState('');
  const [formLogoUrl, setFormLogoUrl] = useState('');
  const [formGmpPercent, setFormGmpPercent] = useState('');
  const [formGmpValue, setFormGmpValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Date picker state — one active field at a time
  const [activeDateField, setActiveDateField] = useState<'openDate' | 'closeDate' | 'allotmentDate' | 'listingDate' | null>(null);

  useEffect(() => {
    if (editingIPO) {
      setFormCompanyName(editingIPO.company_name || editingIPO.ipo_name || '');
      setFormIpoName(editingIPO.ipo_name || '');
      setFormSymbol(editingIPO.symbol || '');
      setFormPrice(editingIPO.buy_price ? editingIPO.buy_price.toString() : '');
      setFormLotSize(editingIPO.quantity ? editingIPO.quantity.toString() : '');
      setFormRegistrar(resolveRegistrarCode(editingIPO.registrar));
      setFormExchange(resolveExchangeCode(editingIPO.exchange));
      setFormIssueType(resolveIssueTypeCode(editingIPO.issue_type));
      setFormOpenDate(editingIPO.open_date || '');
      setFormCloseDate(editingIPO.close_date || '');
      setFormAllotmentDate(editingIPO.allotment_date || '');
      setFormListingDate(editingIPO.listing_date || '');
      setFormLogoUrl(editingIPO.logo_url || '');
      setFormGmpPercent(editingIPO.gmp_percent != null ? editingIPO.gmp_percent.toString() : '');
      setFormGmpValue(editingIPO.gmp_value != null ? editingIPO.gmp_value.toString() : '');
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setFormOpenDate(today);
      setFormCloseDate(today);
    }
  }, [editingIPO]);

  const handleCompanyNameChange = (text: string) => {
    setFormCompanyName(text);
    if (!isEditing || !formIpoName || formIpoName === `${formCompanyName} IPO`) {
      setFormIpoName(text.trim() ? `${text.trim()} IPO` : '');
    }
  };

  const handleAutoFetchData = async () => {
    const searchTarget = formCompanyName.trim() || formIpoName.trim() || formSymbol.trim();
    if (!searchTarget) {
      showError('Enter Company Name', 'Please type the company name or symbol first.');
      return;
    }
    const q = searchTarget.toLowerCase();

    try {
      // 1. Search local SQLite ipo_master table
      const masterRow = await db.getFirstAsync<any>(
        `SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (LOWER(ipo_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(symbol) LIKE ?) LIMIT 1`,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      );
      // 2. Search local SQLite ipo_listings table
      const listingRow = await db.getFirstAsync<any>(
        `SELECT * FROM ipo_listings WHERE deleted_at IS NULL AND (LOWER(ipo_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(symbol) LIKE ?) LIMIT 1`,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      );
      // 3. Fallback catalog lookup
      const seedMatch = INDIAN_IPO_CATALOG.find((item) =>
        item.name.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q) || q.includes(item.name.toLowerCase())
      );

      const companyName = masterRow?.company_name || listingRow?.company_name || seedMatch?.name;
      const symbol = masterRow?.symbol || listingRow?.symbol || seedMatch?.symbol;
      const price = masterRow?.price_band_max || masterRow?.price_band_min || masterRow?.buy_price || listingRow?.buy_price || seedMatch?.price;
      const lot = masterRow?.lot_size || masterRow?.quantity || listingRow?.quantity || seedMatch?.lot;
      const registrar = masterRow?.registrar || listingRow?.registrar || seedMatch?.registrar;
      const exchange = masterRow?.exchange || listingRow?.exchange || seedMatch?.exchange;
      const issueType = masterRow?.issue_type || listingRow?.issue_type || seedMatch?.issueType;
      const openDate = masterRow?.open_date || listingRow?.open_date || seedMatch?.openDate;
      const closeDate = masterRow?.close_date || listingRow?.close_date || seedMatch?.closeDate;
      const allotmentDate = masterRow?.allotment_date || listingRow?.allotment_date || seedMatch?.allotmentDate;
      const listingDate = masterRow?.listing_date || listingRow?.listing_date || seedMatch?.listingDate;

      let count = 0;
      if (companyName) { setFormCompanyName(companyName); setFormIpoName(`${companyName} IPO`); count++; }
      if (symbol) { setFormSymbol(symbol.toUpperCase()); count++; }
      if (price) { setFormPrice(price.toString()); count++; }
      if (lot) { setFormLotSize(lot.toString()); count++; }
      if (registrar) { setFormRegistrar(resolveRegistrarCode(registrar)); count++; }
      if (exchange) { setFormExchange(resolveExchangeCode(exchange)); count++; }
      if (issueType) { setFormIssueType(resolveIssueTypeCode(issueType)); count++; }
      if (openDate) { setFormOpenDate(openDate); count++; }
      if (closeDate) { setFormCloseDate(closeDate); count++; }
      if (allotmentDate) { setFormAllotmentDate(allotmentDate); count++; }
      if (listingDate) { setFormListingDate(listingDate); count++; }

      Haptics.selectionAsync();
      if (count > 0) {
        showSuccess('Data Auto-Fetched', `Auto-filled ${count} field(s) for ${searchTarget}.`);
      }
    } catch (err) {
      console.error('Auto fetch data error:', err);
    }
  };

  const pickLogoImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (Platform.OS === 'web' && asset.file) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              setFormLogoUrl(reader.result);
              Haptics.selectionAsync();
            }
          };
          reader.readAsDataURL(asset.file);
        } else {
          const base64Url = await ensureBase64DataUrl(asset.uri);
          setFormLogoUrl(base64Url);
          Haptics.selectionAsync();
        }
      }
    } catch (err) {
      console.error('Failed to pick logo image:', err);
    }
  };

  const handleSave = async () => {
    const trimmedCompany = formCompanyName.trim();
    const trimmedIpoName = formIpoName.trim() || `${trimmedCompany} IPO`;
    const trimmedSymbol = formSymbol.trim().toUpperCase();
    const price = parseFloat(formPrice) || 0;
    const qty = parseInt(formLotSize, 10) || 0;
    const gmpPercent = parseFloat(formGmpPercent) || 0;
    const gmpValue = parseFloat(formGmpValue) || 0;

    // Strict Validation Requirements
    if (!trimmedCompany) {
      showError('Validation Error', 'Company Name is required.');
      return;
    }
    if (!trimmedSymbol) {
      showError('Validation Error', 'Exchange Symbol is required (e.g. JUNIPER).');
      return;
    }
    if (!formExchange) {
      showError('Validation Error', 'Please select an Exchange.');
      return;
    }
    if (!formRegistrar) {
      showError('Validation Error', 'Please select a Registrar.');
      return;
    }
    if (!formIssueType) {
      showError('Validation Error', 'Please select an Issue Type.');
      return;
    }
    if (price <= 0) {
      showError('Validation Error', 'Cut-off price must be greater than 0.');
      return;
    }
    if (qty <= 0) {
      showError('Validation Error', 'Lot size quantity must be greater than 0.');
      return;
    }
    if (!formOpenDate.trim()) {
      showError('Validation Error', 'Open Date is required.');
      return;
    }
    if (!formCloseDate.trim()) {
      showError('Validation Error', 'Close Date is required.');
      return;
    }
    if (formCloseDate < formOpenDate) {
      showError('Validation Error', 'Close Date cannot be earlier than Open Date.');
      return;
    }

    setSaving(true);
    try {
      const finalLogoUrl = formLogoUrl ? await ensureBase64DataUrl(formLogoUrl.trim()) : '';
      const now = new Date().toISOString();

      if (isEditing && editingIPO) {
        // Section 15: Editing safety — clear backend_ipo_id if core identity fields changed
        let targetBackendIpoId: string | null = editingIPO.backend_ipo_id ?? null;
        if (
          editingIPO.company_name &&
          editingIPO.symbol &&
          (editingIPO.company_name.trim().toLowerCase() !== trimmedCompany.toLowerCase() ||
            editingIPO.symbol.trim().toUpperCase() !== trimmedSymbol)
        ) {
          targetBackendIpoId = null; // Unlink stale backend ID on identity change
        }

        await db.runAsync(
          `UPDATE ipo_listings
           SET backend_ipo_id = ?, company_name = ?, ipo_name = ?, symbol = ?, buy_price = ?, quantity = ?, registrar = ?, exchange = ?, issue_type = ?, open_date = ?, close_date = ?, allotment_date = ?, listing_date = ?, logo_url = ?, gmp_percent = ?, gmp_value = ?, updated_at = ?
           WHERE id = ?`,
          [
            targetBackendIpoId,
            trimmedCompany,
            trimmedIpoName,
            trimmedSymbol,
            price,
            qty,
            formRegistrar,
            formExchange,
            formIssueType,
            formOpenDate,
            formCloseDate,
            formAllotmentDate,
            formListingDate,
            finalLogoUrl,
            gmpPercent,
            gmpValue,
            now,
            editingIPO.id,
          ]
        );
      } else {
        const newId = `ipo_${Date.now()}`;
        await db.runAsync(
          `INSERT INTO ipo_listings (
            id, backend_ipo_id, company_name, ipo_name, symbol, buy_price, quantity,
            registrar, exchange, issue_type, open_date, close_date, allotment_date, listing_date,
            logo_url, archived, is_favorite, gmp_percent, gmp_value, created_at, updated_at
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
          [
            newId,
            trimmedCompany,
            trimmedIpoName,
            trimmedSymbol,
            price,
            qty,
            formRegistrar,
            formExchange,
            formIssueType,
            formOpenDate,
            formCloseDate,
            formAllotmentDate,
            formListingDate,
            finalLogoUrl,
            gmpPercent,
            gmpValue,
            now,
            now,
          ]
        );
      }

      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      console.error('Failed to save IPO record:', err);
      showError('Save Error', 'Failed to save IPO record into local database.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Page Header */}
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
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />

        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>
            {isEditing ? 'EDIT LISTING' : 'NEW LISTING'}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {isEditing ? 'Edit IPO' : 'Add IPO'}
          </Text>
        </View>

        <Button
          variant="primary"
          size="sm"
          title={saving ? 'Saving…' : 'Save'}
          loading={saving}
          disabled={saving}
          onPress={handleSave}
        />
      </View>

      {/* Form ScrollView */}
      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* COMPANY LOGO UPLOAD */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            COMPANY LOGO
          </Text>

          {formLogoUrl ? (
            <View style={[styles.logoPreviewRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Image source={{ uri: formLogoUrl }} style={styles.logoPreviewImage} resizeMode="contain" />
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Text style={[styles.logoPreviewText, { color: colors.foreground }]} numberOfLines={1}>
                  Logo Uploaded
                </Text>
                <Text style={[styles.logoPreviewSub, { color: colors.mutedForeground }]}>
                  Manual image selected
                </Text>
              </View>
              <TouchableOpacity onPress={pickLogoImage} style={[styles.logoBtn, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.8}>
                <Feather name="edit-2" size={13} color={colors.foreground} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFormLogoUrl('')} style={[styles.logoBtn, { backgroundColor: colors.destructiveBg, borderColor: colors.destructiveBg, marginLeft: 6 }]} activeOpacity={0.8}>
                <Feather name="trash-2" size={13} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={pickLogoImage}
              activeOpacity={0.8}
              style={[styles.logoUploadDropzone, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <View style={[styles.logoUploadIconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="upload-cloud" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.logoUploadTitle, { color: colors.foreground }]}>
                  Upload Company Logo
                </Text>
                <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]}>
                  PNG, JPG or SVG image file
                </Text>
              </View>
              <Feather name="plus" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* COMPANY NAME */}
        <View style={styles.field}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
              COMPANY NAME *
            </Text>
            <TouchableOpacity onPress={handleAutoFetchData} activeOpacity={0.7} style={styles.autoFetchLink}>
              <Feather name="zap" size={12} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.autoFetchLinkText, { color: colors.primary }]}>Auto-Fetch Data</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={formCompanyName}
            onChangeText={handleCompanyNameChange}
            placeholder="e.g. Juniper Hotels Limited"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
          />
        </View>

        {/* IPO DISPLAY NAME & SYMBOL side by side */}
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              IPO DISPLAY NAME *
            </Text>
            <TextInput
              value={formIpoName}
              onChangeText={setFormIpoName}
              placeholder="e.g. Juniper Hotels IPO"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
            />
          </View>

          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              SYMBOL *
            </Text>
            <TextInput
              value={formSymbol}
              onChangeText={(txt) => setFormSymbol(txt.toUpperCase())}
              placeholder="e.g. JUNIPER"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
            />
          </View>
        </View>

        {/* CUT-OFF PRICE & LOT SIZE side by side */}
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              CUT-OFF PRICE (₹) *
            </Text>
            <TextInput
              value={formPrice}
              onChangeText={setFormPrice}
              placeholder="e.g. 360"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
            />
          </View>

          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              LOT SIZE (QTY) *
            </Text>
            <TextInput
              value={formLotSize}
              onChangeText={setFormLotSize}
              placeholder="e.g. 40"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
            />
          </View>
        </View>

        {/* CONTROLLED REGISTRAR SELECTION */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>REGISTRAR *</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {CONTROLLED_REGISTRARS.map((r) => {
              const selected = formRegistrar === r.code;
              return (
                <TouchableOpacity
                  key={r.code}
                  onPress={() => setFormRegistrar(r.code)}
                  activeOpacity={0.8}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  {selected && (
                    <Feather name="check" size={12} color="#fff" style={{ marginRight: 4 }} />
                  )}
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? '#fff' : colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* CONTROLLED EXCHANGE & ISSUE TYPE side by side */}
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>EXCHANGE *</Text>
            <View style={[styles.issueTypeGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {CONTROLLED_EXCHANGES.map((ex) => (
                <TouchableOpacity
                  key={ex.code}
                  onPress={() => setFormExchange(ex.code)}
                  style={[styles.issueTypePill, formExchange === ex.code && { backgroundColor: colors.primary }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.issueTypeText, { color: formExchange === ex.code ? '#fff' : colors.mutedForeground }]}>
                    {ex.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ISSUE TYPE *</Text>
            <View style={[styles.issueTypeGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {CONTROLLED_ISSUE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.code}
                  onPress={() => setFormIssueType(t.code)}
                  style={[styles.issueTypePill, formIssueType === t.code && { backgroundColor: colors.primary }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.issueTypeText, { color: formIssueType === t.code ? '#fff' : colors.mutedForeground }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* DATES GRID */}
        <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>KEY DATES</Text>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>OPEN DATE *</Text>
            <TouchableOpacity
              onPress={() => setActiveDateField('openDate')}
              activeOpacity={0.8}
              style={[styles.dateInput, { borderColor: formOpenDate ? colors.primary : colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', color: formOpenDate ? colors.foreground : colors.mutedForeground }}>
                {formOpenDate || 'Select'}
              </Text>
              <Feather name="calendar" size={16} color={formOpenDate ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CLOSE DATE *</Text>
            <TouchableOpacity
              onPress={() => setActiveDateField('closeDate')}
              activeOpacity={0.8}
              style={[styles.dateInput, { borderColor: formCloseDate ? colors.primary : colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', color: formCloseDate ? colors.foreground : colors.mutedForeground }}>
                {formCloseDate || 'Select'}
              </Text>
              <Feather name="calendar" size={16} color={formCloseDate ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ALLOTMENT DATE</Text>
            <TouchableOpacity
              onPress={() => setActiveDateField('allotmentDate')}
              activeOpacity={0.8}
              style={[styles.dateInput, { borderColor: formAllotmentDate ? colors.primary : colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', color: formAllotmentDate ? colors.foreground : colors.mutedForeground }}>
                {formAllotmentDate || 'Select'}
              </Text>
              <Feather name="calendar" size={16} color={formAllotmentDate ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LISTING DATE</Text>
            <TouchableOpacity
              onPress={() => setActiveDateField('listingDate')}
              activeOpacity={0.8}
              style={[styles.dateInput, { borderColor: formListingDate ? colors.primary : colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', color: formListingDate ? colors.foreground : colors.mutedForeground }}>
                {formListingDate || 'Select'}
              </Text>
              <Feather name="calendar" size={16} color={formListingDate ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Custom Date Picker Modals */}
      <DatePickerModal
        visible={activeDateField === 'openDate'}
        value={formOpenDate}
        label="Open Date"
        onConfirm={(iso) => setFormOpenDate(iso)}
        onClose={() => setActiveDateField(null)}
      />
      <DatePickerModal
        visible={activeDateField === 'closeDate'}
        value={formCloseDate}
        label="Close Date"
        onConfirm={(iso) => setFormCloseDate(iso)}
        onClose={() => setActiveDateField(null)}
      />
      <DatePickerModal
        visible={activeDateField === 'allotmentDate'}
        value={formAllotmentDate}
        label="Allotment Date"
        onConfirm={(iso) => setFormAllotmentDate(iso)}
        onClose={() => setActiveDateField(null)}
      />
      <DatePickerModal
        visible={activeDateField === 'listingDate'}
        value={formListingDate}
        label="Listing Date"
        onConfirm={(iso) => setFormListingDate(iso)}
        onClose={() => setActiveDateField(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  form: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  field: {
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginBottom: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  issueTypeGroup: {
    height: 48,
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 4,
    alignItems: 'center',
  },
  issueTypePill: {
    flex: 1,
    height: '100%',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueTypeText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  dateInput: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  autoFetchLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autoFetchLinkText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  logoUploadDropzone: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  logoUploadIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoUploadTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  logoUploadSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  logoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
  },
  logoPreviewImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  logoPreviewText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  logoPreviewSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  logoBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
