import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { API_BASE_URL } from '@/constants/apiConfig';
import { AllotmentStatusBadge } from '@/components/allotment/AllotmentStatusBadge';
import { IconButton } from '@/components/ui/IconButton';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
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

export const APP_DEBUG_BUILD = 'AC-DIAG-20260907-1640';

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
          ? `Mapped ${uiApplicants.length} applicants ➔ NEEDS_REVIEW`
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
  summaryCounts: { total: number; allotted: number; notAllotted: number; needsReview: number };
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
              Rule: <Text style={diagStyles.diagVal}>APPLICATION_NOT_FOUND ➔ NEEDS_REVIEW (Needs Review)</Text>
            </Text>
            <Text style={diagStyles.diagCodeLine}>
              Counters: Total={props.summaryCounts.total}, Allotted={props.summaryCounts.allotted}, NotAllotted={props.summaryCounts.notAllotted}, NeedsReview={props.summaryCounts.needsReview}
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
// MAIN SCREEN COMPONENT
// ==========================================

export default function AllotmentCheckerScreen() {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { applications, ipos, users } = useDB();
  const { user } = useAuth();

  // Active user ID for backend scoping
  const activeUserId = useMemo(() => {
    const firstUser = users[0] as { owner_id?: string; id?: string } | undefined;
    return user?.id || firstUser?.owner_id || firstUser?.id || 'default-user';
  }, [user, users]);

  // Selected IPO — Defaults to NULL on initial mount (idle state)
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(null);
  const [showIpoPicker, setShowIpoPicker] = useState(false);

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
  const [healthState, setHealthState] = useState<{
    status: string;
    httpStatus?: number;
    durationMs?: number;
    url: string;
  }>({
    status: 'CHECKING...',
    url: `${API_BASE_URL}/api/v1/health`,
  });

  // Helper to append to chronological log
  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const timestamp =
      new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0');
    setEventLogs((prev) => [{ timestamp, message, type }, ...prev].slice(0, 60));
  }, []);

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

  // Filter IPOs that have at least one application
  const iposWithApps = useMemo(() => {
    return ipos.filter((ipo) =>
      applications.some((app) => app.ipo_id === ipo.id),
    );
  }, [ipos, applications]);

  // Selected IPO object (strictly derived from selectedIpoId, NO fallback auto-selection)
  const selectedIpo = useMemo(() => {
    if (!selectedIpoId) return null;
    return ipos.find((i) => i.id === selectedIpoId) || null;
  }, [ipos, selectedIpoId]);

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
    async (targetIpoId: string) => {
      const createStartMs = Date.now();
      const startStr =
        new Date().toLocaleTimeString() + '.' + String(createStartMs % 1000).padStart(3, '0');

      try {
        setJobError(null);
        setIsCreatingJob(true);
        setActiveJob(null);
        addLog(`Initiating automated check for IPO ID ${targetIpoId}`, 'info');

        // 1. Collect local applicant PANs for sync
        const ipoApps = applications.filter((app) => app.ipo_id === targetIpoId);
        const localPanRecords = ipoApps
          .map((app) => {
            const usr = users.find((u) => u.id === app.user_id);
            return {
              userId: activeUserId,
              pan: usr?.pan_number || '',
              name: usr?.name || 'Applicant',
            };
          })
          .filter((p) => p.pan && p.pan.trim().length === 10);

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

        // 2.5 Resolve canonical backend IPO ID strictly in order
        const selectedObj = ipos.find((i) => i.id === targetIpoId);
        const selName = selectedObj?.ipo_name || 'IPO';
        const selCompanyName = selectedObj?.company_name || selName;
        const selSymbol = (selectedObj as any)?.symbol;
        const explicitBackendId = selectedObj?.backend_ipo_id;

        let canonicalId: string | null = null;
        let resStatus: 'SUCCESS' | 'NOT_SYNCHRONIZED' = 'NOT_SYNCHRONIZED';
        let resMethod = 'Not Synchronized';

        let backendIpos: any[] = [];
        try {
          backendIpos = await allotmentApiService.fetchBackendIpos();
        } catch (resErr: any) {
          addLog(`Error fetching backend IPO list: ${resErr?.message}`, 'warn');
        }

        // Step 1: Check explicit backend_ipo_id linkage if present
        if (explicitBackendId && explicitBackendId.trim().length > 0) {
          const matchedByBackendId = backendIpos.find((b: any) => b.id === explicitBackendId.trim());
          if (matchedByBackendId || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(explicitBackendId.trim())) {
            canonicalId = explicitBackendId.trim();
            resStatus = 'SUCCESS';
            resMethod = 'Explicit Backend Linkage';
            addLog(`Using explicit backend_ipo_id '${canonicalId}' for local IPO '${targetIpoId}'`, 'success');
          }
        }

        // Step 2: If unlinked, attempt Symbol match against backend IPOs
        if (!canonicalId && selSymbol && selSymbol.trim().length > 0) {
          const matchBySymbol = backendIpos.find(
            (b: any) => (b.symbol || '').toLowerCase() === selSymbol.trim().toLowerCase()
          );
          if (matchBySymbol) {
            canonicalId = matchBySymbol.id;
            resStatus = 'SUCCESS';
            resMethod = `Backend Symbol Match (${matchBySymbol.symbol})`;
            addLog(`Symbol match: Local IPO '${selName}' (${selSymbol}) ➔ Backend ID '${canonicalId}'`, 'success');
            // Persist resolved backend_ipo_id locally in SQLite
            try {
              await db.runAsync(
                'UPDATE ipo_listings SET backend_ipo_id = ?, symbol = ? WHERE id = ?',
                [canonicalId, matchBySymbol.symbol, targetIpoId]
              );
            } catch {}
          }
        }

        // Step 3: If still unlinked, attempt Name match against backend IPOs
        if (!canonicalId) {
          const sName = selName.toLowerCase();
          const sCompName = selCompanyName.toLowerCase();
          const matchByName = backendIpos.find((b: any) => {
            const bName = (b.company?.displayName || '').toLowerCase();
            const bLegal = (b.company?.legalName || '').toLowerCase();
            return (
              bName.includes(sName) ||
              sName.includes(bName) ||
              bLegal.includes(sName) ||
              bName.includes(sCompName) ||
              sCompName.includes(bName)
            );
          });

          if (matchByName) {
            canonicalId = matchByName.id;
            resStatus = 'SUCCESS';
            resMethod = `Backend Name Match (${matchByName.company?.displayName || matchByName.symbol})`;
            addLog(`Name match: Local IPO '${selName}' ➔ Backend ID '${canonicalId}' (${matchByName.company?.displayName})`, 'success');
            // Persist resolved backend_ipo_id locally in SQLite
            try {
              await db.runAsync(
                'UPDATE ipo_listings SET backend_ipo_id = ? WHERE id = ?',
                [canonicalId, targetIpoId]
              );
            } catch {}
          }
        }

        // Step 4: If no backend match could be resolved
        if (!canonicalId || resStatus !== 'SUCCESS') {
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
          addLog(`IPO '${selName}' is not synchronized with backend. Skipping automated check.`, 'warn');
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
    [applications, users, activeUserId, startPollingJob, addLog, setDiagnosticJobError],
  );

  // Handle explicit IPO selection from picker bottom sheet
  const handleSelectIpo = useCallback(
    (ipoId: string) => {
      setShowIpoPicker(false);
      resetCheckState();
      setSelectedIpoId(ipoId);

      const targetIpo = ipos.find((i) => i.id === ipoId);
      const targetRegistrar = targetIpo
        ? getRegistrarConfig(targetIpo.registrar || targetIpo.ipo_name).name
        : '';

      addLog(`IPO selected: ${targetIpo?.ipo_name || ipoId} (Registrar: ${targetRegistrar})`, 'info');

      if (targetRegistrar && isAutomatedCheckSupported(targetRegistrar)) {
        void startAutomatedAllotmentCheck(ipoId);
      } else {
        setIpoResolution({
          selectedName: targetIpo?.ipo_name,
          localId: ipoId,
          backendId: 'NONE',
          resolutionStatus: 'WAITING',
          resolutionMethod: 'Manual Registrar',
        });
        addLog(`Automated check unavailable for ${targetRegistrar}`, 'warn');
      }
    },
    [ipos, resetCheckState, startAutomatedAllotmentCheck, addLog],
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

  // Compute live applicant UI states by combining local user profiles with backend job items
  const uiApplicants = useMemo((): UIApplicantState[] => {
    if (!currentApplications || currentApplications.length === 0) return [];

    return currentApplications.map((app) => {
      const usr = users.find((u) => u.id === app.user_id);
      const pan = usr?.pan_number || '';
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
        status = 'needs_review';
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
          status = 'needs_review';
          errorMessage = matchedItem.errorMessage || 'Application details not found on KFin portal. Please verify manually.';
        } else if (
          backendStatus === 'UNKNOWN' &&
          (activeJob?.status === 'QUEUED' || activeJob?.status === 'RUNNING')
        ) {
          status = 'checking';
        } else {
          // Technical failure / Rate limit / Source Unavailable -> Needs Review
          status = 'needs_review';
          errorMessage = matchedItem.errorMessage || 'Technical Failure';
        }
      } else if ((activeJob || jobError) && !matchedItem) {
        status = 'needs_review';
        errorMessage = jobError || 'Technical Failure';
      }

      return {
        applicationId: app.id,
        userId: app.user_id,
        userName: usr?.name || 'Applicant',
        pan,
        appliedQuantity: selectedIpo?.lot_size || 0,
        price: selectedIpo?.buy_price || 0,
        status,
        sharesAllotted,
        errorMessage,
        checkedAt: matchedItem?.checkedAt || activeJob?.updatedAt,
      };
    });
  }, [
    currentApplications,
    users,
    activeJob,
    isCreatingJob,
    jobError,
    selectedIpo,
    isAutomatedSupported,
    effectiveRegistrar,
  ]);

  // Compute live summary statistics
  const summaryCounts = useMemo(() => {
    let total = uiApplicants.length;
    let allotted = 0;
    let notAllotted = 0;
    let needsReview = 0;

    for (const app of uiApplicants) {
      if (app.status === 'allotted' || app.status === 'partially_allotted') {
        allotted++;
      } else if (app.status === 'not_allotted') {
        notAllotted++;
      } else if (app.status === 'needs_review' || app.status === 'no_record') {
        needsReview++;
      }
    }

    if (activeJob) {
      total = activeJob.totalChecks || total;
    }

    return { total, allotted, notAllotted, needsReview };
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
        <IconButton name="arrow-left" onPress={() => router.back()} />
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Allotment Checker
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            Automated Backend-Driven Verification
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Initial Idle IPO Selector Card */}
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
              {selectedIpo ? 'SELECTED IPO' : 'SELECT IPO TO CHECK ALLOTMENT'}
            </Text>
            <Text style={[styles.ipoSelectorName, { color: colors.foreground }]}>
              {selectedIpo?.ipo_name || 'Choose from registered IPOs...'}
            </Text>
            {selectedIpo ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <Text style={[styles.ipoRegistrarText, { color: colors.primary }]}>
                  Registrar: {effectiveRegistrar}
                </Text>
                <View
                  style={{
                    backgroundColor: isAutomatedSupported ? '#DCFCE7' : '#FEF3C7',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: 'bold',
                      color: isAutomatedSupported ? '#166534' : '#92400E',
                    }}
                  >
                    {isAutomatedSupported ? 'Automated Check Available' : 'Automated Check Unavailable'}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[styles.ipoRegistrarText, { color: colors.mutedForeground }]}>
                Select an IPO to begin checking.
              </Text>
            )}
          </View>

          {selectedIpo ? (
            <TouchableOpacity
              style={[styles.switchButton, { backgroundColor: colors.border }]}
              onPress={handleSwitchIpo}
            >
              <Text style={[styles.switchButtonText, { color: colors.foreground }]}>
                Switch IPO
              </Text>
            </TouchableOpacity>
          ) : (
            <Feather name="chevron-down" size={24} color={colors.mutedForeground} />
          )}
        </TouchableOpacity>

        {/* Selected IPO Info Card */}
        {selectedIpo && (
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.infoCardTitle, { color: colors.mutedForeground }]}>
              IPO ALLOTMENT STATUS
            </Text>
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
                <Text style={[styles.infoGridValue, { color: colors.primary, fontWeight: 'bold' }]}>
                  {currentApplications.length}
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

        {/* TEMPORARY DEVELOPER DIAGNOSTICS PANEL */}
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

        {/* Summary Card (Only rendered after an IPO has been selected) */}
        {selectedIpo && (
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.summaryTitle, { color: colors.mutedForeground }]}>
              ALLOTMENT SUMMARY
            </Text>
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
                <Text style={[styles.summaryCount, { color: '#4CAF50' }]}>
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
                    { color: colors.mutedForeground },
                  ]}
                >
                  {summaryCounts.notAllotted}
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
                  <AllotmentStatusBadge status={applicant.status as any} />
                </View>

                <View style={styles.applicantDetailsRow}>
                  <Text
                    style={[
                      styles.applicantDetailText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Applied:{' '}
                    <Text style={{ color: colors.foreground }}>
                      {applicant.appliedQuantity > 0
                        ? `${applicant.appliedQuantity} shares`
                        : 'Not available'}
                    </Text>
                  </Text>
                  {applicant.sharesAllotted ? (
                    <Text
                      style={[
                        styles.applicantDetailText,
                        { color: '#4CAF50', fontWeight: 'bold' },
                      ]}
                    >
                      Allotted: {applicant.sharesAllotted} shares
                    </Text>
                  ) : null}
                </View>

                {applicant.checkedAt ? (
                  <Text
                    style={[styles.checkedTimeText, { color: colors.mutedForeground }]}
                  >
                    {formatCheckedTime(applicant.checkedAt)}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* IPO Picker Bottom Sheet Modal */}
      <Modal
        visible={showIpoPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowIpoPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowIpoPicker(false)}
        >
          <View
            style={[
              styles.bottomSheet,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <View>
                <Text style={[styles.bottomSheetTitle, { color: colors.foreground }]}>
                  Select IPO with Applications
                </Text>
                <Text style={[styles.bottomSheetSubtitle, { color: colors.mutedForeground }]}>
                  Registered IPOs for which you have saved applications
                </Text>
              </View>
              <IconButton name="x" onPress={() => setShowIpoPicker(false)} />
            </View>

            <FlatList
              data={iposWithApps}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.ipoSelectItem,
                    selectedIpoId === item.id && {
                      backgroundColor: colors.border,
                    },
                  ]}
                  onPress={() => handleSelectIpo(item.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.ipoSelectItemTitle, { color: colors.foreground }]}
                    >
                      {item.ipo_name}
                    </Text>
                    {item.registrar ? (
                      <Text
                        style={[
                          styles.ipoSelectItemSub,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Registrar: {item.registrar}
                      </Text>
                    ) : null}
                  </View>
                  {selectedIpoId === item.id && (
                    <Feather name="check" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
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
    gap: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
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
  },
  switchButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  infoCardTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  infoCompanyName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  infoGridItem: {
    width: '50%',
    gap: 2,
  },
  infoGridLabel: {
    fontSize: 11,
  },
  infoGridValue: {
    fontSize: 14,
    fontWeight: '500',
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
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    alignItems: 'center',
    gap: 4,
  },
  summaryCount: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  sectionHeader: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
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
    fontWeight: 'bold',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
  applicantCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  applicantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  applicantInfoLeft: {
    gap: 2,
  },
  applicantName: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  applicantPan: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
  },
  applicantDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  applicantDetailText: {
    fontSize: 13,
  },
  checkedTimeText: {
    fontSize: 11,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '80%',
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  bottomSheetSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  ipoSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 4,
  },
  ipoSelectItemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  ipoSelectItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
});
