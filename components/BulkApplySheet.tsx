import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDB } from '@/context/DBContext';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { useDialog } from '@/context/DialogContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCurrency } from '@/utils/formatters';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';

const UPI_APPS = ['GPay', 'PhonePe', 'Paytm', 'BHIM', 'BoB ASBA', 'IDFC ASBA', 'Other'];

export interface BulkIPOOption {
  id: string;
  ipo_name: string;
  company_name: string;
  buy_price: number;
  quantity: number;
  open_date: string;
  close_date: string;
  listing_date?: string;
  allotment_date?: string;
  registrar?: string;
  logo_url?: string;
  issue_type?: string;
  symbol?: string;
  isBackend?: boolean;
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function BulkApplySheet({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const db = useSQLiteContext();
  const { ipos, users, applications, bankAccounts, addBulkApplications } = useDB();
  const { showError } = useDialog();

  const [bulkIPOId, setBulkIPOId] = useState<string | null>(null);
  const [bulkBankName, setBulkBankName] = useState<string | null>(null);
  const [bulkUPIApp, setBulkUPIApp] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const [backendIpos, setBackendIpos] = useState<BackendIpo[]>([]);
  const [loadingBackendIpos, setLoadingBackendIpos] = useState(false);

  // Reset selections & fetch live open IPOs from IPO Hub whenever sheet is opened
  useEffect(() => {
    if (visible) {
      setBulkIPOId(null);
      setBulkBankName(null);
      setBulkUPIApp(null);
      setSelectedUserIds(new Set());
      setBulkLoading(false);

      let isMounted = true;
      setLoadingBackendIpos(true);
      backendIpoApiService
        .listBackendIpos()
        .then((data) => {
          if (isMounted) {
            setBackendIpos(data);
            setLoadingBackendIpos(false);
          }
        })
        .catch(() => {
          if (isMounted) setLoadingBackendIpos(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [visible]);

  const [showIPOPicker, setShowIPOPicker] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showUPIPicker, setShowUPIPicker] = useState(false);

  const openBackendOptions = useMemo(() => {
    return backendIpos
      .filter((b) => {
        const st = (b.status || '').toUpperCase();
        const compName = (b.company?.displayName || b.companyName || b.symbol || '').trim();
        if (!compName || compName.toUpperCase() === 'IPO') return false;
        return st === 'OPEN' || st === 'ACTIVE' || st === 'LIVE' || st === 'CLOSING_TODAY';
      })
      .map((b): BulkIPOOption => {
        const price = b.priceBandHigh || b.priceBandLow || 100;
        const lot = b.lotSize || 1;
        const compName = (b.company?.displayName || b.companyName || b.symbol || '').trim();
        return {
          id: b.id,
          ipo_name: compName,
          company_name: compName,
          buy_price: price,
          quantity: lot,
          open_date: b.openDate || '',
          close_date: b.closeDate || '',
          listing_date: b.listingDate || '',
          allotment_date: b.allotmentDate || '',
          registrar: b.registrar || '',
          logo_url: b.logoUrl || b.company?.logoUrl || '',
          issue_type: b.marketSegment === 'SME' ? 'SME' : 'Mainboard',
          symbol: b.symbol || '',
          isBackend: true,
        };
      });
  }, [backendIpos]);

  const openLocalOptions = useMemo(() => {
    return ipos
      .filter((i) => {
        if (i.archived === 1) return false;
        const name = (i.ipo_name || i.company_name || '').trim();
        if (!name || name.toUpperCase() === 'IPO' || name.toLowerCase().includes('test')) return false;
        const st = (i.status || i.lifecycle_status || '').toUpperCase();
        return st === 'OPEN' || st === 'ACTIVE' || st === 'LIVE' || st === 'CLOSING_TODAY';
      })
      .map((i): BulkIPOOption => ({
        id: i.id,
        ipo_name: i.ipo_name || i.company_name || 'IPO',
        company_name: i.company_name || i.ipo_name || 'IPO',
        buy_price: i.buy_price,
        quantity: i.quantity,
        open_date: i.open_date,
        close_date: i.close_date,
        listing_date: i.listing_date,
        allotment_date: i.allotment_date,
        registrar: i.registrar,
        logo_url: i.logo_url,
        issue_type: i.issue_type,
        symbol: i.symbol,
        isBackend: false,
      }));
  }, [ipos]);

  const activeIPOs = useMemo(() => {
    const list: BulkIPOOption[] = [...openBackendOptions];
    for (const loc of openLocalOptions) {
      if (
        !list.some(
          (r) =>
            r.id === loc.id ||
            r.ipo_name.toLowerCase().trim() === loc.ipo_name.toLowerCase().trim()
        )
      ) {
        list.push(loc);
      }
    }
    return list;
  }, [openBackendOptions, openLocalOptions]);

  const activeUsers = useMemo(() => users.filter((u) => u.archived === 0), [users]);
  const selectedIPO = useMemo(() => activeIPOs.find((i) => i.id === bulkIPOId), [activeIPOs, bulkIPOId]);

  const availableBankNames = useMemo(() => {
    const list: string[] = [];
    for (const b of bankAccounts) {
      if (b.bank_name && !list.includes(b.bank_name)) {
        list.push(b.bank_name);
      }
    }
    return list;
  }, [bankAccounts]);

  // Filtered users for selected IPO (excluding users who already have a non-cancelled application)
  const filteredUsers = useMemo(() => {
    if (!bulkIPOId) return activeUsers;
    const existingUserIds = new Set(
      applications
        .filter((a) => a.ipo_id === bulkIPOId && a.status !== 'Cancelled')
        .map((a) => a.user_id)
    );
    return activeUsers.filter((u) => !existingUserIds.has(u.id));
  }, [activeUsers, applications, bulkIPOId]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAllUsers = () => {
    if (selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const handleBulkCreate = async () => {
    if (!bulkIPOId || !selectedIPO) {
      showError('', 'Please select an IPO first.');
      return;
    }
    if (selectedUserIds.size === 0) {
      showError('', 'Please select at least one user.');
      return;
    }

    setBulkLoading(true);
    try {
      // Sync selected IPO details into ipo_listings table to ensure complete metadata.
      // IMPORTANT: Use INSERT OR IGNORE + UPDATE (not INSERT OR REPLACE) to avoid
      // cascade-deleting existing ipo_applications (ipo_id FK ON DELETE CASCADE).
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT OR IGNORE INTO ipo_listings (
          id, ipo_name, company_name, symbol, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
          registrar, exchange, issue_type, archived, is_favorite, logo_url, created_at, updated_at,
          sync_version, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0, 'PENDING')`,
        [
          selectedIPO.id,
          selectedIPO.ipo_name,
          selectedIPO.company_name,
          selectedIPO.symbol || '',
          selectedIPO.buy_price,
          selectedIPO.quantity,
          selectedIPO.open_date || '',
          selectedIPO.close_date || '',
          selectedIPO.listing_date || '',
          selectedIPO.allotment_date || '',
          selectedIPO.registrar || '',
          'NSE, BSE',
          selectedIPO.issue_type || 'Mainboard',
          selectedIPO.logo_url || '',
          now,
          now,
        ]
      );
      // Update only metadata fields — never delete the row (which would cascade-delete applications)
      await db.runAsync(
        `UPDATE ipo_listings SET
          ipo_name = ?, company_name = ?, symbol = ?, buy_price = ?, quantity = ?,
          open_date = ?, close_date = ?, listing_date = ?, allotment_date = ?,
          registrar = ?, exchange = ?, issue_type = ?, logo_url = ?, updated_at = ?
         WHERE id = ?`,
        [
          selectedIPO.ipo_name,
          selectedIPO.company_name,
          selectedIPO.symbol || '',
          selectedIPO.buy_price,
          selectedIPO.quantity,
          selectedIPO.open_date || '',
          selectedIPO.close_date || '',
          selectedIPO.listing_date || '',
          selectedIPO.allotment_date || '',
          selectedIPO.registrar || '',
          'NSE, BSE',
          selectedIPO.issue_type || 'Mainboard',
          selectedIPO.logo_url || '',
          now,
          selectedIPO.id,
        ]
      );

      await addBulkApplications(
        selectedIPO.id,
        Array.from(selectedUserIds),
        bulkBankName ?? undefined,
        bulkUPIApp ?? undefined,
        selectedIPO.issue_type === 'SME' ? 2 : 1
      );
      backendSyncEmitter.notifyChange();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to create bulk applications.');
    } finally {
      setBulkLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable
            style={[
              styles.sheetContainer,
              {
                backgroundColor: colors.background,
                borderTopColor: colors.border,
                paddingBottom: Math.max(Math.floor(insets.bottom / 2), 13),
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Bulk Application Creator</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 13, gap: 12 }}>
              {/* 1. SELECT IPO */}
              <View>
                <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>1. SELECT IPO</Text>
                <TouchableOpacity
                  onPress={() => setShowIPOPicker(true)}
                  style={[styles.pickerTrigger, { borderColor: selectedIPO ? colors.foreground : colors.border, backgroundColor: colors.surface }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pickerTriggerText, { color: selectedIPO ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                    {selectedIPO ? `${selectedIPO.ipo_name} — ${formatCurrency(selectedIPO.buy_price * selectedIPO.quantity * (selectedIPO.issue_type === 'SME' ? 2 : 1))}` : 'Choose Active IPO…'}
                  </Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* 2. BANK & PAYMENT METHOD */}
              <View>
                <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>2. BANK & PAYMENT METHOD</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setShowBankPicker(true)}
                    style={[styles.pickerTrigger, { flex: 1, borderColor: bulkBankName ? colors.foreground : colors.border, backgroundColor: colors.surface }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pickerTriggerText, { color: bulkBankName ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {bulkBankName || 'Bank Account'}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowUPIPicker(true)}
                    style={[styles.pickerTrigger, { flex: 1, borderColor: bulkUPIApp ? colors.foreground : colors.border, backgroundColor: colors.surface }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pickerTriggerText, { color: bulkUPIApp ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {bulkUPIApp || 'UPI App'}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 3. SELECT APPLICANTS */}
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={[styles.stepLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
                    3. SELECT APPLICANTS ({selectedUserIds.size} Selected)
                  </Text>
                  <TouchableOpacity onPress={toggleSelectAllUsers} activeOpacity={0.7} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground }}>
                      {selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0 ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ paddingVertical: 4 }}>
                  {filteredUsers.length === 0 ? (
                    <Text style={[styles.chipEmptyText, { color: colors.mutedForeground }]}>
                      No eligible users. Manage profiles in Users.
                    </Text>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {filteredUsers.map((u) => {
                        const isChecked = selectedUserIds.has(u.id);
                        return (
                          <TouchableOpacity
                            key={u.id}
                            onPress={() => toggleUser(u.id)}
                            style={[
                              styles.chipItem,
                              {
                                borderColor: isChecked ? '#10B981' : colors.border,
                                backgroundColor: isChecked ? (isDark ? colors.card : '#FFFFFF') : colors.card,
                              },
                            ]}
                            activeOpacity={0.75}
                          >
                            <View
                              style={[
                                styles.checkbox,
                                {
                                  borderColor: isChecked ? '#10B981' : colors.mutedForeground,
                                  backgroundColor: isChecked ? '#10B981' : 'transparent',
                                },
                              ]}
                            >
                              {isChecked && <Feather name="check" size={10} color="#FFFFFF" />}
                            </View>
                            <Text style={[styles.chipText, { color: colors.foreground }]}>{u.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>

              {/* CTA Button */}
              <TouchableOpacity
                onPress={handleBulkCreate}
                disabled={bulkLoading || !bulkIPOId || selectedUserIds.size === 0}
                style={
                  bulkLoading || !bulkIPOId || selectedUserIds.size === 0
                    ? [styles.goldBtnDisabled, isDark && { backgroundColor: colors.surface }]
                    : [styles.goldBtn, { backgroundColor: colors.primary }]
                }
                activeOpacity={0.85}
              >
                <Text
                  style={
                    bulkLoading || !bulkIPOId || selectedUserIds.size === 0
                      ? [styles.goldBtnTextDisabled, isDark && { color: colors.mutedForeground }]
                      : [styles.goldBtnText, { color: colors.primaryForeground }]
                  }
                >
                  {bulkLoading ? 'Creating…' : `Create ${selectedUserIds.size} Application${selectedUserIds.size !== 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pickers for Bulk Sheet (Centered Modals matching bids page) */}
      {/* IPO Picker */}
      <Modal visible={showIPOPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowIPOPicker(false)}>
        <Pressable style={styles.centerModalOverlay} onPress={() => setShowIPOPicker(false)}>
          <Pressable style={[styles.pickerModalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.pickerModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Active IPO</Text>
              <TouchableOpacity onPress={() => setShowIPOPicker(false)} style={styles.closeBtn} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {loadingBackendIpos && activeIPOs.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ marginTop: 8, fontSize: 13, color: colors.mutedForeground }}>
                    Loading Open IPOs from IPO Hub…
                  </Text>
                </View>
              ) : activeIPOs.length === 0 ? (
                <Text style={{ padding: 20, fontStyle: 'italic', color: colors.mutedForeground, textAlign: 'center' }}>
                  No open IPOs available currently.
                </Text>
              ) : (
                activeIPOs.map((ipo) => (
                  <TouchableOpacity
                    key={ipo.id}
                    onPress={() => {
                      setBulkIPOId(ipo.id);
                      setShowIPOPicker(false);
                    }}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: bulkIPOId === ipo.id ? (isDark ? '#27272A' : '#F1F5F9') : 'transparent' }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{ipo.ipo_name}</Text>
                        {ipo.isBackend && (
                          <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'GoogleSansFlex_700Bold', color: colors.primary }}>
                              IPO Hub
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                        {formatCurrency(ipo.buy_price)} × {ipo.quantity * (ipo.issue_type === 'SME' ? 2 : 1)} {ipo.issue_type === 'SME' ? '(2 Lots)' : '(1 Lot)'} = {formatCurrency(ipo.buy_price * ipo.quantity * (ipo.issue_type === 'SME' ? 2 : 1))}
                      </Text>
                    </View>
                    {bulkIPOId === ipo.id && <Feather name="check" size={16} color={colors.foreground} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bank Picker */}
      <Modal visible={showBankPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowBankPicker(false)}>
        <Pressable style={styles.centerModalOverlay} onPress={() => setShowBankPicker(false)}>
          <Pressable style={[styles.pickerModalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.pickerModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Bank Account</Text>
              <TouchableOpacity onPress={() => setShowBankPicker(false)} style={styles.closeBtn} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {availableBankNames.length === 0 ? (
                <Text style={{ padding: 20, fontStyle: 'italic', color: colors.mutedForeground, textAlign: 'center' }}>No bank accounts added yet.</Text>
              ) : (
                availableBankNames.map((bName) => (
                  <TouchableOpacity
                    key={bName}
                    onPress={() => {
                      setBulkBankName(bName);
                      setShowBankPicker(false);
                    }}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: bulkBankName === bName ? (isDark ? '#27272A' : '#F1F5F9') : 'transparent' }]}
                  >
                    <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{bName}</Text>
                    {bulkBankName === bName && <Feather name="check" size={16} color={colors.foreground} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* UPI App Picker */}
      <Modal visible={showUPIPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowUPIPicker(false)}>
        <Pressable style={styles.centerModalOverlay} onPress={() => setShowUPIPicker(false)}>
          <Pressable style={[styles.pickerModalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.pickerModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select UPI App / ASBA</Text>
              <TouchableOpacity onPress={() => setShowUPIPicker(false)} style={styles.closeBtn} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {UPI_APPS.map((app) => (
                <TouchableOpacity
                  key={app}
                  onPress={() => {
                    setBulkUPIApp(app);
                    setShowUPIPicker(false);
                  }}
                  style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: bulkUPIApp === app ? (isDark ? '#27272A' : '#F1F5F9') : 'transparent' }]}
                >
                  <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{app}</Text>
                  {bulkUPIApp === app && <Feather name="check" size={16} color={colors.foreground} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  centerModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerModalCard: { width: '92%', maxWidth: 400, borderRadius: 22, borderWidth: 1, maxHeight: '85%', overflow: 'hidden', elevation: 6 },
  pickerModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: '92%',
    borderTopWidth: 1,
    borderBottomWidth: 0,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  closeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 },
  pickerTrigger: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  pickerTriggerText: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', flex: 1, marginRight: 8 },
  chipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  chipText: { fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium' },
  chipEmptyText: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', fontStyle: 'italic', paddingVertical: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  goldBtn: { backgroundColor: '#0F172A', borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  goldBtnDisabled: { backgroundColor: '#E2E8F0', borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  goldBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.1 },
  goldBtnTextDisabled: { color: '#A0AEC0', fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1 },
  pickerRowName: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
});
