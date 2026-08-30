import React, { useEffect, useState } from 'react';
import {
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
    } else {
      setFormOpenDate(new Date().toISOString().slice(0, 10));
    }
  }, [editingIPO]);


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
           SET ipo_name = ?, buy_price = ?, quantity = ?, registrar = ?, exchange = ?, issue_type = ?, open_date = ?, close_date = ?, allotment_date = ?, listing_date = ?, updated_at = ?
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
            now,
            editingIPO.id,
          ]
        );
        showSuccess('Saved', `${formIpoName} updated successfully.`);
      } else {
        const newId = `ipo_${Date.now()}`;
        const now = new Date().toISOString();
        await db.runAsync(
          `INSERT INTO ipo_listings (id, ipo_name, buy_price, quantity, registrar, exchange, issue_type, open_date, close_date, allotment_date, listing_date, archived, is_favorite, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
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
        {/* IPO / COMPANY NAME */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            IPO / COMPANY NAME *
          </Text>
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
});
