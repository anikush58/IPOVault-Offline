import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  TextInput,
  Image,
  Linking,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';

import { useColors } from '@/hooks/useColors';
import { DesignSystem } from '@/constants/DesignSystem';
import { IconButton } from '@/components/ui/IconButton';
import { useDialog } from '@/context/DialogContext';
import {
  useDB,
  type ApplicationWithDetails,
  type IPOAllotmentRecord,
  type SaveAllotmentParams,
} from '@/context/DBContext';

import { getRegistrarConfig } from '@/services/allotment/registrarConfig';
import { formatCurrency } from '@/utils/formatters';
import { allotmentEngine } from '@/lib/allotment/AllotmentEngine';
import { AllotmentRequest, AllotmentResult, EngineProgress } from '@/lib/allotment/types';
import { CheckAllProgressModal } from '@/components/allotment/CheckAllProgressModal';
import { ResultSavedModal } from '@/components/allotment/ResultSavedModal';
import { RecheckConfirmModal } from '@/components/allotment/RecheckConfirmModal';
import { AllotmentStatusBadge, AllotmentBadgeStatus } from '@/components/allotment/AllotmentStatusBadge';

export type UserCheckStatus =
  | 'pending'
  | 'checking'
  | 'allotted'
  | 'partially_allotted'
  | 'not_allotted'
  | 'no_record'
  | 'captcha_required'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'unsupported_registrar'
  | 'unknown_error'
  | 'manual_required';

export type UserCheckState = {
  applicationId: string;
  userId: string;
  userName: string;
  pan: string;
  appliedQuantity: number;
  price: number;
  status: UserCheckStatus;
  sharesAllotted?: number;
  refundAmount?: number;
  verificationMethod?: 'AUTOMATED' | 'USER_VERIFIED';
  checkedAt?: string;
  errorCode?: string;
};

// Mask PAN helper (e.g. ABCDE1234F -> XXXXX1234F)
function maskPan(pan: string): string {
  if (!pan || pan.length < 5) return 'XXXXX';
  return 'XXXXX' + pan.slice(5);
}

// Format relative time (e.g. "Last checked 5m ago")
function formatCheckedTime(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Last checked just now';
  if (diffMins < 60) return `Last checked ${diffMins}m ago`;
  if (diffHours < 24) return `Last checked ${diffHours}h ago`;
  return `Last checked ${diffDays}d ago`;
}

export default function AllotmentCheckerScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ipoId?: string }>();
  const { applications, ipos, users, getAllotments, saveAllotmentResult, refresh } = useDB();
  const { showError } = useDialog();

  // Registrar health statistics (Local Mode)
  const healthData: any[] = [];

  // Selected IPO
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(params.ipoId || null);
  const [showIpoPicker, setShowIpoPicker] = useState(false);

  // Allotments store from SQLite
  const [allotmentDbRecords, setAllotmentDbRecords] = useState<Record<string, IPOAllotmentRecord>>({});

  // Checker sequence states
  const [checking, setChecking] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [userStates, setUserStates] = useState<UserCheckState[]>([]);

  // CAPTCHA / Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaSolution, setCaptchaSolution] = useState('');
  const [solvingCaptcha, setSolvingCaptcha] = useState(false);

  // Manual Verification Modal State
  const [manualModalApp, setManualModalApp] = useState<UserCheckState | null>(null);
  const [manualSelectedStatus, setManualSelectedStatus] = useState<'ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'NOT_ALLOTTED' | 'NO_RECORD'>('ALLOTTED');
  const [manualSharesInput, setManualSharesInput] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  // Allotment Engine & Progress Modal State
  const [showEngineModal, setShowEngineModal] = useState(false);
  const [engineProgress, setEngineProgress] = useState<EngineProgress>({
    total: 0,
    completed: 0,
    results: new Map(),
  });
  const [engineRequests, setEngineRequests] = useState<AllotmentRequest[]>([]);
  const [engineChecking, setEngineChecking] = useState(false);

  // Custom IPOVault Modals State
  const [savedSuccessData, setSavedSuccessData] = useState<{
    userName: string;
    status: 'ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'NOT_ALLOTTED' | 'NO_RECORD';
    sharesAllotted: number;
  } | null>(null);

  const [recheckConfirmData, setRecheckConfirmData] = useState<{
    index: number;
    userName: string;
    currentStatus: string;
  } | null>(null);

  const solveMutation = { mutateAsync: async (..._args: any[]) => ({}) };

  // Filter IPOs that have at least one application
  const iposWithApps = useMemo(() => {
    return ipos.filter((ipo) => applications.some((app) => app.ipo_id === ipo.id));
  }, [ipos, applications]);

  const selectedIpo = useMemo(() => {
    return ipos.find((i) => i.id === selectedIpoId);
  }, [ipos, selectedIpoId]);

  const registrarConfig = useMemo(() => {
    return getRegistrarConfig(selectedIpo?.registrar);
  }, [selectedIpo?.registrar]);

  // Load existing allotment check records from SQLite
  const loadStoredAllotments = useCallback(async () => {
    const records = await getAllotments();
    const map: Record<string, IPOAllotmentRecord> = {};
    for (const r of records) {
      map[r.application_id] = r;
    }
    setAllotmentDbRecords(map);
  }, [getAllotments]);

  useEffect(() => {
    loadStoredAllotments();
  }, [loadStoredAllotments]);

  // Populate user check states for selected IPO
  const buildUserStatesForIpo = useCallback((ipoId: string, dbMap: Record<string, IPOAllotmentRecord>) => {
    const ipo = ipos.find((i) => i.id === ipoId);
    if (!ipo) return [];

    const ipoApps = applications.filter((app) => app.ipo_id === ipoId);
    return ipoApps.map((app) => {
      const user = users.find((u) => u.id === app.user_id);
      const dbRec = dbMap[app.id];

      let initialStatus: UserCheckStatus = 'pending';
      if (dbRec) {
        const s = dbRec.allotment_status.toLowerCase();
        if (s === 'allotted') initialStatus = 'allotted';
        else if (s === 'partially_allotted') initialStatus = 'partially_allotted';
        else if (s === 'not_allotted') initialStatus = 'not_allotted';
        else if (s === 'no_record') initialStatus = 'no_record';
        else if (s === 'captcha_required') initialStatus = 'captcha_required';
        else if (s === 'rate_limited') initialStatus = 'rate_limited';
        else if (s === 'timeout') initialStatus = 'timeout';
        else if (s === 'network_error') initialStatus = 'network_error';
        else if (s === 'unsupported_registrar') initialStatus = 'unsupported_registrar';
        else if (s === 'manual_required') initialStatus = 'manual_required';
        else initialStatus = 'unknown_error';
      }

      return {
        applicationId: app.id,
        userId: app.user_id,
        userName: app.user_name || user?.name || 'Applicant',
        pan: user?.pan_number || '',
        appliedQuantity: app.quantity || ipo.buy_price || 0,
        price: app.buy_price || 0,
        status: initialStatus,
        sharesAllotted: dbRec?.allotted_shares,
        refundAmount: dbRec?.refund_amount,
        verificationMethod: dbRec?.verification_method,
        checkedAt: dbRec?.checked_at,
        errorCode: dbRec?.error_code,
      };
    });
  }, [ipos, applications, users]);

  // Sync state when selected IPO changes or DB loads
  useEffect(() => {
    if (selectedIpoId) {
      const states = buildUserStatesForIpo(selectedIpoId, allotmentDbRecords);
      setUserStates(states);
    }
  }, [selectedIpoId, allotmentDbRecords, buildUserStatesForIpo]);

  // Health status matching
  const regHealth = useMemo(() => {
    if (!selectedIpo?.registrar || !healthData) return null;
    return healthData.find(
      (h: any) =>
        h.registrarName.trim().toUpperCase().includes(selectedIpo.registrar!.trim().toUpperCase()) ||
        selectedIpo.registrar!.trim().toUpperCase().includes(h.registrarName.trim().toUpperCase())
    );
  }, [selectedIpo?.registrar, healthData]);

  // Registrar capability helper
  const isLinkIntime = useMemo(() => {
    if (!selectedIpo?.registrar) return false;
    const reg = selectedIpo.registrar.toUpperCase();
    return reg.includes('LINK') || reg.includes('MUFG') || getRegistrarConfig(selectedIpo.registrar).supportLevel === 'HYBRID';
  }, [selectedIpo?.registrar]);

  // Solve CAPTCHA handler
  const handleSolveCaptcha = async () => {
    if (!sessionId || !captchaSolution.trim()) return;
    setSolvingCaptcha(true);

    try {
      const res: any = await solveMutation.mutateAsync({
        data: {
          session_id: sessionId,
          solution: captchaSolution,
        },
      });

      if (res.status === 'authenticated') {
        setShowCaptchaModal(false);
        setCaptchaSolution('');
        // Resume checking sequence
        setChecking(true);
      } else {
        showError('Verification Failed', 'Incorrect CAPTCHA solution, please try again.');
      }
    } catch (err: any) {
      console.error('Failed to solve captcha:', err);
      showError('Error', 'Unable to verify CAPTCHA. Please check your network connection.');
    } finally {
      setSolvingCaptcha(false);
    }
  };

  // Run single check for an applicant index
  const runCheckForIndex = async (index: number) => {
    if (index < 0 || index >= userStates.length) return;

    const targetUser = userStates[index];
    const ipoName = selectedIpo?.ipo_name || 'IPO';
    const registrarName = selectedIpo?.registrar || 'Registrar';

    // Update state to 'checking'
    setUserStates((prev) =>
      prev.map((u, i) => (i === index ? { ...u, status: 'checking' } : u))
    );

    try {
      if (!targetUser.pan) {
        throw new Error('PAN not available');
      }

      // If registrar is unsupported, trigger manual check immediately
      if (registrarConfig.supportLevel === 'MANUAL_ONLY') {
        const savedRec = await saveAllotmentResult({
          application_id: targetUser.applicationId,
          user_id: targetUser.userId,
          ipo_id: selectedIpoId!,
          allotment_status: 'UNSUPPORTED_REGISTRAR',
          registrar: registrarName,
          verification_method: 'AUTOMATED',
          error_code: 'UNSUPPORTED_REGISTRAR',
        });

        setUserStates((prev) =>
          prev.map((u, i) =>
            i === index
              ? {
                  ...u,
                  status: 'unsupported_registrar',
                  checkedAt: savedRec.checked_at,
                  verificationMethod: 'AUTOMATED',
                  errorCode: 'UNSUPPORTED_REGISTRAR',
                }
              : u
          )
        );
        return;
      }

      // Execute check (Local Mode)
      const res: any = null;

      if (res && res.status === 'captcha_required') {
        setChecking(false);
        setSessionId(res.session_id || null);
        setCaptchaImage(res.captcha_image || null);
        setShowCaptchaModal(true);

        const savedRec = await saveAllotmentResult({
          application_id: targetUser.applicationId,
          user_id: targetUser.userId,
          ipo_id: selectedIpoId!,
          allotment_status: 'CAPTCHA_REQUIRED',
          registrar: registrarName,
          verification_method: 'AUTOMATED',
          error_code: 'CAPTCHA_DETECTED',
        });

        setUserStates((prev) =>
          prev.map((u, i) =>
            i === index
              ? {
                  ...u,
                  status: 'captcha_required',
                  checkedAt: savedRec.checked_at,
                  verificationMethod: 'AUTOMATED',
                  errorCode: 'CAPTCHA_DETECTED',
                }
              : u
          )
        );
        return;
      }

      const result = res?.results?.[0];
      if (result) {
        let dbStatus = 'UNKNOWN_ERROR';
        let uiStatus: UserCheckStatus = 'unknown_error';
        let allottedShares = 0;
        let allottedLots = 0;

        if (result.status === 'allotted') {
          dbStatus = 'ALLOTTED';
          uiStatus = 'allotted';
          allottedShares = result.shares_allotted || targetUser.appliedQuantity;
          allottedLots = 1;
        } else if (result.status === 'not_allotted') {
          dbStatus = 'NOT_ALLOTTED';
          uiStatus = 'not_allotted';
          allottedShares = 0;
          allottedLots = 0;
        } else if (result.status === 'no_record') {
          dbStatus = 'NO_RECORD';
          uiStatus = 'no_record';
        } else {
          dbStatus = result.error_code || 'UNKNOWN_ERROR';
          uiStatus = 'unknown_error';
        }

        const appAmount = targetUser.price * targetUser.appliedQuantity;
        const refundAmt = dbStatus === 'NOT_ALLOTTED' ? appAmount : dbStatus === 'ALLOTTED' ? 0 : Math.max(0, appAmount - (allottedShares * targetUser.price));

        // Save into SQLite
        const savedRec = await saveAllotmentResult({
          application_id: targetUser.applicationId,
          user_id: targetUser.userId,
          ipo_id: selectedIpoId!,
          allotment_status: dbStatus,
          allotted_lots: allottedLots,
          allotted_shares: allottedShares,
          allotment_price: targetUser.price,
          application_amount: appAmount,
          refund_amount: refundAmt,
          registrar: registrarName,
          verification_method: 'AUTOMATED',
          error_code: result.error_code || undefined,
        });

        setUserStates((prev) =>
          prev.map((u, i) =>
            i === index
              ? {
                  ...u,
                  status: uiStatus,
                  sharesAllotted: allottedShares,
                  refundAmount: refundAmt,
                  checkedAt: savedRec.checked_at,
                  verificationMethod: 'AUTOMATED',
                  errorCode: result.error_code || undefined,
                }
              : u
          )
        );

        if (uiStatus === 'allotted') {
          setSavedSuccessData({
            userName: targetUser.userName,
            status: 'ALLOTTED',
            sharesAllotted: allottedShares,
          });
        }
      } else {
        throw new Error('Empty response from registrar adapter');
      }
    } catch (err: any) {
      console.warn(`[AllotmentChecker] Technical error for ${targetUser.userName}:`, err?.message);

      let errCode = 'UNEXPECTED_RESPONSE';
      let uiState: UserCheckStatus = 'unknown_error';

      if (err?.message?.toLowerCase().includes('network') || err?.message?.toLowerCase().includes('fetch')) {
        errCode = 'NETWORK_ERROR';
        uiState = 'network_error';
      } else if (err?.message?.toLowerCase().includes('timeout')) {
        errCode = 'TIMEOUT';
        uiState = 'timeout';
      }

      // Persist technical error check without mutating application status
      const savedRec = await saveAllotmentResult({
        application_id: targetUser.applicationId,
        user_id: targetUser.userId,
        ipo_id: selectedIpoId!,
        allotment_status: errCode,
        registrar: registrarName,
        verification_method: 'AUTOMATED',
        error_code: errCode,
      });

      setUserStates((prev) =>
        prev.map((u, i) =>
          i === index
            ? {
                ...u,
                status: uiState,
                checkedAt: savedRec.checked_at,
                verificationMethod: 'AUTOMATED',
                errorCode: errCode,
              }
            : u
        )
      );
    }
  };

  // Loop runner for "Check All"
  useEffect(() => {
    if (!checking || currentIndex < 0 || currentIndex >= userStates.length) {
      if (checking && currentIndex >= userStates.length) {
        setChecking(false);
        setCurrentIndex(-1);
      }
      return;
    }

    let active = true;
    (async () => {
      await runCheckForIndex(currentIndex);
      if (active) {
        setTimeout(() => {
          if (active) setCurrentIndex((prev) => prev + 1);
        }, 400);
      }
    })();

    return () => {
      active = false;
    };
  }, [checking, currentIndex, sessionId]);

  // Start "Check All" process using AllotmentEngine & CheckAllProgressModal
  const startCheckAll = async () => {
    if (userStates.length === 0 || !selectedIpoId) return;

    const requests: AllotmentRequest[] = userStates.map((u) => ({
      applicationId: u.applicationId,
      userId: u.userId,
      userName: u.userName,
      ipoId: selectedIpoId,
      ipoName: selectedIpo?.ipo_name || 'IPO',
      registrar: selectedIpo?.registrar,
      pan: u.pan,
      appliedQuantity: u.appliedQuantity,
      price: u.price,
      forceRefresh: true,
    }));

    setEngineRequests(requests);
    setEngineProgress({
      total: requests.length,
      completed: 0,
      results: new Map(),
    });
    setEngineChecking(true);
    setShowEngineModal(true);

    try {
      await allotmentEngine.checkAll(requests, {
        onProgress: (prog) => {
          setEngineProgress({ ...prog, results: new Map(prog.results) });
        },
        saveResultCallback: async (res: AllotmentResult) => {
          const existingRec = allotmentDbRecords[res.applicationId];
          // DATA INTEGRITY GUARD: Preserve user-verified results from being overwritten by mock/automated checks
          if (existingRec?.verification_method === 'USER_VERIFIED' && res.verificationMethod !== 'USER_VERIFIED') {
            return;
          }
          const buyPrice = selectedIpo?.buy_price || 100;
          const appAmount = (res.refundAmount || 0) + (res.sharesAllotted * buyPrice);
          await saveAllotmentResult({
            application_id: res.applicationId,
            user_id: res.userId,
            ipo_id: res.ipoId,
            allotment_status: res.status,
            allotted_lots: res.sharesAllotted > 0 ? 1 : 0,
            allotted_shares: res.sharesAllotted,
            allotment_price: buyPrice,
            application_amount: appAmount,
            refund_amount: res.refundAmount,
            registrar: selectedIpo?.registrar || '',
            verification_method: res.verificationMethod === 'USER_VERIFIED' ? 'USER_VERIFIED' : 'AUTOMATED',
            error_code: res.errorMessage,
          });
        },
      });
    } catch (err) {
      console.warn('[AllotmentChecker] Engine batch completed or canceled:', err);
    } finally {
      setEngineChecking(false);
      await loadStoredAllotments();
    }
  };

  const handleCancelEngineCheck = () => {
    allotmentEngine.cancel();
    setEngineChecking(false);
  };

  // Single card check request handler with protection for USER_VERIFIED records
  const handleSingleCheckRequest = (index: number) => {
    if (checking) return;
    const targetUser = userStates[index];
    if (targetUser.verificationMethod === 'USER_VERIFIED') {
      let currentStatusText = 'USER VERIFIED';
      if (targetUser.status === 'allotted') currentStatusText = 'ALLOTTED';
      else if (targetUser.status === 'partially_allotted') currentStatusText = 'PARTIALLY ALLOTTED';
      else if (targetUser.status === 'not_allotted') currentStatusText = 'NOT ALLOTTED';
      else if (targetUser.status === 'no_record') currentStatusText = 'NO RECORD';

      setRecheckConfirmData({
        index,
        userName: targetUser.userName,
        currentStatus: currentStatusText,
      });
      return;
    }
    handleSingleCheck(index);
  };

  const handleConfirmRecheck = async () => {
    if (!recheckConfirmData) return;
    const idx = recheckConfirmData.index;
    setRecheckConfirmData(null);
    await runCheckForIndex(idx);
    await loadStoredAllotments();
  };

  const handleSingleCheck = async (index: number) => {
    if (checking) return;
    await runCheckForIndex(index);
    await loadStoredAllotments();
  };

  // Open Registrar Website
  const handleOpenRegistrarUrl = async () => {
    const url = registrarConfig.url;
    try {
      if (Platform.OS !== 'web' && await WebBrowser.openBrowserAsync(url)) {
        return;
      }
      await Linking.openURL(url);
    } catch {
      showError('Error', `Unable to open URL: ${url}`);
    }
  };

  // Open Manual Verification Sheet
  const handleOpenManualModal = (app: UserCheckState) => {
    setManualModalApp(app);
    setManualSelectedStatus('ALLOTTED');
    setManualSharesInput(String(app.appliedQuantity || selectedIpo?.quantity || 0));
  };

  // Confirm & Save Manual Verification with IPOVault theme
  const handleConfirmManualSave = async () => {
    if (!manualModalApp || !selectedIpoId) return;

    setSavingManual(true);
    try {
      const allottedShares = manualSelectedStatus === 'ALLOTTED' || manualSelectedStatus === 'PARTIALLY_ALLOTTED'
        ? (parseInt(manualSharesInput, 10) || manualModalApp.appliedQuantity)
        : 0;

      const appAmount = manualModalApp.price * manualModalApp.appliedQuantity;
      const refundAmt = manualSelectedStatus === 'NOT_ALLOTTED'
        ? appAmount
        : manualSelectedStatus === 'ALLOTTED'
        ? 0
        : Math.max(0, appAmount - (allottedShares * manualModalApp.price));

      const savedRec = await saveAllotmentResult({
        application_id: manualModalApp.applicationId,
        user_id: manualModalApp.userId,
        ipo_id: selectedIpoId,
        allotment_status: manualSelectedStatus,
        allotted_lots: allottedShares > 0 ? 1 : 0,
        allotted_shares: allottedShares,
        allotment_price: manualModalApp.price,
        application_amount: appAmount,
        refund_amount: refundAmt,
        registrar: selectedIpo?.registrar || '',
        verification_method: 'USER_VERIFIED',
      });

      // Update React state immediately so card and stats reflect new status instantly!
      setUserStates((prev) =>
        prev.map((u) =>
          u.applicationId === manualModalApp.applicationId
            ? {
                ...u,
                status:
                  manualSelectedStatus === 'ALLOTTED'
                    ? 'allotted'
                    : manualSelectedStatus === 'PARTIALLY_ALLOTTED'
                    ? 'partially_allotted'
                    : manualSelectedStatus === 'NOT_ALLOTTED'
                    ? 'not_allotted'
                    : 'no_record',
                sharesAllotted: allottedShares,
                refundAmount: refundAmt,
                verificationMethod: 'USER_VERIFIED',
                checkedAt: savedRec.checked_at,
                errorCode: undefined,
              }
            : u
        )
      );

      const targetApp = manualModalApp;
      setManualModalApp(null);
      await loadStoredAllotments();

      // Open IPOVault-themed Result Saved Modal
      setSavedSuccessData({
        userName: targetApp.userName,
        status: manualSelectedStatus,
        sharesAllotted: allottedShares,
      });
    } catch (err: any) {
      showError('Error', 'Failed to save manual verification.');
    } finally {
      setSavingManual(false);
    }
  };

  // Stats calculation
  const total = userStates.length;
  const completedCount = userStates.filter((u) => u.status !== 'pending' && u.status !== 'checking').length;
  const allottedCount = userStates.filter((u) => u.status === 'allotted').length;
  const partiallyCount = userStates.filter((u) => u.status === 'partially_allotted').length;
  const notAllottedCount = userStates.filter((u) => u.status === 'not_allotted').length;
  const manualReqCount = userStates.filter((u) =>
    ['captcha_required', 'rate_limited', 'timeout', 'network_error', 'unsupported_registrar', 'unknown_error', 'manual_required'].includes(u.status)
  ).length;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Allotment Checker</Text>
        <View style={{ width: 44, height: 44 }} />
      </View>

      {/* Select IPO View */}
      {selectedIpoId === null ? (
        <View style={styles.selectorView}>
          <Text style={[styles.selectorLabel, { color: colors.mutedForeground }]}>SELECT IPO TO CHECK ALLOTMENT</Text>
          <TouchableOpacity
            onPress={() => setShowIpoPicker(true)}
            style={[styles.selectorBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[styles.selectorValueText, { color: colors.mutedForeground }]}>Choose from registered IPOs...</Text>
            <Feather name="chevron-down" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mainContent}>
          {/* IPO Level Summary Card */}
          <View style={[styles.ipoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.ipoHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ipoCardLabel, { color: colors.mutedForeground }]}>IPO ALLOTMENT STATUS</Text>
                <Text style={[styles.ipoCardTitle, { color: colors.foreground }]}>{selectedIpo?.ipo_name}</Text>
              </View>

              <TouchableOpacity
                onPress={() => setShowIpoPicker(true)}
                style={[styles.changeIpoBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={[styles.changeIpoText, { color: colors.primary }]}>Switch IPO</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>Registrar</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.detailVal, { color: colors.foreground }]}>{selectedIpo?.registrar || 'Link Intime'}</Text>
                  {regHealth && (
                    <View
                      style={[
                        styles.healthDot,
                        {
                          backgroundColor:
                            regHealth.currentStatus === 'HEALTHY' ? colors.positive : regHealth.currentStatus === 'DEGRADED' ? colors.statusPending : colors.negative,
                        },
                      ]}
                    />
                  )}
                </View>
              </View>

              <View style={styles.detailItem}>
                <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>Allotment Date</Text>
                <Text style={[styles.detailVal, { color: colors.foreground }]}>{selectedIpo?.allotment_date || '—'}</Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>Issue Type</Text>
                <Text style={[styles.detailVal, { color: colors.foreground }]}>{selectedIpo?.issue_type || 'Mainboard'}</Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>Applications</Text>
                <Text style={[styles.detailVal, { color: colors.foreground }]}>{total}</Text>
              </View>
            </View>
          </View>

          {/* Progress & Summary Panel */}
          <View style={styles.progressContainer}>
            <View style={styles.progressLabelRow}>
              <Text style={[styles.progressStatusText, { color: colors.foreground }]}>
                {checking
                  ? `Checking ${currentIndex + 1} of ${total}...`
                  : completedCount === total && total > 0
                  ? `${total} Applications Checked`
                  : 'Ready for Allotment Check'}
              </Text>
              {checking && (
                <Text style={[styles.progressPct, { color: colors.primary }]}>
                  {total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0}%
                </Text>
              )}
            </View>

            {checking && (
              <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      backgroundColor: colors.primary,
                      width: total > 0 ? `${((currentIndex + 1) / total) * 100}%` : '0%',
                    },
                  ]}
                />
              </View>
            )}

            {/* Stats Breakdown Summary */}
            <View style={[styles.statsPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{total}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.positive }]}>{allottedCount}</Text>
                <Text style={styles.statLabel}>Allotted</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.negative }]}>{notAllottedCount}</Text>
                <Text style={styles.statLabel}>Not Allotted</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.statusPending }]}>{manualReqCount}</Text>
                <Text style={styles.statLabel}>Needs Review</Text>
              </View>
            </View>
          </View>

          {/* Applicant Cards List */}
          <FlatList
            data={userStates}
            keyExtractor={(u) => String(u.applicationId)}
            contentContainerStyle={[styles.listContainer, { paddingBottom: 170 + Math.max(insets.bottom, 28) }]}
            renderItem={({ item: u, index: idx }) => {
              const checkedTimeText = formatCheckedTime(u.checkedAt);
              const isChecked = u.status === 'allotted' || u.status === 'partially_allotted' || u.status === 'not_allotted';
              const needsPortalCheck = isLinkIntime || ['unsupported_registrar', 'captcha_required', 'manual_required', 'unknown_error'].includes(u.status);

              let badgeStatus: AllotmentBadgeStatus = 'PENDING';
              if (u.status === 'checking') badgeStatus = 'CHECKING';
              else if (u.status === 'allotted') badgeStatus = 'ALLOTTED';
              else if (u.status === 'partially_allotted') badgeStatus = 'PARTIALLY_ALLOTTED';
              else if (u.status === 'not_allotted') badgeStatus = 'NOT_ALLOTTED';
              else if (u.status === 'no_record') badgeStatus = 'NO_RECORD';
              else if (u.status === 'pending') badgeStatus = 'PENDING';
              else badgeStatus = 'NEEDS_REVIEW';

              return (
                <View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.userCardHeader}>
                    <View>
                      <Text style={[styles.userNameText, { color: colors.foreground }]}>{u.userName}</Text>
                      {/* PAN Masking */}
                      <Text style={[styles.userPanText, { color: colors.mutedForeground }]}>{maskPan(u.pan)}</Text>
                    </View>

                    <AllotmentStatusBadge status={badgeStatus} sharesAllotted={u.sharesAllotted} size="sm" />
                  </View>

                  {/* Allotment Details & Verification Badge */}
                  {isChecked && (
                    <View style={[styles.allotmentDetailBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.allotmentDetailCell}>
                        <Text style={[styles.detailCellKey, { color: colors.mutedForeground }]}>SHARES ALLOTTED</Text>
                        <Text style={[styles.detailCellVal, { color: u.status === 'not_allotted' ? colors.mutedForeground : colors.primary }]}>
                          {u.sharesAllotted != null ? u.sharesAllotted : 0} Shares
                        </Text>
                      </View>

                      {u.refundAmount != null && u.refundAmount > 0 && (
                        <View style={styles.allotmentDetailCell}>
                          <Text style={[styles.detailCellKey, { color: colors.mutedForeground }]}>EST. REFUND</Text>
                          <Text style={[styles.detailCellVal, { color: colors.positive }]}>
                            {formatCurrency(u.refundAmount)}
                          </Text>
                        </View>
                      )}

                      {/* Verification Method Badge */}
                      <View style={styles.verificationMethodRow}>
                        <Feather
                          name={u.verificationMethod === 'USER_VERIFIED' ? 'user-check' : 'check-circle'}
                          size={11}
                          color={colors.primary}
                        />
                        <Text style={[styles.verificationMethodText, { color: colors.primary }]}>
                          {u.verificationMethod === 'USER_VERIFIED' ? '✓ Verified by you' : '✓ Verified automatically'}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Footer Timestamps & Actions */}
                  <View style={styles.userCardFooter}>
                    <Text style={[styles.checkedTimeText, { color: colors.mutedForeground }]}>
                      {checkedTimeText || 'Not checked yet'}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => handleOpenManualModal(u)}
                        style={[styles.actionBtnSubtle, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <Text style={[styles.actionBtnSubtleText, { color: colors.foreground }]}>Manual Check</Text>
                      </TouchableOpacity>

                      {/* Primary Action Button */}
                      {needsPortalCheck ? (
                        <TouchableOpacity
                          onPress={() => handleOpenManualModal(u)}
                          style={[styles.actionBtnPrimary, { backgroundColor: colors.primary }]}
                          activeOpacity={0.8}
                        >
                          <Feather name="globe" size={13} color="#FFFFFF" />
                          <Text style={styles.actionBtnPrimaryText}>
                            {isChecked ? 'Recheck on Portal' : 'Open Link Intime'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleSingleCheckRequest(idx)}
                          disabled={checking}
                          style={[styles.actionBtnPrimary, { backgroundColor: colors.primary }]}
                        >
                          <Feather name="refresh-cw" size={12} color="#FFFFFF" />
                          <Text style={styles.actionBtnPrimaryText}>{isChecked ? 'Recheck' : 'Check'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />

          {/* Floating Bottom Action Bar */}
          {!showIpoPicker && !showCaptchaModal && (
            <View
              style={[
                styles.doneFooter,
                {
                  borderTopColor: colors.border,
                  backgroundColor: colors.background,
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 20) + 16,
                  paddingTop: 18,
                },
              ]}
            >
              <TouchableOpacity
                onPress={startCheckAll}
                disabled={checking || total === 0}
                activeOpacity={DesignSystem.motion.activeOpacity}
                style={[styles.checkAllBtn, { opacity: checking || total === 0 ? 0.6 : 1 }]}
              >
                <View style={[styles.checkAllGradient, { backgroundColor: colors.primary }]}>
                  {checking ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <>
                      <Feather name="globe" size={18} color="#000000" />
                      <Text style={styles.checkAllBtnText}>
                        {isLinkIntime ? `Open Portal Check (${total} Apps)` : `Check All (${total} Applications)`}
                      </Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Modal 1: IPO Picker Sheet */}
      <Modal visible={showIpoPicker} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowIpoPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={[styles.pickerTitleRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerSheetTitleText, { color: colors.foreground }]}>Select IPO with Applications</Text>
              <TouchableOpacity onPress={() => setShowIpoPicker(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {iposWithApps.length === 0 ? (
              <View style={styles.emptyPickerView}>
                <Feather name="info" size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyPickerText, { color: colors.mutedForeground }]}>
                  No applications recorded in local database yet.
                </Text>
              </View>
            ) : (
              <FlatList
                contentContainerStyle={{ paddingBottom: 0 }}
                data={iposWithApps}
                keyExtractor={(i) => String(i.id)}
                renderItem={({ item: ipo }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedIpoId(ipo.id);
                      setShowIpoPicker(false);
                    }}
                    style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                  >
                    <View>
                      <Text style={[styles.pickerIpoName, { color: colors.foreground }]}>{ipo.ipo_name}</Text>
                      <Text style={[styles.pickerIpoSub, { color: colors.mutedForeground }]}>
                        Registrar: {ipo.registrar || 'Link Intime'}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Modal 2: CAPTCHA Solver Modal */}
      <Modal visible={showCaptchaModal} transparent animationType="fade">
        <View style={styles.captchaOverlay}>
          <View style={[styles.captchaSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.captchaHeader}>
              <Text style={[styles.captchaTitle, { color: colors.foreground }]}>Security Verification</Text>
              <Text style={[styles.captchaSubtitle, { color: colors.mutedForeground }]}>
                {selectedIpo?.registrar || 'Registrar'} requires CAPTCHA verification to proceed.
              </Text>
            </View>

            {captchaImage ? (
              <View style={[styles.captchaImageContainer, { borderColor: colors.border }]}>
                <Image source={{ uri: captchaImage }} style={styles.captchaImage} resizeMode="contain" />
              </View>
            ) : (
              <ActivityIndicator size="large" color={colors.primary} />
            )}

            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.captchaInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="Enter CAPTCHA Code"
                placeholderTextColor={colors.mutedForeground}
                value={captchaSolution}
                onChangeText={setCaptchaSolution}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              onPress={handleSolveCaptcha}
              disabled={solvingCaptcha || !captchaSolution.trim()}
              style={{ width: '100%' }}
            >
              <View style={[styles.submitBtn, { backgroundColor: colors.primary }]}>
                {solvingCaptcha ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.submitBtnText}>Verify & Continue</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Manual Verification Sheet */}
      <Modal visible={Boolean(manualModalApp)} transparent animationType="slide">
        <View style={styles.manualOverlay}>
          <View style={[styles.manualSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.manualHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.manualTitle, { color: colors.foreground }]}>Manual Verification</Text>
                <Text style={[styles.manualSubtitle, { color: colors.mutedForeground }]}>
                  {manualModalApp?.userName} ({maskPan(manualModalApp?.pan || '')})
                </Text>
              </View>

              <TouchableOpacity onPress={() => setManualModalApp(null)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.manualBody}>
              {/* Caution Banner */}
              <View style={[styles.cautionBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <Feather name="info" size={16} color="#B45309" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cautionTitle, { color: '#92400E' }]}>Manual Check Guidance</Text>
                  <Text style={[styles.cautionText, { color: '#B45309' }]}>
                    Please check status on the official portal, then select the verified result below.
                  </Text>
                </View>
              </View>

              {/* Open Registrar Button */}
              <TouchableOpacity onPress={handleOpenRegistrarUrl} style={[styles.openRegistrarBtn, { borderColor: colors.primary }]}>
                <Feather name="external-link" size={16} color={colors.primary} />
                <Text style={[styles.openRegistrarBtnText, { color: colors.primary }]}>
                  Open {registrarConfig.name} Portal
                </Text>
              </TouchableOpacity>

              <Text style={[styles.manualSectionLabel, { color: colors.foreground }]}>
                SELECT VERIFIED ALLOTMENT RESULT
              </Text>

              {/* Status Choices */}
              <View style={styles.choiceGrid}>
                {[
                  { id: 'ALLOTTED', label: 'Allotted', color: colors.statusAllotted },
                  { id: 'PARTIALLY_ALLOTTED', label: 'Partially Allotted', color: '#10B981' },
                  { id: 'NOT_ALLOTTED', label: 'Not Allotted', color: colors.statusNotAllotted },
                  { id: 'NO_RECORD', label: 'No Record Found', color: colors.mutedForeground },
                ].map((choice) => {
                  const isSel = manualSelectedStatus === choice.id;
                  return (
                    <TouchableOpacity
                      key={choice.id}
                      onPress={() => setManualSelectedStatus(choice.id as any)}
                      style={[
                        styles.choiceCard,
                        {
                          backgroundColor: isSel ? choice.color + '15' : colors.surface,
                          borderColor: isSel ? choice.color : colors.border,
                        },
                      ]}
                    >
                      <View style={[styles.choiceDot, { backgroundColor: choice.color }]} />
                      <Text style={[styles.choiceText, { color: isSel ? choice.color : colors.foreground }]}>
                        {choice.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* If Allotted / Partially Allotted -> Shares input */}
              {(manualSelectedStatus === 'ALLOTTED' || manualSelectedStatus === 'PARTIALLY_ALLOTTED') && (
                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>ALLOTTED SHARES</Text>
                  <TextInput
                    style={[styles.manualInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                    keyboardType="number-pad"
                    value={manualSharesInput}
                    onChangeText={setManualSharesInput}
                    placeholder="Enter shares allotted"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              )}

              <TouchableOpacity
                onPress={handleConfirmManualSave}
                disabled={savingManual}
                style={{ width: '100%', marginTop: 8 }}
              >
                <View style={[styles.confirmSaveBtn, { backgroundColor: colors.primary }]}>
                  {savingManual ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <Text style={styles.confirmSaveBtnText}>Confirm & Save Result (User Verified)</Text>
                  )}
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Premium Allotment Engine Progress Modal */}
      <CheckAllProgressModal
        visible={showEngineModal}
        onClose={() => setShowEngineModal(false)}
        onCancel={handleCancelEngineCheck}
        isChecking={engineChecking}
        progress={engineProgress}
        requests={engineRequests}
      />

      {/* Modal 4: Result Saved Success Modal */}
      {savedSuccessData && (
        <ResultSavedModal
          visible={Boolean(savedSuccessData)}
          onClose={() => setSavedSuccessData(null)}
          userName={savedSuccessData.userName}
          status={savedSuccessData.status}
          sharesAllotted={savedSuccessData.sharesAllotted}
        />
      )}

      {/* Modal 5: Recheck Confirmation Modal */}
      {recheckConfirmData && (
        <RecheckConfirmModal
          visible={Boolean(recheckConfirmData)}
          onCancel={() => setRecheckConfirmData(null)}
          onConfirmRecheck={handleConfirmRecheck}
          userName={recheckConfirmData.userName}
          currentStatus={recheckConfirmData.currentStatus}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: DesignSystem.spacing.lg,
    paddingBottom: DesignSystem.spacing.md,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: DesignSystem.typography.size.title, fontFamily: DesignSystem.typography.fontBold, letterSpacing: -0.2 },

  selectorView: { paddingHorizontal: DesignSystem.spacing.xxl, paddingTop: DesignSystem.spacing.xxl, gap: DesignSystem.spacing.sm },
  selectorLabel: { fontSize: DesignSystem.typography.size.bodySm, fontFamily: DesignSystem.typography.fontBold, letterSpacing: 0.8 },
  selectorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: DesignSystem.radius.md,
    paddingHorizontal: DesignSystem.spacing.lg,
    paddingVertical: DesignSystem.spacing.lg,
  },
  selectorValueText: { fontSize: DesignSystem.typography.size.subhead, fontFamily: DesignSystem.typography.fontMedium },

  mainContent: { flex: 1 },
  ipoCard: { margin: DesignSystem.spacing.lg, borderRadius: DesignSystem.radius.lg, borderWidth: 1, padding: DesignSystem.spacing.lg, gap: DesignSystem.spacing.md },
  ipoHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  ipoCardLabel: { fontSize: DesignSystem.typography.size.eyebrow, fontFamily: DesignSystem.typography.fontBold, letterSpacing: 0.8, marginBottom: 2 },
  ipoCardTitle: { fontSize: DesignSystem.typography.size.headline, fontFamily: DesignSystem.typography.fontBold, letterSpacing: -0.3 },
  changeIpoBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: DesignSystem.radius.xs, borderWidth: 1 },
  changeIpoText: { fontSize: DesignSystem.typography.size.caption, fontFamily: DesignSystem.typography.fontBold },

  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: DesignSystem.spacing.md },
  detailItem: { width: '47%', gap: 2 },
  detailKey: { fontSize: DesignSystem.typography.size.eyebrow, fontFamily: DesignSystem.typography.fontBold, letterSpacing: 0.5 },
  detailVal: { fontSize: DesignSystem.typography.size.body, fontFamily: DesignSystem.typography.fontMedium },
  healthDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 2 },

  progressContainer: { paddingHorizontal: DesignSystem.spacing.lg, marginBottom: DesignSystem.spacing.md },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressStatusText: { fontSize: DesignSystem.typography.size.body, fontFamily: DesignSystem.typography.fontSemiBold },
  progressPct: { fontSize: DesignSystem.typography.size.body, fontFamily: DesignSystem.typography.fontBold },
  progressBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressBarFill: { height: '100%', borderRadius: 4 },

  statsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: DesignSystem.radius.md,
    paddingVertical: DesignSystem.spacing.sm,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: DesignSystem.typography.size.subhead, fontFamily: DesignSystem.typography.fontBold },
  statLabel: { fontSize: DesignSystem.typography.size.eyebrow, fontFamily: DesignSystem.typography.fontMedium, color: '#9CA3AF', textTransform: 'uppercase' },

  listContainer: { paddingHorizontal: DesignSystem.spacing.lg, paddingBottom: 100 },
  userCard: {
    borderRadius: DesignSystem.radius.md,
    borderWidth: 1,
    padding: DesignSystem.spacing.lg,
    marginBottom: DesignSystem.spacing.sm,
    gap: DesignSystem.spacing.sm,
  },
  userCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userNameText: { fontSize: DesignSystem.typography.size.subhead, fontFamily: DesignSystem.typography.fontBold },
  userPanText: { fontSize: DesignSystem.typography.size.bodySm, fontFamily: DesignSystem.typography.fontMedium, letterSpacing: 0.5, marginTop: 2 },

  allotmentDetailBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: DesignSystem.spacing.md,
    paddingVertical: DesignSystem.spacing.sm,
    borderRadius: DesignSystem.radius.sm,
    borderWidth: 1,
  },
  allotmentDetailCell: { gap: 1 },
  detailCellKey: { fontSize: DesignSystem.typography.size.eyebrow, fontFamily: DesignSystem.typography.fontBold, letterSpacing: 0.5 },
  detailCellVal: { fontSize: DesignSystem.typography.size.bodySm, fontFamily: DesignSystem.typography.fontBold },

  verificationMethodRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verificationMethodText: { fontSize: DesignSystem.typography.size.eyebrow, fontFamily: DesignSystem.typography.fontBold },

  userCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkedTimeText: { fontSize: DesignSystem.typography.size.caption, fontFamily: DesignSystem.typography.fontRegular },
  actionBtnSubtle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: DesignSystem.radius.xs, borderWidth: 1 },
  actionBtnSubtleText: { fontSize: DesignSystem.typography.size.caption, fontFamily: DesignSystem.typography.fontSemiBold },
  actionBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: DesignSystem.radius.xs },
  actionBtnPrimaryText: { color: '#FFFFFF', fontSize: DesignSystem.typography.size.caption, fontFamily: DesignSystem.typography.fontBold },

  doneFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: DesignSystem.spacing.lg,
    paddingVertical: DesignSystem.spacing.md,
    borderTopWidth: 1,
  },
  checkAllBtn: {
    height: 56,
    borderRadius: DesignSystem.radius.md,
    overflow: 'hidden',
  },
  checkAllGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: DesignSystem.spacing.sm,
  },
  checkAllBtnText: { color: '#FFFFFF', fontSize: DesignSystem.typography.size.subhead, fontFamily: DesignSystem.typography.fontBold, letterSpacing: -0.2 },

  // Picker Overlay
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: DesignSystem.radius.xl, borderTopRightRadius: DesignSystem.radius.xl, maxHeight: 400, paddingBottom: 24, borderTopWidth: 1 },
  pickerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: DesignSystem.spacing.xl,
    paddingVertical: DesignSystem.spacing.lg,
    borderBottomWidth: 1,
  },
  pickerSheetTitleText: { fontSize: DesignSystem.typography.size.title, fontFamily: DesignSystem.typography.fontBold },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: DesignSystem.spacing.xl,
    paddingVertical: DesignSystem.spacing.lg,
    borderBottomWidth: 1,
  },
  pickerIpoName: { fontSize: DesignSystem.typography.size.subhead, fontFamily: DesignSystem.typography.fontSemiBold },
  pickerIpoSub: { fontSize: DesignSystem.typography.size.bodySm, fontFamily: DesignSystem.typography.fontRegular, marginTop: 2 },
  emptyPickerView: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyPickerText: { fontSize: DesignSystem.typography.size.bodyLg, fontFamily: DesignSystem.typography.fontRegular, textAlign: 'center' },

  // CAPTCHA Overlay
  captchaOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: DesignSystem.spacing.xxl },
  captchaSheet: { width: '100%', maxWidth: 360, borderRadius: DesignSystem.radius.xl, borderWidth: 1, padding: DesignSystem.spacing.xl, gap: DesignSystem.spacing.md, alignItems: 'center' },
  captchaHeader: { alignItems: 'center', gap: 4, width: '100%' },
  captchaTitle: { fontSize: DesignSystem.typography.size.headline, fontFamily: DesignSystem.typography.fontBold },
  captchaSubtitle: { fontSize: DesignSystem.typography.size.bodySm, fontFamily: DesignSystem.typography.fontRegular, textAlign: 'center' },
  captchaImageContainer: { width: '100%', height: 70, borderWidth: 1, borderRadius: DesignSystem.radius.sm, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  captchaImage: { width: '100%', height: '100%' },
  inputWrapper: { width: '100%' },
  captchaInput: { width: '100%', height: 44, borderWidth: 1, borderRadius: DesignSystem.radius.sm, paddingHorizontal: 12, fontSize: DesignSystem.typography.size.bodyLg, fontFamily: DesignSystem.typography.fontSemiBold, textAlign: 'center' },
  submitBtn: { width: '100%', height: 48, borderRadius: DesignSystem.radius.md, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: DesignSystem.typography.size.subhead, fontFamily: DesignSystem.typography.fontBold },

  // Manual Verification Modal
  manualOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  manualSheet: { borderTopLeftRadius: DesignSystem.radius.xl, borderTopRightRadius: DesignSystem.radius.xl, maxHeight: '85%', borderTopWidth: 1 },
  manualHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: DesignSystem.spacing.xl, paddingVertical: DesignSystem.spacing.lg, borderBottomWidth: 1 },
  manualTitle: { fontSize: DesignSystem.typography.size.title, fontFamily: DesignSystem.typography.fontBold },
  manualSubtitle: { fontSize: DesignSystem.typography.size.bodySm, fontFamily: DesignSystem.typography.fontRegular, marginTop: 2 },
  manualBody: { padding: DesignSystem.spacing.xl, gap: DesignSystem.spacing.lg },

  cautionBanner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: DesignSystem.radius.sm, borderWidth: 1 },
  cautionTitle: { fontSize: DesignSystem.typography.size.body, fontFamily: DesignSystem.typography.fontBold },
  cautionText: { fontSize: DesignSystem.typography.size.caption, fontFamily: DesignSystem.typography.fontRegular, marginTop: 2, lineHeight: 16 },

  openRegistrarBtn: { height: 46, borderRadius: DesignSystem.radius.md, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  openRegistrarBtnText: { fontSize: DesignSystem.typography.size.body, fontFamily: DesignSystem.typography.fontBold },

  manualSectionLabel: { fontSize: DesignSystem.typography.size.eyebrow, fontFamily: DesignSystem.typography.fontBold, letterSpacing: 0.5 },
  choiceGrid: { gap: 8 },
  choiceCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: DesignSystem.radius.md, borderWidth: 1.5 },
  choiceDot: { width: 10, height: 10, borderRadius: 5 },
  choiceText: { fontSize: DesignSystem.typography.size.bodyLg, fontFamily: DesignSystem.typography.fontBold },

  inputSection: { gap: 4 },
  inputLabel: { fontSize: DesignSystem.typography.size.eyebrow, fontFamily: DesignSystem.typography.fontBold, letterSpacing: 0.5 },
  manualInput: { height: 44, borderWidth: 1, borderRadius: DesignSystem.radius.sm, paddingHorizontal: 12, fontSize: DesignSystem.typography.size.bodyLg, fontFamily: DesignSystem.typography.fontSemiBold },

  confirmSaveBtn: { height: 50, borderRadius: DesignSystem.radius.md, alignItems: 'center', justifyContent: 'center' },
  confirmSaveBtnText: { color: '#FFFFFF', fontSize: DesignSystem.typography.size.subhead, fontFamily: DesignSystem.typography.fontBold },
});
