import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDB } from '@/context/DBContext';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { useDialog } from '@/context/DialogContext';
import { formatCurrency } from '@/utils/formatters';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { ScoopedBottomSheet } from '@/components/ui/ScoopedBottomSheet';
import { BackendIpo } from '@/types/backend-ipo';
import { safeRunAsync } from '@/utils/sqliteDebug';
import { startPerfTimer } from '@/utils/performanceMetrics';

import { calculateNormalizedIPOStatus } from '@/services/ipo/statusNormalizer';

function parseDateOnly(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{4}-\d{2}-\d{2}T/.test(clean)) return clean.substring(0, 10);
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function isIpoCurrentlyOpen(record: {
  status?: string | null;
  lifecycle_status?: string | null;
  open_date?: string | null;
  close_date?: string | null;
  allotment_date?: string | null;
  listing_date?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  allotmentDate?: string | null;
  listingDate?: string | null;
}): boolean {
  const openDateRaw = record.open_date || record.openDate || null;
  const closeDateRaw = record.close_date || record.closeDate || null;
  const allotmentDateRaw = record.allotment_date || record.allotmentDate || null;
  const listingDateRaw = record.listing_date || record.listingDate || null;
  const statusRaw = record.status || record.lifecycle_status || null;

  const openDate = parseDateOnly(openDateRaw);
  const closeDate = parseDateOnly(closeDateRaw);
  const allotmentDate = parseDateOnly(allotmentDateRaw);
  const listingDate = parseDateOnly(listingDateRaw);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 1. If close date has passed, it is closed
  if (closeDate && todayStr > closeDate) {
    return false;
  }

  // 2. If open date is in the future, bidding is not open yet
  if (openDate && todayStr < openDate) {
    return false;
  }

  // 3. Evaluate lifecycle status
  const normalizedStatus = calculateNormalizedIPOStatus({
    status: statusRaw,
    open_date: openDate || openDateRaw,
    close_date: closeDate || closeDateRaw,
    allotment_date: allotmentDate || allotmentDateRaw,
    listing_date: listingDate || listingDateRaw,
  }, todayStr);

  const rawUpper = (statusRaw || '').trim().toUpperCase();
  if (
    rawUpper.includes('CLOSED') ||
    rawUpper.includes('ALLOT') ||
    rawUpper.includes('LISTED') ||
    rawUpper.includes('UPCOMING')
  ) {
    if (normalizedStatus !== 'OPEN' && normalizedStatus !== 'CLOSING_TODAY') {
      return false;
    }
  }

  return normalizedStatus === 'OPEN' || normalizedStatus === 'CLOSING_TODAY';
}

import {
  UPI_APPS,
  resolveBankLinkedUpiApp,
} from '@/utils/bulkApplyUtils';
export { UPI_APPS, resolveBankLinkedUpiApp };

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

  const [backendIpos, setBackendIpos] = useState<BackendIpo[]>(() => {
    return backendIpoApiService.getCachedIpos() || [];
  });
  const [loadingBackendIpos, setLoadingBackendIpos] = useState(false);
  const isSubmittingRef = React.useRef(false);

  // Correlation IDs and timers for selector interactions
  const ipoPickerTimerRef = React.useRef<{ opId: string; start: number } | null>(null);
  const bankPickerTimerRef = React.useRef<{ opId: string; start: number } | null>(null);
  const upiPickerTimerRef = React.useRef<{ opId: string; start: number } | null>(null);

  // Reset selections & revalidate live open IPOs from IPO Hub whenever sheet is opened
  useEffect(() => {
    if (visible) {
      setBulkIPOId(null);
      setBulkBankName(null);
      setBulkUPIApp(null);
      setSelectedUserIds(new Set());
      setBulkLoading(false);

      const cached = backendIpoApiService.getCachedIpos();
      if (cached && cached.length > 0) {
        setBackendIpos(cached);
      }

      let isMounted = true;
      const needsFetch = !cached || cached.length === 0;
      if (needsFetch) {
        setLoadingBackendIpos(true);
      }
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

  const handleOpenIPOPicker = () => {
    const opId = `picker_ipo_${Date.now()}`;
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    ipoPickerTimerRef.current = { opId, start: t0 };
    console.log(`[Picker Trace:${opId}] 1. IPO selector tap registered`);
    setShowIPOPicker(true);
    const elapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
    console.log(`[Picker Trace:${opId}] 2. IPO selector state update dispatched in ${elapsed.toFixed(2)}ms`);
  };

  const handleOpenBankPicker = () => {
    const opId = `picker_bank_${Date.now()}`;
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    bankPickerTimerRef.current = { opId, start: t0 };
    console.log(`[Picker Trace:${opId}] 1. Bank selector tap registered`);
    setShowBankPicker(true);
    const elapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
    console.log(`[Picker Trace:${opId}] 2. Bank selector state update dispatched in ${elapsed.toFixed(2)}ms`);
  };

  const handleOpenUPIPicker = () => {
    const opId = `picker_upi_${Date.now()}`;
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    upiPickerTimerRef.current = { opId, start: t0 };
    console.log(`[Picker Trace:${opId}] 1. UPI selector tap registered`);
    setShowUPIPicker(true);
    const elapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
    console.log(`[Picker Trace:${opId}] 2. UPI selector state update dispatched in ${elapsed.toFixed(2)}ms`);
  };

  const openBackendOptions = useMemo(() => {
    return backendIpos
      .filter((b) => {
        const compName = (b.company?.displayName || b.companyName || b.symbol || '').trim();
        if (!compName || compName.toUpperCase() === 'IPO') return false;
        return isIpoCurrentlyOpen(b);
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
    // Build lookup of all non-open backend IPO identifiers to prevent showing closed IPOs stored in local SQLite
    const closedBackendIdentifiers = new Set<string>();
    for (const b of backendIpos) {
      if (!isIpoCurrentlyOpen(b)) {
        if (b.id) closedBackendIdentifiers.add(b.id.toLowerCase());
        if (b.symbol) closedBackendIdentifiers.add(b.symbol.toLowerCase().trim());
        const compName = (b.company?.displayName || b.companyName || '').toLowerCase().trim();
        if (compName) closedBackendIdentifiers.add(compName);
      }
    }

    return ipos
      .filter((i) => {
        if (i.archived === 1) return false;
        const name = (i.ipo_name || i.company_name || '').trim();
        if (!name || name.toUpperCase() === 'IPO' || name.toLowerCase().includes('test')) return false;

        const cleanName = name.toLowerCase();
        const cleanSymbol = (i.symbol || '').toLowerCase().trim();
        if (
          closedBackendIdentifiers.has(i.id.toLowerCase()) ||
          (i.backend_ipo_id && closedBackendIdentifiers.has(i.backend_ipo_id.toLowerCase())) ||
          (cleanSymbol && closedBackendIdentifiers.has(cleanSymbol)) ||
          closedBackendIdentifiers.has(cleanName)
        ) {
          return false;
        }

        return isIpoCurrentlyOpen(i);
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
  }, [ipos, backendIpos]);

  const activeIPOs = useMemo(() => {
    if (openBackendOptions.length === 0) return openLocalOptions;
    if (openLocalOptions.length === 0) return openBackendOptions;
    const list: BulkIPOOption[] = [...openBackendOptions];
    const seenNames = new Set(openBackendOptions.map((b) => b.ipo_name.toLowerCase().trim()));
    const seenIds = new Set(openBackendOptions.map((b) => b.id));
    for (const loc of openLocalOptions) {
      const locName = loc.ipo_name.toLowerCase().trim();
      if (!seenIds.has(loc.id) && !seenNames.has(locName)) {
        list.push(loc);
        seenNames.add(locName);
        seenIds.add(loc.id);
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

  // Trace when picker modal overlay becomes visible
  useEffect(() => {
    if (showIPOPicker && ipoPickerTimerRef.current) {
      const { opId, start } = ipoPickerTimerRef.current;
      const duration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - start;
      console.log(`[Picker Trace:${opId}] 3. IPO modal visible & ${activeIPOs.length} option(s) available in ${duration.toFixed(2)}ms`);
      ipoPickerTimerRef.current = null;
    }
  }, [showIPOPicker, activeIPOs.length]);

  useEffect(() => {
    if (showBankPicker && bankPickerTimerRef.current) {
      const { opId, start } = bankPickerTimerRef.current;
      const duration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - start;
      console.log(`[Picker Trace:${opId}] 3. Bank modal visible & ${availableBankNames.length} bank(s) available in ${duration.toFixed(2)}ms`);
      bankPickerTimerRef.current = null;
    }
  }, [showBankPicker, availableBankNames.length]);

  useEffect(() => {
    if (showUPIPicker && upiPickerTimerRef.current) {
      const { opId, start } = upiPickerTimerRef.current;
      const duration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - start;
      console.log(`[Picker Trace:${opId}] 3. UPI modal visible & ${UPI_APPS.length} option(s) available in ${duration.toFixed(2)}ms`);
      upiPickerTimerRef.current = null;
    }
  }, [showUPIPicker]);

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
    if (bulkLoading || isSubmittingRef.current) return;
    if (!bulkIPOId || !selectedIPO) {
      showError('', 'Please select an IPO first.');
      return;
    }
    if (selectedUserIds.size === 0) {
      showError('', 'Please select at least one user.');
      return;
    }

    const opId = `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    console.log(`[BulkApply Trace:${opId}] 1. Submit button registered (${selectedUserIds.size} applicant(s), IPO: ${selectedIPO.ipo_name || selectedIPO.id})`);

    isSubmittingRef.current = true;
    setBulkLoading(true);
    const totalSubmitTimer = startPerfTimer('BulkApplySheet.handleBulkCreate', {
      applicantCount: selectedUserIds.size,
      ipoId: selectedIPO.id,
      opId,
    });

    try {
      // 1. Add bulk applications with complete IPO metadata directly in one unified persistence call
      const tAddStart = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      try {
        await addBulkApplications(
          selectedIPO.id,
          Array.from(selectedUserIds),
          bulkBankName ?? undefined,
          bulkUPIApp ?? undefined,
          selectedIPO.issue_type === 'SME' ? 2 : 1,
          selectedIPO
        );
      } finally {
        const addDuration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - tAddStart;
        console.log(`[BulkApply Trace:${opId}] 2. Local SQLite database save completed in ${addDuration.toFixed(1)}ms`);
      }

      // 2. Dispatch event to subscribers
      const tEvtStart = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      try {
        backendSyncEmitter.notifyChange('applications');
      } finally {
        const evtDuration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - tEvtStart;
        console.log(`[BulkApply Trace:${opId}] 3. Scoped event dispatch completed in ${evtDuration.toFixed(1)}ms`);
      }

      // 3. Trigger Haptics and close the sheet immediately
      const tCloseStart = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        totalSubmitTimer({ status: 'success' });
        onClose();
      } finally {
        const closeDuration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - tCloseStart;
        const totalDuration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
        console.log(`[BulkApply Trace:${opId}] 4. Sheet-close triggered in ${closeDuration.toFixed(1)}ms`);
        console.log(`[BulkApply Trace:${opId}] 5. Total submit-to-close elapsed time: ${totalDuration.toFixed(1)}ms`);
      }
    } catch (e: any) {
      const errDuration = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
      totalSubmitTimer({ status: 'error', error: e?.message, durationMs: errDuration });
      console.error(`[BulkApply Trace:${opId}] Submit failed after ${errDuration.toFixed(1)}ms:`, e?.message || e);
      showError('Error', e?.message || 'Failed to create bulk applications.');
    } finally {
      isSubmittingRef.current = false;
      setBulkLoading(false);
    }
  };

  const renderPickerOverlay = () => {
    if (showIPOPicker) {
      return (
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
      );
    }

    if (showBankPicker) {
      return (
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
                      const mappedUpi = resolveBankLinkedUpiApp(bName, bankAccounts, UPI_APPS);
                      if (mappedUpi) {
                        setBulkUPIApp(mappedUpi);
                      }
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
      );
    }

    if (showUPIPicker) {
      return (
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
      );
    }

    return null;
  };

  if (!visible) return null;

  return (
    <ScoopedBottomSheet
      visible={visible}
      onClose={onClose}
      maxHeight="92%"
      overlay={renderPickerOverlay()}
    >
        {/* Sheet Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleGroup}>
            <View
              style={[
                styles.headerIconWrap,
                { backgroundColor: colors.primary + '18' },
              ]}
            >
              <Feather name="layers" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Bulk Apply</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                Apply across multiple investor profiles
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flex: 1, minHeight: 0 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. SELECT IPO */}
            <View>
              <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>1. SELECT IPO</Text>
              <TouchableOpacity
                onPress={handleOpenIPOPicker}
                style={[
                  styles.pickerTrigger,
                  {
                    borderColor: selectedIPO ? colors.foreground : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.pickerTriggerText,
                    { color: selectedIPO ? colors.foreground : colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {selectedIPO
                    ? `${selectedIPO.ipo_name} — ${formatCurrency(
                        selectedIPO.buy_price *
                          selectedIPO.quantity *
                          (selectedIPO.issue_type === 'SME' ? 2 : 1)
                      )}`
                    : 'Choose Active IPO…'}
                </Text>
                <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* 2. BANK & PAYMENT METHOD */}
            <View>
              <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>2. BANK & PAYMENT METHOD</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={handleOpenBankPicker}
                  style={[
                    styles.pickerTrigger,
                    {
                      flex: 1,
                      borderColor: bulkBankName ? colors.foreground : colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.pickerTriggerText,
                      { color: bulkBankName ? colors.foreground : colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
                    {bulkBankName || 'Bank Account'}
                  </Text>
                  <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleOpenUPIPicker}
                  style={[
                    styles.pickerTrigger,
                    {
                      flex: 1,
                      borderColor: bulkUPIApp ? colors.foreground : colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.pickerTriggerText,
                      { color: bulkUPIApp ? colors.foreground : colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
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
          </ScrollView>
        </View>

        {/* Sticky Bottom Footer CTA (Always visible above device navigation) */}
        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              paddingBottom: 10,
            },
          ]}
        >
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
        </View>
      </ScoopedBottomSheet>
  );
}

const styles = StyleSheet.create({
  centerModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999,
    elevation: 20,
  },
  pickerModalCard: { width: '92%', maxWidth: 400, borderRadius: 22, borderWidth: 1, maxHeight: '85%', overflow: 'hidden', elevation: 6 },
  pickerModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3, textAlign: 'left' },
  sheetSubtitle: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2, lineHeight: 16 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 16,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    backgroundColor: 'transparent',
  },
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
  goldBtn: { backgroundColor: '#0F172A', borderRadius: 9999, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  goldBtnDisabled: { backgroundColor: '#E2E8F0', borderRadius: 9999, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  goldBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.1 },
  goldBtnTextDisabled: { color: '#A0AEC0', fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1 },
  pickerRowName: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
});
