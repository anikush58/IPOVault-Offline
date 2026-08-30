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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

type DateField = 'openDate' | 'closeDate' | 'allotmentDate' | 'listingDate';

function isoToDate(iso: string): Date {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateToISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const [saving, setSaving] = useState(false);

  // Date picker state
  const [pickerField, setPickerField] = useState<DateField | null>(null);
  const [showPicker, setShowPicker] = useState(false);

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

  const openDatePicker = (field: DateField) => {
    setPickerField(field);
    setShowPicker(true);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selectedDate && pickerField) {
      const iso = dateToISO(selectedDate);
      if (pickerField === 'openDate') setFormOpenDate(iso);
      else if (pickerField === 'closeDate') setFormCloseDate(iso);
      else if (pickerField === 'allotmentDate') setFormAllotmentDate(iso);
      else if (pickerField === 'listingDate') setFormListingDate(iso);
    }
  };

  const getCurrentPickerValue = (): Date => {
    if (pickerField === 'openDate') return isoToDate(formOpenDate);
    if (pickerField === 'closeDate') return isoToDate(formCloseDate);
    if (pickerField === 'allotmentDate') return isoToDate(formAllotmentDate);
    if (pickerField === 'listingDate') return isoToDate(formListingDate);
    return new Date();
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

        {/* REGISTRAR */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>REGISTRAR</Text>
          <TextInput
            value={formRegistrar}
            onChangeText={setFormRegistrar}
            placeholder="e.g. KFin Technologies Limited"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
          />
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
              onPress={() => openDatePicker('openDate')}
              activeOpacity={0.8}
              style={[styles.dateInput, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', color: formOpenDate ? colors.foreground : colors.mutedForeground }}>
                {formOpenDate || 'YYYY-MM-DD'}
              </Text>
              <Feather name="calendar" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CLOSE DATE</Text>
            <TouchableOpacity
              onPress={() => openDatePicker('closeDate')}
              activeOpacity={0.8}
              style={[styles.dateInput, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', color: formCloseDate ? colors.foreground : colors.mutedForeground }}>
                {formCloseDate || 'Select date'}
              </Text>
              <Feather name="calendar" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ALLOTMENT</Text>
            <TouchableOpacity
              onPress={() => openDatePicker('allotmentDate')}
              activeOpacity={0.8}
              style={[styles.dateInput, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', color: formAllotmentDate ? colors.foreground : colors.mutedForeground }}>
                {formAllotmentDate || 'Select date'}
              </Text>
              <Feather name="calendar" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LISTING DATE</Text>
            <TouchableOpacity
              onPress={() => openDatePicker('listingDate')}
              activeOpacity={0.8}
              style={[styles.dateInput, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'GoogleSansFlex_400Regular', color: formListingDate ? colors.foreground : colors.mutedForeground }}>
                {formListingDate || 'Select date'}
              </Text>
              <Feather name="calendar" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Date Picker */}
      {showPicker && (
        <DateTimePicker
          value={getCurrentPickerValue()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
      )}
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
});
