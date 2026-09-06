import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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

export default function AllotmentCheckerScreen() {
  const colors = useColors();
  const router = useRouter();
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
  }, []);

  // Unmount cleanup ONLY — never triggers job creation on mount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Poll active backend job
  const startPollingJob = useCallback(
    (jobId: string) => {
      stopPolling();
      setIsPolling(true);

      const poll = async () => {
        try {
          const updatedJob = await allotmentApiService.getJob(
            jobId,
            activeUserId,
          );
          setActiveJob(updatedJob);

          if (
            updatedJob.status === 'COMPLETED' ||
            updatedJob.status === 'COMPLETED_WITH_ERRORS' ||
            updatedJob.status === 'FAILED' ||
            updatedJob.status === 'CANCELLED'
          ) {
            stopPolling();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setJobError(msg);
          stopPolling();
        }
      };

      // Initial poll
      void poll();

      // Recurring 2s polling interval
      pollIntervalRef.current = setInterval(poll, 2000);
    },
    [activeUserId, stopPolling],
  );

  // Trigger job creation (ONLY called upon explicit user IPO selection)
  const startAutomatedAllotmentCheck = useCallback(
    async (targetIpoId: string) => {
      try {
        setJobError(null);
        setIsCreatingJob(true);
        setActiveJob(null);

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
        if (localPanRecords.length > 0) {
          await panSyncService.syncLocalPans(activeUserId, localPanRecords);
        }

        // 3. Create backend job with ipoId (Server loads saved PANs for user automatically)
        const job = await allotmentApiService.createJob(targetIpoId, activeUserId);
        setActiveJob(job);
        setIsCreatingJob(false);

        // 4. Start polling job status
        startPollingJob(job.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setJobError(msg);
        setIsCreatingJob(false);
        setIsPolling(false);
      }
    },
    [applications, users, activeUserId, startPollingJob],
  );

  // Handle explicit IPO selection from picker bottom sheet
  const handleSelectIpo = useCallback(
    (ipoId: string) => {
      setShowIpoPicker(false);
      setSelectedIpoId(ipoId);
      void startAutomatedAllotmentCheck(ipoId);
    },
    [startAutomatedAllotmentCheck],
  );

  // Handle Switch IPO action
  const handleSwitchIpo = useCallback(() => {
    stopPolling();
    setActiveJob(null);
    setSelectedIpoId(null);
    setJobError(null);
    setShowIpoPicker(true);
  }, [stopPolling]);

  // Compute live applicant UI states by combining local user profiles with backend job items
  const uiApplicants = useMemo((): UIApplicantState[] => {
    if (!currentApplications || currentApplications.length === 0) return [];

    return currentApplications.map((app) => {
      const usr = users.find((u) => u.id === app.user_id);
      const pan = usr?.pan_number || '';
      const masked = maskPan(pan).toUpperCase();

      // Find matching backend job item by masked ID or fallback
      let matchedItem: BackendJobItem | undefined;
      for (const item of activeJob?.items || []) {
        const backendMask = item.maskedId.toUpperCase();
        if (
          backendMask === masked ||
          backendMask.slice(-4) === masked.slice(-4)
        ) {
          matchedItem = item;
          break;
        }
      }

      let status: UIApplicantState['status'] = 'pending';
      let sharesAllotted = 0;
      let errorMessage: string | undefined;

      if (isCreatingJob && !matchedItem) {
        status = 'checking';
      } else if (matchedItem) {
        const backendStatus = matchedItem.status.toUpperCase();
        if (backendStatus === 'ALLOTTED') {
          status = 'allotted';
          sharesAllotted = matchedItem.sharesAllotted || selectedIpo?.lot_size || 0;
        } else if (backendStatus === 'PARTIALLY_ALLOTTED') {
          status = 'partially_allotted';
          sharesAllotted = matchedItem.sharesAllotted || 0;
        } else if (backendStatus === 'NOT_ALLOTTED') {
          status = 'not_allotted';
        } else if (backendStatus === 'APPLICATION_NOT_FOUND') {
          status = 'no_record';
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
      } else if (activeJob && !matchedItem) {
        status = 'needs_review';
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
  }, [currentApplications, users, activeJob, isCreatingJob, selectedIpo]);

  // Compute live summary statistics
  const summaryCounts = useMemo(() => {
    let total = uiApplicants.length;
    let allotted = 0;
    let notAllotted = 0;
    let needsReview = 0;

    for (const app of uiApplicants) {
      if (app.status === 'allotted' || app.status === 'partially_allotted') {
        allotted++;
      } else if (app.status === 'not_allotted' || app.status === 'no_record') {
        notAllotted++;
      } else if (app.status === 'needs_review') {
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
            {selectedIpo?.registrar ? (
              <Text style={[styles.ipoRegistrarText, { color: colors.primary }]}>
                Registrar: {selectedIpo.registrar}
              </Text>
            ) : !selectedIpo ? (
              <Text style={[styles.ipoRegistrarText, { color: colors.mutedForeground }]}>
                Select an IPO to begin checking.
              </Text>
            ) : null}
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
                  {selectedIpo.registrar || 'Unknown'}
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
                      {applicant.appliedQuantity} shares
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
