import React, { useMemo, useState } from 'react';
import {
  FlatList,
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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB, type IPOListing } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { formatCurrency } from '@/utils/formatters';
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';

type TabSegment = 'active' | 'favorites' | 'archived';
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

export default function IPOManagementScreen() {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { showSuccess, showError, showConfirm } = useDialog();

  const { ipos, applications, refresh } = useDB();

  // Segment State: active | favorites | archived
  const [activeSegment, setActiveSegment] = useState<TabSegment>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIPO, setEditingIPO] = useState<IPOListing | null>(null);

  // Form State
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
  const [formSaving, setFormSaving] = useState(false);

  // Date picker state
  const [pickerField, setPickerField] = useState<DateField | null>(null);
  const [showPicker, setShowPicker] = useState(false);

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

  // Counts
  const activeCount = useMemo(() => ipos.filter((i) => i.archived === 0).length, [ipos]);
  const favCount = useMemo(() => ipos.filter((i) => i.is_favorite === 1).length, [ipos]);
  const archivedCount = useMemo(() => ipos.filter((i) => i.archived === 1).length, [ipos]);

  const filteredIPOs = useMemo(() => {
    let list = ipos;
    if (activeSegment === 'active') {
      list = list.filter((i) => i.archived === 0);
    } else if (activeSegment === 'favorites') {
      list = list.filter((i) => i.is_favorite === 1);
    } else if (activeSegment === 'archived') {
      list = list.filter((i) => i.archived === 1);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) =>
        i.ipo_name.toLowerCase().includes(q) || (i.registrar && i.registrar.toLowerCase().includes(q))
      );
    }

    return list;
  }, [ipos, activeSegment, searchQuery]);

  // Open Add Modal
  const openAddModal = () => {
    setEditingIPO(null);
    setFormIpoName('');
    setFormPrice('');
    setFormLotSize('');
    setFormRegistrar('');
    setFormExchange('');
    setFormIssueType('Mainboard');
    setFormOpenDate(new Date().toISOString().slice(0, 10));
    setFormCloseDate('');
    setFormAllotmentDate('');
    setFormListingDate('');
    setShowAddModal(true);
  };

  // Open Edit Modal
  const openEditModal = (ipo: IPOListing) => {
    setEditingIPO(ipo);
    setFormIpoName(ipo.ipo_name);
    setFormPrice(ipo.buy_price.toString());
    setFormLotSize(ipo.quantity.toString());
    setFormRegistrar(ipo.registrar || '');
    setFormExchange(ipo.exchange || '');
    setFormIssueType((ipo.issue_type as any) === 'SME' ? 'SME' : 'Mainboard');
    setFormOpenDate(ipo.open_date || '');
    setFormCloseDate(ipo.close_date || '');
    setFormAllotmentDate(ipo.allotment_date || '');
    setFormListingDate(ipo.listing_date || '');
    setShowAddModal(true);
  };

  // Toggle Favorite
  const handleToggleFavorite = async (ipo: IPOListing) => {
    Haptics.selectionAsync();
    const newFav = ipo.is_favorite === 1 ? 0 : 1;
    try {
      await db.runAsync('UPDATE ipo_listings SET is_favorite = ? WHERE id = ?', [newFav, ipo.id]);
      await refresh();
    } catch {
      showError('Error', 'Failed to update favorite status.');
    }
  };

  // Toggle Archive Status
  const handleToggleArchive = async (ipo: IPOListing) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newArchived = ipo.archived === 1 ? 0 : 1;
    try {
      await db.runAsync('UPDATE ipo_listings SET archived = ? WHERE id = ?', [newArchived, ipo.id]);
      await refresh();
      showSuccess(
        newArchived === 1 ? 'Archived' : 'Restored',
        `${ipo.ipo_name} has been ${newArchived === 1 ? 'archived' : 'restored to active listings'}.`
      );
    } catch {
      showError('Error', 'Failed to update archive status.');
    }
  };

  const handleDeleteIPO = async (ipo: IPOListing) => {
    try {
      await db.runAsync('UPDATE ipo_listings SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [ipo.id]);
      await refresh();
      showSuccess('Deleted', `${ipo.ipo_name} has been deleted.`);
    } catch {
      showError('Error', 'Failed to delete IPO record.');
    }
  };

  // Save (Create or Update)
  const handleSaveForm = async () => {
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

    setFormSaving(true);
    try {
      if (editingIPO) {
        // Update existing record
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
        // Create new record
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
      setShowAddModal(false);
    } catch {
      showError('Error', 'Failed to save IPO record.');
    } finally {
      setFormSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Custom Single Header (No Double Navigation Bar) ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>TRACK & MANAGE</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPOs</Text>
        </View>

        <IconButton
          name="plus"
          variant="surface"
          size="md"
          onPress={openAddModal}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {/* ── Segmented Tabs Bar ── */}
        <SegmentedTabControl
          variant="primary"
          tabs={[
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'favorites', label: 'Favorites', icon: 'star', count: favCount },
            { key: 'archived', label: 'Archived', count: archivedCount },
          ]}
          activeTab={activeSegment}
          onChange={(newSeg) => setActiveSegment(newSeg as TabSegment)}
          style={{ marginBottom: 14 }}
        />

        {/* ── Search Input Bar ── */}
        <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search IPOs by name or registrar..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Listings Count Eyebrow ── */}
        <Text style={[styles.listingsEyebrow, { color: colors.mutedForeground }]}>
          {filteredIPOs.length} LISTING{filteredIPOs.length !== 1 ? 'S' : ''}
        </Text>

        {filteredIPOs.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Multi-layered Icon Stack */}
            <View style={[styles.emptyIconCircleOuter, { backgroundColor: colors.primary + '14' }]}>
              <View style={[styles.emptyIconCircleInner, { backgroundColor: colors.primary + '28' }]}>
                <Feather
                  name={
                    searchQuery
                      ? 'search'
                      : activeSegment === 'favorites'
                      ? 'star'
                      : activeSegment === 'archived'
                      ? 'archive'
                      : 'layers'
                  }
                  size={32}
                  color={colors.primary}
                />
              </View>
            </View>

            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {searchQuery
                ? 'No Matching IPO Listings'
                : activeSegment === 'favorites'
                ? 'No Favorite IPOs Saved'
                : activeSegment === 'archived'
                ? 'No Archived IPO Listings'
                : 'No IPO Listings Yet'}
            </Text>

            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              {searchQuery
                ? `No IPO matches "${searchQuery}". Check your search term or clear filters.`
                : activeSegment === 'favorites'
                ? 'Bookmark IPOs by tapping the star icon on any IPO card for quick access.'
                : activeSegment === 'archived'
                ? 'Archived IPO listings will appear here to keep your active list clean.'
                : 'Create your first IPO listing to track buy price, quantity, dates, and bulk applications.'}
            </Text>

            {/* Action Buttons */}
            {searchQuery ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={[styles.emptyActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <Feather name="x-circle" size={15} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.emptyActionBtnText, { color: colors.primary }]}>Clear Search Filter</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={openAddModal}
                style={[styles.emptyActionBtnPrimary, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Feather name="plus-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionBtnPrimaryText}>Add IPO Listing</Text>
              </TouchableOpacity>
            )}

            {/* Feature Highlights Card */}
            {!searchQuery && activeSegment === 'active' && (
              <View style={[styles.emptyTipsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.emptyTipRow}>
                  <View style={[styles.emptyTipBadge, { backgroundColor: colors.primary + '1C' }]}>
                    <Feather name="zap" size={14} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.emptyTipTitle, { color: colors.foreground }]}>Quick Auto-Fill</Text>
                    <Text style={[styles.emptyTipDesc, { color: colors.mutedForeground }]}>
                      Type any live company name to pre-fill price, lot size & registrar.
                    </Text>
                  </View>
                </View>

                <View style={[styles.emptyTipDivider, { backgroundColor: colors.border }]} />

                <View style={styles.emptyTipRow}>
                  <View style={[styles.emptyTipBadge, { backgroundColor: '#38A1691C' }]}>
                    <Feather name="users" size={14} color="#38A169" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.emptyTipTitle, { color: colors.foreground }]}>Bulk Applications</Text>
                    <Text style={[styles.emptyTipDesc, { color: colors.mutedForeground }]}>
                      Effortlessly apply for multiple user accounts from your created IPOs.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        ) : (
          filteredIPOs.map((ipo) => {
            const totalAmount = ipo.buy_price * ipo.quantity;
            const appCount = applications.filter((a) => a.ipo_id === ipo.id).length;
            const isArchivedRow = ipo.archived === 1;

            return (
              <View key={ipo.id} style={[styles.ipoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Header Row */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardIconAvatar}>
                    <Feather name="trending-up" size={16} color="#D4A017" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {ipo.ipo_name}
                    </Text>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                      ₹{ipo.buy_price} × {ipo.quantity} lot · {appCount} application{appCount !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <TouchableOpacity onPress={() => handleToggleFavorite(ipo)} hitSlop={8}>
                      <Feather
                        name="star"
                        size={16}
                        color={ipo.is_favorite === 1 ? '#D4A017' : colors.mutedForeground}
                      />
                    </TouchableOpacity>
                    <Text style={styles.cardAmountText}>{formatCurrency(totalAmount)}</Text>
                  </View>
                </View>

                {/* Date Blocks Grid (4 columns) */}
                <View style={styles.dateBlocksGrid}>
                  <View style={styles.dateBlock}>
                    <Text style={styles.dateBlockTag}>OPEN</Text>
                    <Text style={styles.dateBlockVal}>{ipo.open_date || '—'}</Text>
                  </View>
                  <View style={styles.dateBlock}>
                    <Text style={styles.dateBlockTag}>CLOSE</Text>
                    <Text style={styles.dateBlockVal}>{ipo.close_date || '—'}</Text>
                  </View>
                  <View style={styles.dateBlock}>
                    <Text style={styles.dateBlockTag}>ALLOTMENT</Text>
                    <Text style={styles.dateBlockVal}>{ipo.allotment_date || '—'}</Text>
                  </View>
                  <View style={styles.dateBlock}>
                    <Text style={styles.dateBlockTag}>LISTS</Text>
                    <Text style={styles.dateBlockVal}>{ipo.listing_date || '—'}</Text>
                  </View>
                </View>

                {/* Bottom Action Row */}
                <View style={styles.cardActionsRow}>
                  {!isArchivedRow ? (
                    <>
                      <TouchableOpacity onPress={() => openEditModal(ipo)} style={styles.actionBtnTan} activeOpacity={0.8}>
                        <Feather name="edit-2" size={14} color="#D4A017" style={{ marginRight: 6 }} />
                        <Text style={styles.actionBtnTanText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleToggleArchive(ipo)} style={styles.actionBtnTan} activeOpacity={0.8}>
                        <Feather name="archive" size={14} color="#D4A017" style={{ marginRight: 6 }} />
                        <Text style={styles.actionBtnTanText}>Archive</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => handleToggleArchive(ipo)} style={styles.actionBtnTan} activeOpacity={0.8}>
                        <Feather name="rotate-ccw" size={14} color="#D4A017" style={{ marginRight: 6 }} />
                        <Text style={styles.actionBtnTanText}>Unarchive</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleDeleteIPO(ipo)} style={styles.actionBtnRed} activeOpacity={0.8}>
                        <Feather name="trash-2" size={14} color="#E53E3E" style={{ marginRight: 6 }} />
                        <Text style={styles.actionBtnRedText}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Add / Edit IPO Modal Screen ── */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
          <Pressable style={[styles.formModalSheet, { backgroundColor: colors.background, borderTopColor: colors.border }]} onPress={() => {}}>
            {/* Modal Header */}
            <View style={[styles.formModalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.modalCloseCircle}>
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.formModalTitle, { color: colors.foreground }]}>
                {editingIPO ? 'Edit IPO' : 'Add IPO'}
              </Text>
              <TouchableOpacity onPress={handleSaveForm} disabled={formSaving} style={styles.formSavePill} activeOpacity={0.85}>
                <Text style={styles.formSavePillText}>{formSaving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              {/* IPO / COMPANY NAME */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>IPO / COMPANY NAME *</Text>
                <TextInput
                  value={formIpoName}
                  onChangeText={setFormIpoName}
                  placeholder="e.g. Advit Jewels"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.inputField, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                />
              </View>

              {!editingIPO && (
                <TouchableOpacity style={styles.autoFillBtn} activeOpacity={0.8}>
                  <Text style={styles.autoFillBtnText}>Auto Fill IPO Details</Text>
                </TouchableOpacity>
              )}

              {/* CUT-OFF PRICE */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CUT-OFF PRICE (₹) *</Text>
                <TextInput
                  value={formPrice}
                  onChangeText={setFormPrice}
                  placeholder="e.g. 56"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  style={[styles.inputField, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                />
              </View>

              {/* LOT SIZE */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LOT SIZE (QTY) *</Text>
                <TextInput
                  value={formLotSize}
                  onChangeText={setFormLotSize}
                  placeholder="e.g. 2000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  style={[styles.inputField, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                />
              </View>

              {/* REGISTRAR */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>REGISTRAR</Text>
                <TextInput
                  value={formRegistrar}
                  onChangeText={setFormRegistrar}
                  placeholder="e.g. KFin Technologies Limited"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.inputField, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                />
              </View>

              {/* EXCHANGE (only shown on edit) */}
              {editingIPO && (
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>EXCHANGE</Text>
                  <TextInput
                    value={formExchange}
                    onChangeText={setFormExchange}
                    placeholder="e.g. BSE SME"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.inputField, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  />
                </View>
              )}

              {/* ISSUE TYPE Segmented Toggle */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ISSUE TYPE</Text>
                <View style={[styles.issueTypeGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity
                    onPress={() => setFormIssueType('Mainboard')}
                    style={[styles.issueTypePill, formIssueType === 'Mainboard' && styles.issueTypePillActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.issueTypeText, formIssueType === 'Mainboard' && styles.issueTypeTextActive]}>
                      Mainboard
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setFormIssueType('SME')}
                    style={[styles.issueTypePill, formIssueType === 'SME' && styles.issueTypePillActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.issueTypeText, formIssueType === 'SME' && styles.issueTypeTextActive]}>
                      SME
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* OPEN DATE */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>OPEN DATE</Text>
                <TouchableOpacity
                  onPress={() => openDatePicker('openDate')}
                  activeOpacity={0.8}
                  style={[styles.dateInputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <TextInput
                    value={formOpenDate}
                    onChangeText={setFormOpenDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.dateInput, { color: colors.foreground }]}
                    editable={false}
                    pointerEvents="none"
                  />
                  <Feather name="calendar" size={16} color="#D4A017" />
                </TouchableOpacity>
              </View>

              {/* CLOSE DATE */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CLOSE DATE</Text>
                <TouchableOpacity
                  onPress={() => openDatePicker('closeDate')}
                  activeOpacity={0.8}
                  style={[styles.dateInputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <TextInput
                    value={formCloseDate}
                    onChangeText={setFormCloseDate}
                    placeholder="Select date"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.dateInput, { color: colors.foreground }]}
                    editable={false}
                    pointerEvents="none"
                  />
                  <Feather name="calendar" size={16} color="#D4A017" />
                </TouchableOpacity>
              </View>

              {/* ALLOTMENT DATE */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ALLOTMENT DATE</Text>
                <TouchableOpacity
                  onPress={() => openDatePicker('allotmentDate')}
                  activeOpacity={0.8}
                  style={[styles.dateInputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <TextInput
                    value={formAllotmentDate}
                    onChangeText={setFormAllotmentDate}
                    placeholder="Select date"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.dateInput, { color: colors.foreground }]}
                    editable={false}
                    pointerEvents="none"
                  />
                  <Feather name="calendar" size={16} color="#D4A017" />
                </TouchableOpacity>
              </View>

              {/* LISTING DATE */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LISTING DATE</Text>
                <TouchableOpacity
                  onPress={() => openDatePicker('listingDate')}
                  activeOpacity={0.8}
                  style={[styles.dateInputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <TextInput
                    value={formListingDate}
                    onChangeText={setFormListingDate}
                    placeholder="Select date"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.dateInput, { color: colors.foreground }]}
                    editable={false}
                    pointerEvents="none"
                  />
                  <Feather name="calendar" size={16} color="#D4A017" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date Picker Modal Component */}
      {showPicker && (
        <DateTimePicker
          value={getCurrentPickerValue()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    color: '#D4A017',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: { fontSize: 28, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.6, lineHeight: 32 },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D4A017',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#D4A017',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  segmentBar: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  segmentPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  segmentPillActive: { backgroundColor: '#D4A017' },
  segmentText: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: '#718096' },
  segmentTextActive: { color: '#fff' },

  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  countBadgeText: { fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', color: '#4A5568' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' },

  listingsEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  emptyContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIconCircleOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIconCircleInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptyActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#D4A017',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  emptyActionBtnPrimaryText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  emptyTipsBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 20,
    gap: 12,
  },
  emptyTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  emptyTipBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTipTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptyTipDesc: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    lineHeight: 16,
  },
  emptyTipDivider: {
    height: 1,
    width: '100%',
  },

  // IPO Card
  ipoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  cardIconAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF9E6', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  cardSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },
  cardAmountText: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', color: '#D4A017' },

  // Date Blocks Grid
  dateBlocksGrid: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  dateBlock: { flex: 1, backgroundColor: '#F4F5F7', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' },
  dateBlockTag: { fontSize: 9, fontFamily: 'GoogleSansFlex_700Bold', color: '#718096', letterSpacing: 0.6 },
  dateBlockVal: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', color: '#2D3748', marginTop: 2 },

  // Card Action Buttons
  cardActionsRow: { flexDirection: 'row', gap: 10 },
  actionBtnTan: {
    flex: 1,
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnTanText: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: '#D4A017' },

  actionBtnRed: {
    flex: 1,
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnRedText: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: '#E53E3E' },

  // Modal Form Sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  formModalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', borderTopWidth: 1 },
  formModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  modalCloseCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4F5F7', alignItems: 'center', justifyContent: 'center' },
  formModalTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold' },
  formSavePill: { backgroundColor: '#D4A017', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  formSavePillText: { color: '#fff', fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },

  fieldLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.9, marginBottom: 4 },
  inputField: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' },
  autoFillBtn: { height: 46, borderWidth: 1, borderColor: '#D4A017', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  autoFillBtnText: { color: '#D4A017', fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },

  issueTypeGroup: { height: 46, flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, gap: 4, alignItems: 'center' },
  issueTypePill: { flex: 1, height: '100%', borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  issueTypePillActive: { backgroundColor: '#D4A017' },
  issueTypeText: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: '#718096' },
  issueTypeTextActive: { color: '#fff' },

  dateInputWrap: { height: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  dateInput: { flex: 1, height: '100%', fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' },
});
