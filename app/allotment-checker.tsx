import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { API_BASE_URL } from '@/constants/apiConfig';
import { AllotmentStatusBadge } from '@/components/allotment/AllotmentStatusBadge';
import { IconButton } from '@/components/ui/IconButton';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import { useAuth } from '@/context/AuthContext';
import { useDB, type ApplicationStatus, type ApplicationWithDetails } from '@/context/DBContext';
import { useTheme } from '@/context/ThemeContext';
import { useColors } from '@/hooks/useColors';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import {
  allotmentApiService,
  BackendJobItem,
  BackendJobResponse,
} from '@/services/allotment/AllotmentApiService';
import { panSyncService } from '@/services/allotment/PanSyncService';
import {
  getRegistrarConfig,
  isAutomatedCheckSupported,
} from '@/services/allotment/registrarConfig';
import { ApiClient, ApiRequestTrace } from '@/services/api/ApiClient';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';

import {
  AllotmentCheckerIpoItem,
  isBackendIpoAllotmentEligible,
  normalizeBackendIpoForChecker,
} from '@/services/allotment/allotmentCheckerIpoSource';

export const APP_DEBUG_BUILD = 'AC-DIAG-20260907-1640';

// Hero and card graphics for allotment checker (can be swapped from assets/images)
const ALLOTMENT_HERO_GRAPHIC = require('@/assets/images/allotment-checker-graphic.png');
const ALLOTMENT_BG_GREY = require('@/assets/images/allotment-status-bg-grey.png');
const ALLOTMENT_BG_GREEN = require('@/assets/images/allotment-status-bg-green.png');
const ALLOTMENT_BG_RED = require('@/assets/images/allotment-status-bg-red.png');

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

  const isCustomPhoto =
    avatarUrl &&
    typeof avatarUrl === 'string' &&
    !avatarUrl.includes('dicebear') &&
    (avatarUrl.startsWith('http://') ||
      avatarUrl.startsWith('https://') ||
      avatarUrl.startsWith('data:') ||
      avatarUrl.startsWith('file://'));

  if (isCustomPhoto && !hasError) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={styles.applicantAvatar}
        resizeMode="cover"
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
            <Text style={{ color: '#38BDF8', fontSize: 11, fontWeight: 'bold', fontFamily: 'SpaceMono', marginBottom: 2 }}>
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

            <Text style={{ color: '#38BDF8', fontSize: 11, fontWeight: 'bold', fontFamily: 'SpaceMono', marginTop: 6, marginBottom: 2 }}>
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

export default function AllotmentCheckerScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams<{ ipoId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { ipos, applications, users, updateApplication } = useDB();
  const { user } = useAuth();
  const [selectedAppForUpdate, setSelectedAppForUpdate] = useState<ApplicationWithDetails | null>(null);

  // Active user ID for backend scoping
  const activeUserId = useMemo(() => {
    const firstUser = users[0] as { owner_id?: string; id?: string } | undefined;
    return user?.id || firstUser?.owner_id || firstUser?.id || 'default-user';
  }, [user, users]);

  // Backend-published IPOs state
  const [backendIpos, setBackendIpos] = useState<BackendIpo[]>([]);
  const [isLoadingPublishedIpos, setIsLoadingPublishedIpos] = useState(false);
  const [directSelectedIpo, setDirectSelectedIpo] = useState<AllotmentCheckerIpoItem | null>(null);

  // Helper to append to chronological log
  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const timestamp =
      new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0');
    setEventLogs((prev) => [{ timestamp, message, type }, ...prev].slice(0, 60));
  }, []);

  const fetchPublishedIpos = useCallback(async () => {
    try {
      setIsLoadingPublishedIpos(true);
      const items = await backendIpoApiService.listBackendIpos();
      setBackendIpos(items);
      addLog(`Loaded ${items.length} published IPOs from backend`, 'info');
    } catch (err: any) {
      addLog(`Failed to load published IPOs: ${err?.message || String(err)}`, 'warn');
    } finally {
      setIsLoadingPublishedIpos(false);
    }
  }, [addLog]);

  useEffect(() => {
    fetchPublishedIpos();
  }, [fetchPublishedIpos]);

  // Selected IPO — Defaults to NULL on initial mount (idle state)
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(null);
  const [showIpoPicker, setShowIpoPicker] = useState(false);
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
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

  // Published backend IPOs filtered for allotment checking eligibility
  const selectableIpos = useMemo((): AllotmentCheckerIpoItem[] => {
    return backendIpos
      .filter(isBackendIpoAllotmentEligible)
      .map(normalizeBackendIpoForChecker);
  }, [backendIpos]);

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

  // Current IPO applications & local user mapping
  const currentApplications = useMemo(() => {
    if (!selectedIpo) return [];
    return applications.filter((app) => app.ipo_id === selectedIpo.id);
  }, [applications, selectedIpo]);

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
        ? `HTTP ${trace.status}`
        : 'NET_ERR';
      addLog(
        `API ${trace.method} ${trace.path} ➔ ${statusText} (${trace.durationMs}ms)`,
        trace.success ? 'success' : trace.aborted ? 'error' : 'warn',
      );
    });
    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [addLog, stopPolling]);

  // Auto-update application status in database from allotment check results
  const syncApplicationStatusesFromJob = useCallback(
    async (jobItems: BackendJobItem[]) => {
      if (!jobItems || jobItems.length === 0 || !selectedIpo) return;

      let hasChanges = false;
      for (const item of jobItems) {
        const backendStatus = (item.status || '').toUpperCase();
        // Only update if definitive outcome: ALLOTTED or NOT_ALLOTTED.
        // For NO_RECORD, APPLICATION_NOT_FOUND, PENDING, NOT_YET_AVAILABLE, etc., keep applications in active (Applied).
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
          return p.length === 10 && getBackendMaskedPan(p) === backendMask;
        });

        for (const usr of matchingUsers) {
          const appsToUpdate = applications.filter((app) => {
            const isSameIpo =
              app.ipo_id === selectedIpo.id ||
              app.ipo_id?.toLowerCase() === selectedIpo.id?.toLowerCase() ||
              (app.ipo_name &&
                selectedIpo.ipo_name &&
                app.ipo_name.toLowerCase().trim() === selectedIpo.ipo_name.toLowerCase().trim());
            const isSameUser = app.user_id === usr.id;
            return isSameIpo && isSameUser && app.status === 'Applied';
          });

          for (const app of appsToUpdate) {
            try {
              await updateApplication(app.id, targetAppStatus);
              hasChanges = true;
              addLog(
                `Auto-updated application for ${usr.name} (${maskPan(usr.pan_number || '')}) ➔ ${targetAppStatus}`,
                'success',
              );
            } catch (err) {
              console.warn('[AllotmentChecker] Error auto-updating application:', err);
            }
          }
        }
      }

      if (hasChanges) {
        backendSyncEmitter.notifyChange();
      }
    },
    [selectedIpo, users, applications, updateApplication, addLog],
  );

  // Poll active backend job
  const startPollingJob = useCallback(
    (jobId: string) => {
      stopPolling();
      setIsPolling(true);

      let pollCount = 0;

      const poll = async () => {
        pollCount++;
        const timeStr = new Date().toLocaleTimeString();

        try {
          const updatedJob = await allotmentApiService.getJob(
            jobId,
            activeUserId,
          );
          setActiveJob(updatedJob);

          if (updatedJob.items && updatedJob.items.length > 0) {
            void syncApplicationStatusesFromJob(updatedJob.items);
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
              void syncApplicationStatusesFromJob(updatedJob.items);
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
    [activeUserId, stopPolling, addLog, setDiagnosticJobError],
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
              userId: activeUserId,
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
              activeUserId,
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
        const job = await allotmentApiService.createJob(canonicalId, activeUserId);
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
        setJobCreationState({
          status: 'SUCCESS',
          httpStatus: 201,
          jobId: job.id,
        });
        setIsCreatingJob(false);
        addLog(`Backend job created in ${durationMs}ms: ${job.id} (Status: ${job.status})`, 'success');

        // 4. Start polling job status
        startPollingJob(job.id);
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

      const targetRegistrar = targetIpo
        ? getRegistrarConfig(targetIpo.registrar || targetIpo.ipo_name).name
        : '';

      addLog(`IPO selected: ${targetIpo?.ipo_name || ipoId} (Registrar: ${targetRegistrar})`, 'info');

      if (targetRegistrar && isAutomatedCheckSupported(targetRegistrar)) {
        void startAutomatedAllotmentCheck(ipoId, targetIpo);
      } else {
        setIpoResolution({
          selectedName: targetIpo?.ipo_name,
          localId: ipoId,
          backendId: ipoId,
          resolutionStatus: 'WAITING',
          resolutionMethod: 'Manual Registrar',
        });
        addLog(`Automated check unavailable for ${targetRegistrar}`, 'warn');
      }
    },
    [selectableIpos, backendIpos, resetCheckState, startAutomatedAllotmentCheck, addLog],
  );

  // Handle Switch IPO action
  const handleSwitchIpo = useCallback(() => {
    resetCheckState();
    setSelectedIpoId(null);
    setShowIpoPicker(true);
    addLog('Switched IPO selection', 'info');
  }, [resetCheckState, addLog]);

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

  // Handle route param ipoId if passed from IPO detail screen
  useEffect(() => {
    if (params.ipoId && params.ipoId !== selectedIpoId && !isCreatingJob && !isPolling) {
      handleSelectIpo(params.ipoId);
    }
  }, [params.ipoId, selectedIpoId, isCreatingJob, isPolling, handleSelectIpo]);

  // Compute live applicant UI states by combining local user profiles with backend job items
  const uiApplicants = useMemo((): UIApplicantState[] => {
    if (!selectedIpo) return [];

    // Use current applications if available, otherwise fallback to all saved user profiles with valid PAN.
    // In both paths, exclude archived users (archived === 1).
    const applicantProfiles = currentApplications.length > 0
      ? currentApplications
          .filter((app) => {
            const usr = users.find((u) => u.id === app.user_id);
            return !usr || usr.archived !== 1; // keep if user not found (safe) or active
          })
          .map((app) => {
            const usr = users.find((u) => u.id === app.user_id);
            return {
              applicationId: app.id,
              userId: app.user_id,
              userName: usr?.name || 'Applicant',
              pan: usr?.pan_number || '',
              avatarUrl: usr?.avatar_url || (usr as any)?.avatar || undefined,
            };
          })
      : users
          .filter((u) => u.archived !== 1 && u.pan_number && u.pan_number.trim().length === 10)
          .map((u) => ({
            applicationId: `saved_${u.id}`,
            userId: u.id,
            userName: u.name || 'Applicant',
            pan: u.pan_number,
            avatarUrl: u.avatar_url || (u as any)?.avatar || undefined,
          }));

    if (applicantProfiles.length === 0) return [];

    const list = applicantProfiles.map((profile) => {
      const pan = profile.pan;
      const masked = maskPan(pan).toUpperCase();
      const expectedBackendMask = getBackendMaskedPan(pan);

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
      let errorMessage: string | undefined;

      if (!isAutomatedSupported) {
        status = 'check_failed';
        errorMessage = `Automated checking unavailable for ${effectiveRegistrar}`;
      } else if (isCreatingJob && !matchedItem) {
        status = 'pending';
      } else if (matchedItem) {
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
          errorMessage = matchedItem.errorMessage || 'No record found on registrar portal.';
        } else if (backendStatus === 'NOT_YET_AVAILABLE') {
          status = 'not_available';
          errorMessage =
            matchedItem.errorMessage ||
            'Allotment information is not yet available from registrar.';
        } else if (
          backendStatus === 'SOURCE_UNAVAILABLE' ||
          backendStatus === 'REGISTRAR_UNRESOLVED' ||
          backendStatus === 'REGISTRAR_UNSUPPORTED' ||
          backendStatus === 'CAPTCHA_REQUIRED' ||
          backendStatus === 'RATE_LIMITED' ||
          backendStatus === 'TEMPORARY_ERROR'
        ) {
          status = 'check_failed';
          errorMessage = matchedItem.errorMessage || 'Registrar portal unavailable or query failed.';
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
        appliedQuantity: selectedIpo?.lot_size || 0,
        price: selectedIpo?.buy_price || 0,
        status,
        sharesAllotted,
        errorMessage,
        checkedAt: matchedItem?.checkedAt || activeJob?.updatedAt,
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
        setShowCelebrationModal(true);
      }
    }
  }, [activeJob, uiApplicants]);

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
      return ALLOTMENT_BG_GREY;
    }
    if (summaryCounts.allotted > 0) {
      return ALLOTMENT_BG_GREEN;
    }
    if (
      summaryCounts.notAvailable > 0 &&
      summaryCounts.notAllotted === 0 &&
      summaryCounts.noRecord === 0 &&
      summaryCounts.needsReview === 0
    ) {
      return ALLOTMENT_BG_GREY;
    }
    return ALLOTMENT_BG_RED;
  }, [isCheckFinished, summaryCounts]);

  // Progress text formatting
  const progressText = useMemo(() => {
    if (isCreatingJob) return 'Initiating check...';
    if (activeJob) {
      return `Checking ${activeJob.processedChecks} of ${activeJob.totalChecks}...`;
    }
    return 'Ready';
  }, [isCreatingJob, activeJob]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          name="arrow-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Allotment Checker
          </Text>
        </View>
        <IconButton
          name="terminal"
          variant={showDiagnostics ? 'primary' : 'surface'}
          size="md"
          onPress={() => setShowDiagnostics((prev) => !prev)}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Initial Idle IPO Selector Card (Only when no IPO is selected) */}
        {!selectedIpo && (
          <TouchableOpacity
            style={[
              styles.ipoSelectorCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => setShowIpoPicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.ipoSelectorLeft}>
              <Text
                style={[styles.ipoSelectorLabel, { color: colors.mutedForeground }]}
              >
                SELECT IPO TO CHECK ALLOTMENT
              </Text>
              <Text style={[styles.ipoSelectorName, { color: colors.foreground }]}>
                Choose from registered IPOs...
              </Text>
            </View>
            <Feather name="chevron-down" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {/* Empty State Graphics / How It Works Guide when no IPO is selected */}
        {!selectedIpo && (
          <View style={styles.emptyHeroContainer}>
            {/* Top decorative graphic */}
            <View style={styles.emptyHeroGraphicWrapper}>
              <Image
                source={ALLOTMENT_HERO_GRAPHIC}
                style={styles.emptyHeroGraphic}
                resizeMode="contain"
              />
            </View>

            <Text style={[styles.emptyHeroTitle, { color: colors.foreground }]}>
              Instant Allotment Verification
            </Text>
            <Text style={[styles.emptyHeroSubtitle, { color: colors.mutedForeground }]}>
              Check allotment status across multiple PAN applications simultaneously with direct registrar verification.
            </Text>
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
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
                        borderColor: isDark ? colors.border : '#E2E8F0',
                      },
                    ]}
                  >
                    {selectedIpo.logo_url && !logoLoadFailed ? (
                      <Image
                        source={{ uri: selectedIpo.logo_url }}
                        style={styles.infoCompanyLogoImage}
                        resizeMode="cover"
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
                intensity={Platform.OS === 'web' ? 0 : 50}
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
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.08)'
                          : 'rgba(255, 255, 255, 0.85)',
                      },
                    ]}
                  >
                    <Ionicons
                      name="server"
                      size={16}
                      color={isDark ? '#94A3B8' : '#475569'}
                    />
                  </View>
                  <View style={styles.infoGridCellText}>
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
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.08)'
                          : 'rgba(255, 255, 255, 0.85)',
                      },
                    ]}
                  >
                    <Ionicons
                      name="calendar"
                      size={16}
                      color={isDark ? '#94A3B8' : '#475569'}
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
                borderRadius: 8,
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
            userId={activeUserId}
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
                  <Feather name="search" size={14} color={isDark ? '#94A3B8' : '#607386'} />
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
                    {/* Left Side: Avatar + (Name & PAN) */}
                    <View style={styles.applicantLeftWrap}>
                      <ApplicantAvatar
                        avatarUrl={applicant.avatarUrl}
                        name={applicant.userName}
                      />
                      <View style={styles.applicantInfoLeft}>
                        <Text style={[styles.applicantName, { color: colors.foreground }]}>
                          {applicant.userName}
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

                    {/* Right Side: Status Badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AllotmentStatusBadge
                        status={applicant.status as any}
                        sharesAllotted={applicant.sharesAllotted}
                      />
                      {Boolean(matchingApp) && (
                        <Feather name="edit-2" size={14} color={colors.mutedForeground} style={{ opacity: 0.7, marginLeft: 2 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* IPO Picker Modal */}
      <Modal
        visible={showIpoPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowIpoPicker(false)}
      >
        <TouchableOpacity
          style={styles.pickerModalOverlay}
          activeOpacity={1}
          onPress={() => setShowIpoPicker(false)}
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
                onPress={() => setShowIpoPicker(false)}
                style={styles.pickerCloseBtn}
                hitSlop={8}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={selectableIpos}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                  {isLoadingPublishedIpos ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center' }}>
                      No IPOs available for allotment checking.
                    </Text>
                  )}
                </View>
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
                          ? (isDark ? '#27272A' : '#F1F5F9')
                          : 'transparent',
                    },
                  ]}
                  onPress={() => handleSelectIpo(item.id)}
                >
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
                  {selectedIpoId === item.id && (
                    <Feather name="check" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Allotment Celebration Modal */}
      <Modal
        visible={showCelebrationModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowCelebrationModal(false)}
      >
        <View style={styles.celebrationModalOverlay}>
          <ConfettiContainer />
          <View
            style={[
              styles.celebrationModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {/* Trophy Icon Badge */}
            <View style={styles.celebrationIconOuter}>
              <View style={styles.celebrationIconInner}>
                <Feather name="award" size={28} color="#FFFFFF" />
              </View>
            </View>

            <Text style={[styles.celebrationTitle, { color: colors.foreground }]}>
              Allotment Received! 🎉
            </Text>
            <Text
              style={[
                styles.celebrationSubtitle,
                { color: colors.mutedForeground },
              ]}
            >
              Congratulations! Shares have been allotted for {selectedIpo?.ipo_name}.
            </Text>

            {/* List of allotted applicants */}
            <View style={styles.celebrationList}>
              {uiApplicants
                .filter(
                  (a) =>
                    a.status === 'allotted' || a.status === 'partially_allotted',
                )
                .map((app) => (
                  <View
                    key={app.applicationId}
                    style={[
                      styles.celebrationApplicantRow,
                      {
                        backgroundColor: isDark ? 'rgba(47, 160, 17, 0.18)' : '#EBFFDF',
                        borderColor: isDark ? 'rgba(68, 179, 0, 0.6)' : '#44B300',
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.celebrationApplicantName,
                          { color: colors.foreground },
                        ]}
                      >
                        {app.userName}
                      </Text>
                      <Text
                        style={[
                          styles.celebrationApplicantPan,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {maskPan(app.pan)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.celebrationSharesBadge,
                        {
                          backgroundColor: isDark
                            ? 'rgba(68, 179, 0, 0.25)'
                            : '#EBFFDF',
                        },
                      ]}
                    >
                      <Feather name="check" size={13} color="#44B300" />
                      <Text
                        style={[
                          styles.celebrationSharesText,
                          { color: isDark ? '#4ADE80' : '#2FA011' },
                        ]}
                      >
                        {app.sharesAllotted
                          ? `${app.sharesAllotted} Shares`
                          : 'Allotted'}
                      </Text>
                    </View>
                  </View>
                ))}
            </View>

            <TouchableOpacity
              style={[
                styles.celebrationDismissBtn,
                { backgroundColor: isDark ? '#FFFFFF' : '#111827' },
              ]}
              onPress={() => setShowCelebrationModal(false)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.celebrationDismissBtnText,
                  { color: isDark ? '#000000' : '#FFFFFF' },
                ]}
              >
                Awesome!
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Manual Application Status Update Modal */}
      <UpdateApplicationModal
        application={selectedAppForUpdate}
        onClose={() => setSelectedAppForUpdate(null)}
      />
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
    fontWeight: 'bold',
    fontFamily: 'SpaceMono',
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
    fontWeight: 'bold',
    fontSize: 12,
    fontFamily: 'SpaceMono',
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
    fontWeight: 'bold',
    marginBottom: 4,
    fontFamily: 'SpaceMono',
  },
  diagCodeLine: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'SpaceMono',
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
    fontFamily: 'SpaceMono',
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
    fontWeight: 'bold',
    fontFamily: 'SpaceMono',
  },
  apiTraceItem: {
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#334155',
  },
  apiTraceMethod: {
    color: '#F1F5F9',
    fontSize: 11,
    fontFamily: 'SpaceMono',
  },
  apiTraceSub: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
  },
  logScrollView: {
    maxHeight: 120,
    backgroundColor: '#090D16',
    borderRadius: 6,
    padding: 8,
  },
  logText: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
    lineHeight: 14,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  ipoSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  ipoSelectorLeft: {
    flex: 1,
    gap: 4,
  },
  ipoSelectorLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  ipoSelectorName: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
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
    borderRadius: 12,
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
  infoTypePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  infoTypePillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
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
    fontFamily: 'SpaceMono',
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
  emptyHeroContainer: {
    alignItems: 'center',
    paddingTop: 66,
    paddingBottom: 24,
    paddingHorizontal: 8,
    gap: 12,
  },
  emptyHeroGraphicWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyHeroGraphic: {
    width: 300,
    height: 260,
  },
  emptyHeroTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyHeroSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 320,
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
    fontFamily: 'SpaceMono',
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
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  celebrationDismissBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
