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



const REGISTRARS = [
  'KFin Technologies Limited',
  'Link Intime India Pvt. Ltd.',
  'Bigshare Services Pvt. Ltd.',
  'MUFG Intime India Pvt. Ltd.',
  'Cameo Corporate Services Ltd.',
  'Skyline Financial Services Pvt. Ltd.',
  'Purva Sharegistry India Pvt. Ltd.',
  'Mas Services Ltd.',
  'Alankit Assignments Ltd.',
  'Beetal Financial & Computer Services Pvt. Ltd.',
  'Karvy Fintech Pvt. Ltd.',
  'Integrated Registry Management Services Pvt. Ltd.',
  'Universal Capital Securities Pvt. Ltd.',
  'Niche Technologies Pvt. Ltd.',
  'S.K.D.C. Consultants Ltd.',
  'SEBI Registered Registrar',
];

const KNOWN_DOMAINS: Record<string, string> = {
  'ola': 'olaelectric.com',
  'ola electric': 'olaelectric.com',
  'hdb': 'hdbfs.com',
  'hdb financial': 'hdbfs.com',
  'kotak': 'kotak.com',
  'kotak multicap': 'kotak.com',
  'tata': 'tatamotors.com',
  'tata tech': 'tatatechnologies.com',
  'swiggy': 'swiggy.com',
  'zomato': 'zomato.com',
  'paytm': 'paytm.com',
  'lic': 'licindia.in',
  'hyundai': 'hyundai.com',
  'adani': 'adani.com',
  'bajaj': 'bajajhousingfinance.in',
  'nykaa': 'nykaa.com',
  'firstcry': 'firstcry.com',
  'ixigo': 'ixigo.com',
  'unicommerce': 'unicommerce.com',
  'mamaearth': 'honasa.in',
  'zerodha': 'zerodha.com',
};

function getAutoLogoUrl(companyName: string): string {
  if (!companyName.trim()) return '';
  const lower = companyName.toLowerCase().trim();
  const clean = lower.replace(/ (ltd|limited|pvt|private|inc|corp|corporation|services|india|technologies|tech|finance|housing|capital)/g, '').trim();
  const known = KNOWN_DOMAINS[lower] || KNOWN_DOMAINS[clean];
  const domain = known || `${clean.replace(/[^a-z0-9]/g, '')}.com`;
  return `https://logo.clearbit.com/${domain}`;
}



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
  const [formIpoName, setFormIpoName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formLotSize, setFormLotSize] = useState('');
  const [formRegistrar, setFormRegistrar] = useState('');
  const [formExchange, setFormExchange] = useState('');
  const [formIssueType, setFormIssueType] = useState<'Mainboard' | 'SME'>('Mainboard');
  const [formOpenDate, setFormOpenDate] = useState('');
  const [formCloseDate, setFormCloseDate] = useState('');
  const [formAllotmentDate, setFormAllotmentDate] = useState('');
  const [formListingDate, setFormListingDate] = useState('');
  const [formLogoUrl, setFormLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Date picker state — one active field at a time
  const [activeDateField, setActiveDateField] = useState<'openDate' | 'closeDate' | 'allotmentDate' | 'listingDate' | null>(null);

  useEffect(() => {
    if (editingIPO) {
      setFormIpoName(editingIPO.ipo_name);
      setFormPrice(editingIPO.buy_price.toString());
      setFormLotSize(editingIPO.quantity.toString());
      setFormRegistrar(editingIPO.registrar || '');
      setFormExchange(editingIPO.exchange || '');
      setFormIssueType((editingIPO.issue_type as any) === 'SME' ? 'SME' : 'Mainboard');
      setFormOpenDate(editingIPO.open_date || '');
      setFormCloseDate(editingIPO.close_date || '');
      setFormAllotmentDate(editingIPO.allotment_date || '');
      setFormListingDate(editingIPO.listing_date || '');
      setFormLogoUrl(editingIPO.logo_url || '');
    } else {
      setFormOpenDate(new Date().toISOString().slice(0, 10));
    }
  }, [editingIPO]);

  // Auto-fetch data when company name changes (if fields are not manually set)
  const [userPickedLogo, setUserPickedLogo] = useState(false);

  useEffect(() => {
    if (!formLogoUrl || !userPickedLogo) {
      if (formIpoName.trim().length >= 3) {
        const timer = setTimeout(() => {
          const autoUrl = getAutoLogoUrl(formIpoName);
          if (autoUrl) setFormLogoUrl(autoUrl);
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [formIpoName]);

  const handleAutoFetchData = async () => {
    if (!formIpoName.trim()) {
      showError('Enter Company Name', 'Please type the IPO or company name first.');
      return;
    }
    const q = formIpoName.trim().toLowerCase();

    try {
      const masterRow = await db.getFirstAsync<any>(
        `SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (LOWER(ipo_name) LIKE ? OR LOWER(company_name) LIKE ?) LIMIT 1`,
        [`%${q}%`, `%${q}%`]
      );
      const listingRow = await db.getFirstAsync<any>(
        `SELECT * FROM ipo_listings WHERE deleted_at IS NULL AND LOWER(ipo_name) LIKE ? LIMIT 1`,
        [`%${q}%`]
      );

      const price = masterRow?.price_band_max || masterRow?.price_band_min || masterRow?.buy_price || listingRow?.buy_price;
      const lot = masterRow?.lot_size || masterRow?.quantity || listingRow?.quantity;
      const registrar = masterRow?.registrar || listingRow?.registrar;
      const exchange = masterRow?.exchange || listingRow?.exchange;
      const issueType = masterRow?.issue_type || listingRow?.issue_type;
      const openDate = masterRow?.open_date || listingRow?.open_date;
      const closeDate = masterRow?.close_date || listingRow?.close_date;
      const allotmentDate = masterRow?.allotment_date || listingRow?.allotment_date;
      const listingDate = masterRow?.listing_date || listingRow?.listing_date;
      const logoUrl = masterRow?.logo_url || listingRow?.logo_url || getAutoLogoUrl(formIpoName);

      let count = 0;
      if (price) { setFormPrice(price.toString()); count++; }
      if (lot) { setFormLotSize(lot.toString()); count++; }
      if (registrar) { setFormRegistrar(registrar); count++; }
      if (exchange) { setFormExchange(exchange); count++; }
      if (issueType) { setFormIssueType(issueType.toString().toUpperCase().includes('SME') ? 'SME' : 'Mainboard'); count++; }
      if (openDate) { setFormOpenDate(openDate); count++; }
      if (closeDate) { setFormCloseDate(closeDate); count++; }
      if (allotmentDate) { setFormAllotmentDate(allotmentDate); count++; }
      if (listingDate) { setFormListingDate(listingDate); count++; }
      if (logoUrl) { setFormLogoUrl(logoUrl); count++; }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (count > 0) {
        showSuccess('Data Auto-Fetched', `Auto-filled ${count} field(s) for ${formIpoName}.`);
      } else {
        showError('No Master Data Found', 'No auto data found for this company name. Fill remaining fields manually.');
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
        setFormLogoUrl(result.assets[0].uri);
        setUserPickedLogo(true);
        Haptics.selectionAsync();
      }
    } catch (err) {
      console.error('Failed to pick logo image:', err);
    }
  };


  const handleSave = async () => {
    if (!formIpoName.trim()) {
      showError('Required Field', 'Please enter IPO / Company Name.');
      return;
    }
    const price = parseFloat(formPrice) || 0;
    const qty = parseInt(formLotSize, 10) || 0;
    if (price <= 0 || qty <= 0) {
      showError('Invalid Values', 'Price and lot size must be greater than zero.');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && editingIPO) {
        const now = new Date().toISOString();
        await db.runAsync(
          `UPDATE ipo_listings
           SET ipo_name = ?, buy_price = ?, quantity = ?, registrar = ?, exchange = ?, issue_type = ?, open_date = ?, close_date = ?, allotment_date = ?, listing_date = ?, logo_url = ?, updated_at = ?
           WHERE id = ?`,
          [
            formIpoName.trim(),
            price,
            qty,
            formRegistrar.trim(),
            formExchange.trim(),
            formIssueType,
            formOpenDate,
            formCloseDate,
            formAllotmentDate,
            formListingDate,
            formLogoUrl,
            now,
            editingIPO.id,
          ]
        );
        showSuccess('Saved', `${formIpoName} updated successfully.`);
      } else {
        const newId = `ipo_${Date.now()}`;
        const now = new Date().toISOString();
        await db.runAsync(
          `INSERT INTO ipo_listings (id, ipo_name, buy_price, quantity, registrar, exchange, issue_type, open_date, close_date, allotment_date, listing_date, logo_url, archived, is_favorite, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          [
            newId,
            formIpoName.trim(),
            price,
            qty,
            formRegistrar.trim(),
            formExchange.trim(),
            formIssueType,
            formOpenDate,
            formCloseDate,
            formAllotmentDate,
            formListingDate,
            formLogoUrl,
            now,
            now,
          ]
        );
        showSuccess('Created', `${formIpoName} added to IPO listings.`);
      }
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      showError('Error', 'Failed to save IPO record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Page Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            height: topPad + 60,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
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

      {/* ── Form ScrollView ── */}
      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* COMPANY LOGO UPLOAD */}
        <View style={styles.field}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
              COMPANY LOGO
            </Text>
            <TouchableOpacity onPress={handleAutoFetchData} activeOpacity={0.7} style={styles.autoFetchLink}>
              <Feather name="zap" size={12} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.autoFetchLinkText, { color: colors.primary }]}>Auto-Fetch Data</Text>
            </TouchableOpacity>
          </View>

          {formLogoUrl ? (
            <View style={[styles.logoPreviewRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Image source={{ uri: formLogoUrl }} style={styles.logoPreviewImage} resizeMode="contain" />
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Text style={[styles.logoPreviewText, { color: colors.foreground }]} numberOfLines={1}>
                  {userPickedLogo ? 'Custom Logo Uploaded' : 'Logo Auto-Fetched'}
                </Text>
                <Text style={[styles.logoPreviewSub, { color: colors.mutedForeground }]}>
                  Auto-detected from company name
                </Text>
              </View>
              <TouchableOpacity onPress={handleAutoFetchData} style={[styles.logoBtn, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.8}>
                <Feather name="refresh-cw" size={13} color={colors.foreground} />
              </TouchableOpacity>
              <TouchableOpacity onPress={pickLogoImage} style={[styles.logoBtn, { backgroundColor: colors.card, borderColor: colors.border, marginLeft: 6 }]} activeOpacity={0.8}>
                <Feather name="edit-2" size={13} color={colors.foreground} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setFormLogoUrl(''); setUserPickedLogo(true); }} style={[styles.logoBtn, { backgroundColor: colors.destructiveBg, borderColor: colors.destructiveBg, marginLeft: 6 }]} activeOpacity={0.8}>
                <Feather name="trash-2" size={13} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={handleAutoFetchData}
                activeOpacity={0.8}
                style={[styles.logoUploadDropzone, { flex: 1, borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <View style={[styles.logoUploadIconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="zap" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logoUploadTitle, { color: colors.foreground }]}>
                    Auto-Fetch Data
                  </Text>
                  <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]}>
                    Fill form automatically
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={pickLogoImage}
                activeOpacity={0.8}
                style={[styles.logoUploadDropzone, { flex: 1, borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <View style={[styles.logoUploadIconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="upload-cloud" size={16} color={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logoUploadTitle, { color: colors.foreground }]}>
                    Upload File
                  </Text>
                  <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]}>
                    Pick custom image
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* IPO / COMPANY NAME */}
        <View style={styles.field}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
              IPO / COMPANY NAME *
            </Text>
            <TouchableOpacity onPress={handleAutoFetchData} activeOpacity={0.7} style={styles.autoFetchLink}>
              <Feather name="zap" size={12} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.autoFetchLinkText, { color: colors.primary }]}>Auto-Fetch Data</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={formIpoName}
            onChangeText={setFormIpoName}
            placeholder="e.g. Advit Jewels"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
          />
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
              placeholder="e.g. 56"
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
              placeholder="e.g. 2000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
            />
          </View>
        </View>

        {/* ISSUE TYPE */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ISSUE TYPE</Text>
          <View style={[styles.issueTypeGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['Mainboard', 'SME'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                onPress={() => setFormIssueType(type)}
                style={[styles.issueTypePill, formIssueType === type && { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.issueTypeText, { color: formIssueType === type ? '#fff' : colors.mutedForeground }]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* REGISTRAR — Chip Selection */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>REGISTRAR</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {REGISTRARS.map((r) => {
              const selected = formRegistrar === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setFormRegistrar(selected ? '' : r)}
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
                    {r}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {formRegistrar ? (
            <TouchableOpacity
              onPress={() => setFormRegistrar('')}
              style={styles.chipClearRow}
              activeOpacity={0.7}
            >
              <Feather name="x-circle" size={13} color={colors.mutedForeground} style={{ marginRight: 4 }} />
              <Text style={[styles.chipClearText, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {formRegistrar}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* EXCHANGE (edit only) */}
        {isEditing && (
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>EXCHANGE</Text>
            <TextInput
              value={formExchange}
              onChangeText={setFormExchange}
              placeholder="e.g. BSE SME"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
            />
          </View>
        )}

        {/* DATES — 2 column grid */}
        <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>KEY DATES</Text>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>OPEN DATE</Text>
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
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CLOSE DATE</Text>
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
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ALLOTMENT</Text>
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

      {/* ── Custom Date Picker Modals ── */}
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
    borderBottomWidth: 1,
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
    fontSize: 13,
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
  chipClearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  chipClearText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
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
    width: 38,
    height: 38,
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
    marginTop: 1,
  },
  logoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  logoPreviewImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  logoPreviewText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  logoPreviewSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  logoBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
