import { getAuthoritativeIpoLotSize } from '@/utils/ipoCategoryUtils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  DeviceEventEmitter,
  Easing,
  FlatList,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Application from 'expo-application';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { API_BASE_URL } from '@/constants/apiConfig';
import { AllotmentStatusBadge } from '@/components/allotment/AllotmentStatusBadge';
import { Icon } from '@/components/ui/Icon';
import { isCustomAvatarUrl } from '@/utils/avatarUtils';
import { getResolvedLogoUrl, maskApplicantName, MASK_APPLICANT_NAMES_KEY } from '@/utils/formatters';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import { useAuth } from '@/context/AuthContext';
import { useDB, type ApplicationStatus, type ApplicationWithDetails } from '@/context/DBContext';
import { useTheme } from '@/context/ThemeContext';
import { useColors } from '@/hooks/useColors';
import { BannerAdView } from '@/components/ads/BannerAdView';
import { useAppExperience } from '@/context/AppExperienceContext';
import { resolveCanonicalBrokerUserId } from '@/utils/brokerMatching';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import {
  allotmentApiService,
  BackendJobItem,
  BackendJobResponse,
} from '@/services/allotment/AllotmentApiService';
import { panSyncService } from '@/services/allotment/PanSyncService';
import {
  checkBigshareCaptchaPresence,
  getRegistrarConfig,
  getRegistrarShortName,
  getRegistrarDomain,
  getRegistrarWebsite,
  isAutomatedCheckSupported,
} from '@/services/allotment/registrarConfig';
import {
  AllotmentHistoryItem,
  compareAllotmentHistory,
  formatAllotmentTimestamp,
  getAllotmentItemMonth,
  getAllotmentItemMonthYear,
  filterAllotmentHistoryByMonth,
  generateMonthChips,
  MonthChipItem,
  MONTH_NAMES_SHORT,
} from '@/utils/allotmentHistoryUtils';
export {
  AllotmentHistoryItem,
  compareAllotmentHistory,
  formatAllotmentTimestamp,
  getAllotmentItemMonth,
  getAllotmentItemMonthYear,
  filterAllotmentHistoryByMonth,
  generateMonthChips,
  MonthChipItem,
  MONTH_NAMES_SHORT,
};
import { createDeduplicatedNotification } from '@/services/notifications/notificationEngine';
import { markAllotmentModalAsSeen } from '@/hooks/useAllotmentResultModal';
import {
  mapRegistrarCategory,
  formatCategoryDisplayName,
  getCategoryThemeColor,
  formatCategoryStatusText,
  getCategoryStatusTextColor,
  getDeterministicBreakdownLabel,
  sortCategoriesForDisplay,
  deduplicateCategoryRecords,
  deriveOverallCategoryAllotment,
  CategoryBreakdownItem,
} from '@/utils/allotmentCategoryUtils';
import { ApiClient, ApiRequestTrace } from '@/services/api/ApiClient';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { safeRunAsync, safeGetFirstAsync, safeGetAllAsync, isDatabaseOpen, isClosedResourceError } from '@/utils/sqliteDebug';
import { getCachedBackendIpos, saveBackendIposToCache } from '@/services/ipo/ipoHubCacheService';

import {
  AllotmentCheckerIpoItem,
  isBackendIpoAllotmentEligible,
  isIpoWithin30Days,
  normalizeBackendIpoForChecker,
  sortCheckerIposByAllotmentRecency,
} from '@/services/allotment/allotmentCheckerIpoSource';

export const APP_DEBUG_BUILD = 'AC-DIAG-20260907-1640';

// Hero and card graphics for allotment checker (can be swapped from assets/images)
const ALLOTMENT_HERO_GRAPHIC = require('@/assets/images/allotment-checker-graphic.png');
const ALLOTMENT_HERO_GRAPHIC_DARK = require('@/assets/images/allotment-checker-graphic-dark.png');
const ALLOTMENT_BG_GREY = require('@/assets/images/allotment-status-bg-grey.png');
const ALLOTMENT_BG_GREY_DARK = require('@/assets/images/allotment-status-bg-grey-dark.png');
const ALLOTMENT_BG_GREEN = require('@/assets/images/allotment-status-bg-green.png');
const ALLOTMENT_BG_GREEN_DARK = require('@/assets/images/allotment-status-bg-green-dark.png');
const ALLOTMENT_BG_RED = require('@/assets/images/allotment-status-bg-red.png');
const ALLOTMENT_BG_RED_DARK = require('@/assets/images/allotment-status-bg-red-dark.png');

function getIpoMonogram(name: string): string {
  if (!name) return 'IP';
  const clean = name.replace(/\b(limited|ltd|pvt|corp|corporation|inc)\b/gi, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

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

function ApplicantAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl?: string;
  name: string;
}) {
  const [hasError, setHasError] = useState(false);
  const avatarGradient = getAvatarGradient(name || 'User');
  const initial = (name || 'U').trim().charAt(0).toUpperCase();

  const isCustomPhoto = isCustomAvatarUrl(avatarUrl);

  if (isCustomPhoto && !hasError) {
    return (
      <ExpoImage
        source={{ uri: avatarUrl }}
        style={styles.applicantAvatar}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <LinearGradient
      colors={avatarGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.applicantAvatar}
    >
      <Text style={styles.applicantAvatarText}>{initial}</Text>
    </LinearGradient>
  );
}

export {
  AllotmentCheckerIpoItem,
  isBackendIpoAllotmentEligible,
  normalizeBackendIpoForChecker,
  maskApplicantName,
  MASK_APPLICANT_NAMES_KEY,
};

// ==========================================
// DIAGNOSTIC TYPES & HELPER INTERFACES
// ==========================================

export type StageStatus = 'WAITING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface StageItem {
  id: string;
  name: string;
  status: StageStatus;
  detail?: string;
}

export interface DiagnosticErrorOrigin {
  source: string;
  operation: string;
  timestamp: string;
  errorName: string;
  errorMessage: string;
  stack?: string;
  isAborted: boolean;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export interface PanSyncDiagState {
  status: StageStatus;
  httpStatus?: number;
  syncedCount?: number;
  error?: string;
}

export interface JobCreationDiagState {
  status: StageStatus;
  httpStatus?: number;
  jobId?: string;
  error?: string;
  code?: string;
}

export interface PollingDiagState {
  attemptCount: number;
  lastStatus?: string;
  lastHttp?: number;
  lastTime?: string;
  active: boolean;
  error?: string;
}

export interface IpoResolutionDiagState {
  selectedName?: string;
  localId?: string;
  backendId?: string;
  resolutionStatus?: 'SUCCESS' | 'NOT_SYNCHRONIZED' | 'FAILED' | 'WAITING';
  resolutionMethod?: string;
  sentToCreateJob?: string;
}

export interface CreateJobTimingState {
  frontendStarted?: string;
  frontendCompleted?: string;
  frontendDurationMs?: number;
  aborted?: boolean;
  backendReceived?: string;
  backendIpoResolved?: string;
  backendRegistrarResolved?: string;
  backendDbCreated?: string;
  backendWorkerDispatched?: string;
}

// Mask PAN helper (e.g. ABCDE1234F -> XXXXX1234F)
function maskPan(pan: string): string {
  if (!pan || pan.length < 5) return 'XXXXX';
  return 'XXXXX' + pan.slice(5);
}

// Format PAN matching backend mask (e.g. ABCDE1234F -> ABCDE****F)
function getBackendMaskedPan(pan: string): string {
  const p = (pan || '').trim().toUpperCase();
  if (p.length === 10) {
    return `${p.slice(0, 5)}****${p.slice(9)}`;
  }
  return p;
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

export type UIApplicantState = {
  applicationId: string;
  userId: string;
  userName: string;
  pan: string;
  avatarUrl?: string;
  appliedQuantity: number;
  price: number;
  status:
    | 'pending'
    | 'checking'
    | 'allotted'
    | 'partially_allotted'
    | 'not_allotted'
    | 'no_record'
    | 'not_available'
    | 'check_failed'
    | 'needs_review';
  sharesAllotted?: number;
  errorMessage?: string;
  checkedAt?: string;
  categories?: CategoryBreakdownItem[];
};

// Compute 16 Stage Pipeline items based on live state
function computeStages(
  selectedIpo: any,
  effectiveRegistrar: string,
  isAutomatedSupported: boolean,
  panSyncState: PanSyncDiagState,
  jobCreationState: JobCreationDiagState,
  activeJob: BackendJobResponse | null,
  isCreatingJob: boolean,
  isPolling: boolean,
  jobError: string | null,
  uiApplicants: UIApplicantState[],
): StageItem[] {
  const isSelected = Boolean(selectedIpo);
  const isKFin = effectiveRegistrar.toLowerCase().includes('kfin');

  return [
    {
      id: '1',
      name: '1. Screen opened',
      status: 'SUCCESS',
      detail: 'Mounted',
    },
    {
      id: '2',
      name: '2. IPO selected',
      status: isSelected ? 'SUCCESS' : 'WAITING',
      detail: selectedIpo ? selectedIpo.ipo_name : 'Select an IPO',
    },
    {
      id: '3',
      name: '3. Registrar resolved',
      status: isSelected ? 'SUCCESS' : 'WAITING',
      detail: isSelected ? effectiveRegistrar : undefined,
    },
    {
      id: '4',
      name: '4. Capability check',
      status: isSelected
        ? isAutomatedSupported
          ? 'SUCCESS'
          : 'FAILED'
        : 'WAITING',
      detail: isSelected
        ? isAutomatedSupported
          ? 'Automated Check Available'
          : 'Automated Check Unavailable'
        : undefined,
    },
    {
      id: '5',
      name: '5. PAN sync',
      status: panSyncState.status,
      detail:
        panSyncState.status === 'SUCCESS'
          ? `HTTP ${panSyncState.httpStatus || 200} (${panSyncState.syncedCount} synced)`
          : panSyncState.error || (isCreatingJob ? 'Syncing...' : undefined),
    },
    {
      id: '6',
      name: '6. Job creation',
      status: jobCreationState.status,
      detail:
        jobCreationState.status === 'SUCCESS'
          ? `HTTP ${jobCreationState.httpStatus || 201}`
          : jobCreationState.error || (isCreatingJob ? 'Creating job...' : undefined),
    },
    {
      id: '7',
      name: '7. Job queued',
      status: activeJob
        ? 'SUCCESS'
        : jobCreationState.status === 'FAILED'
        ? 'FAILED'
        : 'WAITING',
      detail: activeJob ? `Status: ${activeJob.status}` : undefined,
    },
    {
      id: '8',
      name: '8. Worker started',
      status: activeJob
        ? activeJob.status === 'QUEUED'
          ? 'RUNNING'
          : activeJob.status === 'FAILED'
          ? 'FAILED'
          : 'SUCCESS'
        : 'WAITING',
      detail: activeJob ? `Worker active for ${activeJob.totalChecks} checks` : undefined,
    },
    {
      id: '9',
      name: '9. Applicant checks',
      status: activeJob
        ? activeJob.status === 'RUNNING'
          ? 'RUNNING'
          : activeJob.processedChecks > 0
          ? 'SUCCESS'
          : 'WAITING'
        : 'WAITING',
      detail: activeJob
        ? `${activeJob.processedChecks}/${activeJob.totalChecks} checked`
        : undefined,
    },
    {
      id: '10',
      name: '10. KFin request',
      status: isSelected && isAutomatedSupported && isKFin
        ? activeJob && activeJob.processedChecks > 0
          ? 'SUCCESS'
          : isCreatingJob || isPolling
          ? 'RUNNING'
          : 'WAITING'
        : 'SKIPPED',
      detail: isKFin ? 'KFin API Gateway contacted' : 'Not KFin registrar',
    },
    {
      id: '11',
      name: '11. KFin response',
      status: isSelected && isAutomatedSupported && isKFin
        ? activeJob && activeJob.processedChecks > 0
          ? 'SUCCESS'
          : 'WAITING'
        : 'SKIPPED',
      detail: isKFin
        ? activeJob && activeJob.processedChecks > 0
          ? 'Record Not Found (404 normalized)'
          : undefined
        : 'Not KFin registrar',
    },
    {
      id: '12',
      name: '12. Result normalization',
      status: activeJob && activeJob.processedChecks > 0 ? 'SUCCESS' : 'WAITING',
      detail:
        activeJob && activeJob.processedChecks > 0
          ? 'Normalized to APPLICATION_NOT_FOUND'
          : undefined,
    },
    {
      id: '13',
      name: '13. Job polling',
      status: isPolling
        ? 'RUNNING'
        : activeJob && (activeJob.status === 'COMPLETED' || activeJob.status === 'COMPLETED_WITH_ERRORS')
        ? 'SUCCESS'
        : activeJob && activeJob.status === 'FAILED'
        ? 'FAILED'
        : 'WAITING',
      detail: isPolling ? 'Polling active (~2s interval)' : 'Polling stopped',
    },
    {
      id: '14',
      name: '14. Job completed',
      status: activeJob
        ? activeJob.status === 'COMPLETED' || activeJob.status === 'COMPLETED_WITH_ERRORS'
          ? 'SUCCESS'
          : activeJob.status === 'FAILED'
          ? 'FAILED'
          : 'RUNNING'
        : 'WAITING',
      detail: activeJob ? `Terminal status: ${activeJob.status}` : undefined,
    },
    {
      id: '15',
      name: '15. Frontend result mapping',
      status: uiApplicants.length > 0 && activeJob ? 'SUCCESS' : 'WAITING',
      detail:
        uiApplicants.length > 0 && activeJob
          ? `Mapped ${uiApplicants.length} applicants`
          : undefined,
    },
    {
      id: '16',
      name: '16. UI rendered',
      status: uiApplicants.some((a) => a.status !== 'pending' && a.status !== 'checking')
        ? 'SUCCESS'
        : 'WAITING',
      detail: 'Applicant cards & summary updated',
    },
  ];
}

// ==========================================
// DEVELOPER DIAGNOSTICS PANEL COMPONENT
// ==========================================

function DeveloperDiagnosticsPanel(props: {
  appBuildMarker: string;
  apiBaseUrl: string;
  healthState: { status: string; httpStatus?: number; durationMs?: number; url: string };
  userId?: string;
  ipoResolution?: IpoResolutionDiagState;
  selectedIpo: any;
  effectiveRegistrar: string;
  isAutomatedSupported: boolean;
  activeJob: BackendJobResponse | null;
  isCreatingJob: boolean;
  isPolling: boolean;
  jobError: string | null;
  lastErrorOrigin: DiagnosticErrorOrigin | null;
  abortedOrigin: DiagnosticErrorOrigin | null;
  panSyncState: PanSyncDiagState;
  jobCreationState: JobCreationDiagState;
  jobTiming: CreateJobTimingState | null;
  pollingDiag: PollingDiagState;
  apiTraces: ApiRequestTrace[];
  eventLogs: LogEntry[];
  uiApplicants: UIApplicantState[];
  summaryCounts: {
    total: number;
    allotted: number;
    notAllotted: number;
    noRecord: number;
    notAvailable: number;
    needsReview: number;
  };
  onClearDiagnostics: () => void;
  onRunCheckAgain: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const stages = useMemo(
    () =>
      computeStages(
        props.selectedIpo,
        props.effectiveRegistrar,
        props.isAutomatedSupported,
        props.panSyncState,
        props.jobCreationState,
        props.activeJob,
        props.isCreatingJob,
        props.isPolling,
        props.jobError,
        props.uiApplicants,
      ),
    [
      props.selectedIpo,
      props.effectiveRegistrar,
      props.isAutomatedSupported,
      props.panSyncState,
      props.jobCreationState,
      props.activeJob,
      props.isCreatingJob,
      props.isPolling,
      props.jobError,
      props.uiApplicants,
    ],
  );

  const getBadgeColor = (status: StageStatus) => {
    switch (status) {
      case 'SUCCESS':
        return { bg: '#166534', fg: '#86EFAC' };
      case 'RUNNING':
        return { bg: '#854D0E', fg: '#FDE047' };
      case 'FAILED':
        return { bg: '#991B1B', fg: '#FCA5A5' };
      case 'SKIPPED':
        return { bg: '#374151', fg: '#9CA3AF' };
      case 'WAITING':
      default:
        return { bg: '#1E293B', fg: '#64748B' };
    }
  };

  return (
    <View style={diagStyles.container}>
      {/* Panel Header */}
      <View style={diagStyles.headerRow}>
        <View style={diagStyles.titleGroup}>
          <Feather name="terminal" size={18} color="#F59E0B" />
          <Text style={diagStyles.titleText}>DEVELOPER DIAGNOSTICS</Text>
          <Text style={diagStyles.tagBadge}>DEV ONLY</Text>
        </View>
        <TouchableOpacity
          onPress={() => setIsExpanded(!isExpanded)}
          style={diagStyles.expandToggle}
        >
          <Text style={diagStyles.expandToggleText}>
            {isExpanded ? 'Collapse ▲' : 'Expand ▼'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Controls */}
      <View style={diagStyles.controlsRow}>
        <TouchableOpacity
          style={diagStyles.controlBtn}
          onPress={props.onClearDiagnostics}
        >
          <Feather name="trash-2" size={14} color="#94A3B8" />
          <Text style={diagStyles.controlBtnText}>Clear Diagnostics</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[diagStyles.controlBtn, diagStyles.controlBtnPrimary]}
          onPress={props.onRunCheckAgain}
        >
          <Feather name="refresh-cw" size={14} color="#38BDF8" />
          <Text style={[diagStyles.controlBtnText, { color: '#38BDF8' }]}>
            Run Check Again
          </Text>
        </TouchableOpacity>
      </View>

      {isExpanded && (
        <View style={diagStyles.body}>
          {/* RUNTIME IDENTITY & API ENVIRONMENT */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>RUNTIME IDENTITY & API ENVIRONMENT</Text>
            <Text style={diagStyles.diagCodeLine}>
              APP DEBUG BUILD: <Text style={{ color: '#F59E0B', fontWeight: 'bold' }}>{props.appBuildMarker}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              API Base URL: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>{props.apiBaseUrl}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Device Platform: <Text style={diagStyles.diagVal}>Expo Go / Mobile</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              User ID: <Text style={diagStyles.diagVal}>{props.userId || 'default-user'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Backend Health: <Text style={{ color: props.healthState.httpStatus === 200 ? '#4ADE80' : '#EF4444', fontWeight: 'bold' }}>{props.healthState.status}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Health Latency: <Text style={diagStyles.diagVal}>{props.healthState.durationMs !== undefined ? `${props.healthState.durationMs} ms` : 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Health Target URL: <Text style={diagStyles.diagVal}>{props.healthState.url}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              API Timeout Configured: <Text style={diagStyles.diagVal}>15000 ms</Text>
            </Text>
          </View>

          {/* IPO ID RESOLUTION SECTION */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>IPO ID RESOLUTION</Text>
            <Text style={diagStyles.diagCodeLine}>
              Selected Name: <Text style={diagStyles.diagVal}>{props.ipoResolution?.selectedName || props.selectedIpo?.ipo_name || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Local ID: <Text style={diagStyles.diagVal}>{props.ipoResolution?.localId || props.selectedIpo?.id || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Backend ID: <Text style={{ color: props.ipoResolution?.backendId && props.ipoResolution?.backendId !== 'NONE' && props.ipoResolution?.backendId !== 'NOT LINKED' ? '#4ADE80' : '#F59E0B', fontWeight: 'bold' }}>{props.ipoResolution?.backendId || 'NOT LINKED'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Resolution: <Text style={{ color: props.ipoResolution?.resolutionStatus === 'SUCCESS' ? '#4ADE80' : props.ipoResolution?.resolutionStatus === 'NOT_SYNCHRONIZED' ? '#F59E0B' : props.ipoResolution?.resolutionStatus === 'FAILED' ? '#EF4444' : '#64748B', fontWeight: 'bold' }}>{props.ipoResolution?.resolutionStatus || 'WAITING'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Resolution Method: <Text style={diagStyles.diagVal}>{props.ipoResolution?.resolutionMethod || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Sent to createJob: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>{props.ipoResolution?.sentToCreateJob || 'N/A'}</Text>
            </Text>
          </View>
          {/* ABORTED ORIGIN BANNER (If Abort Error Triggered) */}
          {(props.abortedOrigin || (props.jobError && (props.jobError.includes('Aborted') || props.jobError.includes('abort')))) && (
            <View style={diagStyles.abortedAlertCard}>
              <View style={diagStyles.abortedAlertHeader}>
                <Feather name="alert-octagon" size={18} color="#EF4444" />
                <Text style={diagStyles.abortedAlertTitle}>
                  &gt;&gt;&gt; ABORTED ORIGIN TRACE &lt;&lt;&lt;
                </Text>
              </View>
              <Text style={diagStyles.diagCodeLine}>
                Function: <Text style={diagStyles.diagVal}>{props.abortedOrigin?.source || 'startPollingJob'}</Text>
              </Text>
              <Text style={diagStyles.diagCodeLine}>
                Operation: <Text style={diagStyles.diagVal}>{props.abortedOrigin?.operation || 'GET /api/v1/allotment/jobs/:id'}</Text>
              </Text>
              <Text style={diagStyles.diagCodeLine}>
                Timestamp: <Text style={diagStyles.diagVal}>{props.abortedOrigin?.timestamp || 'N/A'}</Text>
              </Text>
              <Text style={diagStyles.diagCodeLine}>
                Error Name: <Text style={diagStyles.diagVal}>{props.abortedOrigin?.errorName || 'AbortError'}</Text>
              </Text>
              <Text style={diagStyles.diagCodeLine}>
                Error Message: <Text style={diagStyles.diagVal}>{props.abortedOrigin?.errorMessage || props.jobError || 'Aborted'}</Text>
              </Text>
            </View>
          )}

          {/* CREATE JOB TIMING SECTION */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>CREATE JOB TIMING</Text>
            <Text style={{ color: '#38BDF8', fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', marginBottom: 2 }}>
              Frontend Trace:
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Started: <Text style={diagStyles.diagVal}>{props.jobTiming?.frontendStarted || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Completed: <Text style={diagStyles.diagVal}>{props.jobTiming?.frontendCompleted || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Duration: <Text style={diagStyles.diagValBold}>{props.jobTiming?.frontendDurationMs !== undefined ? `${props.jobTiming.frontendDurationMs} ms` : 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Aborted: <Text style={{ color: props.jobTiming?.aborted ? '#EF4444' : '#4ADE80' }}>{props.jobTiming?.aborted ? 'YES' : 'NO'}</Text>
            </Text>

            <Text style={{ color: '#38BDF8', fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', marginTop: 6, marginBottom: 2 }}>
              Backend Trace:
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Received: <Text style={diagStyles.diagVal}>{props.jobTiming?.backendReceived || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              IPO Resolved: <Text style={diagStyles.diagVal}>{props.jobTiming?.backendIpoResolved || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Registrar Resolved: <Text style={diagStyles.diagVal}>{props.jobTiming?.backendRegistrarResolved || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              DB Job Created: <Text style={diagStyles.diagVal}>{props.jobTiming?.backendDbCreated || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Worker Dispatched: <Text style={diagStyles.diagVal}>{props.jobTiming?.backendWorkerDispatched || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              HTTP Response: <Text style={diagStyles.diagValBold}>{props.jobCreationState.httpStatus ? `HTTP ${props.jobCreationState.httpStatus}` : 'N/A'}</Text>
            </Text>
          </View>

          {/* Current Job Error Trace */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>1. Current jobError State</Text>
            <Text style={diagStyles.diagCodeLine}>
              Value: <Text style={{ color: props.jobError ? '#EF4444' : '#4ADE80', fontWeight: 'bold' }}>{props.jobError || 'null (Clean)'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Error Source: <Text style={diagStyles.diagVal}>{props.lastErrorOrigin?.source || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Error Type: <Text style={diagStyles.diagVal}>{props.lastErrorOrigin?.errorName || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Error Message: <Text style={diagStyles.diagVal}>{props.lastErrorOrigin?.errorMessage || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Timestamp: <Text style={diagStyles.diagVal}>{props.lastErrorOrigin?.timestamp || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Error Cleared: <Text style={{ color: props.jobError ? '#F87171' : '#4ADE80' }}>{props.jobError ? 'NO' : 'YES'}</Text>
            </Text>
          </View>

          {/* Stage Pipeline (16 Stages) */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>2. Live Stage Pipeline (16 Stages)</Text>
            {stages.map((st) => {
              const badge = getBadgeColor(st.status);
              return (
                <View key={st.id} style={diagStyles.stageRow}>
                  <Text style={diagStyles.stageName}>{st.name}</Text>
                  <View style={diagStyles.stageRight}>
                    {st.detail ? (
                      <Text style={diagStyles.stageDetailText} numberOfLines={1}>
                        {st.detail}
                      </Text>
                    ) : null}
                    <View style={[diagStyles.badgeBox, { backgroundColor: badge.bg }]}>
                      <Text style={[diagStyles.badgeText, { color: badge.fg }]}>
                        [{st.status}]
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Job Information */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>3. Backend Job Info</Text>
            {props.activeJob ? (
              <>
                <Text style={diagStyles.diagCodeLine}>
                  Job ID: <Text style={diagStyles.diagVal}>{props.activeJob.id.slice(0, 8)}...{props.activeJob.id.slice(-4)}</Text>
                </Text>
                <Text style={diagStyles.diagCodeLine}>
                  Job Status: <Text style={diagStyles.diagValBold}>{props.activeJob.status}</Text>
                </Text>
                <Text style={diagStyles.diagCodeLine}>
                  Total Items: <Text style={diagStyles.diagVal}>{props.activeJob.totalChecks}</Text>
                </Text>
                <Text style={diagStyles.diagCodeLine}>
                  Processed: <Text style={diagStyles.diagVal}>{props.activeJob.processedChecks}</Text>
                </Text>
                <Text style={diagStyles.diagCodeLine}>
                  Successful: <Text style={diagStyles.diagVal}>{props.activeJob.successfulChecks}</Text>
                </Text>
                <Text style={diagStyles.diagCodeLine}>
                  Failed: <Text style={diagStyles.diagVal}>{props.activeJob.failedChecks}</Text>
                </Text>
              </>
            ) : (
              <Text style={diagStyles.diagMutedText}>No active job created yet.</Text>
            )}
          </View>

          {/* PAN Sync & Job Creation Results */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>4. PAN Sync & Job Creation</Text>
            <Text style={diagStyles.diagCodeLine}>
              PAN Sync Status: <Text style={{ color: props.panSyncState.status === 'SUCCESS' ? '#4ADE80' : '#F59E0B' }}>{props.panSyncState.status}</Text> (HTTP {props.panSyncState.httpStatus || 200}, Synced: {props.panSyncState.syncedCount || 0})
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Create Job Status: <Text style={{ color: props.jobCreationState.status === 'SUCCESS' ? '#4ADE80' : props.jobCreationState.status === 'FAILED' ? '#EF4444' : '#F59E0B' }}>{props.jobCreationState.status}</Text> (HTTP {props.jobCreationState.httpStatus || 'N/A'})
            </Text>
          </View>

          {/* Polling Details */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>5. Polling Details</Text>
            <Text style={diagStyles.diagCodeLine}>
              Poll Attempt Count: <Text style={diagStyles.diagVal}>{props.pollingDiag.attemptCount}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Last Polled Status: <Text style={diagStyles.diagVal}>{props.pollingDiag.lastStatus || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Last Poll HTTP: <Text style={diagStyles.diagVal}>{props.pollingDiag.lastHttp || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Last Poll Time: <Text style={diagStyles.diagVal}>{props.pollingDiag.lastTime || 'N/A'}</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Polling Active: <Text style={{ color: props.pollingDiag.active ? '#38BDF8' : '#94A3B8' }}>{props.pollingDiag.active ? 'YES' : 'NO'}</Text>
            </Text>
          </View>

          {/* AbortController & API Request Traces */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>6. API Request Traces & Abort Log</Text>
            {props.apiTraces.length > 0 ? (
              props.apiTraces.map((tr) => (
                <View key={tr.id} style={diagStyles.apiTraceItem}>
                  <Text style={diagStyles.apiTraceMethod}>
                    {tr.method} {tr.fullUrl || tr.path}
                  </Text>
                  <Text style={diagStyles.apiTraceSub}>
                    {tr.aborted ? (
                      <Text style={{ color: '#EF4444' }}>ABORTED ({tr.errorMessage || 'AbortError'})</Text>
                    ) : (
                      <Text style={{ color: tr.success ? '#4ADE80' : '#F87171' }}>
                        HTTP {tr.status} ({tr.durationMs}ms)
                      </Text>
                    )}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={diagStyles.diagMutedText}>No API requests recorded yet.</Text>
            )}
          </View>

          {/* Frontend Mapping Breakdown */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>7. Frontend Mapping Summary</Text>
            <Text style={diagStyles.diagCodeLine}>
              Rule: <Text style={diagStyles.diagVal}>APPLICATION_NOT_FOUND ➔ NO_RECORD (No Record Found)</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Counters: Total={props.summaryCounts.total}, Allotted={props.summaryCounts.allotted}, NotAllotted={props.summaryCounts.notAllotted}, NoRecord={props.summaryCounts.noRecord}, NotDeclared={props.summaryCounts.notAvailable}, NeedsReview={props.summaryCounts.needsReview}
            </Text>
          </View>

          {/* Chronological Event Log */}
          <View style={diagStyles.sectionBox}>
            <Text style={diagStyles.sectionTitle}>8. Chronological Event Log ({props.eventLogs.length})</Text>
            <ScrollView style={diagStyles.logScrollView} nestedScrollEnabled>
              {props.eventLogs.map((lg, idx) => (
                <Text
                  key={idx}
                  style={[
                    diagStyles.logText,
                    lg.type === 'error'
                      ? { color: '#F87171' }
                      : lg.type === 'warn'
                      ? { color: '#FBBF24' }
                      : lg.type === 'success'
                      ? { color: '#4ADE80' }
                      : { color: '#94A3B8' },
                  ]}
                >
                  [{lg.timestamp}] {lg.message}
                </Text>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

// ==========================================
// CONFETTI ANIMATION COMPONENT
// ==========================================

const NUM_CONFETTI = 45;
const CONFETTI_COLORS = [
  '#10B981',
  '#F59E0B',
  '#3B82F6',
  '#EC4899',
  '#8B5CF6',
  '#EF4444',
  '#FBBF24',
  '#06B6D4',
];

const ConfettiParticle = ({ index }: { index: number }) => {
  const animY = useRef(new Animated.Value(-20)).current;
  const animX = useRef(new Animated.Value(0)).current;
  const animRotate = useRef(new Animated.Value(0)).current;
  const animOpacity = useRef(new Animated.Value(1)).current;

  const randomLeft = useMemo(() => Math.random() * 95, []);
  const randomColor = useMemo(
    () => CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    [index],
  );
  const randomSize = useMemo(() => 6 + Math.random() * 8, []);
  const randomShape = useMemo(
    () => (index % 2 === 0 ? 'rect' : 'circle'),
    [index],
  );

  useEffect(() => {
    const delay = Math.random() * 400;
    const duration = 2400 + Math.random() * 800;
    const xOffset = (Math.random() - 0.5) * 140;

    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(animY, {
          toValue: 650,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(animX, {
          toValue: xOffset,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(animRotate, {
          toValue: 360 * (Math.random() > 0.5 ? 2 : -2),
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(animOpacity, {
          toValue: 0,
          duration,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [animY, animX, animRotate, animOpacity]);

  const spin = animRotate.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: `${randomLeft}%`,
        width: randomSize,
        height: randomShape === 'circle' ? randomSize : randomSize * 1.5,
        borderRadius: randomShape === 'circle' ? randomSize / 2 : 2,
        backgroundColor: randomColor,
        opacity: animOpacity,
        transform: [
          { translateY: animY },
          { translateX: animX },
          { rotate: spin },
        ],
      }}
    />
  );
};

const ConfettiContainer = () => {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {Array.from({ length: NUM_CONFETTI }).map((_, i) => (
        <ConfettiParticle key={i} index={i} />
      ))}
    </View>
  );
};

// ==========================================
// MAIN SCREEN COMPONENT
// ==========================================

// Global warm cache across component remounts
const ALLOTMENT_IPOS_CACHE_STORAGE_KEY = '@ipovault_cached_allotment_backend_ipos_v1';
let _sharedAllotmentIposCache: BackendIpo[] = [];

export default function AllotmentCheckerScreen({ isTabScreen }: { isTabScreen?: boolean } = {}) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { isNonPro } = useAppExperience();
  const isPrimaryTab = Boolean(isTabScreen && isNonPro);
  const router = useRouter();
  const params = useLocalSearchParams<{ ipoId?: string; id?: string }>();
  const routeIpoId = params.ipoId || params.id;
  const autoCheckedRouteRef = useRef<string | null>(null);
  const dismissedRouteIpoIdRef = useRef<string | null>(null);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { ipos, applications, users, allotments, updateApplication, saveAllotmentResult, refresh } = useDB();
  const { user } = useAuth();
  const [selectedAppForUpdate, setSelectedAppForUpdate] = useState<ApplicationWithDetails | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [quickLogoErrors, setQuickLogoErrors] = useState<Record<string, boolean>>({});
  const [sessionAllotments, setSessionAllotments] = useState<AllotmentHistoryItem[]>([]);
  const inFlightCreatedAppsRef = useRef<Set<string>>(new Set());

  // Self-healing: Clean up any duplicate applications and allotments for the same user + IPO across local & backend IDs
  useEffect(() => {
    const healDuplicates = async () => {
      try {
        if (!isDatabaseOpen(db)) return;
        // Step 1: Transfer 'Allotted' status & shares to the keeper application before pruning (respecting category)
        await safeRunAsync(
          db,
          `UPDATE ipo_applications
           SET status = 'Allotted',
               shares_count = COALESCE(
                 (SELECT MAX(d.shares_count) FROM ipo_applications d 
                  WHERE d.user_id = ipo_applications.user_id 
                    AND COALESCE(NULLIF(d.category, ''), 'RETAIL') = COALESCE(NULLIF(ipo_applications.category, ''), 'RETAIL')
                    AND d.deleted_at IS NULL
                    AND (d.ipo_id = ipo_applications.ipo_id OR d.ipo_id IN (SELECT id FROM ipo_listings WHERE backend_ipo_id = ipo_applications.ipo_id))),
                 shares_count
               )
           WHERE deleted_at IS NULL
             AND EXISTS (
               SELECT 1 FROM ipo_applications d
               WHERE d.user_id = ipo_applications.user_id
                 AND COALESCE(NULLIF(d.category, ''), 'RETAIL') = COALESCE(NULLIF(ipo_applications.category, ''), 'RETAIL')
                 AND d.deleted_at IS NULL
                 AND (d.ipo_id = ipo_applications.ipo_id OR d.ipo_id IN (SELECT id FROM ipo_listings WHERE backend_ipo_id = ipo_applications.ipo_id))
                 AND (d.status = 'Allotted' OR d.status = 'Partially Allotted')
             )`,
          [],
          'AllotmentChecker.healDuplicates.step1'
        );

        // Step 2: Soft-delete duplicate applications for the same user, IPO, and category
        await safeRunAsync(
          db,
          `UPDATE ipo_applications
           SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id IN (
             SELECT a.id
             FROM ipo_applications a
             JOIN ipo_applications b ON a.user_id = b.user_id 
               AND COALESCE(NULLIF(a.category, ''), 'RETAIL') = COALESCE(NULLIF(b.category, ''), 'RETAIL')
               AND a.id > b.id
               AND a.deleted_at IS NULL
               AND b.deleted_at IS NULL
             LEFT JOIN ipo_listings la ON a.ipo_id = la.id
             LEFT JOIN ipo_listings lb ON b.ipo_id = lb.id
             WHERE (
               a.ipo_id = b.ipo_id
               OR (la.backend_ipo_id IS NOT NULL AND la.backend_ipo_id = lb.backend_ipo_id)
               OR (la.ipo_name IS NOT NULL AND lb.ipo_name IS NOT NULL AND la.ipo_name != 'IPO' AND lb.ipo_name != 'IPO' AND LOWER(TRIM(la.ipo_name)) = LOWER(TRIM(lb.ipo_name)))
               OR (a.ipo_id = lb.backend_ipo_id)
               OR (b.ipo_id = la.backend_ipo_id)
               OR (LOWER(TRIM(a.ipo_id)) = LOWER(TRIM(b.ipo_id)))
             )
             AND (
               -- Never delete if raw categories differ or if shares_count differ!
               (a.category = b.category OR (a.category IS NULL AND b.category IS NULL))
               AND (a.shares_count = b.shares_count OR a.shares_count IS NULL OR b.shares_count IS NULL)
             )
           )`,
          [],
          'AllotmentChecker.healDuplicates.step2'
        );

        // Step 3: Delete orphaned and duplicate allotments for the same category
        await safeRunAsync(
          db,
          `DELETE FROM ipo_allotments
           WHERE application_id NOT IN (SELECT id FROM ipo_applications WHERE deleted_at IS NULL)
              OR id IN (
                SELECT a.id
                FROM ipo_allotments a
                JOIN ipo_allotments b ON a.user_id = b.user_id AND a.id > b.id
                JOIN ipo_applications app_a ON a.application_id = app_a.id
                JOIN ipo_applications app_b ON b.application_id = app_b.id
                  AND COALESCE(NULLIF(app_a.category, ''), 'RETAIL') = COALESCE(NULLIF(app_b.category, ''), 'RETAIL')
                LEFT JOIN ipo_listings la ON a.ipo_id = la.id
                LEFT JOIN ipo_listings lb ON b.ipo_id = lb.id
                WHERE (
                  a.ipo_id = b.ipo_id
                  OR (la.backend_ipo_id IS NOT NULL AND la.backend_ipo_id = lb.backend_ipo_id)
                  OR (la.ipo_name IS NOT NULL AND lb.ipo_name IS NOT NULL AND LOWER(TRIM(la.ipo_name)) = LOWER(TRIM(lb.ipo_name)))
                  OR (a.ipo_id = lb.backend_ipo_id)
                  OR (b.ipo_id = la.backend_ipo_id)
                )
              )`,
          [],
          'AllotmentChecker.healDuplicates.step3'
        );
        await refresh();
      } catch (err) {
        if (!isClosedResourceError(err)) {
          console.warn('[AllotmentChecker] Duplicate healing error:', err);
        }
      }
    };
    healDuplicates();
  }, [db, refresh]);

  // Active user ID for backend scoping
  const activeUserId = useMemo(() => {
    return resolveCanonicalBrokerUserId(user, users);
  }, [user, users]);

  // Backend-published IPOs state (hydrated synchronously from warm memory if available)
  const [backendIpos, setBackendIpos] = useState<BackendIpo[]>(() => {
    if (_sharedAllotmentIposCache.length > 0) return _sharedAllotmentIposCache;
    const serviceCache = backendIpoApiService.getCachedIpos();
    if (serviceCache && serviceCache.length > 0) {
      _sharedAllotmentIposCache = serviceCache;
      return serviceCache;
    }
    return [];
  });
  const [isLoadingPublishedIpos, setIsLoadingPublishedIpos] = useState(false);
  const [directSelectedIpo, setDirectSelectedIpo] = useState<AllotmentCheckerIpoItem | null>(null);
  const [ipoSearchQuery, setIpoSearchQuery] = useState('');

  // Immediate offline-first hydration from SQLite & persistent storage
  useEffect(() => {
    let isMounted = true;
    const hydrateLocalCache = async () => {
      if (_sharedAllotmentIposCache.length > 0) return;

      // Tier 1: Local SQLite ipo_master table (near-instant 1-3ms)
      try {
        if (db) {
          const sqliteCached = await getCachedBackendIpos(db);
          if (isMounted && sqliteCached.length > 0) {
            _sharedAllotmentIposCache = sqliteCached;
            setBackendIpos(sqliteCached);
            return;
          }
        }
      } catch (err) {
        // Fallback to AsyncStorage
      }

      // Tier 2: SafeAsyncStorage fallback
      try {
        const rawCached = await safeAsyncStorage.getItem(ALLOTMENT_IPOS_CACHE_STORAGE_KEY);
        if (isMounted && rawCached) {
          const parsed = JSON.parse(rawCached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _sharedAllotmentIposCache = parsed;
            setBackendIpos(parsed);
          }
        }
      } catch (err) {}
    };

    hydrateLocalCache();
    return () => {
      isMounted = false;
    };
  }, [db]);

  // Helper to append to chronological log
  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const timestamp =
      new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0');
    setEventLogs((prev) => [{ timestamp, message, type }, ...prev].slice(0, 60));
  }, []);

  const fetchPublishedIpos = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      try {
        if (_sharedAllotmentIposCache.length === 0 && backendIpos.length === 0) {
          setIsLoadingPublishedIpos(true);
        }
        const items = await backendIpoApiService.listBackendIpos(undefined, options);
        if (items && items.length > 0) {
          _sharedAllotmentIposCache = items;
          setBackendIpos(items);
          addLog(`Loaded ${items.length} published IPOs from backend`, 'info');

          // Asynchronously persist to SQLite and AsyncStorage for future instant loads
          if (db) {
            saveBackendIposToCache(db, items).catch(() => {});
          }
          safeAsyncStorage
            .setItem(ALLOTMENT_IPOS_CACHE_STORAGE_KEY, JSON.stringify(items.slice(0, 100)))
            .catch(() => {});
        }
      } catch (err: any) {
        addLog(`Failed to load published IPOs: ${err?.message || String(err)}`, 'warn');
      } finally {
        setIsLoadingPublishedIpos(false);
      }
    },
    [addLog, db, backendIpos.length],
  );

  useEffect(() => {
    fetchPublishedIpos();
  }, [fetchPublishedIpos]);

  // Background live revalidation on sync events
  useEffect(() => {
    const unsub = backendSyncEmitter.subscribe((event) => {
      if (event === 'applications') return;
      fetchPublishedIpos({ forceRefresh: true });
    });
    return unsub;
  }, [fetchPublishedIpos]);

  // Selected IPO — Defaults to NULL on initial mount (idle state)
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(null);
  const [showIpoPicker, setShowIpoPicker] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>('all');
  const [installDate, setInstallDate] = useState<Date | null>(null);
  const [isMaskNames, setIsMaskNames] = useState(false);

  useEffect(() => {
    let isMounted = true;
    safeAsyncStorage
      .getItem(MASK_APPLICANT_NAMES_KEY)
      .then((stored) => {
        if (isMounted && stored !== null) {
          setIsMaskNames(stored === 'true');
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleMaskNames = useCallback(() => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setIsMaskNames((prev) => {
      const next = !prev;
      void safeAsyncStorage.setItem(MASK_APPLICANT_NAMES_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    safeAsyncStorage.getItem('@ipovault_install_time').then((stored) => {
      if (stored && isMounted) {
        const ms = Date.parse(stored);
        if (!Number.isNaN(ms)) {
          setInstallDate(new Date(ms));
          return;
        }
      }
      Application.getInstallationTimeAsync()
        .then((date) => {
          if (date && isMounted) {
            setInstallDate(date);
            safeAsyncStorage.setItem('@ipovault_install_time', date.toISOString());
          }
        })
        .catch(() => {
          const curr = new Date();
          if (isMounted) setInstallDate(curr);
          safeAsyncStorage.setItem('@ipovault_install_time', curr.toISOString());
        });
    });
    return () => {
      isMounted = false;
    };
  }, []);
  const [showConfetti, setShowConfetti] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const celebratedJobIdsRef = useRef<Set<string>>(new Set());

  // Reset logo error when selected IPO changes
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [selectedIpoId]);

  // Active Job state
  const [activeJob, setActiveJob] = useState<BackendJobResponse | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  // Diagnostic states
  const [eventLogs, setEventLogs] = useState<LogEntry[]>([]);
  const [apiTraces, setApiTraces] = useState<ApiRequestTrace[]>([]);
  const [panSyncState, setPanSyncState] = useState<PanSyncDiagState>({
    status: 'WAITING',
  });
  const [jobCreationState, setJobCreationState] = useState<JobCreationDiagState>({
    status: 'WAITING',
  });
  const [jobTiming, setJobTiming] = useState<CreateJobTimingState | null>(null);
  const [pollingDiag, setPollingDiag] = useState<PollingDiagState>({
    attemptCount: 0,
    active: false,
  });
  const [lastErrorOrigin, setLastErrorOrigin] = useState<DiagnosticErrorOrigin | null>(null);
  const [abortedOrigin, setAbortedOrigin] = useState<DiagnosticErrorOrigin | null>(null);
  const [ipoResolution, setIpoResolution] = useState<IpoResolutionDiagState>({
    resolutionStatus: 'WAITING',
  });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showDevOption, setShowDevOption] = useState(false);
  const [healthState, setHealthState] = useState<{
    status: string;
    httpStatus?: number;
    durationMs?: number;
    url: string;
  }>({
    status: 'CHECKING...',
    url: `${API_BASE_URL}/api/v1/health`,
  });

  const checkBackendHealth = useCallback(async () => {
    const startMs = Date.now();
    const targetUrl = `${API_BASE_URL}/api/v1/health`;
    try {
      const res = await fetch(targetUrl);
      const duration = Date.now() - startMs;
      if (res.ok) {
        setHealthState({
          status: `SUCCESS (HTTP ${res.status})`,
          httpStatus: res.status,
          durationMs: duration,
          url: targetUrl,
        });
        addLog(`Backend health check PASSED (${duration}ms): HTTP ${res.status} at ${targetUrl}`, 'success');
      } else {
        setHealthState({
          status: `FAILED (HTTP ${res.status})`,
          httpStatus: res.status,
          durationMs: duration,
          url: targetUrl,
        });
        addLog(`Backend health check FAILED (${duration}ms): HTTP ${res.status} at ${targetUrl}`, 'warn');
      }
    } catch (err: any) {
      const duration = Date.now() - startMs;
      setHealthState({
        status: `UNREACHABLE (${err?.message || 'fetch failed'})`,
        durationMs: duration,
        url: targetUrl,
      });
      addLog(`Backend health check UNREACHABLE (${duration}ms): ${err?.message || 'fetch failed'} at ${targetUrl}`, 'error');
    }
  }, [addLog]);

  useEffect(() => {
    checkBackendHealth();
  }, [checkBackendHealth]);

  // Centralized Error Setter
  const setDiagnosticJobError = useCallback(
    (err: unknown, source: string, operation: string) => {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const timestamp =
        new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0');
      const isAborted =
        errorObj.name === 'AbortError' ||
        errorObj.message.includes('Aborted') ||
        errorObj.message.includes('abort') ||
        errorObj.message.includes('cancel');

      const origin: DiagnosticErrorOrigin = {
        source,
        operation,
        timestamp,
        errorName: errorObj.name,
        errorMessage: errorObj.message,
        stack: errorObj.stack,
        isAborted,
      };

      setLastErrorOrigin(origin);
      setJobError(errorObj.message);
      addLog(
        `JobError set by ${source} during ${operation}: [${errorObj.name}] ${errorObj.message}`,
        isAborted ? 'error' : 'warn',
      );

      if (isAborted) {
        setAbortedOrigin(origin);
      }
    },
    [addLog],
  );

  // Polling ref for cleanup
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Published backend IPOs filtered for allotment checking eligibility and within last 30 days, sorted by recency
  const selectableIpos = useMemo((): AllotmentCheckerIpoItem[] => {
    const eligible = backendIpos.filter((b) => isBackendIpoAllotmentEligible(b) && isIpoWithin30Days(b));
    const sorted = sortCheckerIposByAllotmentRecency(eligible);
    return sorted.map(normalizeBackendIpoForChecker);
  }, [backendIpos]);

  // Top 4 latest IPOs for one-tap Quick Check
  const quickCheckIpos = useMemo((): AllotmentCheckerIpoItem[] => {
    return selectableIpos.slice(0, 4);
  }, [selectableIpos]);

  // Filtered selectable IPOs based on search query in the picker modal
  const filteredSelectableIpos = useMemo((): AllotmentCheckerIpoItem[] => {
    if (!ipoSearchQuery.trim()) return selectableIpos;
    const q = ipoSearchQuery.trim().toLowerCase();
    return selectableIpos.filter(
      (item) =>
        item.ipo_name.toLowerCase().includes(q) ||
        (item.symbol && item.symbol.toLowerCase().includes(q)) ||
        (item.company_name && item.company_name.toLowerCase().includes(q))
    );
  }, [selectableIpos, ipoSearchQuery]);

  // Selected IPO object (strictly derived from selectedIpoId, NO fallback auto-selection)
  const selectedIpo = useMemo((): AllotmentCheckerIpoItem | null => {
    if (!selectedIpoId) return null;
    let item: AllotmentCheckerIpoItem | null = null;
    const fromSelectable = selectableIpos.find((i) => i.id === selectedIpoId);
    if (fromSelectable) {
      item = { ...fromSelectable };
    } else {
      const fromAllBackend = backendIpos.find((i) => i.id === selectedIpoId);
      if (fromAllBackend) {
        item = normalizeBackendIpoForChecker(fromAllBackend);
      } else if (directSelectedIpo && directSelectedIpo.id === selectedIpoId) {
        item = { ...directSelectedIpo };
      }
    }
    if (item && (!item.logo_url || item.logo_url.trim() === '')) {
      const localMatch = ipos?.find(
        (i) =>
          i.id === selectedIpoId ||
          (i.ipo_name && item?.ipo_name && i.ipo_name.trim().toLowerCase() === item.ipo_name.trim().toLowerCase()) ||
          (i.symbol && item?.symbol && i.symbol.trim().toLowerCase() === item.symbol.trim().toLowerCase())
      );
      if (localMatch?.logo_url) {
        item.logo_url = localMatch.logo_url;
      }
    }
    return item;
  }, [selectedIpoId, selectableIpos, backendIpos, directSelectedIpo, ipos]);

  // Effective registrar resolution (falls back to keyword matching / registrarConfig when empty)
  const effectiveRegistrar = useMemo(() => {
    if (!selectedIpo) return '';
    const cfg = getRegistrarConfig(selectedIpo.registrar || selectedIpo.ipo_name);
    if (cfg.name !== 'Official Portal') {
      return cfg.name;
    }
    return 'Link Intime India Private Ltd';
  }, [selectedIpo]);

  // Clean registrar name for display (strips (formerly ...) suffix)
  const displayRegistrar = useMemo(() => {
    return (effectiveRegistrar || '')
      .replace(/\s*\(formerly.*?\)/gi, '')
      .trim();
  }, [effectiveRegistrar]);

  // Support level helper for automated checking
  const isAutomatedSupported = useMemo(() => {
    return isAutomatedCheckSupported(effectiveRegistrar);
  }, [effectiveRegistrar]);

  const registrarConfig = useMemo(() => {
    return getRegistrarConfig(effectiveRegistrar);
  }, [effectiveRegistrar]);

  const effectiveRegistrarShortName = useMemo(() => {
    return getRegistrarShortName(effectiveRegistrar);
  }, [effectiveRegistrar]);

  const handleOpenRegistrarWebsite = useCallback(
    async (regName?: string | null) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      const config = getRegistrarConfig(regName || effectiveRegistrar);
      const targetUrl = config.url || 'https://www.bseindia.com/investors/appli_check.aspx';

      try {
        if (Platform.OS !== 'web' && typeof WebBrowser?.openBrowserAsync === 'function') {
          await WebBrowser.openBrowserAsync(targetUrl, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
            controlsColor: '#007AFF',
            toolbarColor: isDark ? '#1C1C1E' : '#FFFFFF',
            showTitle: true,
            enableBarCollapsing: true,
          });
          return;
        }
      } catch (_browserErr) {
        // Fall back to Linking
      }

      try {
        const supported = await Linking.canOpenURL(targetUrl);
        if (supported) {
          await Linking.openURL(targetUrl);
        }
      } catch (linkErr) {
        console.warn('Could not open registrar portal URL:', linkErr);
      }
    },
    [effectiveRegistrar, isDark]
  );

  // Current IPO applications & local user mapping
  const currentApplications = useMemo(() => {
    if (!selectedIpo) return [];
    return applications.filter((app) => {
      if (app.ipo_id === selectedIpo.id || app.ipo_id?.toLowerCase() === selectedIpo.id?.toLowerCase()) {
        return true;
      }
      const localListing = ipos.find((i) => i.id === app.ipo_id);
      if (localListing && (localListing as any).backend_ipo_id === selectedIpo.id) {
        return true;
      }
      if (
        app.ipo_name &&
        selectedIpo.ipo_name &&
        app.ipo_name.toLowerCase().trim() === selectedIpo.ipo_name.toLowerCase().trim()
      ) {
        return true;
      }
      if (
        app.ipo_name &&
        selectedIpo.company_name &&
        app.ipo_name.toLowerCase().trim() === selectedIpo.company_name.toLowerCase().trim()
      ) {
        return true;
      }
      const localSymbol = localListing?.symbol;
      if (
        localSymbol &&
        selectedIpo.symbol &&
        localSymbol.toLowerCase().trim() === selectedIpo.symbol.toLowerCase().trim()
      ) {
        return true;
      }
      return false;
    });
  }, [applications, selectedIpo, ipos]);

  // Cleanup polling interval helper
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
    setPollingDiag((prev) => ({ ...prev, active: false }));
  }, []);

  // Complete reset of previous check context when switching or selecting a new IPO
  const resetCheckState = useCallback(() => {
    stopPolling();
    setActiveJob(null);
    setIsCreatingJob(false);
    setIsPolling(false);
    setJobError(null);
    setJobTiming(null);
    setPanSyncState({ status: 'WAITING' });
    setJobCreationState({ status: 'WAITING' });
    setIpoResolution({ resolutionStatus: 'WAITING' });
    setPollingDiag({ attemptCount: 0, active: false });
    setLastErrorOrigin(null);
    setAbortedOrigin(null);
    setApiTraces([]);
  }, [stopPolling]);

  // Subscribe to ApiClient request events for diagnostics
  useEffect(() => {
    addLog('AllotmentCheckerScreen mounted', 'info');
    const unsubscribe = ApiClient.onRequest((trace) => {
      setApiTraces((prev) => [trace, ...prev].slice(0, 20));
      const statusText = trace.aborted
        ? 'ABORTED'
        : trace.status
        ? String(trace.status)
        : 'PENDING';
      addLog(`[HTTP] ${trace.method} ${trace.fullUrl || trace.path} [${statusText}] (${trace.durationMs}ms)`, 'info');
    });
    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [addLog, stopPolling]);

  // Auto-update application status in database from allotment check results
  const syncApplicationStatusesFromJob = useCallback(
    async (jobItems: BackendJobItem[], overrideIpo?: AllotmentCheckerIpoItem | null) => {
      const currentIpo = overrideIpo || selectedIpo;
      if (!jobItems || jobItems.length === 0 || !currentIpo) return;

      let hasChanges = false;
      let successfulAllotmentsCount = 0;
      let firstAllottedApplicantName = '';
      let firstAllottedShares = 0;
      for (const item of jobItems) {
        const backendStatus = (item.status || '').toUpperCase();
        // Only update if definitive outcome: ALLOTTED, PARTIALLY_ALLOTTED, or NOT_ALLOTTED.
        if (
          backendStatus !== 'ALLOTTED' &&
          backendStatus !== 'PARTIALLY_ALLOTTED' &&
          backendStatus !== 'NOT_ALLOTTED'
        ) {
          continue;
        }

        const targetAppStatus: ApplicationStatus =
          backendStatus === 'ALLOTTED' || backendStatus === 'PARTIALLY_ALLOTTED'
            ? 'Allotted'
            : 'Not Allotted';

        const backendMask = (item.maskedId || '').trim().toUpperCase();
        const matchingUsers = users.filter((u) => {
          const p = (u.pan_number || '').trim().toUpperCase();
          if (!p) return false;
          return (
            (p.length === 10 && getBackendMaskedPan(p) === backendMask) ||
            maskPan(p).toUpperCase() === backendMask ||
            p === backendMask ||
            p === (item as any).pan
          );
        });

        // If user got allotted, ensure sessionAllotments immediately tracks this outcome
        if (backendStatus === 'ALLOTTED' || backendStatus === 'PARTIALLY_ALLOTTED') {
          successfulAllotmentsCount++;
          if (!firstAllottedApplicantName && matchingUsers[0]?.name) {
            firstAllottedApplicantName = matchingUsers[0].name;
            firstAllottedShares =
              typeof item.sharesAllotted === 'number' && item.sharesAllotted > 0
                ? item.sharesAllotted
                : (getAuthoritativeIpoLotSize(currentIpo, backendIpos, ipos) || 0);
          }
          const checkedAt = item.checkedAt || new Date().toISOString();
          const firstUser = matchingUsers[0];

          if (item.categoryResults && item.categoryResults.length > 0) {
            for (const catRes of item.categoryResults) {
              const catStatus = (catRes.status || '').toUpperCase();
              if (catStatus === 'ALLOTTED' || catStatus === 'PARTIALLY_ALLOTTED') {
                const allottedShares =
                  typeof catRes.sharesAllotted === 'number' && catRes.sharesAllotted > 0
                    ? catRes.sharesAllotted
                    : getAuthoritativeIpoLotSize(currentIpo, backendIpos, ipos) || undefined;
                const catName = (catRes.category || 'RETAIL').toUpperCase();
                const key = `session_${currentIpo.id}_${firstUser?.id || item.maskedId}_${catName}`;

                setSessionAllotments((prev) => {
                  if (prev.some((p) => p.id === key)) return prev;
                  return [
                    ...prev,
                    {
                      id: key,
                      ipoId: currentIpo.id,
                      ipoName: currentIpo.company_name || currentIpo.ipo_name || 'IPO',
                      ipoOpenDate: (currentIpo as any).open_date || (currentIpo as any).openDate,
                      userName: firstUser?.name || 'Applicant',
                      pan: firstUser?.pan_number || '',
                      status: catStatus,
                      sharesAllotted: allottedShares,
                      checkedAt,
                      checkedAtFormatted: formatAllotmentTimestamp(checkedAt),
                      category: catName,
                    },
                  ];
                });
              }
            }
          } else {
            const allottedShares =
              typeof item.sharesAllotted === 'number' && item.sharesAllotted > 0
                ? item.sharesAllotted
                : getAuthoritativeIpoLotSize(currentIpo, backendIpos, ipos) || undefined;
            setSessionAllotments((prev) => {
              const key = `session_${currentIpo.id}_${firstUser?.id || item.maskedId}`;
              if (prev.some((p) => p.id === key)) return prev;
              return [
                ...prev,
                {
                  id: key,
                  ipoId: currentIpo.id,
                  ipoName: currentIpo.company_name || currentIpo.ipo_name || 'IPO',
                  ipoOpenDate: (currentIpo as any).open_date || (currentIpo as any).openDate,
                  userName: firstUser?.name || 'Applicant',
                  pan: firstUser?.pan_number || '',
                  status: backendStatus,
                  sharesAllotted: allottedShares,
                  checkedAt,
                  checkedAtFormatted: formatAllotmentTimestamp(checkedAt),
                },
              ];
            });
          }
        }

        for (const usr of matchingUsers) {
          // Find ALL applications for this user and this IPO (handling SEBI dual bids)
          const userExistingApps = applications.filter((app) => {
            const isSameUser = app.user_id === usr.id;
            if (!isSameUser) return false;
            const appIpo = ipos.find((i) => i.id === app.ipo_id);
            const isSameIpo =
              app.ipo_id === currentIpo.id ||
              app.ipo_id?.toLowerCase() === currentIpo.id?.toLowerCase() ||
              appIpo?.backend_ipo_id === currentIpo.id ||
              (app.ipo_name &&
                currentIpo.ipo_name &&
                app.ipo_name.toLowerCase().trim() === currentIpo.ipo_name.toLowerCase().trim()) ||
              (app.ipo_name &&
                currentIpo.company_name &&
                app.ipo_name.toLowerCase().trim() === currentIpo.company_name.toLowerCase().trim()) ||
              (appIpo?.symbol &&
                currentIpo.symbol &&
                appIpo.symbol.toLowerCase().trim() === currentIpo.symbol.toLowerCase().trim());
            return isSameIpo;
          });

          if (userExistingApps.length > 0) {
            if (item.categoryResults && item.categoryResults.length > 0) {
              const dedupedCats = deduplicateCategoryRecords(item.categoryResults);
              const matchedAppIds = new Set<string>();

              for (const catRes of dedupedCats) {
                const normCat = mapRegistrarCategory(catRes.category);

                // Multi-attribute scoring for candidate application matching
                const unmatchedApps = userExistingApps.filter((a) => !matchedAppIds.has(a.id));
                let bestApp: typeof userExistingApps[0] | undefined = undefined;
                let bestScore = -Infinity;

                for (const app of unmatchedApps) {
                  let score = 0;
                  const appAppNo = (app as any).application_number;
                  if (catRes.applicationNumber && appAppNo && String(appAppNo).trim() === String(catRes.applicationNumber).trim()) {
                    score += 1000;
                  }

                  const appCat = mapRegistrarCategory(app.category);
                  const catMatches = appCat === normCat;
                  if (catMatches) {
                    score += 100;
                  }

                  const appAppliedShares = app.shares_count || app.quantity || 0;
                  if (catRes.sharesApplied != null && catRes.sharesApplied > 0 && appAppliedShares > 0) {
                    if (catRes.sharesApplied === appAppliedShares) {
                      score += 150;
                    } else {
                      score -= 50;
                    }
                  }

                  if (catRes.rawCategory && app.category && String(catRes.rawCategory).trim().toUpperCase() === String(app.category).trim().toUpperCase()) {
                    score += 50;
                  }

                  if (score > bestScore) {
                    bestScore = score;
                    bestApp = app;
                  }
                }

                let matchedApp: typeof userExistingApps[0] | undefined = undefined;
                if (bestApp && (bestScore > 0 || unmatchedApps.length === 1)) {
                  matchedApp = bestApp;
                }

                const catStatus = (catRes.status || '').toUpperCase();
                const isCatAllotted =
                  catStatus === 'ALLOTTED' || catStatus === 'PARTIALLY_ALLOTTED';

                // If user received an allotment in a verified category not yet tracked in SQLite applications, auto-create it
                if (!matchedApp && isCatAllotted) {
                  try {
                    const newAppId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const nowIso = new Date().toISOString();
                    const initialShares = catRes.sharesAllotted || getAuthoritativeIpoLotSize(currentIpo, backendIpos, ipos, normCat) || 0;
                    await safeRunAsync(
                      db,
                      `INSERT INTO ipo_applications (id, user_id, ipo_id, category, status, shares_count, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      [newAppId, usr.id, currentIpo.id, normCat, 'Allotted', initialShares, user?.uid || null, nowIso, nowIso],
                      'AllotmentChecker.autoCreateApp'
                    );
                    matchedApp = {
                      id: newAppId,
                      user_id: usr.id,
                      ipo_id: currentIpo.id,
                      category: normCat,
                      status: 'Allotted',
                      shares_count: initialShares,
                    } as any;
                  } catch (createErr) {
                    console.warn('[AllotmentChecker] Error auto-creating application for category:', createErr);
                  }
                }

                if (matchedApp) {
                  matchedAppIds.add(matchedApp.id);
                  try {
                    const appliedShares = catRes.sharesApplied || matchedApp.shares_count || matchedApp.quantity || 0;
                    const lotSize = getAuthoritativeIpoLotSize(currentIpo, backendIpos, ipos, normCat);

                    let effectiveCatStatus = catStatus;
                    if (catRes.sharesAllotted != null && catRes.sharesAllotted > 0) {
                      if (appliedShares > 0 && catRes.sharesAllotted < appliedShares) {
                        effectiveCatStatus = 'PARTIALLY_ALLOTTED';
                      } else if (effectiveCatStatus !== 'PARTIALLY_ALLOTTED') {
                        effectiveCatStatus = 'ALLOTTED';
                      }
                    } else if ((catRes as any).allottedLots != null && (catRes as any).allottedLots > 0) {
                      const derivedShares = (catRes as any).allottedLots * lotSize;
                      if (appliedShares > 0 && derivedShares < appliedShares) {
                        effectiveCatStatus = 'PARTIALLY_ALLOTTED';
                      }
                    }

                    let sharesCount = 0;
                    if (isCatAllotted) {
                      if (catRes.sharesAllotted != null && catRes.sharesAllotted > 0) {
                        sharesCount = catRes.sharesAllotted;
                      } else if ((catRes as any).allottedLots != null && (catRes as any).allottedLots > 0) {
                        sharesCount = (catRes as any).allottedLots * lotSize;
                      } else if (effectiveCatStatus === 'PARTIALLY_ALLOTTED' && appliedShares > lotSize) {
                        sharesCount = lotSize;
                      } else {
                        sharesCount = matchedApp.shares_count || matchedApp.quantity || lotSize;
                      }
                    }

                    const allottedLots = isCatAllotted
                      ? ((catRes as any).allottedLots || Math.max(1, Math.round(sharesCount / lotSize)))
                      : 0;

                    await saveAllotmentResult({
                      application_id: matchedApp.id,
                      user_id: usr.id,
                      ipo_id: matchedApp.ipo_id,
                      allotment_status: effectiveCatStatus,
                      allotted_lots: allottedLots,
                      allotted_shares: sharesCount,
                      registrar: currentIpo.registrar || '',
                      checked_at: item.checkedAt || new Date().toISOString(),
                    });
                    hasChanges = true;
                    addLog(
                      `Allotment verified for ${usr.name} [${formatCategoryDisplayName(normCat)}] (${maskPan(usr.pan_number || '')}) ➔ ${isCatAllotted ? (effectiveCatStatus === 'PARTIALLY_ALLOTTED' ? `Partially Allotted (${sharesCount} sh)` : `Allotted (${sharesCount} sh)`) : 'Not Allotted'}`,
                      'success',
                    );
                  } catch (err) {
                    console.warn('[AllotmentChecker] Error updating category allotment:', err);
                  }
                }
              }
            } else {
              const targetApp =
                userExistingApps.find(
                  (app) => (app.category || 'RETAIL').toUpperCase() === 'RETAIL',
                ) || userExistingApps[0];

              try {
                const isOverallAllotted =
                  backendStatus === 'ALLOTTED' || backendStatus === 'PARTIALLY_ALLOTTED';
                const appliedShares = targetApp.shares_count || targetApp.quantity || 0;
                const lotSize = getAuthoritativeIpoLotSize(currentIpo, backendIpos, ipos, targetApp.category);

                let effectiveBackendStatus = backendStatus;
                if (typeof item.sharesAllotted === 'number' && item.sharesAllotted > 0) {
                  if (appliedShares > 0 && item.sharesAllotted < appliedShares) {
                    effectiveBackendStatus = 'PARTIALLY_ALLOTTED';
                  } else if (effectiveBackendStatus !== 'PARTIALLY_ALLOTTED') {
                    effectiveBackendStatus = 'ALLOTTED';
                  }
                } else if ((item as any).allottedLots != null && (item as any).allottedLots > 0) {
                  const derivedShares = (item as any).allottedLots * lotSize;
                  if (appliedShares > 0 && derivedShares < appliedShares) {
                    effectiveBackendStatus = 'PARTIALLY_ALLOTTED';
                  }
                }

                let sharesCount = 0;
                if (isOverallAllotted) {
                  if (typeof item.sharesAllotted === 'number' && item.sharesAllotted > 0) {
                    sharesCount = item.sharesAllotted;
                  } else if ((item as any).allottedLots != null && (item as any).allottedLots > 0) {
                    sharesCount = (item as any).allottedLots * lotSize;
                  } else if (effectiveBackendStatus === 'PARTIALLY_ALLOTTED' && appliedShares > lotSize) {
                    sharesCount = lotSize;
                  } else {
                    sharesCount = targetApp.shares_count || targetApp.quantity || lotSize;
                  }
                }

                const allottedLots = isOverallAllotted
                  ? ((item as any).allottedLots || Math.max(1, Math.round(sharesCount / lotSize)))
                  : 0;

                await saveAllotmentResult({
                  application_id: targetApp.id,
                  user_id: usr.id,
                  ipo_id: targetApp.ipo_id,
                  allotment_status: effectiveBackendStatus,
                  allotted_lots: allottedLots,
                  allotted_shares: sharesCount,
                  registrar: currentIpo.registrar || '',
                  checked_at: item.checkedAt || new Date().toISOString(),
                });
                hasChanges = true;
                addLog(
                  `Allotment verified for ${usr.name} (${maskPan(usr.pan_number || '')}) ➔ ${targetAppStatus}`,
                  'success',
                );
              } catch (err) {
                console.warn('[AllotmentChecker] Error updating existing application allotment:', err);
              }
            }
            continue;
          }

          // If applicant got allotted but had NO application in memory, check SQLite directly before auto-creating
          if (backendStatus === 'ALLOTTED' || backendStatus === 'PARTIALLY_ALLOTTED') {
            let targetIpoId = currentIpo.id;
            const matchedListing = ipos.find(
              (i) =>
                i.id === currentIpo.id ||
                i.backend_ipo_id === currentIpo.id ||
                (currentIpo.ipo_name && i.ipo_name?.toLowerCase().trim() === currentIpo.ipo_name.toLowerCase().trim()),
            );
            if (matchedListing) {
              targetIpoId = matchedListing.id;
            }

            const inFlightKey = `${usr.id}:::${targetIpoId}`;
            if (inFlightCreatedAppsRef.current.has(inFlightKey)) {
              continue;
            }

            // Check SQLite directly to prevent duplicate creation
            let existingDbApp: { id: string } | null = null;
            try {
              existingDbApp = await safeGetFirstAsync<{ id: string }>(
                db,
                `SELECT a.id FROM ipo_applications a
                 LEFT JOIN ipo_listings l ON a.ipo_id = l.id
                 WHERE a.user_id = ?
                   AND (
                     a.ipo_id = ?
                     OR a.ipo_id = ?
                     OR l.backend_ipo_id = ?
                     OR (l.ipo_name IS NOT NULL AND LOWER(TRIM(l.ipo_name)) = LOWER(TRIM(?)))
                     OR (a.ipo_id = ?)
                   )
                   AND (a.deleted_at IS NULL OR a.deleted_at = '')
                 LIMIT 1`,
                [usr.id, targetIpoId, currentIpo.id, currentIpo.id, currentIpo.ipo_name || '', currentIpo.ipo_name || ''],
                'AllotmentChecker.findExistingDbApp'
              );
            } catch {}

            if (existingDbApp) {
              inFlightCreatedAppsRef.current.add(inFlightKey);
              try {
                const sharesCount = item.sharesAllotted || currentIpo.lot_size || 0;
                await saveAllotmentResult({
                  application_id: existingDbApp.id,
                  user_id: usr.id,
                  ipo_id: targetIpoId,
                  allotment_status: backendStatus,
                  allotted_lots: (item as any).allottedLots || 1,
                  allotted_shares: sharesCount,
                  registrar: currentIpo.registrar || '',
                  checked_at: item.checkedAt || new Date().toISOString(),
                });
                hasChanges = true;
              } catch {}
              continue;
            }

            inFlightCreatedAppsRef.current.add(inFlightKey);
            try {
              if (!matchedListing) {
                const nowIso = new Date().toISOString();
                await safeRunAsync(
                  db,
                  `INSERT OR IGNORE INTO ipo_listings (id, ipo_name, company_name, symbol, buy_price, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [currentIpo.id, currentIpo.ipo_name, currentIpo.company_name || currentIpo.ipo_name, currentIpo.symbol || '', currentIpo.buy_price || 100, currentIpo.lot_size || 1, nowIso, nowIso],
                  'AllotmentChecker.insertListing'
                );
              }

              const newAppId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              const nowIso = new Date().toISOString();
              const sharesCount = item.sharesAllotted || currentIpo.lot_size || 0;

              await safeRunAsync(
                db,
                `INSERT INTO ipo_applications (id, user_id, ipo_id, category, status, shares_count, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [newAppId, usr.id, targetIpoId, (item as any).category || 'RETAIL', targetAppStatus, sharesCount, user?.uid || null, nowIso, nowIso],
                'AllotmentChecker.insertApp'
              );

              await saveAllotmentResult({
                application_id: newAppId,
                user_id: usr.id,
                ipo_id: targetIpoId,
                allotment_status: backendStatus,
                allotted_lots: (item as any).allottedLots || 1,
                allotted_shares: sharesCount,
                registrar: currentIpo.registrar || '',
                checked_at: item.checkedAt || nowIso,
              });
              hasChanges = true;
              addLog(`Recorded allotment application for ${usr.name} ➔ ${targetAppStatus}`, 'success');
            } catch (err) {
              console.warn('[AllotmentChecker] Error auto-creating allotment application:', err);
            }
          }
        }
      }

      if (hasChanges) {
        try {
          await refresh();
        } catch {}
        backendSyncEmitter.notifyChange();
      }

      if (successfulAllotmentsCount > 0 && db && currentIpo) {
        try {
          const ipoName = currentIpo.company_name || currentIpo.ipo_name || 'IPO';
          const notifBody = successfulAllotmentsCount === 1
            ? `Allotment received for ${firstAllottedApplicantName || 'your application'} in ${ipoName}${firstAllottedShares > 0 ? ` (${firstAllottedShares} shares)` : ''}!`
            : `Allotment received for ${ipoName} across ${successfulAllotmentsCount} managed accounts!`;

          void createDeduplicatedNotification(db, {
            type: 'ALLOTTED',
            ipo_id: currentIpo.id,
            title: '🎉 Allotment Confirmed!',
            body: notifBody,
            dedupe_key: `ipo_allotment_received_${currentIpo.id}`,
          });
        } catch (notifErr) {
          if (__DEV__) console.warn('[AllotmentChecker] Error shooting allotment notification:', notifErr);
        }
      }
    },
    [selectedIpo, users, applications, ipos, allotments, saveAllotmentResult, addLog, refresh, db, user],
  );

  // Poll active backend job
  const startPollingJob = useCallback(
    (jobId: string, preResolvedIpo?: AllotmentCheckerIpoItem | null) => {
      stopPolling();
      setIsPolling(true);

      let pollCount = 0;

      const poll = async () => {
        pollCount++;
        const timeStr = new Date().toLocaleTimeString();

        try {
          const updatedJob = await allotmentApiService.getJob(
            jobId,
            activeUserId || undefined,
          );
          setActiveJob(updatedJob);

          if (updatedJob.items && updatedJob.items.length > 0) {
            void syncApplicationStatusesFromJob(updatedJob.items, preResolvedIpo || selectedIpo);
          }

          setPollingDiag({
            attemptCount: pollCount,
            lastStatus: updatedJob.status,
            lastHttp: 200,
            lastTime: timeStr,
            active: true,
          });

          addLog(
            `Poll #${pollCount} ➔ ${updatedJob.status} (${updatedJob.processedChecks}/${updatedJob.totalChecks})`,
            'info',
          );

          if (
            updatedJob.status === 'COMPLETED' ||
            updatedJob.status === 'COMPLETED_WITH_ERRORS'
          ) {
            setJobError(null);
            setPollingDiag((prev) => ({ ...prev, active: false }));
            addLog(`Job completed with status ${updatedJob.status}`, 'success');
            stopPolling();
            if (updatedJob.items && updatedJob.items.length > 0) {
              void syncApplicationStatusesFromJob(updatedJob.items, preResolvedIpo || selectedIpo);
            }
          } else if (
            updatedJob.status === 'FAILED' ||
            updatedJob.status === 'CANCELLED'
          ) {
            setPollingDiag((prev) => ({ ...prev, active: false }));
            addLog(`Job ended with status ${updatedJob.status}`, 'warn');
            stopPolling();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setPollingDiag((prev) => ({
            ...prev,
            attemptCount: pollCount,
            lastHttp: 0,
            lastTime: timeStr,
            error: msg,
          }));

          // Transient polling timeout or fetch cancellation must not display red "Aborted" banner
          if (msg.includes('Aborted') || msg.includes('abort') || msg.includes('cancel')) {
            addLog(`Poll #${pollCount} fetch aborted (transient timeout)`, 'warn');
            return;
          }
          setDiagnosticJobError(err, 'startPollingJob', `GET /api/v1/allotment/jobs/${jobId}`);
          stopPolling();
        }
      };

      // Initial poll
      void poll();

      // Recurring 2s polling interval
      pollIntervalRef.current = setInterval(poll, 2000);
    },
    [activeUserId, stopPolling, addLog, setDiagnosticJobError, syncApplicationStatusesFromJob, selectedIpo],
  );

  // Trigger job creation (ONLY called upon explicit user IPO selection)
  const startAutomatedAllotmentCheck = useCallback(
    async (targetIpoId: string, preResolvedIpo?: AllotmentCheckerIpoItem | null) => {
      const createStartMs = Date.now();
      const startStr =
        new Date().toLocaleTimeString() + '.' + String(createStartMs % 1000).padStart(3, '0');

      try {
        setJobError(null);
        setIsCreatingJob(true);
        setActiveJob(null);
        addLog(`Initiating automated check for IPO ID ${targetIpoId}`, 'info');

        // 1. Collect all local applicant PANs from active (non-archived) user profiles for sync
        const userPanMap = new Map<string, { userId: string; pan: string; name: string }>();
        users.forEach((usr) => {
          if (usr.archived === 1) return; // skip archived users
          const p = (usr.pan_number || '').trim().toUpperCase();
          if (p.length === 10) {
            userPanMap.set(p, {
              userId: activeUserId || usr.id,
              pan: p,
              name: usr.name || 'Applicant',
            });
          }
        });
        const localPanRecords = Array.from(userPanMap.values());

        // 2. Synchronize local user PANs to backend UserSavedPan model
        setPanSyncState({ status: 'RUNNING' });
        if (localPanRecords.length > 0) {
          try {
            const syncSuccess = await panSyncService.syncLocalPans(
              activeUserId || '',
              localPanRecords,
            );
            setPanSyncState({
              status: syncSuccess ? 'SUCCESS' : 'FAILED',
              httpStatus: 200,
              syncedCount: localPanRecords.length,
            });
            addLog(
              `PAN sync completed (${localPanRecords.length} records)`,
              syncSuccess ? 'success' : 'warn',
            );
          } catch (syncErr: any) {
            setPanSyncState({
              status: 'FAILED',
              httpStatus: syncErr?.statusCode || 0,
              error: syncErr?.message || String(syncErr),
              syncedCount: 0,
            });
          }
        } else {
          setPanSyncState({ status: 'SKIPPED', syncedCount: 0, httpStatus: 200 });
          addLog('PAN sync skipped (no valid 10-char local PANs)', 'info');
        }

        // 2.5 Resolve canonical backend IPO ID strictly
        const selectedObj =
          preResolvedIpo ||
          selectableIpos.find((i) => i.id === targetIpoId) ||
          (backendIpos.find((i) => i.id === targetIpoId)
            ? normalizeBackendIpoForChecker(backendIpos.find((i) => i.id === targetIpoId)!)
            : null);
        const selName = selectedObj?.ipo_name || 'IPO';

        let canonicalId: string | null = null;
        let resStatus: 'SUCCESS' | 'NOT_SYNCHRONIZED' = 'NOT_SYNCHRONIZED';
        let resMethod = 'Not Synchronized';

        // Check if targetIpoId is directly a canonical UUID
        const isTargetUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIpoId.trim());
        if (isTargetUuid) {
          canonicalId = targetIpoId.trim();
          resStatus = 'SUCCESS';
          resMethod = 'Direct Canonical Backend UUID';
          addLog(`Using direct canonical backend IPO ID '${canonicalId}'`, 'success');
        }

        if (!canonicalId) {
          setIpoResolution({
            selectedName: selName,
            localId: targetIpoId,
            backendId: 'NOT LINKED',
            resolutionStatus: 'NOT_SYNCHRONIZED',
            resolutionMethod: 'Not Synchronized',
            sentToCreateJob: 'NONE',
          });
          setJobCreationState({
            status: 'SKIPPED',
            error: 'IPO is not synchronized with backend',
          });
          setIsCreatingJob(false);
          setIsPolling(false);
          addLog(`IPO '${selName}' is not a valid backend UUID. Skipping automated check.`, 'warn');
          return;
        }

        setIpoResolution({
          selectedName: selName,
          localId: targetIpoId,
          backendId: canonicalId,
          resolutionStatus: resStatus,
          resolutionMethod: resMethod,
          sentToCreateJob: canonicalId,
        });

        // 3. Create backend job with canonicalId
        setJobCreationState({ status: 'RUNNING' });
        const job = await allotmentApiService.createJob(canonicalId, activeUserId || undefined);
        const createEndMs = Date.now();
        const endStr =
          new Date().toLocaleTimeString() + '.' + String(createEndMs % 1000).padStart(3, '0');
        const durationMs = createEndMs - createStartMs;

        setJobTiming({
          frontendStarted: startStr,
          frontendCompleted: endStr,
          frontendDurationMs: durationMs,
          aborted: false,
          backendReceived: startStr,
          backendIpoResolved: startStr,
          backendRegistrarResolved: startStr,
          backendDbCreated: endStr,
          backendWorkerDispatched: endStr,
        });

        setActiveJob(job);
        if (job.items && job.items.length > 0) {
          void syncApplicationStatusesFromJob(job.items, selectedObj);
        }
        setJobCreationState({
          status: 'SUCCESS',
          httpStatus: 201,
          jobId: job.id,
        });
        setIsCreatingJob(false);
        addLog(`Backend job created in ${durationMs}ms: ${job.id} (Status: ${job.status})`, 'success');

        // 4. Start polling job status
        startPollingJob(job.id, selectedObj);
      } catch (err: unknown) {
        const createEndMs = Date.now();
        const endStr =
          new Date().toLocaleTimeString() + '.' + String(createEndMs % 1000).padStart(3, '0');
        const durationMs = createEndMs - createStartMs;

        const isAborted =
          (err as Error)?.name === 'AbortError' ||
          String(err).includes('Aborted') ||
          String(err).includes('abort');

        setJobTiming({
          frontendStarted: startStr,
          frontendCompleted: endStr,
          frontendDurationMs: durationMs,
          aborted: isAborted,
        });

        setJobCreationState({
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
        });
        setDiagnosticJobError(err, 'startAutomatedAllotmentCheck', 'createJob');
        setIsCreatingJob(false);
        setIsPolling(false);
      }
    },
    [users, activeUserId, selectableIpos, backendIpos, startPollingJob, addLog, setDiagnosticJobError],
  );

  // Handle explicit IPO selection from picker bottom sheet or route param
  const handleSelectIpo = useCallback(
    async (ipoId: string) => {
      setShowIpoPicker(false);
      resetCheckState();
      setSelectedIpoId(ipoId);

      let targetIpo =
        selectableIpos.find((i) => i.id === ipoId) ||
        (backendIpos.find((i) => i.id === ipoId)
          ? normalizeBackendIpoForChecker(backendIpos.find((i) => i.id === ipoId)!)
          : null);

      if (!targetIpo) {
        try {
          const fetched = await backendIpoApiService.getBackendIpoDetail(ipoId);
          if (fetched) {
            targetIpo = normalizeBackendIpoForChecker(fetched);
            setDirectSelectedIpo(targetIpo);
          }
        } catch (err: any) {
          addLog(`Could not fetch details for backend IPO ${ipoId}: ${err?.message}`, 'warn');
        }
      }

      if (!targetIpo && ipos && ipos.length > 0) {
        const localMatch = ipos.find(
          (i) =>
            i.id === ipoId ||
            (i.symbol && i.symbol.toLowerCase() === ipoId.toLowerCase()) ||
            (i.ipo_name && i.ipo_name.toLowerCase() === ipoId.toLowerCase())
        );
        if (localMatch) {
          const candidateId = (localMatch as any).backend_ipo_id || localMatch.id;
          const candidateFromSelectable = selectableIpos.find(
            (i) => i.id === candidateId || (i.symbol && localMatch.symbol && i.symbol.toLowerCase() === localMatch.symbol.toLowerCase())
          );
          if (candidateFromSelectable) {
            targetIpo = candidateFromSelectable;
          } else {
            const candidateFromBackend = backendIpos.find(
              (i) => i.id === candidateId || (i.symbol && localMatch.symbol && i.symbol.toLowerCase() === localMatch.symbol.toLowerCase())
            );
            if (candidateFromBackend) {
              targetIpo = normalizeBackendIpoForChecker(candidateFromBackend);
            }
          }
        }
      }

      const canonicalTargetId = targetIpo ? targetIpo.id : ipoId;
      setSelectedIpoId(canonicalTargetId);
      if (targetIpo) {
        setDirectSelectedIpo(targetIpo);
      }

      const targetRegistrar = targetIpo
        ? getRegistrarConfig(targetIpo.registrar || targetIpo.ipo_name).name
        : '';

      // If allotment is not yet declared out by backend, fallback to official registrar portal immediately
      if (targetIpo && !isBackendIpoAllotmentEligible(targetIpo as any)) {
        const portalConfig = getRegistrarConfig(targetIpo.registrar || targetRegistrar || targetIpo.ipo_name);
        addLog(`Allotment not declared yet for ${targetIpo.ipo_name || canonicalTargetId}. Opening official ${portalConfig.name} portal.`, 'info');
        setIpoResolution({
          selectedName: targetIpo?.ipo_name,
          localId: canonicalTargetId,
          backendId: canonicalTargetId,
          resolutionStatus: 'WAITING',
          resolutionMethod: 'Manual Registrar',
        });
        void WebBrowser.openBrowserAsync(portalConfig.url, {
          showTitle: true,
          enableBarCollapsing: true,
        });
        return;
      }

      addLog(`IPO selected: ${targetIpo?.ipo_name || canonicalTargetId} (Registrar: ${targetRegistrar})`, 'info');

      // Bigshare hybrid flow: Check CAPTCHA presence first
      const registrarUpper = (targetIpo?.registrar || targetRegistrar || '').toUpperCase();
      const isBigshare =
        registrarUpper.includes('BIGSHARE') ||
        registrarUpper.replace(/[\s_.-]+/g, '').includes('BIGSHARE');

      if (isBigshare) {
        addLog(`Checking Bigshare CAPTCHA status for ${targetIpo?.ipo_name || canonicalTargetId}...`, 'info');
        let captchaPresent = false;
        try {
          captchaPresent = await checkBigshareCaptchaPresence();
        } catch (err: any) {
          addLog(`Could not determine Bigshare CAPTCHA status: ${err?.message}`, 'warn');
          captchaPresent = true;
        }

        if (captchaPresent) {
          addLog(`Bigshare CAPTCHA detected. Immediately opening Bigshare WebView for manual completion.`, 'info');
          const portalConfig = getRegistrarConfig('BIGSHARE');
          setIpoResolution({
            selectedName: targetIpo?.ipo_name,
            localId: canonicalTargetId,
            backendId: canonicalTargetId,
            resolutionStatus: 'WAITING',
            resolutionMethod: 'Manual Registrar',
          });
          void WebBrowser.openBrowserAsync(portalConfig.url, {
            showTitle: true,
            enableBarCollapsing: true,
          });
          return;
        }

        addLog(`Bigshare CAPTCHA absent. Running direct automated check for ${targetIpo?.ipo_name || canonicalTargetId}.`, 'success');
        void startAutomatedAllotmentCheck(canonicalTargetId, targetIpo);
        return;
      }

      // Registrars without automated backend support: open their portal in-app instantly
      const manualRedirectRegistrar = registrarUpper.includes('CAMEO')
        ? 'CAMEO'
        : registrarUpper.includes('INTEGRATED')
          ? 'INTEGRATED'
          : registrarUpper.includes('MAS')
            ? 'MAS'
            : registrarUpper.includes('MUDRA')
              ? 'MUDRA'
              : registrarUpper.includes('ALANKIT')
                ? 'ALANKIT'
                : null;
      if (manualRedirectRegistrar) {
        const portalConfig = getRegistrarConfig(manualRedirectRegistrar);
        addLog(`Opening ${portalConfig.name} allotment portal for ${targetIpo?.ipo_name || canonicalTargetId}`, 'info');
        setIpoResolution({
          selectedName: targetIpo?.ipo_name,
          localId: canonicalTargetId,
          backendId: canonicalTargetId,
          resolutionStatus: 'WAITING',
          resolutionMethod: 'Manual Registrar',
        });
        void WebBrowser.openBrowserAsync(portalConfig.url, {
          showTitle: true,
          enableBarCollapsing: true,
        });
        return;
      }

      if (targetRegistrar && isAutomatedCheckSupported(targetRegistrar)) {
        void startAutomatedAllotmentCheck(canonicalTargetId, targetIpo);
      } else {
        setIpoResolution({
          selectedName: targetIpo?.ipo_name,
          localId: canonicalTargetId,
          backendId: canonicalTargetId,
          resolutionStatus: 'WAITING',
          resolutionMethod: 'Manual Registrar',
        });
        addLog(`Automated check unavailable for ${targetRegistrar}`, 'warn');
      }
    },
    [selectableIpos, backendIpos, ipos, resetCheckState, startAutomatedAllotmentCheck, addLog],
  );

  // Auto-select and start check when route param ipoId is passed
  useEffect(() => {
    if (
      routeIpoId &&
      autoCheckedRouteRef.current !== routeIpoId &&
      dismissedRouteIpoIdRef.current !== routeIpoId
    ) {
      autoCheckedRouteRef.current = routeIpoId;
      handleSelectIpo(routeIpoId);
    }
  }, [routeIpoId, handleSelectIpo]);

  // Reset dismissed route param tracking when target route param changes
  useEffect(() => {
    if (routeIpoId && routeIpoId !== dismissedRouteIpoIdRef.current) {
      dismissedRouteIpoIdRef.current = null;
    }
  }, [routeIpoId]);

  // Handle Switch IPO action
  const handleSwitchIpo = useCallback(() => {
    resetCheckState();
    setSelectedIpoId(null);
    setDirectSelectedIpo(null);
    setIpoSearchQuery('');
    setShowIpoPicker(true);
    addLog('Switched IPO selection', 'info');
  }, [resetCheckState, addLog]);

  // Complete reset to default allotment page (used for non-pro tab transitions)
  const resetToDefaultPage = useCallback(() => {
    if (routeIpoId) {
      dismissedRouteIpoIdRef.current = routeIpoId;
      autoCheckedRouteRef.current = routeIpoId;
    }
    resetCheckState();
    setSelectedIpoId(null);
    setDirectSelectedIpo(null);
    setIpoSearchQuery('');
    setShowIpoPicker(false);
    setShowConfetti(false);
    setSelectedAppForUpdate(null);
    setShowHistoryModal(false);
    try {
      router.setParams({ ipoId: '', id: '' });
    } catch {}
    addLog('Reset allotment checker to default state', 'info');
  }, [resetCheckState, routeIpoId, router, addLog]);

  // Unified Back Handler for Header Back Icon & Hardware Back Button
  const handleBackPress = useCallback(() => {
    if (showIpoPicker) {
      setShowIpoPicker(false);
      return;
    }
    if (showHistoryModal) {
      setShowHistoryModal(false);
      return;
    }
    if (showConfetti) {
      setShowConfetti(false);
      return;
    }
    if (selectedAppForUpdate) {
      setSelectedAppForUpdate(null);
      return;
    }

    // If opened as a stack screen with a target IPO and can go back, navigate back to caller
    if (!isTabScreen && routeIpoId && router.canGoBack()) {
      router.back();
      return;
    }

    // If viewing an IPO result, deselect and return to the default IPO picker view
    if (selectedIpo) {
      resetToDefaultPage();
      return;
    }

    // If on default picker view and can navigate back
    if (router.canGoBack()) {
      router.back();
      return;
    }

    // Fallback root navigation
    if (isPrimaryTab) {
      router.replace('/(tabs)/ipos');
    } else {
      router.replace('/(tabs)');
    }
  }, [
    showIpoPicker,
    showHistoryModal,
    showConfetti,
    selectedAppForUpdate,
    isTabScreen,
    routeIpoId,
    router,
    selectedIpo,
    resetToDefaultPage,
    isPrimaryTab,
  ]);

  // Tab transition & screen navigation lifecycle
  const resetToDefaultPageRef = useRef(resetToDefaultPage);
  resetToDefaultPageRef.current = resetToDefaultPage;
  const routeIpoIdRef = useRef(routeIpoId);
  routeIpoIdRef.current = routeIpoId;
  const hasLostFocusRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      hasLostFocusRef.current = false;

      return () => {
        hasLostFocusRef.current = true;
      };
    }, [])
  );

  // Also listen for bottom tab press on Allotment tab
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ALLOTMENT_TAB_NAV_PRESS', () => {
      resetToDefaultPage();
    });
    return () => {
      sub.remove();
    };
  }, [resetToDefaultPage]);

  // Android hardware/system Back button handler
  useEffect(() => {
    const onHardwareBack = () => {
      if (showIpoPicker) {
        setShowIpoPicker(false);
        return true;
      }
      if (showHistoryModal) {
        setShowHistoryModal(false);
        return true;
      }
      if (showConfetti) {
        setShowConfetti(false);
        return true;
      }
      if (selectedAppForUpdate) {
        setSelectedAppForUpdate(null);
        return true;
      }
      if (!isTabScreen && routeIpoId && router.canGoBack()) {
        router.back();
        return true;
      }
      if (selectedIpo) {
        resetToDefaultPage();
        return true;
      }
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => {
      sub.remove();
    };
  }, [
    showIpoPicker,
    showHistoryModal,
    showConfetti,
    selectedAppForUpdate,
    isTabScreen,
    routeIpoId,
    selectedIpo,
    router,
    resetToDefaultPage,
  ]);

  // Diagnostics controls
  const handleClearDiagnostics = useCallback(() => {
    setApiTraces([]);
    setEventLogs([]);
    setPanSyncState({ status: 'WAITING' });
    setJobCreationState({ status: 'WAITING' });
    setJobTiming(null);
    setPollingDiag({ attemptCount: 0, active: false });
    setLastErrorOrigin(null);
    setAbortedOrigin(null);
    setIpoResolution({ resolutionStatus: 'WAITING' });
    addLog('Diagnostics cleared by user', 'info');
  }, [addLog]);

  const handleRunCheckAgain = useCallback(() => {
    if (selectedIpoId) {
      addLog(`Re-running allotment check for IPO ID ${selectedIpoId}`, 'info');
      handleSelectIpo(selectedIpoId);
    } else {
      addLog('Cannot re-run check: No IPO selected', 'warn');
    }
  }, [selectedIpoId, handleSelectIpo, addLog]);

  const [checkingApplicantId, setCheckingApplicantId] = useState<string | null>(null);

  const handleCheckSingleApplicant = useCallback(
    async (applicant: UIApplicantState) => {
      if (!selectedIpoId || !selectedIpo) return;
      setCheckingApplicantId(applicant.applicationId);
      addLog(`Re-checking applicant ${applicant.userName} (${maskPan(applicant.pan)})`, 'info');
      try {
        await startAutomatedAllotmentCheck(selectedIpoId, selectedIpo);
      } finally {
        setCheckingApplicantId(null);
      }
    },
    [selectedIpoId, selectedIpo, startAutomatedAllotmentCheck, addLog],
  );



  // Compute live applicant UI states by combining all active users from Manage Users with backend job items
  const uiApplicants = useMemo((): UIApplicantState[] => {
    if (!selectedIpo) return [];

    // All active (non-archived) users from Manage Users with valid 10-char PAN
    const activeUsers = users.filter(
      (u) => u.archived !== 1 && u.pan_number && u.pan_number.trim().length === 10,
    );

    const activeUserIds = new Set(activeUsers.map((u) => u.id));

    const applicantProfiles: Array<{
      applicationId: string;
      userId: string;
      userName: string;
      pan: string;
      avatarUrl?: string;
      appliedQuantity: number;
      price: number;
    }> = [];

    // 1. Add all active users from Manage Users
    for (const usr of activeUsers) {
      const userApps = currentApplications.filter((a) => a.user_id === usr.id);
      const app = userApps[0];
      const appliedQuantity =
        userApps.length > 0
          ? userApps.reduce(
              (sum, a) =>
                sum + (a.quantity || (a.shares_count ?? 0) || selectedIpo?.lot_size || 0),
              0,
            )
          : selectedIpo?.lot_size || 0;

      applicantProfiles.push({
        applicationId: app?.id || `saved_${usr.id}`,
        userId: usr.id,
        userName: usr.name || 'Applicant',
        pan: usr.pan_number.trim().toUpperCase(),
        avatarUrl: usr.avatar_url || (usr as any)?.avatar || undefined,
        appliedQuantity,
        price: app?.buy_price || selectedIpo?.buy_price || 0,
      });
    }

    // 2. Include any applications whose user is not yet in activeUsers
    for (const app of currentApplications) {
      if (!activeUserIds.has(app.user_id)) {
        const usr = users.find((u) => u.id === app.user_id);
        if (!usr || usr.archived !== 1) {
          const pan = (usr?.pan_number || '').trim().toUpperCase();
          if (pan.length === 10) {
            applicantProfiles.push({
              applicationId: app.id,
              userId: app.user_id,
              userName: usr?.name || 'Applicant',
              pan,
              avatarUrl: usr?.avatar_url || (usr as any)?.avatar || undefined,
              appliedQuantity:
                app.quantity ||
                (app.shares_count ?? undefined) ||
                selectedIpo?.lot_size ||
                0,
              price: app.buy_price || selectedIpo?.buy_price || 0,
            });
          }
        }
      }
    }

    if (applicantProfiles.length === 0) return [];

    const list = applicantProfiles.map((profile) => {
      const pan = profile.pan;
      const masked = maskPan(pan).toUpperCase();
      const expectedBackendMask = getBackendMaskedPan(pan);
      const userApps = currentApplications.filter((a) => a.user_id === profile.userId);
      const totalAppliedFromApps =
        userApps.length > 0
          ? userApps.reduce(
              (sum, a) =>
                sum + (a.quantity || (a.shares_count ?? 0) || selectedIpo?.lot_size || 0),
              0,
            )
          : profile.appliedQuantity;

      // Find matching backend job item strictly by canonical backend mask
      let matchedItem: BackendJobItem | undefined;
      for (const item of activeJob?.items || []) {
        const backendMask = (item.maskedId || '').trim().toUpperCase();
        if (backendMask === expectedBackendMask) {
          matchedItem = item;
          break;
        }
      }

      let status: UIApplicantState['status'] = 'pending';
      let sharesAllotted = 0;
      let appliedQuantity = totalAppliedFromApps;
      let errorMessage: string | undefined;
      let checkedAt: string | undefined = matchedItem?.checkedAt || activeJob?.updatedAt;
      let categories: CategoryBreakdownItem[] | undefined = undefined;

      if (!isAutomatedSupported) {
        status = 'check_failed';
        errorMessage = `Automated checking unavailable for ${effectiveRegistrar}`;
      } else if (isCreatingJob && !matchedItem) {
        status = 'pending';
      } else if (matchedItem) {
        if (matchedItem.categoryResults && matchedItem.categoryResults.length > 0) {
          const dedupedCats = deduplicateCategoryRecords(matchedItem.categoryResults);
          const categoriesList: CategoryBreakdownItem[] = dedupedCats.map((c) => {
            const normCat = mapRegistrarCategory(c.category || c.rawCategory);
            const catStatusUpper = (c.status || '').trim().toUpperCase();
            let catStatus: CategoryBreakdownItem['status'] = 'not_allotted';
            if (catStatusUpper === 'ALLOTTED') {
              catStatus = 'allotted';
            } else if (catStatusUpper === 'PARTIALLY_ALLOTTED') {
              catStatus = 'partially_allotted';
            } else if (
              catStatusUpper === 'APPLICATION_NOT_FOUND' ||
              catStatusUpper === 'NO_RECORD'
            ) {
              catStatus = 'no_record';
            } else if (catStatusUpper === 'NOT_YET_AVAILABLE') {
              catStatus = 'not_available';
            } else if (catStatusUpper === 'NOT_ALLOTTED') {
              catStatus = 'not_allotted';
            } else {
              catStatus = 'needs_review';
            }

            const appForCat = userApps.find(
              (a) => mapRegistrarCategory(a.category) === normCat,
            );
            const sharesApplied =
              c.sharesApplied ||
              appForCat?.quantity ||
              appForCat?.shares_count ||
              selectedIpo?.lot_size ||
              0;
            const catShares =
              catStatus === 'allotted' || catStatus === 'partially_allotted'
                ? c.sharesAllotted || 0
                : 0;

            return {
              category: normCat,
              rawCategory: c.rawCategory || c.category,
              status: catStatus,
              sharesAllotted: catShares,
              sharesApplied,
              applicationNumber: c.applicationNumber || undefined,
            };
          });

          const dedupedCategoriesList = deduplicateCategoryRecords(categoriesList);
          const overall = deriveOverallCategoryAllotment(dedupedCategoriesList);
          status = overall.status;
          sharesAllotted = overall.totalSharesAllotted;
          appliedQuantity =
            overall.totalSharesApplied > 0
              ? overall.totalSharesApplied
              : totalAppliedFromApps;
          categories = sortCategoriesForDisplay(dedupedCategoriesList);
        } else {
          const backendStatus = (matchedItem.status || '').toUpperCase();
          if (backendStatus === 'ALLOTTED') {
            status = 'allotted';
            sharesAllotted = matchedItem.sharesAllotted || selectedIpo?.lot_size || 0;
          } else if (backendStatus === 'PARTIALLY_ALLOTTED') {
            status = 'partially_allotted';
            sharesAllotted = matchedItem.sharesAllotted || 0;
          } else if (backendStatus === 'NOT_ALLOTTED') {
            status = 'not_allotted';
          } else if (
            backendStatus === 'APPLICATION_NOT_FOUND' ||
            backendStatus === 'NO_RECORD'
          ) {
            status = 'no_record';
            errorMessage =
              matchedItem.errorMessage || 'No record found on registrar portal.';
          } else if (backendStatus === 'NOT_YET_AVAILABLE') {
            status = 'not_available';
            errorMessage =
              matchedItem.errorMessage ||
              'Allotment information is not yet available from registrar.';
          } else if (
            backendStatus === 'SOURCE_UNAVAILABLE' ||
            backendStatus === 'SOURCE_RESPONSE_INVALID' ||
            backendStatus === 'REGISTRAR_UNRESOLVED' ||
            backendStatus === 'REGISTRAR_UNSUPPORTED' ||
            backendStatus === 'CAPTCHA_REQUIRED' ||
            backendStatus === 'RATE_LIMITED' ||
            backendStatus === 'TEMPORARY_ERROR'
          ) {
            status = 'check_failed';
            errorMessage =
              matchedItem.errorMessage || 'Registrar portal unavailable or query failed.';
          } else if (
            backendStatus === 'QUEUED' ||
            backendStatus === 'PENDING' ||
            backendStatus === 'PROCESSING' ||
            backendStatus === 'IN_PROGRESS' ||
            (backendStatus === 'UNKNOWN' &&
              (activeJob?.status === 'QUEUED' || activeJob?.status === 'RUNNING'))
          ) {
            status = 'pending';
          } else if (activeJob?.status === 'RUNNING' || activeJob?.status === 'QUEUED') {
            status = 'pending';
          } else {
            status = 'needs_review';
            errorMessage = matchedItem.errorMessage || 'Status pending review.';
          }
        }
      } else if (activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'QUEUED')) {
        status = 'pending';
      } else if (
        activeJob &&
        (activeJob.status === 'COMPLETED' ||
          activeJob.status === 'COMPLETED_WITH_ERRORS') &&
        !matchedItem
      ) {
        status = 'needs_review';
        errorMessage = 'Unable to match this applicant to the completed registrar result.';
      } else if (!activeJob && userApps.length > 0) {
        // Load category-aware outcome from SQLite allotments when available
        const appsWithAllotments = userApps
          .map((a) => ({
            app: a,
            alt: (allotments || []).find((alt) => alt.application_id === a.id),
          }))
          .filter((item) => item.alt !== undefined);

        if (appsWithAllotments.length > 0) {
          const categoriesList: CategoryBreakdownItem[] = appsWithAllotments.map(
            ({ app: a, alt }) => {
              const normCat = mapRegistrarCategory(a.category);
              const altStatusUpper = (alt!.allotment_status || '').trim().toUpperCase();
              let catStatus: CategoryBreakdownItem['status'] = 'not_allotted';
              if (altStatusUpper === 'ALLOTTED') {
                catStatus = 'allotted';
              } else if (altStatusUpper === 'PARTIALLY_ALLOTTED') {
                catStatus = 'partially_allotted';
              } else if (altStatusUpper === 'NOT_ALLOTTED') {
                catStatus = 'not_allotted';
              } else {
                catStatus = 'needs_review';
              }
              const catShares =
                catStatus === 'allotted' || catStatus === 'partially_allotted'
                  ? alt!.allotted_shares || 0
                  : 0;

              return {
                category: normCat,
                status: catStatus,
                sharesAllotted: catShares,
                sharesApplied: a.quantity || a.shares_count || selectedIpo?.lot_size || 0,
                applicationNumber: (a as any).application_number || a.id || undefined,
                applicationId: a.id,
                id: a.id,
              };
            },
          );

          const dedupedCategoriesList = deduplicateCategoryRecords(categoriesList);
          const overall = deriveOverallCategoryAllotment(dedupedCategoriesList);
          status = overall.status;
          sharesAllotted = overall.totalSharesAllotted;
          appliedQuantity =
            overall.totalSharesApplied > 0
              ? overall.totalSharesApplied
              : totalAppliedFromApps;
          categories = sortCategoriesForDisplay(dedupedCategoriesList);
          checkedAt = appsWithAllotments[0]?.alt?.checked_at;
        }
      } else if (jobError) {
        status = 'needs_review';
        errorMessage = jobError || 'Check incomplete.';
      }

      return {
        applicationId: profile.applicationId,
        userId: profile.userId,
        userName: profile.userName,
        pan,
        avatarUrl: profile.avatarUrl,
        appliedQuantity,
        price: profile.price || selectedIpo?.buy_price || 0,
        status,
        sharesAllotted,
        errorMessage,
        checkedAt,
        categories,
      };
    });

    // Bring applicants with allotment to the top of the list
    return list.sort((a, b) => {
      const isAAllotted = a.status === 'allotted' || a.status === 'partially_allotted';
      const isBAllotted = b.status === 'allotted' || b.status === 'partially_allotted';
      if (isAAllotted && !isBAllotted) return -1;
      if (!isAAllotted && isBAllotted) return 1;
      return 0;
    });
  }, [
    selectedIpo,
    currentApplications,
    users,
    allotments,
    activeJob,
    isCreatingJob,
    jobError,
    isAutomatedSupported,
    effectiveRegistrar,
  ]);

  // Only show applicants after checking has been performed for them
  const visibleApplicants = useMemo((): UIApplicantState[] => {
    return uiApplicants.filter(
      (applicant) => applicant.status !== 'pending' && applicant.status !== 'checking'
    );
  }, [uiApplicants]);

  // Trigger celebration modal with confetti when allotment is found
  useEffect(() => {
    if (!activeJob) return;
    const isFinished =
      activeJob.status === 'COMPLETED' ||
      (activeJob.totalChecks > 0 && activeJob.processedChecks >= activeJob.totalChecks);
    if (isFinished && !celebratedJobIdsRef.current.has(activeJob.id)) {
      celebratedJobIdsRef.current.add(activeJob.id);
      const hasAllotment = uiApplicants.some(
        (a) => a.status === 'allotted' || a.status === 'partially_allotted',
      );
      if (hasAllotment) {
        try {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
        setShowConfetti(true);
        setTimeout(() => {
          setShowConfetti(false);
        }, 6000);

        // Mark as seen so returning to Dashboard does not present duplicate modal
        void markAllotmentModalAsSeen([
          selectedIpo?.id,
          (selectedIpo as any)?.backend_ipo_id,
          selectedIpo?.ipo_name,
          selectedIpo?.company_name,
        ]);

        // Shoot local push notification for successful allotment check
        try {
          const allottedApps = uiApplicants.filter(
            (a) => a.status === 'allotted' || a.status === 'partially_allotted',
          );
          const ipoName = selectedIpo?.company_name || selectedIpo?.ipo_name || 'IPO';
          const totalShares = allottedApps.reduce((sum, a) => sum + (a.sharesAllotted || 0), 0);
          const notifBody = allottedApps.length === 1
            ? `Allotment received for ${allottedApps[0].userName} in ${ipoName}${totalShares > 0 ? ` (${totalShares} shares)` : ''}!`
            : `Allotment received for ${ipoName} across ${allottedApps.length} accounts (${totalShares} total shares)!`;

          if (db) {
            void createDeduplicatedNotification(db, {
              type: 'ALLOTTED',
              ipo_id: selectedIpo?.id,
              title: '🎉 Allotment Confirmed!',
              body: notifBody,
              dedupe_key: `ipo_allotment_received_${selectedIpo?.id || activeJob.id}`,
            });
          }
        } catch (notifErr) {
          if (__DEV__) console.warn('[AllotmentChecker] Notification error:', notifErr);
        }
      }
    }
  }, [activeJob, uiApplicants, db, selectedIpo]);

  // Compute live summary statistics
  const summaryCounts = useMemo(() => {
    let total = uiApplicants.length;
    let allotted = 0;
    let notAllotted = 0;
    let noRecord = 0;
    let notAvailable = 0;
    let needsReview = 0;

    for (const app of uiApplicants) {
      if (app.status === 'allotted' || app.status === 'partially_allotted') {
        allotted++;
      } else if (app.status === 'not_allotted') {
        notAllotted++;
      } else if (app.status === 'no_record') {
        noRecord++;
      } else if (app.status === 'not_available') {
        notAvailable++;
      } else if (app.status === 'needs_review' || app.status === 'check_failed') {
        needsReview++;
      }
    }

    if (activeJob) {
      total = activeJob.totalChecks || total;
    }

    return { total, allotted, notAllotted, noRecord, notAvailable, needsReview };
  }, [uiApplicants, activeJob]);

  // Determine if allotment check has finished for the selected IPO
  const isCheckFinished = useMemo(() => {
    if (!selectedIpo) return false;
    if (activeJob) {
      return (
        activeJob.status === 'COMPLETED' ||
        activeJob.status === 'COMPLETED_WITH_ERRORS' ||
        (activeJob.totalChecks > 0 && activeJob.processedChecks >= activeJob.totalChecks)
      );
    }
    // Only finished if checks were actually run (i.e. status is no longer 'pending' or 'checking')
    const hasExecutedChecks =
      uiApplicants.length > 0 &&
      uiApplicants.some((a) => a.status !== 'pending' && a.status !== 'checking');
    return hasExecutedChecks && !isCreatingJob && !isPolling;
  }, [selectedIpo, activeJob, isCreatingJob, isPolling, uiApplicants]);

  // Card background graphic: Grey before/during check, Green if >= 1 allotment, Red if 0 allotments (Grey if all not_available)
  const cardBgGraphic = useMemo(() => {
    if (!isCheckFinished) {
      return isDark ? ALLOTMENT_BG_GREY_DARK : ALLOTMENT_BG_GREY;
    }
    if (summaryCounts.allotted > 0) {
      return isDark ? ALLOTMENT_BG_GREEN_DARK : ALLOTMENT_BG_GREEN;
    }
    if (
      summaryCounts.notAvailable > 0 &&
      summaryCounts.notAllotted === 0 &&
      summaryCounts.noRecord === 0 &&
      summaryCounts.needsReview === 0
    ) {
      return isDark ? ALLOTMENT_BG_GREY_DARK : ALLOTMENT_BG_GREY;
    }
    return isDark ? ALLOTMENT_BG_RED_DARK : ALLOTMENT_BG_RED;
  }, [isCheckFinished, summaryCounts, isDark]);

  // Progress text formatting
  const progressText = useMemo(() => {
    if (isCreatingJob) return 'Initiating check...';
    if (activeJob) {
      return `Checking ${activeJob.processedChecks} of ${activeJob.totalChecks}...`;
    }
    return 'Ready';
  }, [isCreatingJob, activeJob]);

  // Allotment history computed from persisted SQLite ipo_allotments, active check items & legitimate allotments
  // Filter: strictly show only verified allotments with positive shares (> 0).
  // Sort: latest IPO issue/opening date first, grouped by IPO with check timestamp secondary sort.
  const allotmentHistoryItems = useMemo(() => {
    const itemsMap = new Map<string, AllotmentHistoryItem>();

    // Build reliable lookup for each IPO's issue/opening date
    const ipoOpenDateMap = new Map<string, string>();

    for (const b of backendIpos || []) {
      const openDate = b.openDate || b.lifecycle?.openDate;
      if (openDate && typeof openDate === 'string' && openDate.trim()) {
        const val = openDate.trim();
        if (b.id) ipoOpenDateMap.set(b.id, val);
        if (b.companyName) ipoOpenDateMap.set(b.companyName.trim().toLowerCase(), val);
        if (b.company?.displayName) ipoOpenDateMap.set(b.company.displayName.trim().toLowerCase(), val);
        if (b.symbol) ipoOpenDateMap.set(b.symbol.trim().toLowerCase(), val);
      }
    }

    for (const i of ipos || []) {
      const openDate = i.open_date;
      if (openDate && typeof openDate === 'string' && openDate.trim()) {
        const val = openDate.trim();
        if (i.id) ipoOpenDateMap.set(i.id, val);
        if (i.backend_ipo_id) ipoOpenDateMap.set(i.backend_ipo_id, val);
        if (i.ipo_name) ipoOpenDateMap.set(i.ipo_name.trim().toLowerCase(), val);
        if (i.company_name) ipoOpenDateMap.set(i.company_name.trim().toLowerCase(), val);
        if (i.symbol) ipoOpenDateMap.set(i.symbol.trim().toLowerCase(), val);
      }
    }

    for (const a of applications || []) {
      const openDate = a.open_date;
      if (openDate && typeof openDate === 'string' && openDate.trim()) {
        const val = openDate.trim();
        if (a.ipo_id) ipoOpenDateMap.set(a.ipo_id, val);
        if (a.ipo_name) ipoOpenDateMap.set(a.ipo_name.trim().toLowerCase(), val);
      }
    }

    const getIpoOpenDate = (ipoId?: string, ipoName?: string): string | undefined => {
      if (ipoId && ipoOpenDateMap.has(ipoId)) {
        return ipoOpenDateMap.get(ipoId);
      }
      const normName = (ipoName || '').trim().toLowerCase();
      if (normName && ipoOpenDateMap.has(normName)) {
        return ipoOpenDateMap.get(normName);
      }
      return undefined;
    };

    // Canonical name and user mapping to strictly guarantee 0 duplicate records
    // regardless of whether the record originates from SQLite allotments, SQLite applications,
    // active job polling, or session memory.
    const ipoCanonicalNameMap = new Map<string, string>();
    for (const b of backendIpos || []) {
      const cName = (b.company?.displayName || b.companyName || b.symbol || b.id || '').trim().toLowerCase();
      if (cName) {
        if (b.id) ipoCanonicalNameMap.set(b.id, cName);
        if (b.companyName) ipoCanonicalNameMap.set(b.companyName.trim().toLowerCase(), cName);
        if (b.company?.displayName) ipoCanonicalNameMap.set(b.company.displayName.trim().toLowerCase(), cName);
        if (b.symbol) ipoCanonicalNameMap.set(b.symbol.trim().toLowerCase(), cName);
      }
    }
    for (const i of ipos || []) {
      const cName = (i.company_name || i.ipo_name || i.symbol || i.id || '').trim().toLowerCase();
      if (cName) {
        if (i.id) ipoCanonicalNameMap.set(i.id, ipoCanonicalNameMap.get(i.backend_ipo_id || '') || cName);
        if (i.backend_ipo_id) ipoCanonicalNameMap.set(i.backend_ipo_id, ipoCanonicalNameMap.get(i.id) || cName);
        if (i.ipo_name) ipoCanonicalNameMap.set(i.ipo_name.trim().toLowerCase(), cName);
        if (i.company_name) ipoCanonicalNameMap.set(i.company_name.trim().toLowerCase(), cName);
        if (i.symbol) ipoCanonicalNameMap.set(i.symbol.trim().toLowerCase(), cName);
      }
    }
    for (const a of applications || []) {
      const cName = (a.ipo_name || a.ipo_id || '').trim().toLowerCase();
      if (cName) {
        if (a.ipo_id) ipoCanonicalNameMap.set(a.ipo_id, ipoCanonicalNameMap.get(a.ipo_id) || cName);
        if (a.ipo_name) ipoCanonicalNameMap.set(a.ipo_name.trim().toLowerCase(), cName);
      }
    }

    const userCanonicalMap = new Map<string, string>();
    for (const u of users || []) {
      const canonUser = (u.pan_number ? u.pan_number.trim().toUpperCase() : u.id || u.name || '').trim().toLowerCase();
      if (canonUser) {
        if (u.id) userCanonicalMap.set(u.id, canonUser);
        if (u.pan_number) userCanonicalMap.set(u.pan_number.trim().toUpperCase(), canonUser);
        if (u.name) userCanonicalMap.set(u.name.trim().toLowerCase(), canonUser);
      }
    }

    const getCanonicalKey = (
      ipoId?: string,
      ipoName?: string,
      userId?: string,
      pan?: string,
      userName?: string,
      category?: string,
    ) => {
      const normIpo = (
        (ipoName ? ipoCanonicalNameMap.get(ipoName.trim().toLowerCase()) : undefined) ||
        (ipoId ? ipoCanonicalNameMap.get(ipoId) : undefined) ||
        ipoName ||
        ipoId ||
        ''
      ).trim().toLowerCase();

      const normUser = (
        (pan ? userCanonicalMap.get(pan.trim().toUpperCase()) : undefined) ||
        (pan && pan.trim().toUpperCase() ? pan.trim().toUpperCase() : undefined) ||
        (userName && userName !== 'Applicant' ? userCanonicalMap.get(userName.trim().toLowerCase()) : undefined) ||
        (userName && userName !== 'Applicant' ? userName.trim().toLowerCase() : undefined) ||
        (userId ? userCanonicalMap.get(userId) : undefined) ||
        userId ||
        userName ||
        ''
      ).trim().toLowerCase();

      const normCategory = mapRegistrarCategory(category);
      return normCategory
        ? `${normIpo}:::${normUser}:::${normCategory}`
        : `${normIpo}:::${normUser}`;
    };

    const upsertItem = (item: AllotmentHistoryItem, userId?: string) => {
      const canonicalKey = getCanonicalKey(
        item.ipoId,
        item.ipoName,
        userId,
        item.pan,
        item.userName,
        item.category,
      );
      const existing = itemsMap.get(canonicalKey);
      if (!existing) {
        itemsMap.set(canonicalKey, item);
      } else {
        const isExistingPartial =
          existing.status === 'PARTIALLY_ALLOTTED' || existing.status === 'Partially Allotted';
        const isIncomingPartial =
          item.status === 'PARTIALLY_ALLOTTED' || item.status === 'Partially Allotted';

        let betterShares = existing.sharesAllotted;
        if (isExistingPartial || isIncomingPartial) {
          if (existing.sharesAllotted && item.sharesAllotted) {
            betterShares = Math.min(existing.sharesAllotted, item.sharesAllotted);
          } else {
            betterShares = existing.sharesAllotted || item.sharesAllotted;
          }
        } else {
          betterShares =
            item.sharesAllotted && item.sharesAllotted > 0
              ? item.sharesAllotted
              : existing.sharesAllotted;
        }

        const betterTime = item.checkedAt || existing.checkedAt;
        const betterFormattedTime = item.checkedAtFormatted || existing.checkedAtFormatted;
        const betterStatus =
          isExistingPartial || isIncomingPartial
            ? 'PARTIALLY_ALLOTTED'
            : (item.status || existing.status);
        const betterOpenDate = item.ipoOpenDate || existing.ipoOpenDate;
        const betterPan = existing.pan || item.pan;
        const betterUserName =
          existing.userName && existing.userName !== 'Applicant'
            ? existing.userName
            : item.userName || existing.userName;
        const betterCategory = existing.category || item.category;

        itemsMap.set(canonicalKey, {
          ...existing,
          sharesAllotted: betterShares,
          checkedAt: betterTime,
          checkedAtFormatted: betterFormattedTime,
          status: betterStatus,
          ipoOpenDate: betterOpenDate,
          pan: betterPan,
          userName: betterUserName,
          category: betterCategory,
        });
      }
    };

    // 1. Process persisted allotment records from ipo_allotments table
    for (const alt of allotments || []) {
      const normStatus = (alt.allotment_status || '').trim().toUpperCase();
      const isAllotted = normStatus === 'ALLOTTED' || normStatus === 'PARTIALLY_ALLOTTED';

      // Strictly show all successful allotment results
      if (!isAllotted) continue;

      const app = applications.find((a) => a.id === alt.application_id);
      const usr = users.find((u) => u.id === alt.user_id || u.id === app?.user_id);
      const ipo = ipos.find((i) => i.id === alt.ipo_id || i.id === app?.ipo_id);
      const matchedBackendIpo = backendIpos.find(
        (b) =>
          b.id === alt.ipo_id ||
          b.id === app?.ipo_id ||
          (ipo?.backend_ipo_id && b.id === ipo.backend_ipo_id) ||
          b.company?.displayName?.toLowerCase().trim() === (app?.ipo_name || ipo?.ipo_name)?.toLowerCase().trim(),
      );

      const appliedShares = app?.shares_count || app?.quantity || 0;
      const lotSize = getAuthoritativeIpoLotSize(matchedBackendIpo || ipo, backendIpos, ipos, app?.category);
      let allottedShares: number | undefined;

      if (normStatus === 'PARTIALLY_ALLOTTED' || app?.status === 'Partially Allotted') {
        allottedShares =
          typeof alt.allotted_shares === 'number' && alt.allotted_shares > 0 && (appliedShares <= 0 || alt.allotted_shares < appliedShares)
            ? alt.allotted_shares
            : typeof app?.allotted_shares === 'number' && app.allotted_shares > 0 && (appliedShares <= 0 || app.allotted_shares < appliedShares)
            ? app.allotted_shares
            : typeof alt.allotted_lots === 'number' && alt.allotted_lots > 0 && lotSize > 0
            ? alt.allotted_lots * lotSize
            : lotSize > 0
            ? lotSize
            : (appliedShares > 0 ? Math.floor(appliedShares / 2) : undefined);
      } else {
        allottedShares =
          typeof alt.allotted_shares === 'number' && alt.allotted_shares > 0
            ? alt.allotted_shares
            : typeof app?.allotted_shares === 'number' && app.allotted_shares > 0
            ? app.allotted_shares
            : typeof alt.allotted_lots === 'number' && alt.allotted_lots > 0 && lotSize > 0
            ? alt.allotted_lots * lotSize
            : typeof app?.shares_count === 'number' && app.shares_count > 0
            ? app.shares_count
            : typeof app?.quantity === 'number' && app.quantity > 0
            ? app.quantity
            : lotSize > 0 ? lotSize : undefined;
      }

      const ipoId = matchedBackendIpo?.id || ipo?.id || app?.ipo_id;
      const ipoName = app?.ipo_name || ipo?.company_name || ipo?.ipo_name || 'IPO';
      const ipoOpenDate = getIpoOpenDate(ipoId, ipoName);

      upsertItem(
        {
          id: alt.id,
          ipoId,
          ipoName,
          ipoOpenDate,
          userName: app?.user_name || usr?.name || 'Applicant',
          pan: usr?.pan_number || (app as any)?.user_pan_number || '',
          status: normStatus,
          sharesAllotted: allottedShares,
          checkedAt: alt.checked_at,
          checkedAtFormatted: formatAllotmentTimestamp(alt.checked_at),
          category: mapRegistrarCategory(app?.category),
          applicationId: alt.application_id,
        },
        alt.user_id || app?.user_id || usr?.id,
      );
    }

    // 2. Merge sessionAllotments (tracked immediately when fetched in this session)
    for (const sessionItem of sessionAllotments) {
      if (sessionItem.status === 'ALLOTTED' || sessionItem.status === 'PARTIALLY_ALLOTTED') {
        upsertItem(sessionItem);
      }
    }

    // 3. Merge activeJob items if available (live or completed check in current session)
    if (activeJob?.items && selectedIpo) {
      for (const item of activeJob.items) {
        const rawStatus = (item.status || '').trim().toUpperCase();
        const isAllotted = rawStatus === 'ALLOTTED' || rawStatus === 'PARTIALLY_ALLOTTED';

        if (!isAllotted) continue;

        const backendMask = (item.maskedId || '').trim().toUpperCase();
        const usr = users.find((u) => {
          const p = (u.pan_number || '').trim().toUpperCase();
          if (!p) return false;
          return (
            (p.length === 10 && getBackendMaskedPan(p) === backendMask) ||
            maskPan(p).toUpperCase() === backendMask ||
            p === backendMask ||
            p === (item as any).pan
          );
        });

        const app = applications.find((a) => {
          if (a.user_id !== usr?.id) return false;
          const aIpo = ipos.find((i) => i.id === a.ipo_id);
          return (
            a.ipo_id === selectedIpo.id ||
            aIpo?.backend_ipo_id === selectedIpo.id ||
            (a.ipo_name && selectedIpo.ipo_name && a.ipo_name.toLowerCase().trim() === selectedIpo.ipo_name.toLowerCase().trim()) ||
            (a.ipo_name && selectedIpo.company_name && a.ipo_name.toLowerCase().trim() === selectedIpo.company_name.toLowerCase().trim())
          );
        });

        const appliedShares = app?.shares_count || app?.quantity || 0;
        let allottedShares: number | undefined;

        if (rawStatus === 'PARTIALLY_ALLOTTED' || app?.status === 'Partially Allotted') {
          allottedShares =
            typeof item.sharesAllotted === 'number' && item.sharesAllotted > 0 && (appliedShares <= 0 || item.sharesAllotted < appliedShares)
              ? item.sharesAllotted
              : typeof app?.allotted_shares === 'number' && app.allotted_shares > 0 && (appliedShares <= 0 || app.allotted_shares < appliedShares)
              ? app.allotted_shares
              : selectedIpo?.lot_size || (appliedShares > 0 ? Math.floor(appliedShares / 2) : undefined);
        } else {
          allottedShares =
            typeof item.sharesAllotted === 'number' && item.sharesAllotted > 0
              ? item.sharesAllotted
              : typeof app?.allotted_shares === 'number' && app.allotted_shares > 0
              ? app.allotted_shares
              : typeof app?.shares_count === 'number' && app.shares_count > 0
              ? app.shares_count
              : typeof app?.quantity === 'number' && app.quantity > 0
              ? app.quantity
              : selectedIpo?.lot_size || undefined;
        }

        const checkedAt = item.checkedAt || activeJob.updatedAt || activeJob.createdAt || new Date().toISOString();

        // If this application was already persisted in SQLite allotments with identical timestamp & status, reuse id
        const existingAlt = app ? (allotments || []).find((a) => a.application_id === app.id) : undefined;
        const key = existingAlt && existingAlt.checked_at === checkedAt
          ? existingAlt.id
          : `job_${selectedIpo.id}_${usr?.id || item.maskedId}_${checkedAt || ''}`;

        const ipoId = selectedIpo.id;
        const ipoName = selectedIpo.company_name || selectedIpo.ipo_name || 'IPO';
        const ipoOpenDate = getIpoOpenDate(ipoId, ipoName) || (selectedIpo as any).open_date || (selectedIpo as any).openDate;

        if (item.categoryResults && item.categoryResults.length > 0) {
          for (const catRes of item.categoryResults) {
            const catStatus = (catRes.status || '').trim().toUpperCase();
            if (catStatus !== 'ALLOTTED' && catStatus !== 'PARTIALLY_ALLOTTED') continue;

            const catApplied = catRes.sharesApplied || appliedShares || 0;
            let catShares: number | undefined;

            if (catStatus === 'PARTIALLY_ALLOTTED') {
              catShares =
                typeof catRes.sharesAllotted === 'number' && catRes.sharesAllotted > 0 && (catApplied <= 0 || catRes.sharesAllotted < catApplied)
                  ? catRes.sharesAllotted
                  : typeof app?.allotted_shares === 'number' && app.allotted_shares > 0 && (catApplied <= 0 || app.allotted_shares < catApplied)
                  ? app.allotted_shares
                  : selectedIpo?.lot_size || (catApplied > 0 ? Math.floor(catApplied / 2) : undefined);
            } else {
              catShares =
                typeof catRes.sharesAllotted === 'number' && catRes.sharesAllotted > 0
                  ? catRes.sharesAllotted
                  : selectedIpo?.lot_size || undefined;
            }

            const catName = mapRegistrarCategory(catRes.category);
            const catKey = `${key}_${catName}`;

            upsertItem(
              {
                id: catKey,
                ipoId,
                ipoName,
                ipoOpenDate,
                userName: usr?.name || app?.user_name || 'Applicant',
                pan: usr?.pan_number || '',
                status: catStatus,
                sharesAllotted: catShares,
                checkedAt,
                checkedAtFormatted: formatAllotmentTimestamp(checkedAt),
                category: catName,
                applicationId: app?.id,
              },
              usr?.id,
            );
          }
        } else {
          upsertItem(
            {
              id: key,
              ipoId,
              ipoName,
              ipoOpenDate,
              userName: usr?.name || app?.user_name || 'Applicant',
              pan: usr?.pan_number || '',
              status: rawStatus,
              sharesAllotted: allottedShares,
              checkedAt,
              checkedAtFormatted: formatAllotmentTimestamp(checkedAt),
              category: mapRegistrarCategory(app?.category),
              applicationId: app?.id,
            },
            usr?.id,
          );
        }
      }
    }

    // 4. Include applications with genuine allotment status that lack an ipo_allotments row
    for (const app of applications) {
      const isLegitAllotted =
        app.status === 'Allotted' ||
        app.status === 'Partially Allotted';

      if (!isLegitAllotted) continue; // STRICTLY EXCLUDE Applied, Mandate Approved, etc.

      const usr = users.find((u) => u.id === app.user_id);
      const ipo = ipos.find((i) => i.id === app.ipo_id);
      const matchedBackendIpo = backendIpos.find(
        (b) =>
          b.id === app.ipo_id ||
          (ipo?.backend_ipo_id && b.id === ipo.backend_ipo_id) ||
          b.company?.displayName?.toLowerCase().trim() === app.ipo_name?.toLowerCase().trim(),
      );

      const appliedShares = app.shares_count || app.quantity || 0;
      const lotSize = getAuthoritativeIpoLotSize(matchedBackendIpo || ipo, backendIpos, ipos, app?.category);
      let sharesCount: number | undefined;
      if (app.status === 'Partially Allotted') {
        sharesCount =
          typeof (app as any).allotted_shares === 'number' && (app as any).allotted_shares > 0
            ? (app as any).allotted_shares
            : typeof (app as any).allotted_lots === 'number' && (app as any).allotted_lots > 0 && lotSize > 0
            ? (app as any).allotted_lots * lotSize
            : lotSize > 0
            ? lotSize
            : (appliedShares > 0 ? Math.floor(appliedShares / 2) : undefined);
      } else {
        sharesCount =
          typeof (app as any).allotted_shares === 'number' && (app as any).allotted_shares > 0
            ? (app as any).allotted_shares
            : typeof (app as any).allotted_lots === 'number' && (app as any).allotted_lots > 0 && lotSize > 0
            ? (app as any).allotted_lots * lotSize
            : typeof (app as any).shares_count === 'number' && (app as any).shares_count > 0
            ? (app as any).shares_count
            : lotSize > 0 ? lotSize : undefined;
      }

      const ipoId = matchedBackendIpo?.id || app.ipo_id;
      const ipoName = app.ipo_name || ipo?.company_name || ipo?.ipo_name || 'IPO';
      const ipoOpenDate = getIpoOpenDate(ipoId, ipoName);
      const normCat = mapRegistrarCategory(app.category);

      const canonicalKey = getCanonicalKey(
        ipoId,
        ipoName,
        app.user_id,
        usr?.pan_number,
        app.user_name || usr?.name,
        normCat,
      );
      if (itemsMap.has(canonicalKey)) continue;

      const status = app.status === 'Partially Allotted' ? 'PARTIALLY_ALLOTTED' : 'ALLOTTED';

      upsertItem(
        {
          id: app.id,
          ipoId,
          ipoName,
          ipoOpenDate,
          userName: app.user_name || usr?.name || 'Applicant',
          pan: usr?.pan_number || '',
          status,
          sharesAllotted: sharesCount,
          checkedAt: app.updated_at || app.created_at || undefined,
          checkedAtFormatted: formatAllotmentTimestamp(app.updated_at || app.created_at),
          category: normCat,
          applicationId: app.id,
        },
        app.user_id,
      );
    }

    const items = Array.from(itemsMap.values());
    items.sort(compareAllotmentHistory);
    return items;
  }, [allotments, applications, ipos, users, backendIpos, activeJob, selectedIpo, sessionAllotments]);

  const monthChips = useMemo(() => {
    return generateMonthChips(allotmentHistoryItems, undefined, installDate);
  }, [allotmentHistoryItems, installDate]);

  const selectedMonthLabel = useMemo(() => {
    if (selectedHistoryMonth.toLowerCase() === 'all') return 'All';
    const found = monthChips.find(
      (c) => c.key.toLowerCase() === selectedHistoryMonth.toLowerCase()
    );
    if (found) return found.label;
    return selectedHistoryMonth;
  }, [selectedHistoryMonth, monthChips]);

  const filteredHistoryItems = useMemo(() => {
    return filterAllotmentHistoryByMonth(allotmentHistoryItems, selectedHistoryMonth);
  }, [allotmentHistoryItems, selectedHistoryMonth]);

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: topPad },
      ]}
    >
      {/* Full Screen Background Graphic for Idle State */}
      {!selectedIpo && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            isNonPro ? { top: -100, bottom: -100 } : null,
          ]}
          pointerEvents="none"
        >
          <Image
            source={isDark ? ALLOTMENT_HERO_GRAPHIC_DARK : ALLOTMENT_HERO_GRAPHIC}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        </View>
      )}

      {/* Top Header */}
      <View style={styles.header}>
        {selectedIpo || !isPrimaryTab ? (
          <View style={{ marginRight: 12 }}>
            <IconButton
              name="arrow-left"
              variant="surface"
              size="md"
              onPress={handleBackPress}
            />
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.9}
          delayLongPress={600}
          onLongPress={() => {
            try {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            } catch {}
            setShowDevOption((prev) => !prev);
          }}
          style={(!isPrimaryTab || selectedIpo) ? styles.headerCenterPro : { flex: 1, justifyContent: 'center' }}
        >
          <Text
            style={[
              styles.headerEyebrow,
              { color: colors.primary },
              (!isPrimaryTab || selectedIpo) && styles.headerEyebrowPro,
            ]}
          >
            {selectedIpo ? 'ALLOTMENT RESULT' : 'REGISTRAR STATUS'}
          </Text>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.foreground },
              (!isPrimaryTab || selectedIpo) ? styles.headerTitlePro : null,
            ]}
            numberOfLines={1}
          >
            {selectedIpo ? (selectedIpo.ipo_name || selectedIpo.company_name) : 'Allotment Checker'}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={[
              styles.historyHeaderBtn,
              {
                backgroundColor: isMaskNames
                  ? (isDark ? 'rgba(99, 102, 241, 0.18)' : '#EEF2FF')
                  : colors.card,
                borderColor: isMaskNames ? colors.primary : colors.border,
              },
            ]}
            onPress={toggleMaskNames}
            activeOpacity={0.8}
            hitSlop={6}
            accessibilityLabel={isMaskNames ? 'Show applicant names' : 'Mask applicant names'}
            accessibilityRole="button"
          >
            <Feather
              name={isMaskNames ? 'eye-off' : 'eye'}
              size={18}
              color={isMaskNames ? colors.primary : colors.foreground}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.historyHeaderBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowHistoryModal(true)}
            activeOpacity={0.8}
            hitSlop={6}
            accessibilityLabel="Allotment History"
            accessibilityRole="button"
          >
            <Feather name="clock" size={18} color={colors.foreground} />
            <View
              style={[
                styles.historyTickBadge,
                { backgroundColor: '#10B981', borderColor: colors.card },
              ]}
            >
              <Feather name="check" size={8} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          {/* Developer Diagnostics Button (hidden by default, toggled via header title long-press) */}
          {showDevOption && (
            <IconButton
              name="terminal"
              variant={showDiagnostics ? 'primary' : 'surface'}
              size="md"
              onPress={() => setShowDiagnostics((prev) => !prev)}
            />
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          !selectedIpo && styles.scrollContentIdle,
          {
            paddingTop: 18,
            paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + (isPrimaryTab ? 96 : 16),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Initial Idle IPO Selector Card (Only when no IPO is selected) */}
        {!selectedIpo && (
          <TouchableOpacity
            style={[
              styles.ipoSelectorCard,
              {
                backgroundColor: isDark ? colors.card : '#FFFFFF',
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              setIpoSearchQuery('');
              setShowIpoPicker(true);
            }}
            activeOpacity={0.82}
          >
            <View style={styles.ipoSelectorLeft}>
              <View style={styles.ipoSelectorTextCol}>
                <Text
                  style={[styles.ipoSelectorName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  Choose from registered IPOs...
                </Text>
                <Text
                  style={[styles.ipoSelectorHint, { color: colors.mutedForeground }]}
                >
                  Direct registrar verification for saved PANs
                </Text>
              </View>
            </View>
            <Feather
              name="chevron-down"
              size={20}
              color={colors.mutedForeground}
              style={{ marginLeft: 8, marginRight: 2 }}
            />
          </TouchableOpacity>
        )}

        {/* Quick Check Section: 4 Latest IPO Cards (Shown in idle state) */}
        {!selectedIpo && quickCheckIpos.length > 0 && (
          <View style={styles.quickSection}>
            <View style={styles.quickSectionHeader}>
              <Text style={[styles.quickSectionTitle, { color: colors.foreground }]}>
                Quick Allotment Check
              </Text>
            </View>

            <View style={styles.quickGrid}>
              {quickCheckIpos.map((item) => {
                const isSelected = selectedIpoId === item.id;
                const avatarGradient = getAvatarGradient(item.ipo_name);
                const monogram = getIpoMonogram(item.ipo_name);
                const cardWidth = Math.max(140, Math.floor((windowWidth - 32 - 10) / 2));

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.quickCard,
                      {
                        width: cardWidth,
                        backgroundColor: isDark ? colors.card : '#FFFFFF',
                        borderColor: isSelected ? colors.primary : colors.border,
                        borderWidth: isSelected ? 1.5 : 1,
                      },
                    ]}
                    onPress={() => {
                      try {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch {}
                      handleSelectIpo(item.id);
                    }}
                    activeOpacity={0.78}
                  >
                    <View style={styles.quickCardTop}>
                      <View
                        style={[
                          styles.quickLogoBox,
                          {
                            backgroundColor: '#FFFFFF',
                            borderColor: isDark ? '#334155' : '#E2E8F0',
                          },
                        ]}
                      >
                        {item.logo_url && !quickLogoErrors[item.id] ? (
                          <ExpoImage
                            source={{ uri: getResolvedLogoUrl(item.logo_url) || item.logo_url }}
                            style={styles.quickLogoImage}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                            priority="high"
                            onError={() => {
                              setQuickLogoErrors((prev) => ({ ...prev, [item.id]: true }));
                            }}
                          />
                        ) : (
                          <LinearGradient
                            colors={avatarGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.quickAvatar}
                          >
                            <Text style={styles.quickAvatarText}>{monogram}</Text>
                          </LinearGradient>
                        )}
                      </View>

                      <Text
                        style={[
                          styles.quickIpoName,
                          { color: colors.foreground, flex: 1, marginLeft: 8, marginRight: 6 },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {item.ipo_name}
                      </Text>

                      <View
                        style={[
                          styles.quickActionPill,
                          {
                            backgroundColor: isDark
                              ? 'rgba(255, 255, 255, 0.08)'
                              : '#F1F5F9',
                          },
                        ]}
                      >
                        <Feather
                          name="arrow-up-right"
                          size={12}
                          color={isDark ? '#94A3B8' : '#64748B'}
                        />
                      </View>
                    </View>

                    <View style={styles.quickCardBottom}>
                      <Text
                        style={[
                          styles.quickSubText,
                          { color: colors.mutedForeground },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {item.issue_type || 'Mainboard'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Idle Spacer to push intro/trust content to bottom 30% */}
        {!selectedIpo && <View style={{ flex: 1, minHeight: 32 }} />}

        {/* Idle Intro & Trust Section (Bottom 30%) */}
        {!selectedIpo && (
          <View style={styles.idleBottomHeroContainer}>
            <View style={styles.idleHeroTextWrap}>
              <Text
                style={[
                  styles.idleHeroTitle,
                  { color: isDark ? '#FFFFFF' : '#0F172A' },
                ]}
              >
                Check Your IPO Allotment
              </Text>
              <Text
                style={[
                  styles.idleHeroSubtitle,
                  { color: isDark ? '#94A3B8' : '#64748B' },
                ]}
              >
                Enter your PAN and application details to instantly check your IPO allotment status.
              </Text>
            </View>

            {/* Trust Badges */}
            <View style={styles.trustBadgesRow}>
              {/* Badge 1: Secure & Private */}
              <View style={styles.trustBadgeItem}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={24}
                  color={isDark ? '#38BDF8' : '#1E293B'}
                  style={styles.trustBadgeIcon}
                />
                <View style={styles.trustBadgeTextWrap}>
                  <Text
                    style={[
                      styles.trustBadgeTitle,
                      { color: isDark ? '#F1F5F9' : '#0F172A' },
                    ]}
                    numberOfLines={1}
                  >
                    Secure & Private
                  </Text>
                  <Text
                    style={[
                      styles.trustBadgeSubtitle,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                    numberOfLines={1}
                  >
                    Your data is protected
                  </Text>
                </View>
              </View>

              {/* Vertical Divider */}
              <View
                style={[
                  styles.trustBadgeDivider,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.15)'
                      : '#CBD5E1',
                  },
                ]}
              />

              {/* Badge 2: Fast & Accurate */}
              <View style={styles.trustBadgeItem}>
                <Ionicons
                  name="flash-outline"
                  size={24}
                  color={isDark ? '#FBBF24' : '#1E293B'}
                  style={styles.trustBadgeIcon}
                />
                <View style={styles.trustBadgeTextWrap}>
                  <Text
                    style={[
                      styles.trustBadgeTitle,
                      { color: isDark ? '#F1F5F9' : '#0F172A' },
                    ]}
                    numberOfLines={1}
                  >
                    Fast & Accurate
                  </Text>
                  <Text
                    style={[
                      styles.trustBadgeSubtitle,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                    numberOfLines={1}
                  >
                    Get results in seconds
                  </Text>
                </View>
              </View>

              {/* Vertical Divider */}
              <View
                style={[
                  styles.trustBadgeDivider,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.15)'
                      : '#CBD5E1',
                  },
                ]}
              />

              {/* Badge 3: All Major Registrars */}
              <View style={styles.trustBadgeItem}>
                <Feather
                  name="globe"
                  size={21}
                  color={isDark ? '#34D399' : '#1E293B'}
                  style={styles.trustBadgeIcon}
                />
                <View style={styles.trustBadgeTextWrap}>
                  <Text
                    style={[
                      styles.trustBadgeTitle,
                      { color: isDark ? '#F1F5F9' : '#0F172A' },
                    ]}
                    numberOfLines={1}
                  >
                    All Major Registrars
                  </Text>
                  <Text
                    style={[
                      styles.trustBadgeSubtitle,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                    numberOfLines={1}
                  >
                    KFintech, MUFG, Link Intime
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Quick Check horizontal switcher when an IPO is selected */}
        {selectedIpo && quickCheckIpos.length > 1 && (
          <View style={styles.quickBarContainer}>
            <View style={styles.quickBarHeader}>
              <Text style={[styles.quickBarTitle, { color: colors.mutedForeground }]}>
                QUICK ALLOTMENT CHECK
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickBarScroll}
            >
              {quickCheckIpos.map((item) => {
                const isSelected = selectedIpoId === item.id;
                const avatarGradient = getAvatarGradient(item.ipo_name);
                const monogram = getIpoMonogram(item.ipo_name);

                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => {
                      if (isSelected) return;
                      try {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch {}
                      handleSelectIpo(item.id);
                    }}
                    style={[
                      styles.quickBarChip,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(16, 185, 129, 0.16)'
                            : '#ECFDF5'
                          : isDark
                          ? colors.card
                          : '#FFFFFF',
                        borderColor: isSelected ? '#10B981' : colors.border,
                        borderWidth: isSelected ? 1.5 : 1,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.quickBarLogoBox,
                        {
                          backgroundColor: '#FFFFFF',
                          borderColor: isDark ? '#334155' : '#E2E8F0',
                        },
                      ]}
                    >
                      {item.logo_url && !quickLogoErrors[item.id] ? (
                        <ExpoImage
                          source={{ uri: getResolvedLogoUrl(item.logo_url) || item.logo_url }}
                          style={styles.quickBarLogo}
                          contentFit="contain"
                          cachePolicy="memory-disk"
                          priority="high"
                          onError={() => setQuickLogoErrors((p) => ({ ...p, [item.id]: true }))}
                        />
                      ) : (
                        <LinearGradient
                          colors={avatarGradient}
                          style={styles.quickBarAvatar}
                        >
                          <Text style={styles.quickBarAvatarText}>{monogram}</Text>
                        </LinearGradient>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.quickBarName,
                        {
                          color: isSelected
                            ? isDark
                              ? '#34D399'
                              : '#059669'
                            : colors.foreground,
                          fontFamily: isSelected
                            ? 'GoogleSansFlex_700Bold'
                            : 'GoogleSansFlex_600SemiBold',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.ipo_name}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Selected IPO Info Card (Shown when an IPO is selected) */}
        {selectedIpo && (
          <ImageBackground
            source={cardBgGraphic}
            style={[
              styles.infoCard,
              {
                backgroundColor: isDark ? colors.card : '#F4FAF7',
                borderColor: isDark ? colors.border : '#E2EBE6',
              },
            ]}
            imageStyle={styles.infoCardBgImage}
            resizeMode="cover"
          >
            <View style={styles.infoCardInner}>
              {/* Top Row: Eyebrow + Switch IPO Button */}
              <View style={styles.infoHeaderRow}>
                <Text
                  style={[
                    styles.infoCardTitle,
                    { color: isDark ? colors.mutedForeground : '#627D77' },
                  ]}
                >
                  IPO ALLOTMENT STATUS
                </Text>
                <TouchableOpacity
                  style={[
                    styles.switchButton,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
                      borderColor: isDark ? colors.border : '#E2E8F0',
                    },
                  ]}
                  onPress={handleSwitchIpo}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="swap-horizontal"
                    size={15}
                    color={colors.foreground}
                  />
                  <Text style={[styles.switchButtonText, { color: colors.foreground }]}>
                    Switch IPO
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Company Hero Row: Square Box Avatar/Logo + (Tag & Name) */}
              <View style={styles.infoHeroRow}>
                <View style={styles.infoHeroLeft}>
                  {/* Square Box for Company Logo with Light Grey Stroke */}
                  <View
                    style={[
                      styles.infoLogoBox,
                      {
                        backgroundColor: '#FFFFFF',
                        borderColor: isDark ? '#334155' : '#E2E8F0',
                      },
                    ]}
                  >
                    {selectedIpo.logo_url && !logoLoadFailed ? (
                      <ExpoImage
                        source={{ uri: getResolvedLogoUrl(selectedIpo.logo_url) || selectedIpo.logo_url }}
                        style={styles.infoCompanyLogoImage}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        priority="high"
                        onError={() => setLogoLoadFailed(true)}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.infoMonogramText,
                          { color: isDark ? '#34D399' : '#0F172A' },
                        ]}
                      >
                        {getIpoMonogram(selectedIpo.ipo_name)}
                      </Text>
                    )}
                  </View>

                  {/* Tag & Company Name */}
                  <View style={styles.infoHeroTextWrap}>
                    <View style={styles.infoHeroHeaderPills}>
                      <View
                        style={[
                          styles.infoTypePill,
                          {
                            backgroundColor: isDark ? 'rgba(47, 160, 17, 0.18)' : '#EBFFDF',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.infoTypePillText,
                            { color: isDark ? '#4ADE80' : '#2FA011' },
                          ]}
                        >
                          {selectedIpo.issue_type || 'Mainboard'}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[styles.infoCompanyName, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {selectedIpo.ipo_name}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Bottom Vertical Specs Container: Registrar & Allotment Date (iOS Glass Effect) */}
              <BlurView
                intensity={Platform.OS === 'ios' ? 50 : 0}
                tint={isDark ? 'dark' : 'light'}
                style={[
                  styles.infoGridContainer,
                  {
                    backgroundColor: isDark
                      ? 'rgba(15, 23, 42, 0.55)'
                      : 'rgba(255, 255, 255, 0.72)',
                    borderColor: isDark
                      ? 'rgba(255, 255, 255, 0.14)'
                      : 'rgba(255, 255, 255, 0.85)',
                  },
                ]}
              >
                {/* Row 1: Registrar */}
                <View style={styles.infoVerticalRow}>
                  <View
                    style={[
                      styles.infoGridIconWrap,
                      {
                        backgroundColor: '#E2E8F0',
                      },
                    ]}
                  >
                    <Ionicons
                      name="server"
                      size={16}
                      color="#000000"
                    />
                  </View>
                  <View style={[styles.infoGridCellText, { flex: 1 }]}>
                    <Text
                      style={[
                        styles.infoGridLabel,
                        { color: isDark ? colors.mutedForeground : '#64748B' },
                      ]}
                    >
                      Registrar
                    </Text>
                    <Text
                      style={[styles.infoGridValue, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {effectiveRegistrar}
                    </Text>
                  </View>
                </View>

                {/* Horizontal Divider */}
                <View
                  style={[
                    styles.infoGridDivider,
                    { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)' },
                  ]}
                />

                {/* Row 2: Allotment Date */}
                <View style={styles.infoVerticalRow}>
                  <View
                    style={[
                      styles.infoGridIconWrap,
                      {
                        backgroundColor: '#E2E8F0',
                      },
                    ]}
                  >
                    <Ionicons
                      name="calendar"
                      size={16}
                      color="#000000"
                    />
                  </View>
                  <View style={styles.infoGridCellText}>
                    <Text
                      style={[
                        styles.infoGridLabel,
                        { color: isDark ? colors.mutedForeground : '#64748B' },
                      ]}
                    >
                      Allotment Date
                    </Text>
                    <Text
                      style={[styles.infoGridValue, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {selectedIpo.allotment_date || 'TBD'}
                    </Text>
                  </View>
                </View>
              </BlurView>
            </View>
          </ImageBackground>
        )}

        {/* Unsupported Registrar Notice Banner */}
        {selectedIpo && !isAutomatedSupported && (
          <View
            style={{
              padding: 16,
              borderRadius: 16,
              borderWidth: 1,
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
              borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#F59E0B',
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="alert-triangle" size={18} color={isDark ? '#FBBF24' : '#B45309'} />
              <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', color: isDark ? '#FBBF24' : '#92400E' }}>
                Automated checking unavailable for this registrar
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', color: isDark ? '#FCD34D' : '#B45309', lineHeight: 18 }}>
              Automated checking is unavailable for {effectiveRegistrar}. PAN automation for this registrar is not implemented. Technical/unsupported statuses are never presented as &quot;No shares allotted&quot;. Please verify manually on the official portal.
            </Text>
            <TouchableOpacity
              style={{
                marginTop: 4,
                backgroundColor: '#B45309',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 9999,
                alignSelf: 'flex-start',
              }}
              onPress={() => void Linking.openURL(registrarConfig.url)}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold' }}>
                Open Official {effectiveRegistrar} Portal
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Progress & Live Status Bar (Only rendered after selection during check) */}
        {selectedIpo && (isCreatingJob || isPolling) && (
          <View
            style={[
              styles.progressCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.progressHeaderRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.progressText, { color: colors.foreground }]}>
                {progressText}
              </Text>
            </View>
            <View
              style={[
                styles.progressBarBg,
                { backgroundColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.primary,
                    width: activeJob
                      ? `${Math.min(
                          100,
                          (activeJob.processedChecks /
                            Math.max(1, activeJob.totalChecks)) *
                            100,
                        )}%`
                      : '15%',
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Error Banner */}
        {jobError && (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
              },
            ]}
          >
            <Feather name="alert-circle" size={18} color={isDark ? '#F87171' : '#DC2626'} />
            <Text style={[styles.errorBannerText, { color: isDark ? '#F87171' : '#B91C1C' }]}>
              {jobError}
            </Text>
          </View>
        )}

        {/* TEMPORARY DEVELOPER DIAGNOSTICS PANEL (Toggled via Header Icon) */}
        {showDiagnostics && (
          <DeveloperDiagnosticsPanel
            appBuildMarker={APP_DEBUG_BUILD}
            apiBaseUrl={API_BASE_URL}
            healthState={healthState}
            userId={activeUserId || undefined}
            ipoResolution={ipoResolution}
            selectedIpo={selectedIpo}
            effectiveRegistrar={effectiveRegistrar}
            isAutomatedSupported={isAutomatedSupported}
            activeJob={activeJob}
            isCreatingJob={isCreatingJob}
            isPolling={isPolling}
            jobError={jobError}
            lastErrorOrigin={lastErrorOrigin}
            abortedOrigin={abortedOrigin}
            panSyncState={panSyncState}
            jobCreationState={jobCreationState}
            jobTiming={jobTiming}
            pollingDiag={pollingDiag}
            apiTraces={apiTraces}
            eventLogs={eventLogs}
            uiApplicants={uiApplicants}
            summaryCounts={summaryCounts}
            onClearDiagnostics={handleClearDiagnostics}
            onRunCheckAgain={handleRunCheckAgain}
          />
        )}

        {/* Summary Card (Only rendered after an IPO has been selected) */}
        {selectedIpo && (
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.summaryGrid}>
              {/* Tile 1: TOTAL */}
              <View
                style={[
                  styles.summaryTile,
                  { backgroundColor: isDark ? 'rgba(96, 115, 134, 0.15)' : '#EDF4F9' },
                ]}
              >
                <Text style={[styles.summaryCount, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  {summaryCounts.total}
                </Text>
                <Text style={[styles.summaryLabel, { color: isDark ? '#94A3B8' : '#607386' }]}>
                  TOTAL
                </Text>
                <View style={styles.summaryIconWrap}>
                  <Ionicons name="people" size={14} color={isDark ? '#94A3B8' : '#607386'} />
                </View>
              </View>

              {/* Tile 2: ALLOTTED */}
              <View
                style={[
                  styles.summaryTile,
                  { backgroundColor: isDark ? 'rgba(47, 160, 17, 0.18)' : '#EBFFDF' },
                ]}
              >
                <Text style={[styles.summaryCount, { color: isDark ? '#4ADE80' : '#2FA011' }]}>
                  {summaryCounts.allotted}
                </Text>
                <Text style={[styles.summaryLabel, { color: isDark ? '#4ADE80' : '#2FA011' }]}>
                  ALLOTTED
                </Text>
                <View style={styles.summaryIconWrap}>
                  <Ionicons name="checkmark-circle" size={14} color={isDark ? '#4ADE80' : '#2FA011'} />
                </View>
              </View>

              {/* Tile 3: NOT ALLOTTED */}
              <View
                style={[
                  styles.summaryTile,
                  { backgroundColor: isDark ? 'rgba(242, 78, 78, 0.18)' : '#FFE8E8' },
                ]}
              >
                <Text style={[styles.summaryCount, { color: isDark ? '#FB7185' : '#F24E4E' }]}>
                  {summaryCounts.notAllotted}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.summaryLabel, { color: isDark ? '#FB7185' : '#F24E4E' }]}
                >
                  NOT ALLOTTED
                </Text>
                <View style={styles.summaryIconWrap}>
                  <Ionicons name="close-circle" size={14} color={isDark ? '#FB7185' : '#F24E4E'} />
                </View>
              </View>

              {/* Tile 4: NO RECORD */}
              <View
                style={[
                  styles.summaryTile,
                  { backgroundColor: isDark ? 'rgba(96, 115, 134, 0.15)' : '#EDF4F9' },
                ]}
              >
                <Text style={[styles.summaryCount, { color: isDark ? '#94A3B8' : '#607386' }]}>
                  {summaryCounts.noRecord}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.summaryLabel, { color: isDark ? '#94A3B8' : '#607386' }]}
                >
                  NO RECORD
                </Text>
                <View style={styles.summaryIconWrap}>
                  <Icon name="search" size={14} color={isDark ? '#94A3B8' : '#607386'} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Applicant Cards Header & List (Only rendered after an IPO has been selected) */}
        {selectedIpo && (
          <>
            {/* Empty State when no applicants exist in total */}
            {uiApplicants.length === 0 && !isCreatingJob && !isPolling && (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather name="users" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  No Applicants Found
                </Text>
                <Text
                  style={[styles.emptySubtitle, { color: colors.mutedForeground }]}
                >
                  Add applicant profiles to automatically check allotments for this
                  IPO.
                </Text>
              </View>
            )}

            {/* Applicant List - only displays applicants after checking is performed */}
            <View style={styles.applicantList}>
              {visibleApplicants.map((applicant) => {
                const avatarGradient = getAvatarGradient(applicant.userName || 'User');
                const initial = (applicant.userName || 'U').trim().charAt(0).toUpperCase();
                const matchingApp =
                  applications.find((a) => a.id === applicant.applicationId) ||
                  applications.find(
                    (a) =>
                      a.user_id === applicant.userId &&
                      ((selectedIpo?.id && a.ipo_id === selectedIpo.id) ||
                        (selectedIpo?.ipo_name &&
                          a.ipo_name?.toLowerCase().trim() ===
                            selectedIpo.ipo_name.toLowerCase().trim())),
                  );

                return (
                  <TouchableOpacity
                    key={applicant.applicationId}
                    activeOpacity={matchingApp ? 0.7 : 1}
                    onPress={() => {
                      if (matchingApp) {
                        setSelectedAppForUpdate(matchingApp);
                      }
                    }}
                    style={[
                      styles.applicantCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    {/* Top Row: Left Side (Avatar + Name & PAN) and Right Side (Overall Allotment Badge) */}
                    <View style={styles.applicantCardTopRow}>
                      <View style={styles.applicantLeftWrap}>
                        <ApplicantAvatar
                          avatarUrl={isMaskNames ? undefined : applicant.avatarUrl}
                          name={isMaskNames ? maskApplicantName(applicant.userName) : applicant.userName}
                        />
                        <View style={styles.applicantInfoLeft}>
                          <Text style={[styles.applicantName, { color: colors.foreground }]}>
                            {isMaskNames ? maskApplicantName(applicant.userName) : applicant.userName}
                          </Text>
                          <Text
                            style={[
                              styles.applicantPan,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {maskPan(applicant.pan)}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AllotmentStatusBadge
                          status={applicant.status as any}
                          sharesAllotted={applicant.sharesAllotted}
                        />
                      </View>
                    </View>

                    {/* Category Breakdown: Show all verified categories within the SAME user card */}
                    {applicant.categories && applicant.categories.length > 1 && (
                      <View
                        style={[
                          styles.categoryBreakdownWrap,
                          {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                          },
                        ]}
                      >
                        {sortCategoriesForDisplay(applicant.categories).map((cat, cIdx) => (
                          <View
                            key={`${cat.category}_${cIdx}`}
                            style={[
                              styles.categoryBreakdownRow,
                              cIdx > 0 && {
                                borderTopWidth: 1,
                                borderTopColor: isDark
                                  ? 'rgba(255, 255, 255, 0.06)'
                                  : '#EDF2F7',
                              },
                            ]}
                          >
                            <View style={styles.categoryNameCol}>
                              <View
                                style={[
                                  styles.categoryDot,
                                  { backgroundColor: getCategoryThemeColor(cat.category) },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.categoryNameText,
                                  { color: colors.foreground },
                                ]}
                              >
                                {getDeterministicBreakdownLabel(cat, applicant.categories || [])}
                              </Text>
                            </View>

                            <View style={styles.categoryBadgeCol}>
                              <Text
                                style={[
                                  styles.categoryStatusText,
                                  { color: getCategoryStatusTextColor(cat.status, isDark) },
                                ]}
                              >
                                {formatCategoryStatusText(cat)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* AdMob Banner Ad */}
            <BannerAdView style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 16 }} />
          </>
        )}
      </ScrollView>

      {/* IPO Picker Modal */}
      <Modal
        visible={showIpoPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          setIpoSearchQuery('');
          setShowIpoPicker(false);
        }}
      >
        <TouchableOpacity
          style={styles.pickerModalOverlay}
          activeOpacity={1}
          onPress={() => {
            setIpoSearchQuery('');
            setShowIpoPicker(false);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.pickerModalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.pickerModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerModalTitle, { color: colors.foreground }]}>
                Select IPO to Check Allotment
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setIpoSearchQuery('');
                  setShowIpoPicker(false);
                }}
                style={styles.pickerCloseBtn}
                hitSlop={8}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Fast Instant Search Bar */}
            <View
              style={[
                styles.pickerSearchContainer,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}
            >
              <Icon
                name="search"
                size={16}
                color={colors.mutedForeground}
                style={{ marginRight: 8 }}
              />
              <TextInput
                value={ipoSearchQuery}
                onChangeText={setIpoSearchQuery}
                placeholder="Search IPO name or symbol..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.pickerSearchInput, { color: colors.foreground }]}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {ipoSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setIpoSearchQuery('')} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filteredSelectableIpos}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              maxToRenderPerBatch={15}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              ListEmptyComponent={
                isLoadingPublishedIpos && selectableIpos.length === 0 ? (
                  <ShimmerGroup>
                    <View style={{ padding: 16, gap: 12 }}>
                      {[1, 2, 3, 4].map((i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                          <ShimmerBlock width={36} height={36} borderRadius={10} />
                          <View style={{ flex: 1, gap: 6 }}>
                            <ShimmerBlock width="65%" height={14} borderRadius={4} />
                            <ShimmerBlock width="40%" height={11} borderRadius={4} />
                          </View>
                        </View>
                      ))}
                    </View>
                  </ShimmerGroup>
                ) : (
                  <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <Text
                      style={{
                        color: colors.mutedForeground,
                        fontSize: 13,
                        fontFamily: 'GoogleSansFlex_400Regular',
                        textAlign: 'center',
                      }}
                    >
                      {ipoSearchQuery.trim()
                        ? `No IPOs matching "${ipoSearchQuery}"`
                        : 'No IPOs available for allotment checking.'}
                    </Text>
                  </View>
                )
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.pickerRow,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor:
                        selectedIpoId === item.id
                          ? isDark
                            ? '#27272A'
                            : '#F1F5F9'
                          : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    setIpoSearchQuery('');
                    handleSelectIpo(item.id);
                  }}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text
                      style={[
                        styles.pickerRowName,
                        {
                          color:
                            selectedIpoId === item.id
                              ? colors.primary
                              : colors.foreground,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {item.ipo_name}
                    </Text>
                    <View style={styles.pickerRegistrarRow}>
                      <Text
                        style={[
                          styles.pickerRowSub,
                          { color: colors.mutedForeground, flexShrink: 1 },
                        ]}
                        numberOfLines={1}
                      >
                        Registrar: {getRegistrarShortName(item.registrar)}
                      </Text>
                    </View>
                  </View>
                  {selectedIpoId === item.id && (
                    <Feather name="check" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>


      {/* Allotment History & Recent Applications Modal */}
      <Modal
        visible={showHistoryModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <TouchableOpacity
          style={styles.pickerModalOverlay}
          activeOpacity={1}
          onPress={() => setShowHistoryModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.historyModalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.pickerModalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ position: 'relative' }}>
                  <Feather name="clock" size={18} color={colors.primary} />
                  <View
                    style={[
                      styles.modalHistoryTickBadge,
                      { backgroundColor: '#10B981', borderColor: colors.card },
                    ]}
                  >
                    <Feather name="check" size={7} color="#FFFFFF" />
                  </View>
                </View>
                <Text style={[styles.pickerModalTitle, { color: colors.foreground }]}>
                  Allotment History
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowHistoryModal(false)}
                style={styles.pickerCloseBtn}
                hitSlop={8}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Month Filter Chips Bar with Sticky 'All' Chip */}
            <View
              style={[
                styles.historyMonthFilterBar,
                { borderBottomColor: colors.border, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#F8FAFC' },
              ]}
            >
              {/* Sticky All Chip */}
              <View
                style={[
                  styles.historyStickyAllContainer,
                  { borderRightColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)' },
                ]}
              >
                <TouchableOpacity
                  onPress={() => {
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } catch {}
                    setSelectedHistoryMonth('all');
                  }}
                  style={[
                    styles.historyMonthChip,
                    {
                      backgroundColor: selectedHistoryMonth.toLowerCase() === 'all'
                        ? (isDark ? colors.primary : '#0F172A')
                        : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF'),
                      borderColor: selectedHistoryMonth.toLowerCase() === 'all'
                        ? (isDark ? colors.primary : '#0F172A')
                        : colors.border,
                    },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.historyMonthChipText,
                      {
                        color: selectedHistoryMonth.toLowerCase() === 'all'
                          ? (isDark ? '#0F172A' : '#FFFFFF')
                          : colors.foreground,
                        fontFamily: selectedHistoryMonth.toLowerCase() === 'all'
                          ? 'GoogleSansFlex_700Bold'
                          : 'GoogleSansFlex_500Medium',
                      },
                    ]}
                  >
                    All
                  </Text>
                  {allotmentHistoryItems.length > 0 && (
                    <View
                      style={[
                        styles.historyMonthChipBadge,
                        {
                          backgroundColor: selectedHistoryMonth.toLowerCase() === 'all'
                            ? (isDark ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.25)')
                            : (isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0'),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.historyMonthChipBadgeText,
                          {
                            color: selectedHistoryMonth.toLowerCase() === 'all'
                              ? (isDark ? '#0F172A' : '#FFFFFF')
                              : colors.mutedForeground,
                          },
                        ]}
                      >
                        {allotmentHistoryItems.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Scrollable Month Chips (Current Month directly beside All) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.historyMonthScrollView}
                contentContainerStyle={styles.historyMonthScroll}
              >
                {monthChips.map((chip) => {
                  const isSelected = selectedHistoryMonth.toLowerCase() === chip.key.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={chip.key}
                      onPress={() => {
                        try {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        } catch {}
                        setSelectedHistoryMonth(chip.key);
                      }}
                      style={[
                        styles.historyMonthChip,
                        {
                          backgroundColor: isSelected
                            ? (isDark ? colors.primary : '#0F172A')
                            : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF'),
                          borderColor: isSelected
                            ? (isDark ? colors.primary : '#0F172A')
                            : colors.border,
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.historyMonthChipText,
                          {
                            color: isSelected
                              ? (isDark ? '#0F172A' : '#FFFFFF')
                              : colors.foreground,
                            fontFamily: isSelected
                              ? 'GoogleSansFlex_700Bold'
                              : 'GoogleSansFlex_500Medium',
                          },
                        ]}
                      >
                        {chip.label}
                      </Text>
                      {chip.count > 0 && (
                        <View
                          style={[
                            styles.historyMonthChipBadge,
                            {
                              backgroundColor: isSelected
                                ? (isDark ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.25)')
                                : (isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0'),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.historyMonthChipBadgeText,
                              {
                                color: isSelected
                                  ? (isDark ? '#0F172A' : '#FFFFFF')
                                  : colors.mutedForeground,
                              },
                            ]}
                          >
                            {chip.count}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <FlatList
              data={filteredHistoryItems}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}
              ListEmptyComponent={
                <View style={{ padding: 28, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Feather name="inbox" size={32} color={colors.mutedForeground} />
                  <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold' }}>
                    {selectedHistoryMonth === 'all'
                      ? 'No Allotment History'
                      : `No Allotments in ${selectedMonthLabel.toUpperCase()}`}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 18 }}>
                    {selectedHistoryMonth === 'all'
                      ? 'Check any active IPO above to verify registrar allotment for your PANs.'
                      : `No verified allotments found for ${selectedMonthLabel.toUpperCase()}.`}
                  </Text>
                  {selectedHistoryMonth !== 'all' && (
                    <TouchableOpacity
                      onPress={() => setSelectedHistoryMonth('all')}
                      style={[
                        styles.historyResetBtn,
                        { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' },
                      ]}
                    >
                      <Text style={[styles.historyResetBtnText, { color: colors.primary }]}>
                        Show All Allotments ({allotmentHistoryItems.length})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.historyRow,
                    { borderBottomColor: colors.border },
                  ]}
                  onPress={() => {
                    setShowHistoryModal(false);
                    if (item.ipoId) {
                      handleSelectIpo(item.ipoId);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.historyRowName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.ipoName}
                    </Text>
                    <Text style={[styles.historyRowSub, { color: colors.mutedForeground }]}>
                      {isMaskNames ? maskApplicantName(item.userName) : item.userName}{item.category ? ` [${formatCategoryDisplayName(item.category)}]` : ''}{item.checkedAtFormatted ? ` • ${item.checkedAtFormatted}` : ''}
                    </Text>
                  </View>
                  <AllotmentStatusBadge
                    status={item.status as any}
                    sharesAllotted={item.sharesAllotted}
                    size="sm"
                  />
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Manual Application Status Update Modal */}
      <UpdateApplicationModal
        application={selectedAppForUpdate}
        onClose={() => setSelectedAppForUpdate(null)}
      />

      {/* Confetti celebration overlay directly on the result screen */}
      {showConfetti && <ConfettiContainer />}
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================

const diagStyles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F59E0B',
    padding: 14,
    gap: 12,
    marginVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    color: '#F59E0B',
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  tagBadge: {
    backgroundColor: '#92400E',
    color: '#FEF3C7',
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  expandToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#1E293B',
    borderRadius: 6,
  },
  expandToggleText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  controlBtnPrimary: {
    borderColor: '#0284C7',
  },
  controlBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  body: {
    gap: 10,
    marginTop: 4,
  },
  abortedAlertCard: {
    backgroundColor: '#450A0A',
    borderColor: '#EF4444',
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  abortedAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  abortedAlertTitle: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  sectionBox: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionTitle: {
    color: '#38BDF8',
    fontSize: 11,
    marginBottom: 4,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  diagCodeLine: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  diagVal: {
    color: '#F1F5F9',
  },
  diagValBold: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  diagMutedText: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#334155',
  },
  stageName: {
    color: '#CBD5E1',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    flex: 1,
  },
  stageRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageDetailText: {
    color: '#64748B',
    fontSize: 10,
    maxWidth: 130,
  },
  badgeBox: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  apiTraceItem: {
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#334155',
  },
  apiTraceMethod: {
    color: '#F1F5F9',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  apiTraceSub: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  logScrollView: {
    maxHeight: 120,
    backgroundColor: '#090D16',
    borderRadius: 6,
    padding: 8,
  },
  logText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 14,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 60,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  headerCenterPro: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingLeft: 72,
    paddingRight: 116,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
    textAlign: 'left',
  },
  headerEyebrowPro: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.8,
    lineHeight: 34,
    textAlign: 'left',
  },
  headerTitlePro: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    lineHeight: 24,
    textAlign: 'center',
  },
  headerTitleSelected: {
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  historyTickBadge: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHistoryTickBadge: {
    position: 'absolute',
    right: -5,
    bottom: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  quickSection: {
    width: '100%',
    marginTop: 4,
  },
  quickSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickSectionTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.2,
  },
  quickSeeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  quickSeeAllText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCard: {
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 14,
    justifyContent: 'space-between',
    minHeight: 70,
  },
  quickCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickLogoBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 0,
    margin: 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  quickLogoImage: {
    ...StyleSheet.absoluteFillObject,
    width: 32,
    height: 32,
  },
  quickAvatar: {
    ...StyleSheet.absoluteFillObject,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAvatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  quickActionPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCardBottom: {
    gap: 2,
  },
  quickCardRegistrarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 2,
  },
  quickRegistrarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  quickRegistrarPillText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  quickBarRegistrarText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  quickIpoName: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    lineHeight: 17,
  },
  quickSubText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 14,
  },
  quickBarContainer: {
    marginBottom: 4,
    gap: 8,
  },
  quickBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickBarTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  quickBarScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  quickBarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    maxWidth: 220,
  },
  quickBarLogoBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    overflow: 'hidden',
    padding: 0,
    margin: 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  quickBarLogo: {
    ...StyleSheet.absoluteFillObject,
    width: 24,
    height: 24,
  },
  quickBarAvatar: {
    ...StyleSheet.absoluteFillObject,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBarAvatarText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  quickBarName: {
    fontSize: 12.5,
    maxWidth: 150,
  },
  ipoSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  ipoSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  ipoSelectorIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ipoSelectorTextCol: {
    flex: 1,
    gap: 3,
  },
  ipoSelectorLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  ipoSelectorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ipoSelectorName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  ipoSelectorHint: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  ipoSelectorChevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  ipoRegistrarText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
  },
  switchButtonText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  infoCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  infoCardBgImage: {
    borderRadius: 24,
  },
  infoCardInner: {
    paddingTop: 16,
    paddingHorizontal: 5,
    paddingBottom: 5,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 11,
    marginBottom: 14,
  },
  infoCardTitle: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  infoHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 11,
    marginBottom: 16,
  },
  infoHeroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6,
    gap: 12,
  },
  infoLogoBox: {
    width: 54,
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 0,
    margin: 0,
    position: 'relative',
  },
  infoCompanyLogoImage: {
    ...StyleSheet.absoluteFillObject,
    width: 54,
    height: 54,
  },
  infoMonogramText: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  infoHeroTextWrap: {
    flex: 1,
    gap: 4,
  },
  infoHeroHeaderPills: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  infoTypePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 50,
  },
  infoTypePillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  infoRegistrarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 50,
    borderWidth: 1,
  },
  infoRegistrarPillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.1,
  },
  infoRegistrarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoRegistrarActionText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  infoCompanyName: {
    fontSize: 18.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    lineHeight: 23,
  },
  infoGridContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  infoVerticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  infoGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoGridCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 4,
  },
  infoGridIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGridCellText: {
    flex: 1,
    gap: 1.5,
  },
  infoGridLabel: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  infoGridValue: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 0.5,
  },
  infoGridSubtext: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  infoGridDivider: {
    height: 1,
    marginVertical: 12,
  },
  readySectionTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 6,
    marginBottom: -4,
  },
  progressCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
    flex: 1,
    lineHeight: 18,
  },
  summaryCard: {
    padding: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 4,
  },
  summaryTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 12,
    gap: 2,
  },
  summaryCount: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  summaryIconWrap: {
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    maxWidth: 260,
  },
  applicantList: {
    gap: 8,
  },
  applicantCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  applicantCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  categoryBreakdownWrap: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  categoryBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  categoryNameCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryNameText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  categoryBadgeCol: {
    flexShrink: 0,
  },
  categoryStatusText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.1,
  },
  applicantLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  applicantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  applicantAvatarText: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  applicantInfoLeft: {
    gap: 2,
    flex: 1,
  },
  applicantName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  applicantPan: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    letterSpacing: 0.5,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    width: '92%',
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    maxHeight: '85%',
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  historyModalCard: {
    width: '92%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    maxHeight: '80%',
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  historyMonthFilterBar: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
  },
  historyStickyAllContainer: {
    paddingRight: 8,
    borderRightWidth: 1,
    marginRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyMonthScrollView: {
    flex: 1,
  },
  historyMonthScroll: {
    paddingRight: 14,
    gap: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyMonthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 20,
    borderWidth: 1,
  },
  historyMonthChipText: {
    fontSize: 12.5,
  },
  historyMonthChipBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMonthChipBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  historyResetBtn: {
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  historyResetBtnText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  historyRowName: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  historyRowSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerModalTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  pickerCloseBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    paddingVertical: 0,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  pickerRowName: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
    marginRight: 8,
  },
  pickerRowSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  pickerRegistrarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 3,
  },
  pickerRegistrarLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  pickerRegistrarLinkText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  scrollContentIdle: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  idleBottomHeroContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 8,
    marginTop: 50,
    marginBottom: 70,
    gap: 16,
  },
  idleHeroTextWrap: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  idleHeroTitle: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  idleHeroSubtitle: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 19.5,
    maxWidth: 340,
  },
  trustBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 4,
    paddingHorizontal: 2,
  },
  trustBadgeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  trustBadgeIcon: {
    flexShrink: 0,
  },
  trustBadgeTextWrap: {
    flex: 1,
    gap: 1.5,
  },
  trustBadgeTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  trustBadgeSubtitle: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 12,
  },
  trustBadgeDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 3,
  },
  celebrationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  celebrationModalCard: {
    width: '90%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  celebrationIconOuter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#10B98122',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  celebrationIconInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 6,
  },
  celebrationSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  celebrationList: {
    width: '100%',
    gap: 8,
    marginBottom: 20,
  },
  celebrationApplicantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  celebrationApplicantName: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  celebrationApplicantPan: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
  celebrationSharesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  celebrationSharesText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#065F46',
  },
  celebrationDismissBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 9999,
    width: '100%',
    alignItems: 'center',
  },
  celebrationDismissBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
