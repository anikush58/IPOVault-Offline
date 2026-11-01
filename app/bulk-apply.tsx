import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
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
import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '@/components/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';
import { useDB, type User, type IPOListing } from '@/context/DBContext';
import { useAppExperience } from '@/context/AppExperienceContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { AnimatedEntrance } from '@/components/ui/AnimatedEntrance';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { formatCurrency, formatDate, maskPAN, getResolvedLogoUrl } from '@/utils/formatters';
import { startPerfTimer } from '@/utils/performanceMetrics';
import {
  UPI_APPS,
  resolveBankLinkedUpiApp,
  isIpoAvailableForBulkApply,
} from '@/utils/bulkApplyUtils';
import { isCustomAvatarUrl } from '@/utils/avatarUtils';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import {
  IpoCategory,
  CATEGORY_OPTIONS,
  validateCategoryBid,
  getIpoOfferCategories,
  getCategoryLotLimits,
  CategoryLotLimits,
  resolveIpoLotSize,
} from '@/utils/ipoCategoryUtils';

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

const BULK_APPLY_PREV_IPO_KEY = 'ipovault_bulk_apply_last_ipo_id';
const BULK_APPLY_PREV_BANK_KEY = 'ipovault_bulk_apply_last_bank_name';
const BULK_APPLY_PREV_UPI_KEY = 'ipovault_bulk_apply_last_upi_app';

const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'], // Purple
  ['#10B981', '#047857'], // Emerald
  ['#3B82F6', '#1D4ED8'], // Blue
  ['#F59E0B', '#B45309'], // Amber
  ['#EC4899', '#BE185D'], // Pink
  ['#6366F1', '#4338CA'], // Indigo
  ['#14B8A6', '#0F766E'], // Teal
  ['#F43F5E', '#BE123C'], // Rose
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

function BulkApplyScreenContent() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ ipoId?: string }>();
  const db = useSQLiteContext();
  const { showError, showSuccess, showDialog } = useDialog();
  const { ipos, users, bankAccounts, applications, addBulkApplications } = useDB();

  const scrollY = useRef(new Animated.Value(0)).current;

  // Form State
  const [bulkIPOId, setBulkIPOId] = useState<string | null>(params.ipoId || null);
  const [bulkBankName, setBulkBankName] = useState<string | null>(null);
  const [bulkUPIApp, setBulkUPIApp] = useState<string | null>(null);
  const [bulkCategory, setBulkCategory] = useState<IpoCategory>('RETAIL');
  const [bulkLots, setBulkLots] = useState<number>(1);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(new Set());
  const [applicantSearch, setApplicantSearch] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const isSubmittingRef = useRef(false);

  // Submission Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [submittedIpoName, setSubmittedIpoName] = useState('');
  const [submittedLots, setSubmittedLots] = useState(0);
  const [submittedAmount, setSubmittedAmount] = useState(0);
  const [alreadyActiveCount, setAlreadyActiveCount] = useState(0);

  const handleSuccessDone = () => {
    setShowSuccessModal(false);
  };

  // Live Backend IPO Catalog state
  const [backendIpos, setBackendIpos] = useState<BackendIpo[]>(() => {
    return backendIpoApiService.getCachedIpos() || [];
  });
  const [loadingBackendIpos, setLoadingBackendIpos] = useState(false);

  // Pickers modal state
  const [showIPOPicker, setShowIPOPicker] = useState(false);
  const [ipoSearch, setIpoSearch] = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [showUPIPicker, setShowUPIPicker] = useState(false);

  // Sync params.ipoId if provided dynamically
  useEffect(() => {
    if (params.ipoId && !bulkIPOId) {
      setBulkIPOId(params.ipoId);
    }
  }, [params.ipoId, bulkIPOId]);

  // Restore previously selected data (IPO, Bank, UPI app)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [savedIpoId, savedBank, savedUpi] = await Promise.all([
          safeAsyncStorage.getItem(BULK_APPLY_PREV_IPO_KEY),
          safeAsyncStorage.getItem(BULK_APPLY_PREV_BANK_KEY),
          safeAsyncStorage.getItem(BULK_APPLY_PREV_UPI_KEY),
        ]);

        if (!isMounted) return;

        if (!params.ipoId && savedIpoId) {
          setBulkIPOId((prev) => (prev ? prev : savedIpoId));
        }
        if (savedBank) {
          setBulkBankName((prev) => (prev ? prev : savedBank));
        }
        if (savedUpi) {
          setBulkUPIApp((prev) => (prev ? prev : savedUpi));
        }
      } catch (err) {
        console.warn('[BulkApply] Error restoring previous selections:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [params.ipoId]);

  // Persist IPO selection changes
  useEffect(() => {
    if (bulkIPOId) {
      safeAsyncStorage.setItem(BULK_APPLY_PREV_IPO_KEY, bulkIPOId);
    }
  }, [bulkIPOId]);

  // Persist Bank selection changes
  useEffect(() => {
    if (bulkBankName) {
      safeAsyncStorage.setItem(BULK_APPLY_PREV_BANK_KEY, bulkBankName);
    }
  }, [bulkBankName]);

  // Persist UPI App selection changes
  useEffect(() => {
    if (bulkUPIApp) {
      safeAsyncStorage.setItem(BULK_APPLY_PREV_UPI_KEY, bulkUPIApp);
    }
  }, [bulkUPIApp]);

  // Load backend IPOs on mount
  useEffect(() => {
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
  }, []);

  // Compute Open Backend IPO options
  const openBackendOptions = useMemo(() => {
    return backendIpos
      .filter((b) => {
        const compName = (b.company?.displayName || b.companyName || b.symbol || '').trim();
        if (!compName || compName.toUpperCase() === 'IPO') return false;
        return isIpoAvailableForBulkApply(b);
      })
      .map((b): BulkIPOOption => {
        const price = b.priceBandHigh || b.priceBandLow || 100;
        const lot = resolveIpoLotSize(b);
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

  // Compute Open Local SQLite options
  const openLocalOptions = useMemo(() => {
    const closedBackendIdentifiers = new Set<string>();
    for (const b of backendIpos) {
      if (!isIpoAvailableForBulkApply(b)) {
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

        return isIpoAvailableForBulkApply(i);
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

  // Unified Active IPO List
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

  const activeUsers = useMemo(() => users.filter((u: User) => u.archived === 0), [users]);
  const selectedIPO = useMemo(() => activeIPOs.find((i) => i.id === bulkIPOId), [activeIPOs, bulkIPOId]);

  // Available Bank Accounts
  const availableBankNames = useMemo(() => {
    const list: string[] = [];
    for (const b of bankAccounts) {
      if (b.bank_name && !list.includes(b.bank_name)) {
        list.push(b.bank_name);
      }
    }
    return list;
  }, [bankAccounts]);

  // Auto-set default bank and UPI if only 1 bank exists
  useEffect(() => {
    if (!bulkBankName && availableBankNames.length === 1) {
      const singleBank = availableBankNames[0];
      setBulkBankName(singleBank);
      const mapped = resolveBankLinkedUpiApp(singleBank, bankAccounts, UPI_APPS);
      if (mapped) setBulkUPIApp(mapped);
    }
  }, [availableBankNames, bulkBankName, bankAccounts]);

  // Filtered applicants: Excludes users who already applied for this IPO in the selected category
  const filteredUsers = useMemo(() => {
    if (!bulkIPOId) return activeUsers;
    const matchingIpoIds = new Set<string>([bulkIPOId]);
    if (selectedIPO) {
      if (selectedIPO.id) matchingIpoIds.add(selectedIPO.id);
      if ((selectedIPO as any).backend_ipo_id) matchingIpoIds.add((selectedIPO as any).backend_ipo_id);
    }
    for (const loc of ipos) {
      if (loc.id === bulkIPOId || (loc.backend_ipo_id && loc.backend_ipo_id === bulkIPOId)) {
        matchingIpoIds.add(loc.id);
        if (loc.backend_ipo_id) matchingIpoIds.add(loc.backend_ipo_id);
      }
    }

    const existingUserIds = new Set(
      applications
        .filter(
          (a) =>
            matchingIpoIds.has(a.ipo_id) &&
            a.status !== 'Cancelled' &&
            (a.category || 'RETAIL') === bulkCategory
        )
        .map((a) => a.user_id)
    );
    return activeUsers.filter((u: User) => !existingUserIds.has(u.id));
  }, [activeUsers, applications, bulkIPOId, bulkCategory, selectedIPO, ipos]);

  // Filtered users by search text
  const displayedUsers = useMemo(() => {
    if (!applicantSearch.trim()) return filteredUsers;
    const q = applicantSearch.toLowerCase().trim();
    return filteredUsers.filter((u: User) => {
      return (
        u.name.toLowerCase().includes(q) ||
        (u.pan_number && u.pan_number.toLowerCase().includes(q)) ||
        (u.broker && u.broker.toLowerCase().includes(q))
      );
    });
  }, [filteredUsers, applicantSearch]);

  const toggleUser = useCallback((userId: string) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const handleAvatarError = useCallback((id: string) => {
    setFailedAvatarIds((prev) => new Set(prev).add(id));
  }, []);

  const toggleSelectAllUsers = () => {
    try {
      Haptics.selectionAsync();
    } catch {}
    if (selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u: User) => u.id)));
    }
  };

  // Offer categories & dynamic lot limits for selected IPO
  const offerCategories = useMemo(() => {
    if (!selectedIPO) return [];
    return getIpoOfferCategories((selectedIPO as any).backendData || selectedIPO);
  }, [selectedIPO]);

  const currentCategoryConfig = useMemo(() => {
    return offerCategories.find(
      (c) => (c.category || '').toUpperCase().trim() === bulkCategory
    );
  }, [offerCategories, bulkCategory]);

  const lotLimits: CategoryLotLimits = useMemo(() => {
    if (!selectedIPO) {
      return getCategoryLotLimits({
        category: bulkCategory,
        unitPrice: 0,
        lotSize: 0,
        isSme: false,
      });
    }
    return getCategoryLotLimits({
      category: bulkCategory,
      unitPrice: selectedIPO.buy_price,
      lotSize: resolveIpoLotSize(selectedIPO, bulkCategory),
      isSme: selectedIPO.issue_type === 'SME',
      categoryConfig: currentCategoryConfig,
    });
  }, [selectedIPO, bulkCategory, currentCategoryConfig]);

  // Whenever selected IPO or category changes, pre-select default lots
  useEffect(() => {
    if (lotLimits.defaultLots) {
      setBulkLots(lotLimits.defaultLots);
    }
  }, [bulkIPOId, bulkCategory, lotLimits.defaultLots]);

  // Financial calculations
  const singleAppLots = bulkLots;
  const singleAppShares = selectedIPO ? resolveIpoLotSize(selectedIPO, bulkCategory) * singleAppLots : 0;
  const singleAppAmount = selectedIPO ? selectedIPO.buy_price * singleAppShares : 0;
  const totalLots = singleAppLots * selectedUserIds.size;
  const totalShares = singleAppShares * selectedUserIds.size;
  const totalBlockedAmount = singleAppAmount * selectedUserIds.size;

  // Handle Bulk Create Submission
  const handleBulkCreate = async () => {
    if (bulkLoading || isSubmittingRef.current) return;
    if (!bulkIPOId || !selectedIPO) {
      showError('IPO Required', 'Please select an open IPO to proceed.');
      return;
    }
    if (selectedUserIds.size === 0) {
      showError('Applicants Required', 'Please select at least one investor profile.');
      return;
    }

    if (!lotLimits.hasValidLotData) {
      showError('Invalid IPO Data', lotLimits.errorMessage || 'Lot size or price band is missing for this IPO.');
      return;
    }

    // Category-specific bid validation
    const unitPrice = selectedIPO.buy_price;
    const lotQty = resolveIpoLotSize(selectedIPO, bulkCategory);
    const isSme = selectedIPO.issue_type === 'SME';
    const val = validateCategoryBid({
      category: bulkCategory,
      lots: bulkLots,
      unitPrice,
      lotSize: lotQty,
      isSme,
      categoryConfig: currentCategoryConfig,
    });
    if (!val.valid) {
      showError('Invalid Application', val.error || `Invalid bid for ${CATEGORY_OPTIONS[bulkCategory].shortLabel} category.`);
      return;
    }

    const opId = `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    console.log(`[BulkApply Trace:${opId}] 1. Submit button registered (${selectedUserIds.size} applicant(s), IPO: ${selectedIPO.ipo_name || selectedIPO.id}, Category: ${bulkCategory}, Lots: ${bulkLots})`);

    isSubmittingRef.current = true;
    setBulkLoading(true);
    const totalSubmitTimer = startPerfTimer('BulkApplyScreen.handleBulkCreate', {
      applicantCount: selectedUserIds.size,
      ipoId: selectedIPO.id,
      category: bulkCategory,
      lots: bulkLots,
      opId,
    });

    try {
      const result = await addBulkApplications(
        selectedIPO.id,
        Array.from(selectedUserIds),
        bulkBankName ?? undefined,
        bulkUPIApp ?? undefined,
        bulkLots,
        selectedIPO,
        bulkCategory
      );

      backendSyncEmitter.notifyChange('applications');
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      totalSubmitTimer({ status: 'success' });
      const elapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
      console.log(`[BulkApply Trace:${opId}] 2. Bulk apply completed in ${elapsed.toFixed(1)}ms. Created: ${result.createdCount}, Existing: ${result.alreadyExistingCount}, Failed: ${result.failedCount}`);

      if (result.alreadyExistingCount > 0 && result.createdCount === 0) {
        showDialog({
          title: 'Applications Already Active',
          message: `All ${result.alreadyExistingCount} selected applicant(s) already have an active ${CATEGORY_OPTIONS[bulkCategory].shortLabel} application for ${selectedIPO.ipo_name}. Existing applications were preserved.\n\nNote: This is only a local application tracker and does not place an official bid on the stock exchange.`,
          type: 'info',
          confirmText: 'Done',
        });
      } else {
        const createdCount = result.createdCount;
        const totalLotsCount = createdCount * bulkLots;
        const lotSize = resolveIpoLotSize(selectedIPO, bulkCategory);
        const unitPrice = selectedIPO.buy_price || 0;
        const totalValue = totalLotsCount * lotSize * unitPrice;

        setSubmittedCount(createdCount);
        setSubmittedIpoName(selectedIPO.ipo_name || selectedIPO.company_name);
        setSubmittedLots(totalLotsCount);
        setSubmittedAmount(totalValue);
        setAlreadyActiveCount(result.alreadyExistingCount);
        setShowSuccessModal(true);
      }

      // Keep bulk apply screen opened and clear only the submitted applicants
      setSelectedUserIds(new Set());
    } catch (e: any) {
      const errElapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
      totalSubmitTimer({ status: 'error', error: e?.message, durationMs: errElapsed });
      console.error(`[BulkApply Trace:${opId}] Submit failed:`, e?.message || e);
      showError('Creation Failed', e?.message || 'Failed to submit bulk applications.');
    } finally {
      isSubmittingRef.current = false;
      setBulkLoading(false);
    }
  };

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Screen Header adhering to rule: No Redundant Navigation Titles */}
      <ScreenHeader
        title="Bulk Apply"
        eyebrow="MULTI-INVESTOR BID ENGINE"
        showBack
        centerTitle
        scrollY={scrollY}
      />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topPad + 68,
            paddingBottom: insets.bottom + 110,
          },
        ]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step Progress Visual Tracker */}
        <AnimatedEntrance delay={0} distance={10}>
          <View style={[styles.stepBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, { backgroundColor: selectedIPO ? '#10B981' : colors.primary }]}>
                {selectedIPO ? (
                  <Feather name="check" size={13} color="#FFFFFF" />
                ) : (
                  <Text style={styles.stepNumText}>1</Text>
                )}
              </View>
              <Text style={[styles.stepText, { color: colors.foreground }]}>Select IPO</Text>
            </View>

            <View style={[styles.stepLine, { backgroundColor: selectedIPO ? colors.primary : colors.border }]} />

            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  {
                    backgroundColor: bulkBankName || bulkUPIApp ? '#10B981' : (selectedIPO ? colors.primary : colors.surface),
                    borderColor: colors.border,
                    borderWidth: bulkBankName || bulkUPIApp || selectedIPO ? 0 : 1,
                  },
                ]}
              >
                {bulkBankName || bulkUPIApp ? (
                  <Feather name="check" size={13} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.stepNumText, { color: selectedIPO ? '#FFFFFF' : colors.mutedForeground }]}>2</Text>
                )}
              </View>
              <Text style={[styles.stepText, { color: selectedIPO ? colors.foreground : colors.mutedForeground }]}>Mandate</Text>
            </View>

            <View style={[styles.stepLine, { backgroundColor: selectedUserIds.size > 0 ? colors.primary : colors.border }]} />

            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  {
                    backgroundColor: selectedUserIds.size > 0 ? '#10B981' : colors.surface,
                    borderColor: colors.border,
                    borderWidth: selectedUserIds.size > 0 ? 0 : 1,
                  },
                ]}
              >
                {selectedUserIds.size > 0 ? (
                  <Feather name="check" size={13} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.stepNumText, { color: colors.mutedForeground }]}>3</Text>
                )}
              </View>
              <Text style={[styles.stepText, { color: selectedUserIds.size > 0 ? colors.foreground : colors.mutedForeground }]}>Applicants</Text>
            </View>
          </View>
        </AnimatedEntrance>

        {/* SECTION 1: TARGET IPO */}
        <AnimatedEntrance delay={40} distance={12}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>STEP 1 · TARGET IPO</Text>
            {selectedIPO && (
              <TouchableOpacity
                onPress={() => setShowIPOPicker(true)}
                activeOpacity={0.7}
                style={styles.changeActionBtn}
              >
                <Text style={[styles.changeActionText, { color: colors.primary }]}>Change IPO</Text>
                <Feather name="chevron-down" size={13} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {!selectedIPO ? (
            <TouchableOpacity
              onPress={() => setShowIPOPicker(true)}
              activeOpacity={0.8}
              style={[styles.emptyPickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.emptyPickerTitle, { color: colors.foreground }]}>Choose an Active IPO</Text>
                <Text style={[styles.emptyPickerSub, { color: colors.mutedForeground }]}>
                  {loadingBackendIpos ? 'Hydrating active IPO listings…' : `${activeIPOs.length} open IPOs ready for bidding`}
                </Text>
              </View>
              <View style={[styles.selectCtaBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.selectCtaText, { color: colors.primaryForeground }]}>Select</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.showcaseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.showcaseTopRow}>
                <View style={styles.showcaseIdentity}>
                  <View style={[styles.showcaseLogoWrap, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: '#FFFFFF' }]}>
                    {selectedIPO.logo_url ? (
                      <Image source={{ uri: getResolvedLogoUrl(selectedIPO.logo_url) || selectedIPO.logo_url }} style={styles.showcaseLogo} resizeMode="contain" />
                    ) : (
                      <View style={[styles.showcaseLogoFallback, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[styles.showcaseLogoText, { color: colors.primary }]}>
                          {selectedIPO.ipo_name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.showcaseTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {selectedIPO.ipo_name}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View style={[styles.tagBadge, { backgroundColor: selectedIPO.issue_type === 'SME' ? '#EC4899' : '#4F46E5' }]}>
                        <Text style={[styles.tagBadgeText, { color: '#FFFFFF' }]}>
                          {selectedIPO.issue_type || 'Mainboard'}
                        </Text>
                      </View>
                      <View style={[styles.tagBadge, { backgroundColor: '#10B981' }]}>
                        <Text style={[styles.tagBadgeText, { color: '#FFFFFF' }]}>Open for Bidding</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* Metrics Grid */}
              <View style={[styles.metricsGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>PRICE / SHARE</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{formatCurrency(selectedIPO.buy_price)}</Text>
                </View>
                <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
                <View style={styles.metricCell}>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>LOT SIZE</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>
                    {resolveIpoLotSize(selectedIPO, bulkCategory)} Shares / Lot
                  </Text>
                </View>
                <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
                <View style={styles.metricCell}>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>CLOSING</Text>
                  <Text style={[styles.metricValue, { color: isDark ? '#F87171' : '#DC2626' }]}>
                    {selectedIPO.close_date ? formatDate(selectedIPO.close_date) : 'Soon'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </AnimatedEntrance>

        {/* SECTION: APPLICATION CATEGORY */}
        <AnimatedEntrance delay={60} distance={12}>
          <View style={[styles.sectionHeaderRow, { marginTop: 16 }]}>
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>APPLICATION CATEGORY</Text>
          </View>
          <View style={styles.categoryPillRow}>
            {(['RETAIL', 'SHAREHOLDER', 'HNI'] as IpoCategory[]).map((catKey) => {
              const isCatActive = bulkCategory === catKey;
              const info = CATEGORY_OPTIONS[catKey];
              return (
                <TouchableOpacity
                  key={catKey}
                  onPress={() => setBulkCategory(catKey)}
                  activeOpacity={0.7}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: isCatActive ? info.badgeBorder : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                      borderColor: isCatActive ? info.badgeBorder : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      {
                        color: isCatActive ? '#FFFFFF' : colors.mutedForeground,
                        fontWeight: isCatActive ? '700' : '500',
                      },
                    ]}
                  >
                    {info.shortLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </AnimatedEntrance>

        {/* SECTION: LOT SIZE SELECTION */}
        <AnimatedEntrance delay={70} distance={12}>
          <View style={[styles.sectionHeaderRow, { marginTop: 16 }]}>
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>LOT SIZE & QUANTITY</Text>
            {selectedIPO && lotLimits.hasValidLotData && (
              <View style={[styles.lotBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: colors.border }]}>
                <Text style={[styles.lotBadgeText, { color: colors.mutedForeground }]}>
                  {singleAppShares} shares @ {formatCurrency(selectedIPO.buy_price)}
                </Text>
              </View>
            )}
          </View>

          {!selectedIPO ? (
            <View style={[styles.lotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.lotPlaceholderText, { color: colors.mutedForeground }]}>
                Select an open IPO above to configure lot size.
              </Text>
            </View>
          ) : !lotLimits.hasValidLotData ? (
            <View style={[styles.lotCard, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2', borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FCA5A5' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="alert-triangle" size={16} color="#EF4444" />
                <Text style={[styles.lotErrorTitle, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
                  Unavailable Lot Size Data
                </Text>
              </View>
              <Text style={[styles.lotErrorSub, { color: isDark ? '#FECACA' : '#7F1D1D' }]}>
                {lotLimits.errorMessage || 'This IPO does not have defined lot size or price data. Applications cannot be submitted.'}
              </Text>
            </View>
          ) : (
            <View style={[styles.lotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Stepper Row */}
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  onPress={() => {
                    if (bulkLots > lotLimits.minLots) {
                      setBulkLots((prev) => Math.max(lotLimits.minLots, prev - 1));
                      try {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch {}
                    }
                  }}
                  disabled={bulkLots <= lotLimits.minLots}
                  activeOpacity={0.7}
                  style={[
                    styles.stepperBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
                      opacity: bulkLots <= lotLimits.minLots ? 0.35 : 1,
                    },
                  ]}
                  hitSlop={8}
                >
                  <Feather name="minus" size={18} color={colors.foreground} />
                </TouchableOpacity>

                <View style={styles.stepperDisplay}>
                  <Text style={[styles.stepperNumber, { color: colors.foreground }]}>
                    {bulkLots} {bulkLots === 1 ? 'Lot' : 'Lots'}
                  </Text>
                  <Text style={[styles.stepperSubtext, { color: colors.mutedForeground }]}>
                    {singleAppShares} Shares · {formatCurrency(singleAppAmount)} / applicant
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    if (bulkLots < lotLimits.maxLots) {
                      setBulkLots((prev) => Math.min(lotLimits.maxLots, prev + 1));
                      try {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch {}
                    }
                  }}
                  disabled={bulkLots >= lotLimits.maxLots}
                  activeOpacity={0.7}
                  style={[
                    styles.stepperBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
                      opacity: bulkLots >= lotLimits.maxLots ? 0.35 : 1,
                    },
                  ]}
                  hitSlop={8}
                >
                  <Feather name="plus" size={18} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              {/* Quick Lots Selector Chips */}
              {lotLimits.options.length > 1 && (
                <View style={styles.quickChipsWrapper}>
                  <Text style={[styles.quickChipsLabel, { color: colors.mutedForeground }]}>
                    QUICK SELECT LOTS:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickChipsRow}
                  >
                    {lotLimits.options.map((optionLots) => {
                      const isActive = bulkLots === optionLots;
                      return (
                        <TouchableOpacity
                          key={optionLots}
                          onPress={() => {
                            setBulkLots(optionLots);
                            try {
                              Haptics.selectionAsync();
                            } catch {}
                          }}
                          activeOpacity={0.7}
                          style={[
                            styles.quickChip,
                            {
                              backgroundColor: isActive
                                ? colors.primary
                                : isDark
                                ? 'rgba(255,255,255,0.05)'
                                : 'rgba(0,0,0,0.04)',
                              borderColor: isActive ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.quickChipText,
                              {
                                color: isActive ? colors.primaryForeground : colors.foreground,
                                fontWeight: isActive ? '700' : '500',
                              },
                            ]}
                          >
                            {optionLots} {optionLots === 1 ? 'Lot' : 'Lots'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Category-specific lot guidance note */}
              <View style={[styles.lotGuidanceRow, { borderTopColor: colors.border }]}>
                <Feather name="shield" size={12} color={colors.mutedForeground} />
                <Text style={[styles.lotGuidanceText, { color: colors.mutedForeground }]}>
                  {bulkCategory === 'HNI'
                    ? `HNI requirement: Min ${lotLimits.minLots} lots (> ₹2,00,000). Max ${lotLimits.maxLots} lots.`
                    : bulkCategory === 'SHAREHOLDER'
                    ? `Shareholder limits: Min ${lotLimits.minLots} lot${lotLimits.minLots > 1 ? 's' : ''}, max ${lotLimits.maxLots} lots (up to ${formatCurrency(lotLimits.maxAmount)}).`
                    : selectedIPO.issue_type === 'SME'
                    ? `SME mandatory minimum: 2 lots (${selectedIPO.quantity * 2} shares min). Max ${lotLimits.maxLots} lots (₹2,00,000 ceiling).`
                    : `Retail limit: Min 1 lot, max ${lotLimits.maxLots} lots (₹2,00,000 ceiling).`}
                </Text>
              </View>
            </View>
          )}
        </AnimatedEntrance>

        {/* SECTION 2: PAYMENT & MANDATE CONFIG */}
        <AnimatedEntrance delay={80} distance={12}>
          <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>STEP 2 · PAYMENT & MANDATE</Text>
          </View>

          <View style={styles.mandateRow}>
            {/* Bank Account Selector Card */}
            <TouchableOpacity
              onPress={() => setShowBankPicker(true)}
              activeOpacity={0.8}
              style={[
                styles.mandateCard,
                {
                  backgroundColor: colors.card,
                  borderColor: bulkBankName ? '#10B981' : colors.border,
                },
              ]}
            >
              <View style={styles.mandateCardTop}>
                <Text style={[styles.mandateCardLabel, { color: bulkBankName ? '#10B981' : colors.mutedForeground }]}>BANK ACCOUNT</Text>
              </View>
              <View style={styles.mandateCardBottom}>
                <Text style={[styles.mandateCardValue, { color: bulkBankName ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                  {bulkBankName || 'Select Bank'}
                </Text>
                <Feather name="chevron-down" size={15} color={bulkBankName ? '#10B981' : colors.mutedForeground} />
              </View>
            </TouchableOpacity>

            {/* UPI Application Selector Card */}
            <TouchableOpacity
              onPress={() => setShowUPIPicker(true)}
              activeOpacity={0.8}
              style={[
                styles.mandateCard,
                {
                  backgroundColor: colors.card,
                  borderColor: bulkUPIApp ? '#10B981' : colors.border,
                },
              ]}
            >
              <View style={styles.mandateCardTop}>
                <Text style={[styles.mandateCardLabel, { color: bulkUPIApp ? '#10B981' : colors.mutedForeground }]}>UPI APP / ASBA</Text>
              </View>
              <View style={styles.mandateCardBottom}>
                <Text style={[styles.mandateCardValue, { color: bulkUPIApp ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                  {bulkUPIApp || 'Select UPI'}
                </Text>
                <Feather name="chevron-down" size={15} color={bulkUPIApp ? '#10B981' : colors.mutedForeground} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Mandate Info Banner */}
          <View style={[styles.infoBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="clock" size={15} color={colors.mutedForeground} />
            <Text style={[styles.infoBannerText, { color: colors.mutedForeground }]}>
              Application Window: Standard IPO application windows typically operate between 10:00 AM - 5:00 PM on market working days.
            </Text>
          </View>
        </AnimatedEntrance>

        {/* SECTION 3: INVESTOR APPLICANTS */}
        <AnimatedEntrance delay={120} distance={12}>
          <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>
              STEP 3 · APPLICANTS ({selectedUserIds.size} / {filteredUsers.length} SELECTED)
            </Text>
            {filteredUsers.length > 0 && (
              <TouchableOpacity
                onPress={toggleSelectAllUsers}
                activeOpacity={0.7}
                style={styles.changeActionBtn}
              >
                <Text style={[styles.changeActionText, { color: colors.primary }]}>
                  {selectedUserIds.size === filteredUsers.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Applicant Filter Search Box (if more than 3 users) */}
          {filteredUsers.length > 3 && (
            <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Icon name="search" size={15} color={colors.mutedForeground} />
              <TextInput
                placeholder="Search investor profiles by name or PAN…"
                placeholderTextColor={colors.mutedForeground}
                value={applicantSearch}
                onChangeText={setApplicantSearch}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {applicantSearch.length > 0 && (
                <TouchableOpacity onPress={() => setApplicantSearch('')}>
                  <Feather name="x" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Investor Cards List */}
          {filteredUsers.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="user-check" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyBoxText, { color: colors.foreground }]}>
                {bulkIPOId ? 'All eligible profiles have already applied!' : 'No investor profiles found.'}
              </Text>
              <Text style={[styles.emptyBoxSub, { color: colors.mutedForeground }]}>
                Manage and add new applicant profiles from the Users tab.
              </Text>
            </View>
          ) : (
            <View style={styles.applicantsGrid}>
              {displayedUsers.map((u: User) => (
                <ApplicantCardItem
                  key={u.id}
                  u={u}
                  isSelected={selectedUserIds.has(u.id)}
                  onToggle={toggleUser}
                  colors={colors}
                  hasSelectedIPO={!!selectedIPO}
                  bulkLots={bulkLots}
                  singleAppShares={singleAppShares}
                  singleAppAmount={singleAppAmount}
                  hasFailedAvatar={failedAvatarIds.has(u.id)}
                  onAvatarError={handleAvatarError}
                />
              ))}
            </View>
          )}
        </AnimatedEntrance>

        {/* SECTION 4: LIVE SUMMARY BREAKDOWN */}
        {selectedIPO && selectedUserIds.size > 0 && (
          <AnimatedEntrance delay={160} distance={12}>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryHeader}>
                <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Bidding Overview</Text>
              </View>

              <View style={styles.summaryRowsContainer}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Target IPO</Text>
                  <Text style={[styles.summaryVal, { color: colors.foreground }]}>{selectedIPO.ipo_name}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total Selected Profiles</Text>
                  <Text style={[styles.summaryVal, { color: colors.foreground }]}>{selectedUserIds.size} Applicants</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Aggregate Lots & Shares</Text>
                  <Text style={[styles.summaryVal, { color: colors.foreground }]}>
                    {totalLots} Lots ({totalShares} Shares)
                  </Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryNetRow}>
                  <View>
                    <Text style={[styles.summaryNetLabel, { color: colors.mutedForeground }]}>TOTAL BLOCKED FUNDS</Text>
                    <Text style={[styles.summaryNetSub, { color: colors.mutedForeground }]}>
                      {selectedUserIds.size} × {formatCurrency(singleAppAmount)}
                    </Text>
                  </View>
                  <Text style={[styles.summaryNetValue, { color: colors.primary }]}>
                    {formatCurrency(totalBlockedAmount)}
                  </Text>
                </View>
              </View>
            </View>
          </AnimatedEntrance>
        )}
      </Animated.ScrollView>

      {/* Sticky Bottom Floating Action Bar */}
      <View
        style={[
          styles.stickyFooter,
          {
            backgroundColor: isDark ? 'rgba(18, 20, 28, 0.95)' : 'rgba(255,255,255,0.95)',
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleBulkCreate}
          disabled={bulkLoading || !bulkIPOId || selectedUserIds.size === 0 || !lotLimits.hasValidLotData}
          activeOpacity={0.85}
          style={[
            styles.submitCtaBtn,
            {
              backgroundColor:
                bulkLoading || !bulkIPOId || selectedUserIds.size === 0 || !lotLimits.hasValidLotData
                  ? (isDark ? colors.surface : '#E2E8F0')
                  : colors.primary,
            },
          ]}
        >
          {bulkLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={[styles.submitCtaText, { color: '#FFFFFF' }]}>Creating Applications…</Text>
            </View>
          ) : (
            <Text
              style={[
                styles.submitCtaText,
                {
                  color:
                    !bulkIPOId || selectedUserIds.size === 0
                      ? colors.mutedForeground
                      : colors.primaryForeground,
                },
              ]}
            >
              {!bulkIPOId
                ? 'Select an IPO to Continue'
                : selectedUserIds.size === 0
                ? 'Select Applicants'
                : `Submit ${selectedUserIds.size} Application${selectedUserIds.size !== 1 ? 's' : ''}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* IPO PICKER MODAL */}
      <Modal
        visible={showIPOPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIPOPicker(false)}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable style={styles.backdropDismiss} onPress={() => setShowIPOPicker(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Active IPO</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  Choose an issue currently accepting retail applications
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowIPOPicker(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                hitSlop={8}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Modal Search */}
            <View style={[styles.modalSearchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="search" size={15} color={colors.mutedForeground} />
              <TextInput
                placeholder="Search open IPOs…"
                placeholderTextColor={colors.mutedForeground}
                value={ipoSearch}
                onChangeText={setIpoSearch}
                style={[styles.modalSearchInput, { color: colors.foreground }]}
              />
              {ipoSearch.length > 0 && (
                <TouchableOpacity onPress={() => setIpoSearch('')}>
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {loadingBackendIpos && activeIPOs.length === 0 ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ marginTop: 10, fontSize: 13, color: colors.mutedForeground }}>
                    Refreshing live catalog from IPO Hub…
                  </Text>
                </View>
              ) : activeIPOs.length === 0 ? (
                <View style={{ padding: 28, alignItems: 'center' }}>
                  <Text style={{ fontStyle: 'italic', color: colors.mutedForeground, textAlign: 'center' }}>
                    No open IPOs available currently.
                  </Text>
                </View>
              ) : (
                activeIPOs
                  .filter((i) => !ipoSearch.trim() || i.ipo_name.toLowerCase().includes(ipoSearch.toLowerCase().trim()))
                  .map((ipo) => {
                    const isSelected = bulkIPOId === ipo.id;
                    const mult = ipo.issue_type === 'SME' ? 2 : 1;
                    const lotAmt = ipo.buy_price * ipo.quantity * mult;

                    return (
                      <TouchableOpacity
                        key={ipo.id}
                        onPress={() => {
                          setBulkIPOId(ipo.id);
                          setShowIPOPicker(false);
                          setIpoSearch('');
                          try {
                            Haptics.selectionAsync();
                          } catch {}
                        }}
                        style={[
                          styles.modalRowItem,
                          {
                            borderBottomColor: colors.border,
                            backgroundColor: isSelected ? (isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF') : 'transparent',
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.modalRowTitle, { color: isSelected ? colors.primary : colors.foreground }]}>
                              {ipo.ipo_name}
                            </Text>
                            <View style={[styles.modalRowTag, { backgroundColor: ipo.issue_type === 'SME' ? '#EC4899' : '#4F46E5' }]}>
                              <Text style={[styles.modalRowTagText, { color: '#FFFFFF' }]}>
                                {ipo.issue_type || 'Mainboard'}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.modalRowSub, { color: colors.mutedForeground }]}>
                            {formatCurrency(ipo.buy_price)} × {ipo.quantity * mult} Shares = {formatCurrency(lotAmt)}
                          </Text>
                        </View>
                        {isSelected && (
                          <View style={[styles.modalRowCheck, { backgroundColor: colors.primary }]}>
                            <Feather name="check" size={13} color="#FFFFFF" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* BANK PICKER MODAL */}
      <Modal
        visible={showBankPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBankPicker(false)}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable style={styles.backdropDismiss} onPress={() => setShowBankPicker(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Bank Account</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  Choose primary ASBA or UPI-linked bank
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowBankPicker(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                hitSlop={8}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {availableBankNames.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: colors.mutedForeground, fontStyle: 'italic', textAlign: 'center' }}>
                    No bank accounts registered yet. Manage banks in Banks tab.
                  </Text>
                </View>
              ) : (
                availableBankNames.map((bName) => {
                  const isSelected = bulkBankName === bName;
                  return (
                    <TouchableOpacity
                      key={bName}
                      onPress={() => {
                        setBulkBankName(bName);
                        const mapped = resolveBankLinkedUpiApp(bName, bankAccounts, UPI_APPS);
                        if (mapped) setBulkUPIApp(mapped);
                        setShowBankPicker(false);
                        try {
                          Haptics.selectionAsync();
                        } catch {}
                      }}
                      style={[
                        styles.modalRowItem,
                        {
                          borderBottomColor: colors.border,
                          backgroundColor: isSelected ? (isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF') : 'transparent',
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalRowTitle, { color: isSelected ? colors.primary : colors.foreground }]}>
                          {bName}
                        </Text>
                      </View>
                      {isSelected && (
                        <View style={[styles.modalRowCheck, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={13} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* UPI PICKER MODAL */}
      <Modal
        visible={showUPIPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUPIPicker(false)}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable style={styles.backdropDismiss} onPress={() => setShowUPIPicker(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select UPI App / ASBA</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  Select mandate verification platform
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowUPIPicker(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                hitSlop={8}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {UPI_APPS.map((app) => {
                const isSelected = bulkUPIApp === app;
                return (
                  <TouchableOpacity
                    key={app}
                    onPress={() => {
                      setBulkUPIApp(app);
                      setShowUPIPicker(false);
                      try {
                        Haptics.selectionAsync();
                      } catch {}
                    }}
                    style={[
                      styles.modalRowItem,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected ? (isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF') : 'transparent',
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalRowTitle, { color: isSelected ? colors.primary : colors.foreground }]}>
                        {app}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={[styles.modalRowCheck, { backgroundColor: colors.primary }]}>
                        <Feather name="check" size={13} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Submission Success Modal ── */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleSuccessDone}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable style={styles.backdropDismiss} onPress={handleSuccessDone} />
          <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Success Icon Halo */}
            <View style={[styles.successIconHalo, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#DCFCE7' }]}>
              <View style={styles.successIconCircle}>
                <Feather name="check" size={28} color="#FFFFFF" />
              </View>
            </View>

            {/* Title & Subtitle */}
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              Applications Recorded
            </Text>
            <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
              Successfully recorded <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_700Bold' }}>{submittedCount}</Text> {submittedCount === 1 ? 'application' : 'applications'} locally for
            </Text>
            <Text style={[styles.successIpoName, { color: colors.primary }]} numberOfLines={2}>
              {submittedIpoName}
            </Text>

            {alreadyActiveCount > 0 && (
              <View style={[styles.alreadyActiveBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF', borderColor: isDark ? 'rgba(59, 130, 246, 0.25)' : '#BFDBFE' }]}>
                <Feather name="info" size={13} color="#3B82F6" />
                <Text style={[styles.alreadyActiveText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                  {alreadyActiveCount} applicant(s) already had active applications and were preserved.
                </Text>
              </View>
            )}

            {/* Quick Stat Summary Badge */}
            <View style={[styles.successStatsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.successStatItem}>
                <Text style={[styles.successStatVal, { color: colors.foreground }]}>{submittedCount}</Text>
                <Text style={[styles.successStatLabel, { color: colors.mutedForeground }]}>Applicants</Text>
              </View>
              <View style={[styles.successStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.successStatItem}>
                <Text style={[styles.successStatVal, { color: colors.foreground }]}>{submittedLots}</Text>
                <Text style={[styles.successStatLabel, { color: colors.mutedForeground }]}>Total Lots</Text>
              </View>
              <View style={[styles.successStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.successStatItem}>
                <Text style={[styles.successStatVal, { color: colors.foreground }]}>{formatCurrency(submittedAmount)}</Text>
                <Text style={[styles.successStatLabel, { color: colors.mutedForeground }]}>Total Value</Text>
              </View>
            </View>

            {/* Prominent Local Application Notice */}
            <View
              style={[
                styles.prominentNoticeBox,
                {
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
                  borderColor: isDark ? 'rgba(245, 158, 11, 0.32)' : '#FDE68A',
                },
              ]}
            >
              <View style={styles.prominentNoticeHeader}>
                <Feather name="alert-circle" size={15} color={isDark ? '#FBBF24' : '#D97706'} />
                <Text
                  style={[
                    styles.prominentNoticeTitle,
                    { color: isDark ? '#FCD34D' : '#B45309' },
                  ]}
                >
                  Local Application Only
                </Text>
              </View>
              <Text
                style={[
                  styles.prominentNoticeBody,
                  { color: isDark ? '#FDE68A' : '#92400E' },
                ]}
              >
                This application is recorded locally on your device for tracking. It does not place an official bid on the stock exchange. Please apply through your broker or bank ASBA and approve the UPI mandate.
              </Text>
            </View>

            {/* Done CTA */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleSuccessDone}
              style={[styles.successDoneBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.successDoneBtnText, { color: colors.primaryForeground }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Step Progress
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  stepText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    borderRadius: 1,
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  changeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  changeActionText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // Empty Target IPO Picker
  emptyPickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 14,
  },
  emptyPickerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPickerTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  emptyPickerSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  selectCtaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  selectCtaText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  // Showcase Target IPO Card
  showcaseCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  showcaseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  showcaseIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  showcaseLogoWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 0,
    margin: 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  showcaseLogo: {
    ...StyleSheet.absoluteFillObject,
    width: 46,
    height: 46,
    resizeMode: 'contain',
  },
  showcaseLogoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showcaseLogoText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  showcaseTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 50,
  },
  tagBadgeText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  metricsGrid: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  metricDivider: {
    width: 1,
    height: '80%',
    alignSelf: 'center',
  },

  // Mandate Row
  mandateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mandateCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  mandateCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mandateIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mandateCardLabel: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
  },
  mandateCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mandateCardValue: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  infoBannerText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
    lineHeight: 16,
  },

  // Applicants
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  applicantsGrid: {
    gap: 8,
  },
  applicantCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  applicantCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  avatarGradient: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  applicantName: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  applicantSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  applicantPan: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  brokerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 50,
    borderWidth: 1,
  },
  brokerBadgeText: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  checkboxCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantCostBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderTopWidth: 1,
  },
  applicantCostLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  applicantCostValue: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptyBox: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyBoxText: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 4,
  },
  emptyBoxSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },

  // Summary Card
  summaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  summaryRowsContainer: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  summaryVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  summaryDivider: {
    height: 1,
    marginVertical: 4,
  },
  summaryNetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  summaryNetLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  summaryNetSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  summaryNetValue: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
  },

  // Sticky Bottom Action Bar
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  submitCtaBtn: {
    height: 52,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitCtaText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.2,
  },

  // Modal Dialogs
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  modalSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  modalRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  modalRowTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  modalRowSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  modalRowTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 50,
  },
  modalRowTagText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalRowCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  categoryPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPillText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  categoryNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  categoryNoticeText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
  },
  lotBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  lotBadgeText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  lotCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  lotPlaceholderText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  lotErrorTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  lotErrorSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 16,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  stepperNumber: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  stepperSubtext: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
  quickChipsWrapper: {
    gap: 6,
    paddingTop: 4,
  },
  quickChipsLabel: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  lotGuidanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  lotGuidanceText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
  },
  // Success Modal
  successCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  successIconHalo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  successIpoName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  alreadyActiveBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    width: '100%',
  },
  alreadyActiveText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    flex: 1,
  },
  successStatsBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  successStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  successStatVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  successStatLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
  successStatDivider: {
    width: 1,
    height: 24,
  },
  prominentNoticeBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  prominentNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  prominentNoticeTitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  prominentNoticeBody: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    lineHeight: 17,
  },
  successDoneBtn: {
    width: '100%',
    height: 48,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  successDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});

interface ApplicantCardItemProps {
  u: User;
  isSelected: boolean;
  onToggle: (id: string) => void;
  colors: any;
  hasSelectedIPO: boolean;
  bulkLots: number;
  singleAppShares: number;
  singleAppAmount: number;
  hasFailedAvatar: boolean;
  onAvatarError: (id: string) => void;
}

const ApplicantCardItem = React.memo(function ApplicantCardItem({
  u,
  isSelected,
  onToggle,
  colors,
  hasSelectedIPO,
  bulkLots,
  singleAppShares,
  singleAppAmount,
  hasFailedAvatar,
  onAvatarError,
}: ApplicantCardItemProps) {
  const [grad1, grad2] = useMemo(() => getAvatarGradient(u.name || 'User'), [u.name]);
  const initials = u.name ? u.name.slice(0, 2).toUpperCase() : 'U';

  const customAvatar = (u.avatar_url || (u as any).avatarUrl || (u as any).avatar || '').trim();
  const canLoadImage = isCustomAvatarUrl(customAvatar) && !hasFailedAvatar;

  return (
    <TouchableOpacity
      onPress={() => onToggle(u.id)}
      activeOpacity={0.75}
      style={[
        styles.applicantCard,
        {
          backgroundColor: colors.card,
          borderColor: isSelected ? '#10B981' : colors.border,
        },
      ]}
    >
      <View style={styles.applicantCardMain}>
        {canLoadImage ? (
          <Image
            source={{ uri: customAvatar }}
            style={[styles.avatarGradient, { backgroundColor: colors.surface }]}
            resizeMode="cover"
            onError={() => onAvatarError(u.id)}
          />
        ) : (
          <LinearGradient colors={[grad1, grad2]} style={styles.avatarGradient}>
            <Text style={styles.avatarText}>{initials}</Text>
          </LinearGradient>
        )}

        <View style={{ flex: 1 }}>
          <Text style={[styles.applicantName, { color: colors.foreground }]} numberOfLines={1}>
            {u.name}
          </Text>
          <View style={styles.applicantSubRow}>
            <Text style={[styles.applicantPan, { color: colors.mutedForeground }]}>
              {u.pan_number ? `PAN: ${maskPAN(u.pan_number)}` : 'Investor Profile'}
            </Text>
            {u.broker && (
              <View style={[styles.brokerBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.brokerBadgeText, { color: colors.mutedForeground }]}>
                  {u.broker.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={[
            styles.checkboxCircle,
            {
              borderColor: isSelected ? '#10B981' : colors.border,
              backgroundColor: isSelected ? '#10B981' : 'transparent',
            },
          ]}
        >
          {isSelected && <Feather name="check" size={13} color="#FFFFFF" />}
        </View>
      </View>

      {hasSelectedIPO && isSelected && (
        <View style={[styles.applicantCostBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.applicantCostLabel, { color: colors.mutedForeground }]}>
            Allocated: {bulkLots} {bulkLots === 1 ? 'Lot' : 'Lots'} ({singleAppShares} Shares)
          </Text>
          <Text style={[styles.applicantCostValue, { color: colors.foreground }]}>
            {formatCurrency(singleAppAmount)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

export default function BulkApplyScreen() {
  const { isNonPro, isLoading: isExperienceLoading } = useAppExperience();
  const router = useRouter();

  useEffect(() => {
    if (!isExperienceLoading && isNonPro) {
      if (typeof (router as any).navigate === 'function') {
        (router as any).navigate('/(tabs)/ipos');
      } else {
        router.replace('/(tabs)/ipos');
      }
    }
  }, [isNonPro, isExperienceLoading, router]);

  if (isNonPro) {
    return null;
  }

  return <BulkApplyScreenContent />;
}
