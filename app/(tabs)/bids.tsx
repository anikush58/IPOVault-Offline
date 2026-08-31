import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDialog } from '@/context/DialogContext';
import { useDB, type ApplicationStatus, type ApplicationWithDetails, type IPOListing, type User } from '@/context/DBContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { formatCurrency } from '@/utils/formatters';
import { StatusBadge } from '@/components/StatusBadge';
import { AddIPOModal } from '@/components/AddIPOModal';
import { BulkApplySheet } from '@/components/BulkApplySheet';

type ViewMode = 'home' | 'attention' | 'allBids';
type FilterStatus = 'All' | 'Applied' | 'Allotted' | 'Not Allotted' | 'Cancelled';

function SwipeableBidCard({
  bid,
  isDark,
  colors,
  isBulkMarking,
  isChecked,
  onPress,
  onMarkAllotted,
  onMarkNotAllotted,
}: {
  bid: ApplicationWithDetails;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
  isBulkMarking: boolean;
  isChecked: boolean;
  onPress: () => void;
  onMarkAllotted: (bid: ApplicationWithDetails) => void;
  onMarkNotAllotted: (bid: ApplicationWithDetails) => void;
}) {
  const pan = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isBulkMarking) return false;
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        pan.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 70) {
          Animated.timing(pan, {
            toValue: 180,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
            onMarkAllotted(bid);
            Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
          });
        } else if (gestureState.dx < -70) {
          Animated.timing(pan, {
            toValue: -180,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
            onMarkNotAllotted(bid);
            Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
          });
        } else {
          Animated.spring(pan, {
            toValue: 0,
            friction: 7,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const leftGreenOpacity = pan.interpolate({
    inputRange: [0, 30, 90],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  const rightRedOpacity = pan.interpolate({
    inputRange: [-90, -30, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const firstLetter = (bid.ipo_name || 'I').charAt(0).toUpperCase();

  return (
    <View style={styles.swipeCardWrapper}>
      {/* Background Actions */}
      <View style={StyleSheet.absoluteFill}>
        {/* Left Side: Green ALLOTTED Action */}
        <Animated.View
          style={[
            styles.swipeActionLeft,
            {
              backgroundColor: isDark ? '#064E3B' : '#DCFCE7',
              borderColor: isDark ? '#059669' : '#86EFAC',
              opacity: leftGreenOpacity,
            },
          ]}
        >
          <View style={styles.swipeActionContentLeft}>
            <Feather name="check-circle" size={20} color={isDark ? '#34D399' : '#16A34A'} />
            <Text style={[styles.swipeActionTextLeft, { color: isDark ? '#34D399' : '#16A34A' }]}>
              ALLOTTED
            </Text>
          </View>
        </Animated.View>

        {/* Right Side: Red NOT ALLOTTED Action */}
        <Animated.View
          style={[
            styles.swipeActionRight,
            {
              backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2',
              borderColor: isDark ? '#991B1B' : '#FCA5A5',
              opacity: rightRedOpacity,
            },
          ]}
        >
          <View style={styles.swipeActionContentRight}>
            <Text style={[styles.swipeActionTextRight, { color: isDark ? '#F87171' : '#DC2626' }]}>
              NOT ALLOTTED
            </Text>
            <Feather name="x-circle" size={20} color={isDark ? '#F87171' : '#DC2626'} />
          </View>
        </Animated.View>
      </View>

      {/* Foreground Card */}
      <Animated.View
        style={[
          styles.swipeForegroundCard,
          {
            transform: [{ translateX: pan }],
            backgroundColor: isChecked
              ? (isDark ? '#27272A' : '#F1F5F9')
              : colors.card,
            borderColor: isChecked ? (isDark ? '#64748B' : '#475569') : colors.border,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.92}
          style={styles.cardTouchableInner}
        >
          {/* Top Row: Avatar, IPO Name, Date & Status Badge */}
          <View style={styles.cardTopRow}>
            <View style={styles.cardHeaderLeft}>
              {isBulkMarking && (
                <View
                  style={[
                    styles.bulkCheckbox,
                    {
                      borderColor: isChecked ? (isDark ? '#64748B' : '#1E293B') : colors.mutedForeground,
                      backgroundColor: isChecked ? (isDark ? '#475569' : '#0F172A') : 'transparent',
                    },
                  ]}
                >
                  {isChecked && <Feather name="check" size={11} color="#FFFFFF" />}
                </View>
              )}

              <View style={[styles.ipoAvatarBox, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                <Text style={[styles.ipoAvatarLetter, { color: colors.foreground }]}>
                  {firstLetter}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.cardIpoTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {bid.ipo_name}
                </Text>
                <Text style={[styles.cardAppliedDate, { color: colors.mutedForeground }]}>
                  Applied on {bid.open_date || '2026-08-27'}
                </Text>
              </View>
            </View>

            <StatusBadge status={bid.status} />
          </View>

          {/* Horizontal Divider */}
          <View style={[styles.cardDivider, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]} />

          {/* Bottom Row: User Name & Bank Badge */}
          <View style={styles.cardBottomRow}>
            <View style={styles.userNameWrap}>
              <View style={[styles.userDot, { backgroundColor: isDark ? '#94A3B8' : '#64748B' }]} />
              <Text style={[styles.userNameText, { color: colors.foreground }]} numberOfLines={1}>
                {bid.user_name}
              </Text>
            </View>

            {bid.user_bank_name ? (
              <View style={[styles.bankPill, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderColor: colors.border }]}>
                <Feather name="credit-card" size={12} color={colors.mutedForeground} />
                <Text style={[styles.bankPillText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {bid.user_bank_name}
                </Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function BidsScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams<{ ipoId?: string; autoOpenApply?: string }>();
  const { showSuccess, showError } = useDialog();
  const { users, ipos, applications, bankAccounts, addBulkApplications, updateApplication, updateBulkApplications } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Primary view navigation mode: 'home' | 'attention' | 'allBids'
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All');

  // Bulk Status Marking State
  const [isBulkMarking, setIsBulkMarking] = useState(false);
  const [bulkSelectedBidIds, setBulkSelectedBidIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Modal / Sheet states
  const [showBulkSheet, setShowBulkSheet] = useState(false);
  const [showAddIPOModal, setShowAddIPOModal] = useState(false);
  const [selectedAppForUpdate, setSelectedAppForUpdate] = useState<ApplicationWithDetails | null>(null);

  // Bulk Apply Form State
  const [bulkIPOId, setBulkIPOId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userLotQuantities, setUserLotQuantities] = useState<Record<string, number>>({});
  const [bulkBankName, setBulkBankName] = useState<string | null>(null);
  const [bulkUPIApp, setBulkUPIApp] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Auto-open Bulk Apply when navigated from IPO details
  React.useEffect(() => {
    if (params.ipoId) {
      setBulkIPOId(params.ipoId);
      setShowBulkSheet(true);
    }
  }, [params.ipoId, params.autoOpenApply]);

  // Pickers for Bulk Sheet
  const [showIPOPicker, setShowIPOPicker] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showUPIPicker, setShowUPIPicker] = useState(false);
  const [activeLotPickerUserId, setActiveLotPickerUserId] = useState<string | null>(null);

  // Update Status Modal Form State
  const [updateStatus, setUpdateStatus] = useState<ApplicationStatus>('Allotted');
  const [allottedLots, setAllottedLots] = useState(1);
  const [allottedShares, setAllottedShares] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);

  const UPI_APPS = ['GPay', 'BHIM', 'PayTM', 'PhonePe', 'IDFC ASBA', 'BoB ASBA'];

  // Today's date string (YYYY-MM-DD)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const activeIPOs = useMemo(() => ipos.filter((ipo) => ipo.archived === 0), [ipos]);
  const selectedIPO = useMemo(() => ipos.find((i) => i.id === bulkIPOId), [ipos, bulkIPOId]);

  // Needs Your Attention list: dynamically derived applications in 'Applied' or 'Mandate Approved' status needing status/allotment update
  const attentionItems = useMemo(() => {
    return applications.filter((app) => app.status === 'Applied' || app.status === 'Mandate Approved');
  }, [applications]);

  // Confirmation Dialog Modal State
  const [confirmTarget, setConfirmTarget] = useState<{
    bid: ApplicationWithDetails;
    status: 'Allotted' | 'Not Allotted';
  } | null>(null);

  // Operational bids list (showing 'Applied' and 'Mandate Approved' bids on Bids screen)
  const allBidsSorted = useMemo(() => {
    return applications
      .filter((a) => a.status === 'Applied' || a.status === 'Mandate Approved')
      .sort((a, b) => {
        const dateA = a.open_date ? new Date(a.open_date).getTime() : 0;
        const dateB = b.open_date ? new Date(b.open_date).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return (b.id || '').localeCompare(a.id || '');
      });
  }, [applications]);

  const recentBids = useMemo(() => allBidsSorted.slice(0, 5), [allBidsSorted]);

  const filteredAllBids = useMemo(() => {
    if (statusFilter === 'All') return allBidsSorted;
    if (statusFilter === 'Cancelled') return allBidsSorted.filter((a) => (a.status as any) === 'Cancelled' || a.status === 'Sold');
    return allBidsSorted.filter((a) => a.status === statusFilter);
  }, [allBidsSorted, statusFilter]);

  // Filtered users for bulk apply (excluding archived users and users who already applied for the selected IPO)
  const filteredUsers = useMemo(() => {
    const activeUsers = users.filter((u) => u.archived !== 1);
    if (!bulkIPOId) return activeUsers;
    const appliedUserIds = new Set(
      applications.filter((a) => a.ipo_id === bulkIPOId).map((a) => a.user_id)
    );
    return activeUsers.filter((u) => !appliedUserIds.has(u.id));
  }, [users, applications, bulkIPOId]);

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAllUsers = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const handleBulkCreate = async () => {
    if (!bulkIPOId) { showError('', 'Please select an IPO first.'); return; }
    if (selectedUserIds.size === 0) { showError('', 'Select at least one applicant.'); return; }
    setBulkLoading(true);
    try {
      await addBulkApplications(bulkIPOId, Array.from(selectedUserIds), bulkBankName ?? undefined, bulkUPIApp ?? undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedUserIds(new Set());
      setShowBulkSheet(false);
    } catch {
      showError('Error', 'Failed to create applications.');
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleBidSelection = (id: string) => {
    setBulkSelectedBidIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAllBids = (targetList: ApplicationWithDetails[]) => {
    if (bulkSelectedBidIds.size === targetList.length) {
      setBulkSelectedBidIds(new Set());
    } else {
      setBulkSelectedBidIds(new Set(targetList.map((b) => b.id)));
    }
  };

  const handleExecuteBulkStatusUpdate = async (newStatus: 'Allotted' | 'Not Allotted' | 'Cancelled') => {
    if (bulkSelectedBidIds.size === 0) {
      showError('', 'Please select at least one bid.');
      return;
    }
    setBulkActionLoading(true);
    try {
      const idsArray = Array.from(bulkSelectedBidIds);
      await updateBulkApplications(idsArray, newStatus);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBulkSelectedBidIds(new Set());
      setIsBulkMarking(false);
    } catch {
      showError('Error', 'Failed to update status for selected bids.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const openUpdateModal = (app: ApplicationWithDetails) => {
    setSelectedAppForUpdate(app);
    setUpdateStatus(app.status as any);
    setAllottedLots(1);
    setAllottedShares(app.quantity.toString());
    setUpdateNotes('');
  };

  const handleSaveStatus = async () => {
    if (!selectedAppForUpdate) return;
    setUpdateLoading(true);
    try {
      await updateApplication(selectedAppForUpdate.id, updateStatus as any);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedAppForUpdate(null);
    } catch {
      showError('Error', 'Failed to update status.');
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── SCREEN 1: BIDS HOME ── */}
      {viewMode === 'home' && (
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={[styles.headerEyebrow, { color: colors.primary }]}>CREATE & MANAGE</Text>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bids</Text>
            </View>

            <IconButton
              name="plus"
              variant="surface"
              size="md"
              onPress={() => setShowBulkSheet(true)}
            />
          </View>

          <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 90 }}>
            {/* Management Shortcuts — 2 Prominent Grid Cards */}
            <View style={styles.shortcutsRow}>
              {/* Users Card */}
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/users', params: { from: 'bids' } })}
                activeOpacity={0.78}
                style={[styles.shortcutCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIconWrap, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <Feather name="users" size={18} color={colors.foreground} />
                </View>
                <Text style={[styles.shortcutTitle, { color: colors.foreground }]} numberOfLines={1}>Users</Text>
                <Text style={[styles.shortcutSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {users.length} profiles
                </Text>
              </TouchableOpacity>

              {/* Banks Card */}
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/banks', params: { from: 'bids' } })}
                activeOpacity={0.78}
                style={[styles.shortcutCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIconWrap, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <Feather name="credit-card" size={18} color={colors.foreground} />
                </View>
                <Text style={[styles.shortcutTitle, { color: colors.foreground }]} numberOfLines={1}>Banks</Text>
                <Text style={[styles.shortcutSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {bankAccounts.length} accounts
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Action: Bulk Apply */}
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>QUICK ACTION</Text>
              <TouchableOpacity
                onPress={() => setShowBulkSheet(true)}
                activeOpacity={0.8}
                style={[styles.quickActionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.quickIconWrap, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <Feather name="layers" size={20} color={colors.foreground} />
                </View>
                <View style={{ flex: 1, paddingRight: 4 }}>
                  <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>Bulk Apply</Text>
                  <Text style={[styles.quickActionSub, { color: colors.mutedForeground }]}>
                    Apply for multiple users at once
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Needs Your Attention Section */}
            <View style={styles.sectionWrap}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={[styles.sectionEyebrow, { color: isBulkMarking ? colors.primary : colors.mutedForeground, marginBottom: 0 }]}>
                  {isBulkMarking ? `BULK MARK (${bulkSelectedBidIds.size} SELECTED)` : 'NEEDS YOUR ATTENTION'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {isBulkMarking && allBidsSorted.length > 0 && (
                    <TouchableOpacity
                      onPress={() => toggleSelectAllBids(allBidsSorted)}
                      style={[styles.bulkHeaderPill, { borderColor: colors.border, backgroundColor: colors.card }]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.bulkHeaderPillText, { color: colors.primary }]}>
                        {bulkSelectedBidIds.size === allBidsSorted.length ? 'Deselect All' : 'Select All'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {allBidsSorted.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setIsBulkMarking((prev) => !prev);
                        if (isBulkMarking) setBulkSelectedBidIds(new Set());
                      }}
                      style={[
                        styles.bulkHeaderPill,
                        {
                          borderColor: isBulkMarking ? colors.primary : colors.border,
                          backgroundColor: isBulkMarking ? colors.primary + '18' : colors.card,
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Feather name={isBulkMarking ? 'check' : 'check-square'} size={13} color={colors.primary} style={{ marginRight: 4 }} />
                      <Text style={[styles.bulkHeaderPillText, { color: colors.primary }]}>
                        {isBulkMarking ? 'Done' : 'Bulk Mark'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {attentionItems.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setViewMode('attention')}
                  activeOpacity={0.82}
                  style={[
                    styles.attentionAlertCard,
                    {
                      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.alertIconWrap, { backgroundColor: isDark ? '#374151' : '#E2E8F0' }]}>
                    <Feather name="clock" size={18} color={colors.foreground} />
                  </View>
                  <View style={{ flex: 1, paddingRight: 4 }}>
                    <Text style={[styles.attentionAlertTitle, { color: colors.foreground }]}>
                      {attentionItems.length} status update{attentionItems.length !== 1 ? 's' : ''} pending
                    </Text>
                    <Text style={[styles.attentionAlertSub, { color: colors.mutedForeground }]}>
                      Allotment results require your action
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={[styles.attentionEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.emptyCheckWrap, { backgroundColor: isDark ? '#064E3B' : '#E6FFFA' }]}>
                    <Feather name="check-circle" size={18} color={isDark ? '#34D399' : '#319795'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.attentionEmptyTitle, { color: colors.foreground }]}>You&apos;re all caught up</Text>
                    <Text style={[styles.attentionEmptySub, { color: colors.mutedForeground }]}>No pending actions right now.</Text>
                  </View>
                </View>
              )}

              {/* All Applied Bids List */}
              <View style={{ marginTop: 12 }}>

                {allBidsSorted.length === 0 ? (
                  <View style={[styles.recentEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.recentEmptyText, { color: colors.mutedForeground }]}>
                      No bids submitted yet. Tap Bulk Apply above or &quot;+&quot; to create one.
                    </Text>
                  </View>
                ) : (
                  allBidsSorted.map((bid) => {
                    const isChecked = bulkSelectedBidIds.has(bid.id);
                    return (
                      <SwipeableBidCard
                        key={bid.id}
                        bid={bid}
                        isDark={isDark}
                        colors={colors}
                        isBulkMarking={isBulkMarking}
                        isChecked={isChecked}
                        onPress={() => {
                          if (isBulkMarking) {
                            toggleBidSelection(bid.id);
                          } else {
                            openUpdateModal(bid);
                          }
                        }}
                        onMarkAllotted={(targetBid) => {
                          setConfirmTarget({ bid: targetBid, status: 'Allotted' });
                        }}
                        onMarkNotAllotted={(targetBid) => {
                          setConfirmTarget({ bid: targetBid, status: 'Not Allotted' });
                        }}
                      />
                    );
                  })
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── SCREEN 3: NEEDS YOUR ATTENTION LIST SCREEN ── */}
      {viewMode === 'attention' && (
        <View style={{ flex: 1 }}>
          {/* Sub Header */}
          <View style={[styles.subHeader, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setViewMode('home')} style={styles.backBtn} activeOpacity={0.7}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.subHeaderTitle, { color: colors.foreground }]}>Needs Your Attention</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}>
            {/* Banner Card */}
            <View
              style={[
                styles.attentionBanner,
                {
                  backgroundColor: isDark ? '#3F1718' : '#FFF5F5',
                  borderColor: isDark ? '#7F1D1D' : '#FFC9C9',
                },
              ]}
            >
              <View style={[styles.bannerIconWrap, { backgroundColor: isDark ? '#7F1D1D' : '#FFE3E3' }]}>
                <Feather name="clock" size={20} color={isDark ? '#F87171' : '#E53E3E'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: isDark ? '#F87171' : '#C53030' }]}>
                  {attentionItems.length} status update{attentionItems.length !== 1 ? 's' : ''} pending
                </Text>
                <Text style={[styles.bannerSub, { color: isDark ? '#FCA5A5' : '#9B2C2C' }]}>
                  Please update allotment status for the following applications.
                </Text>
              </View>
            </View>

            {/* List of items needing update */}
            {attentionItems.length === 0 ? (
              <View style={[styles.recentEmptyCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
                <Text style={[styles.recentEmptyText, { color: colors.mutedForeground }]}>
                  All caught up! No pending status updates right now.
                </Text>
              </View>
            ) : (
              attentionItems.map((app) => (
                <View key={app.id} style={[styles.attentionItemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.attentionItemLeft}>
                    <View style={styles.ipoAvatar}>
                      <Text style={styles.ipoAvatarText}>{app.ipo_name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.attentionItemTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {app.ipo_name}
                      </Text>
                      <Text style={[styles.attentionItemSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {app.user_name}{app.user_bank_name ? ` · ${app.user_bank_name}` : ''}
                      </Text>
                      <Text style={[styles.attentionItemDate, { color: colors.mutedForeground }]}>
                        Applied on {app.open_date || 'recent date'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => openUpdateModal(app)}
                    style={styles.updateRowBtn}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.updateRowBtnText}>Update &gt;</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Bottom Tip */}
            <View style={styles.bottomTipWrap}>
              <Feather name="help-circle" size={14} color={colors.primary} />
              <Text style={[styles.bottomTipText, { color: colors.mutedForeground }]}>
                Only applications where IPO is closed and allotment result is pending appear here.
              </Text>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── SCREEN 5: ALL BIDS LIST SCREEN ── */}
      {viewMode === 'allBids' && (
        <View style={{ flex: 1 }}>
          {/* Sub Header */}
          <View style={[styles.subHeader, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setViewMode('home')} style={styles.backBtn} activeOpacity={0.7}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.subHeaderTitle, { color: colors.foreground }]}>All Bids</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Filter Status Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {(['All', 'Applied', 'Allotted', 'Not Allotted', 'Cancelled'] as FilterStatus[]).map((st) => {
              const isActive = statusFilter === st;
              const count = st === 'All'
                ? allBidsSorted.length
                : st === 'Cancelled'
                ? allBidsSorted.filter((a) => (a.status as any) === 'Cancelled' || a.status === 'Sold').length
                : allBidsSorted.filter((a) => a.status === st).length;

              return (
                <TouchableOpacity
                  key={st}
                  onPress={() => setStatusFilter(st)}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: isActive ? (isDark ? '#374151' : '#0F172A') : colors.card,
                      borderColor: isActive ? (isDark ? '#4B5563' : '#1E293B') : colors.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterPillText, { color: isActive ? '#FFFFFF' : colors.foreground }]}>
                    {st} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}>
            {filteredAllBids.length === 0 ? (
              <View style={[styles.recentEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.recentEmptyText, { color: colors.mutedForeground }]}>
                  No bids match the selected filter.
                </Text>
              </View>
            ) : (
              filteredAllBids.map((bid) => {
                const isChecked = bulkSelectedBidIds.has(bid.id);
                return (
                  <SwipeableBidCard
                    key={bid.id}
                    bid={bid}
                    isDark={isDark}
                    colors={colors}
                    isBulkMarking={isBulkMarking}
                    isChecked={isChecked}
                    onPress={() => {
                      if (isBulkMarking) {
                        toggleBidSelection(bid.id);
                      } else {
                        openUpdateModal(bid);
                      }
                    }}
                    onMarkAllotted={(targetBid) => {
                      setConfirmTarget({ bid: targetBid, status: 'Allotted' });
                    }}
                    onMarkNotAllotted={(targetBid) => {
                      setConfirmTarget({ bid: targetBid, status: 'Not Allotted' });
                    }}
                  />
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* ── SCREEN 2: BULK APPLICATION CREATOR BOTTOM SHEET ── */}
      <BulkApplySheet visible={showBulkSheet} onClose={() => setShowBulkSheet(false)} />

      {/* ── SCREEN 4: UPDATE APPLICATION STATUS MODAL ── */}
      {selectedAppForUpdate && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedAppForUpdate(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedAppForUpdate(null)}>
            <Pressable style={[styles.sheetContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]} onPress={() => {}}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

              <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Update Application Status</Text>
                <TouchableOpacity onPress={() => setSelectedAppForUpdate(null)} style={styles.closeBtn} hitSlop={8}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                {/* Application Card Summary */}
                <View style={[styles.appSummaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.summaryIpoName, { color: colors.foreground }]}>{selectedAppForUpdate.ipo_name}</Text>
                  <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
                    {selectedAppForUpdate.user_name}{selectedAppForUpdate.user_bank_name ? ` · ${selectedAppForUpdate.user_bank_name}` : ''}
                  </Text>
                  <Text style={[styles.summarySub, { color: colors.mutedForeground, marginTop: 2 }]}>
                    Applied on {selectedAppForUpdate.open_date || 'recent date'}
                  </Text>
                  <Text style={[styles.summaryAmt, { color: colors.foreground, marginTop: 6 }]}>
                    Amount: {formatCurrency(selectedAppForUpdate.buy_price * selectedAppForUpdate.quantity)} · 1 Lot ({selectedAppForUpdate.quantity} Shares)
                  </Text>
                </View>

                {/* Status Selection */}
                <View>
                  <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>SELECT STATUS</Text>
                  <View style={[styles.statusRadioGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    {[
                      { status: 'Applied', label: 'Applied' },
                      { status: 'Mandate Approved', label: 'Mandate Approved' },
                      { status: 'Allotted', label: 'Allotted' },
                      { status: 'Not Allotted', label: 'Not Allotted' },
                      { status: 'Cancelled', label: 'Cancelled' },
                    ].map((stOption) => {
                      const isSelected = updateStatus === stOption.status;
                      const isCurrent = selectedAppForUpdate.status === stOption.status;

                      return (
                        <TouchableOpacity
                          key={stOption.status}
                          onPress={() => setUpdateStatus(stOption.status as any)}
                          style={[styles.statusRadioOption, { borderBottomColor: colors.border }]}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.radioCircle, { borderColor: isSelected ? colors.foreground : colors.mutedForeground }]}>
                            {isSelected && <View style={[styles.radioDot, { backgroundColor: colors.foreground }]} />}
                          </View>
                          <Text style={[styles.radioLabel, { color: colors.foreground }]}>{stOption.label}</Text>
                          {isCurrent && (
                            <View style={[styles.currentBadge, { backgroundColor: isDark ? colors.surface : '#EDF2F7' }]}>
                              <Text style={[styles.currentBadgeText, { color: colors.mutedForeground }]}>Current</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Allotted Details (only when Allotted selected) */}
                {updateStatus === 'Allotted' && (
                  <View>
                    <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>ALLOTTED DETAILS</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground }]}>No. of Lots Allotted</Text>
                        <View style={[styles.stepperWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                          <TouchableOpacity onPress={() => setAllottedLots(Math.max(1, allottedLots - 1))} style={styles.stepperBtn} hitSlop={6}>
                            <Feather name="minus" size={16} color={colors.foreground} />
                          </TouchableOpacity>
                          <Text style={[styles.stepperVal, { color: colors.foreground }]}>{allottedLots}</Text>
                          <TouchableOpacity onPress={() => setAllottedLots(allottedLots + 1)} style={styles.stepperBtn} hitSlop={6}>
                            <Feather name="plus" size={16} color={colors.foreground} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldSubLabel, { color: colors.mutedForeground }]}>No. of Shares</Text>
                        <TextInput
                          value={allottedShares}
                          onChangeText={setAllottedShares}
                          keyboardType="numeric"
                          style={[styles.sharesInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                        />
                      </View>
                    </View>
                  </View>
                )}

                {/* Notes Optional */}
                <View>
                  <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>NOTES (Optional)</Text>
                  <TextInput
                    value={updateNotes}
                    onChangeText={setUpdateNotes}
                    placeholder="Add any notes..."
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.notesInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  />
                </View>

                {/* Primary CTA */}
                <Button
                  variant="primary"
                  size="lg"
                  title="Save Status"
                  loading={updateLoading}
                  disabled={updateLoading}
                  onPress={handleSaveStatus}
                  fullWidth
                />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}



      {/* Lot Quantity Selector Modal (Matching Screenshot 2) */}
      <Modal visible={Boolean(activeLotPickerUserId)} transparent animationType="fade" onRequestClose={() => setActiveLotPickerUserId(null)}>
        <Pressable style={styles.centerModalOverlay} onPress={() => setActiveLotPickerUserId(null)}>
          <Pressable style={[styles.pickerModalCard, { backgroundColor: '#20202A', borderColor: '#2D2D3D', maxHeight: 450, padding: 0 }]} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {Array.from({ length: 20 }, (_, i) => i).map((lotCount) => {
                const lotSize = selectedIPO?.quantity || 1;
                const unitPrice = selectedIPO?.buy_price || 0;
                const totalShares = lotCount * lotSize;
                const totalCost = lotCount * lotSize * unitPrice;
                const userId = activeLotPickerUserId;
                const isSelected = userId ? (userLotQuantities[userId] || 0) === lotCount : false;

                return (
                  <TouchableOpacity
                    key={lotCount}
                    onPress={() => {
                      if (userId) {
                        setUserLotQuantities((prev) => ({ ...prev, [userId]: lotCount }));
                        setSelectedUserIds((prev) => {
                          const n = new Set(prev);
                          if (lotCount > 0) n.add(userId);
                          else n.delete(userId);
                          return n;
                        });
                      }
                      setActiveLotPickerUserId(null);
                    }}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: '#2D2D3D',
                      backgroundColor: isSelected ? '#2E2E3E' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold', color: isSelected ? '#A5B4FC' : '#E0E7FF' }}>
                      {totalShares} ({lotCount} lots) (Rs {totalCost})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Status Confirmation Dialog Modal ── */}
      {confirmTarget && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmTarget(null)}
        >
          <Pressable style={styles.confirmOverlay} onPress={() => setConfirmTarget(null)}>
            <Pressable style={[styles.confirmCard, { backgroundColor: colors.card }]} onPress={() => {}}>
              <View style={[styles.confirmQuestionBadge, { backgroundColor: isDark ? '#3D3011' : '#FFF9E6' }]}>
                <Text style={styles.confirmQuestionMark}>?</Text>
              </View>

              <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
                {confirmTarget.status === 'Allotted' ? 'Mark as Allotted?' : 'Mark as Not Allotted?'}
              </Text>

              <Text style={[styles.confirmSubtitle, { color: colors.mutedForeground }]}>
                {confirmTarget.bid.user_name} — {confirmTarget.bid.ipo_name}
              </Text>

              <View style={styles.confirmActionsRow}>
                <TouchableOpacity
                  onPress={() => setConfirmTarget(null)}
                  style={[styles.confirmCancelBtn, { backgroundColor: colors.surface }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.confirmCancelText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    const { bid, status } = confirmTarget;
                    setConfirmTarget(null);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    try {
                      await updateApplication(bid.id, status);
                    } catch {
                      showError('Error', 'Failed to update application status.');
                    }
                  }}
                  style={styles.confirmActionBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmActionBtnText}>
                    {confirmTarget.status === 'Allotted' ? 'Allotted' : 'Not Allotted'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Floating Bulk Action Bar ── */}
      {isBulkMarking && (
        <View
          style={[
            styles.bulkFloatingBar,
            {
              backgroundColor: isDark ? '#1E293B' : '#0F172A',
              borderColor: isDark ? '#334155' : '#1E293B',
              bottom: Platform.OS === 'web' ? 80 : insets.bottom + 90,
            },
          ]}
        >
          {/* Header Row: Selection Counter & Quick Deselect */}
          <View style={styles.bulkBarTopRow}>
            <View style={[styles.bulkCountBadge, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <View style={[styles.bulkCountDot, { backgroundColor: '#FFFFFF' }]} />
              <Text style={[styles.bulkCountText, { color: '#FFFFFF' }]}>
                {bulkSelectedBidIds.size} Selected
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setBulkSelectedBidIds(new Set())}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Text style={[styles.bulkClearText, { color: '#94A3B8' }]}>
                Deselect All
              </Text>
            </TouchableOpacity>
          </View>

          {/* Action Row: 3 Equal-Width Status Buttons */}
          <View style={styles.bulkBarActionsRow}>
            <TouchableOpacity
              onPress={() => handleExecuteBulkStatusUpdate('Allotted')}
              disabled={bulkSelectedBidIds.size === 0 || bulkActionLoading}
              style={[
                styles.bulkBarBtn,
                { backgroundColor: '#10B981' },
                (bulkSelectedBidIds.size === 0 || bulkActionLoading) && { opacity: 0.4 },
              ]}
              activeOpacity={0.85}
            >
              <Feather name="check" size={14} color="#FFFFFF" />
              <Text style={styles.bulkBarBtnText}>Allotted</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleExecuteBulkStatusUpdate('Not Allotted')}
              disabled={bulkSelectedBidIds.size === 0 || bulkActionLoading}
              style={[
                styles.bulkBarBtn,
                { backgroundColor: '#EF4444' },
                (bulkSelectedBidIds.size === 0 || bulkActionLoading) && { opacity: 0.4 },
              ]}
              activeOpacity={0.85}
            >
              <Feather name="x" size={14} color="#FFFFFF" />
              <Text style={styles.bulkBarBtnText}>Not Allotted</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleExecuteBulkStatusUpdate('Cancelled')}
              disabled={bulkSelectedBidIds.size === 0 || bulkActionLoading}
              style={[
                styles.bulkBarBtn,
                { backgroundColor: '#6B7280' },
                (bulkSelectedBidIds.size === 0 || bulkActionLoading) && { opacity: 0.4 },
              ]}
              activeOpacity={0.85}
            >
              <Feather name="slash" size={13} color="#FFFFFF" />
              <Text style={styles.bulkBarBtnText}>Cancelled</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Add IPO Modal ── */}
      <AddIPOModal
        visible={showAddIPOModal}
        onClose={() => setShowAddIPOModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
    color: '#64748B',
  },
  headerTitle: { fontSize: 30, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.8, lineHeight: 34 },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    elevation: 3,
  },

  // Sub Header
  subHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subHeaderTitle: { fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  // Shortcuts — 3 Grid Cards
  shortcutsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  shortcutCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'flex-start',
    minHeight: 110,
  },
  shortcutIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  shortcutTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2, marginBottom: 2 },
  shortcutSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium' },

  // Sections
  sectionWrap: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewAllText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  // Quick Action Card
  quickActionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 76,
  },
  quickIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickActionTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  quickActionSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },

  // Attention Alert / Empty Cards
  attentionAlertCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 76,
  },
  alertIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  attentionAlertTitle: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold' },
  attentionAlertSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },

  attentionEmptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
  },
  emptyCheckWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  attentionEmptyTitle: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },
  attentionEmptySub: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },

  // Attention Banner (Screen 3)
  attentionBanner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  bannerIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold' },
  bannerSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },

  attentionItemCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  attentionItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  ipoAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(100,116,139,0.12)', alignItems: 'center', justifyContent: 'center' },
  ipoAvatarText: { color: '#64748B', fontFamily: 'GoogleSansFlex_700Bold', fontSize: 16 },
  attentionItemTitle: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold' },
  attentionItemSub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },
  attentionItemDate: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },

  updateRowBtn: { borderWidth: 1, borderColor: '#64748B', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  updateRowBtnText: { color: '#64748B', fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold' },

  bottomTipWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, paddingHorizontal: 4 },
  bottomTipIcon: { fontSize: 14 },
  bottomTipText: { flex: 1, fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 18 },

  // Recent / All Bid Cards
  recentEmptyCard: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center' },
  recentEmptyText: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center' },

  // Swipeable Bid Card styles
  swipeCardWrapper: {
    marginVertical: 4,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  swipeActionLeft: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    paddingLeft: 20,
  },
  swipeActionContentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swipeActionTextLeft: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  swipeActionRight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  swipeActionContentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swipeActionTextRight: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  swipeForegroundCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardTouchableInner: {
    padding: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  ipoAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ipoAvatarLetter: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  cardIpoTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  cardAppliedDate: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    marginHorizontal: 14,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  userDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  userNameText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  bankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  bankPillText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  // Filter Bar (Screen 5)
  filterBar: { borderBottomWidth: 1, borderBottomColor: 'transparent', paddingVertical: 10 },
  filterPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  filterPillText: { fontSize: 12, fontFamily: 'GoogleSansFlex_600SemiBold' },

  // Modals & Bottom Sheets
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
    marginBottom: -60,
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

  // App Summary Card (Screen 4)
  appSummaryCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  summaryIpoName: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold' },
  summarySub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },
  summaryAmt: { fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold' },

  // Status Radio Group
  statusRadioGroup: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  statusRadioOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12, minHeight: 48 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D4A017' },
  radioLabel: { fontSize: 14, fontFamily: 'GoogleSansFlex_500Medium', flex: 1 },
  currentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  currentBadgeText: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold' },

  fieldSubLabel: { fontSize: 11, fontFamily: 'GoogleSansFlex_500Medium', marginBottom: 4 },
  stepperWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  stepperBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Status Confirm Modal
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 340, borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  confirmQuestionBadge: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  confirmQuestionMark: { fontSize: 28, fontFamily: 'GoogleSansFlex_700Bold' },
  confirmTitle: { fontSize: 20, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.4, textAlign: 'center', marginBottom: 6 },
  confirmSubtitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', marginBottom: 24 },
  confirmActionsRow: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmCancelBtn: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmCancelText: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold' },
  confirmActionBtn: { flex: 1, backgroundColor: '#0F172A', minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmActionBtnText: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', color: '#FFFFFF' },

  stepperVal: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold' },
  sharesInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'GoogleSansFlex_500Medium', minHeight: 48 },
  notesInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', minHeight: 48 },

  // Bulk Status Marking Styles
  bidUserBankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  userNamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  userPillNameText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  bankNamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  bankNameText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  bulkHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  bulkHeaderPillText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  bulkCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  bulkFloatingBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    zIndex: 9990,
  },
  bulkBarTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bulkCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  bulkCountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bulkCountText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  bulkClearText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  bulkBarActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkBarBtn: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  bulkBarBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  pickerSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: 520, borderTopWidth: 1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, minHeight: 52 },
  pickerRowName: { fontSize: 14, fontFamily: 'GoogleSansFlex_500Medium' },
});
