import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { API_BASE_URL } from '@/constants/apiConfig';
import { AllotmentStatusBadge } from '@/components/allotment/AllotmentStatusBadge';
import { IconButton } from '@/components/ui/IconButton';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import { useTheme } from '@/context/ThemeContext';
import { useColors } from '@/hooks/useColors';
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
  appliedQuantity: number;
  price: number;
  status:
    | 'pending'
    | 'checking'
    | 'allotted'
    | 'partially_allotted'
    | 'not_allotted'
    | 'no_record'
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
      status: uiApplicants.length > 0 ? 'SUCCESS' : 'WAITING',
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
  summaryCounts: { total: number; allotted: number; notAllotted: number; noRecord: number; needsReview: number };
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
              Counters: Total={props.summaryCounts.total}, Allotted={props.summaryCounts.allotted}, NotAllotted={props.summaryCounts.notAllotted}, NoRecord={props.summaryCounts.noRecord}, NeedsReview={props.summaryCounts.needsReview}
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
  const { applications, users } = useDB();
  const { user } = useAuth();

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
  const celebratedJobIdsRef = useRef<Set<string>>(new Set());

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
    const fromSelectable = selectableIpos.find((i) => i.id === selectedIpoId);
    if (fromSelectable) return fromSelectable;
    const fromAllBackend = backendIpos.find((i) => i.id === selectedIpoId);
    if (fromAllBackend) return normalizeBackendIpoForChecker(fromAllBackend);
    if (directSelectedIpo && directSelectedIpo.id === selectedIpoId) return directSelectedIpo;
    return null;
  }, [selectedIpoId, selectableIpos, backendIpos, directSelectedIpo]);

  // Effective registrar resolution (falls back to keyword matching / registrarConfig when empty)
  const effectiveRegistrar = useMemo(() => {
    if (!selectedIpo) return '';
    const cfg = getRegistrarConfig(selectedIpo.registrar || selectedIpo.ipo_name);
    if (cfg.name !== 'Official Portal') {
      return cfg.name;
    }
    return 'Link Intime India Private Ltd';
  }, [selectedIpo]);

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

        // 1. Collect all local applicant PANs from user profiles and applications for sync
        const userPanMap = new Map<string, { userId: string; pan: string; name: string }>();
        users.forEach((usr) => {
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

    // Use current applications if available, otherwise fallback to all saved user profiles with valid PAN
    const applicantProfiles = currentApplications.length > 0
      ? currentApplications.map((app) => {
          const usr = users.find((u) => u.id === app.user_id);
          return {
            applicationId: app.id,
            userId: app.user_id,
            userName: usr?.name || 'Applicant',
            pan: usr?.pan_number || '',
          };
        })
      : users
          .filter((u) => u.pan_number && u.pan_number.trim().length === 10)
          .map((u) => ({
            applicationId: `saved_${u.id}`,
            userId: u.id,
            userName: u.name || 'Applicant',
            pan: u.pan_number,
          }));

    if (applicantProfiles.length === 0) return [];

    const list = applicantProfiles.map((profile) => {
      const pan = profile.pan;
      const masked = maskPan(pan).toUpperCase();
      const expectedBackendMask = getBackendMaskedPan(pan);

      // Find matching backend job item by masked ID or fallback
      let matchedItem: BackendJobItem | undefined;
      for (const item of activeJob?.items || []) {
        const backendMask = (item.maskedId || '').toUpperCase();
        if (
          backendMask === expectedBackendMask ||
          backendMask === masked ||
          backendMask.slice(-4) === masked.slice(-4) ||
          (backendMask.length === 10 && pan.length === 10 && backendMask[0] === pan[0] && backendMask.slice(-1) === pan.slice(-1))
        ) {
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
        status = 'checking';
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
          status = 'pending';
          errorMessage = matchedItem.errorMessage || 'Allotment is not yet available from registrar.';
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
          backendStatus === 'UNKNOWN' &&
          (activeJob?.status === 'QUEUED' || activeJob?.status === 'RUNNING')
        ) {
          status = 'checking';
        } else {
          status = 'needs_review';
          errorMessage = matchedItem.errorMessage || 'Status pending review.';
        }
      } else if ((activeJob || jobError) && !matchedItem) {
        status = 'needs_review';
        errorMessage = jobError || 'Check incomplete.';
      }

      return {
        applicationId: profile.applicationId,
        userId: profile.userId,
        userName: profile.userName,
        pan,
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
    let needsReview = 0;

    for (const app of uiApplicants) {
      if (app.status === 'allotted' || app.status === 'partially_allotted') {
        allotted++;
      } else if (app.status === 'not_allotted') {
        notAllotted++;
      } else if (app.status === 'no_record') {
        noRecord++;
      } else if (app.status === 'needs_review' || app.status === 'check_failed') {
        needsReview++;
      }
    }

    if (activeJob) {
      total = activeJob.totalChecks || total;
    }

    return { total, allotted, notAllotted, noRecord, needsReview };
  }, [uiApplicants, activeJob]);

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
              { backgroundColor: colors.surface, borderColor: colors.border },
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
          <View
            style={[
              styles.emptyHeroCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {/* Top decorative badge & icon */}
            <View style={styles.emptyHeroIconWrapper}>
              <View
                style={[
                  styles.emptyHeroIconOuter,
                  { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}33` },
                ]}
              >
                <View
                  style={[
                    styles.emptyHeroIconInner,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Feather name="shield" size={24} color="#FFFFFF" />
                </View>
              </View>
            </View>

            <Text style={[styles.emptyHeroTitle, { color: colors.foreground }]}>
              Instant Allotment Verification
            </Text>
            <Text style={[styles.emptyHeroSubtitle, { color: colors.mutedForeground }]}>
              Check allotment status across multiple PAN applications simultaneously with direct registrar verification.
            </Text>

            {/* Feature Pill Cards */}
            <View style={styles.featuresList}>
              <View
                style={[
                  styles.featureRow,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <View style={[styles.featureIconBadge, { backgroundColor: '#3B82F620' }]}>
                  <Feather name="check-circle" size={16} color="#3B82F6" />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={[styles.featureHeading, { color: colors.foreground }]}>
                    Automated Registrar Query
                  </Text>
                  <Text style={[styles.featureSubtext, { color: colors.mutedForeground }]}>
                    Direct discovery for KFin Technologies & MUFG Intime
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.featureRow,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <View style={[styles.featureIconBadge, { backgroundColor: '#10B98120' }]}>
                  <Feather name="users" size={16} color="#10B981" />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={[styles.featureHeading, { color: colors.foreground }]}>
                    Batch Multi-Applicant Check
                  </Text>
                  <Text style={[styles.featureSubtext, { color: colors.mutedForeground }]}>
                    Verify all saved family and applicant PANs in one single run
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.featureRow,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <View style={[styles.featureIconBadge, { backgroundColor: '#F59E0B20' }]}>
                  <Feather name="zap" size={16} color="#F59E0B" />
                </View>
                <View style={styles.featureTextWrapper}>
                  <Text style={[styles.featureHeading, { color: colors.foreground }]}>
                    Live Status Summary
                  </Text>
                  <Text style={[styles.featureSubtext, { color: colors.mutedForeground }]}>
                    Categorized Allotted, Not Allotted, and No Record counts
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Selected IPO Info Card (Shown when an IPO is selected) */}
        {selectedIpo && (
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.infoHeaderRow}>
              <Text style={[styles.infoCardTitle, { color: colors.mutedForeground }]}>
                IPO ALLOTMENT STATUS
              </Text>
              <TouchableOpacity
                style={[styles.switchButton, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}
                onPress={handleSwitchIpo}
              >
                <Text style={[styles.switchButtonText, { color: colors.foreground }]}>
                  Switch IPO
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.infoCompanyName, { color: colors.foreground }]}>
              {selectedIpo.ipo_name}
            </Text>

            <View style={styles.infoGrid}>
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoGridLabel, { color: colors.mutedForeground }]}>
                  Registrar
                </Text>
                <Text style={[styles.infoGridValue, { color: colors.foreground }]}>
                  {effectiveRegistrar}
                </Text>
              </View>
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoGridLabel, { color: colors.mutedForeground }]}>
                  Allotment Date
                </Text>
                <Text style={[styles.infoGridValue, { color: colors.foreground }]}>
                  {selectedIpo.allotment_date || 'TBD'}
                </Text>
              </View>
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoGridLabel, { color: colors.mutedForeground }]}>
                  Issue Type
                </Text>
                <Text style={[styles.infoGridValue, { color: colors.foreground }]}>
                  {selectedIpo.issue_type || 'Mainboard'}
                </Text>
              </View>
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoGridLabel, { color: colors.mutedForeground }]}>
                  Applications
                </Text>
                <Text style={[styles.infoGridValue, { color: colors.foreground, fontWeight: 'bold' }]}>
                  {uiApplicants.length || currentApplications.length}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Unsupported Registrar Notice Banner */}
        {selectedIpo && !isAutomatedSupported && (
          <View
            style={{
              padding: 16,
              borderRadius: 16,
              borderWidth: 1,
              backgroundColor: '#FEF3C7',
              borderColor: '#F59E0B',
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="alert-triangle" size={20} color="#B45309" />
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#92400E' }}>
                Automated checking unavailable for this registrar
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: '#B45309', lineHeight: 18 }}>
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
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' }}>
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
              { backgroundColor: colors.surface, borderColor: colors.border },
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
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={20} color="#FF5252" />
            <Text style={styles.errorBannerText}>{jobError}</Text>
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
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.foreground }]}>
                  {summaryCounts.total}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  TOTAL
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: '#00C853' }]}>
                  {summaryCounts.allotted}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  ALLOTTED
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text
                  style={[
                    styles.summaryCount,
                    { color: '#EF4444' },
                  ]}
                >
                  {summaryCounts.notAllotted + summaryCounts.noRecord}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  NOT ALLOTTED
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: '#FFB300' }]}>
                  {summaryCounts.needsReview}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  NEEDS REVIEW
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Applicant Cards Header & List (Only rendered after an IPO has been selected) */}
        {selectedIpo && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Saved Applicants ({uiApplicants.length})
              </Text>
            </View>

            {/* Empty State */}
            {uiApplicants.length === 0 && !isCreatingJob && (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
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

            {/* Applicant List */}
            {uiApplicants.map((applicant) => (
              <View
                key={applicant.applicationId}
                style={[
                  styles.applicantCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {/* Top Row: Name + PAN on Left, Status Badge on Right */}
                <View style={styles.applicantHeaderRow}>
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
                  <AllotmentStatusBadge
                    status={
                      applicant.status === 'no_record'
                        ? 'not_allotted'
                        : (applicant.status as any)
                    }
                    sharesAllotted={applicant.sharesAllotted}
                  />
                </View>

                {/* Bottom Row: Timestamp/Status Text on Left, Black Refresh Button on Right */}
                <View style={styles.applicantBottomRow}>
                  <View style={styles.applicantBottomLeft}>
                    <Text
                      style={[
                        styles.checkedTimeText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {applicant.checkedAt
                        ? `Last checked ${formatCheckedTime(applicant.checkedAt)}`
                        : 'Not checked yet'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.applicantRefreshBtn}
                    onPress={() => handleCheckSingleApplicant(applicant)}
                    disabled={
                      checkingApplicantId === applicant.applicationId ||
                      isCreatingJob ||
                      isPolling
                    }
                    activeOpacity={0.7}
                  >
                    {checkingApplicantId === applicant.applicationId ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Feather name="rotate-cw" size={14} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
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
              { backgroundColor: colors.surface, borderColor: colors.border },
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
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center' }}>
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
                        backgroundColor: isDark ? '#14291E' : '#ECFDF5',
                        borderColor: isDark ? '#065F46' : '#A7F3D0',
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
                    <View style={styles.celebrationSharesBadge}>
                      <Feather name="check" size={13} color="#059669" />
                      <Text style={styles.celebrationSharesText}>
                        {app.sharesAllotted
                          ? `${app.sharesAllotted} shares`
                          : 'Allotted'}
                      </Text>
                    </View>
                  </View>
                ))}
            </View>

            <TouchableOpacity
              style={styles.celebrationDismissBtn}
              onPress={() => setShowCelebrationModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.celebrationDismissBtnText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  ipoSelectorName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  ipoRegistrarText: {
    fontSize: 12,
  },
  switchButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  switchButtonText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  infoCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCardTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  infoCompanyName: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.4,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
    marginTop: 4,
  },
  infoGridItem: {
    width: '50%',
    gap: 3,
  },
  infoGridLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  infoGridValue: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_600SemiBold',
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
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    gap: 8,
  },
  errorBannerText: {
    color: '#D32F2F',
    fontSize: 13,
    flex: 1,
  },
  summaryCard: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  summaryCount: {
    fontSize: 22,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
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
  applicantCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 16,
  },
  applicantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  applicantInfoLeft: {
    gap: 3,
  },
  applicantName: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  applicantPan: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
    letterSpacing: 0.5,
  },
  applicantBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  applicantBottomLeft: {
    flex: 1,
    marginRight: 12,
  },
  checkedTimeText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  applicantRefreshBtn: {
    backgroundColor: '#0F172A',
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyHeroCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  emptyHeroIconWrapper: {
    marginBottom: 4,
  },
  emptyHeroIconOuter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHeroIconInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHeroTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptyHeroSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  featuresList: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  featureIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrapper: {
    flex: 1,
    gap: 2,
  },
  featureHeading: {
    fontSize: 13,
    fontWeight: '600',
  },
  featureSubtext: {
    fontSize: 11,
    lineHeight: 15,
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
