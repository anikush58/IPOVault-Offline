import React, { useState, useMemo } from 'react';
import {
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
import { Feather } from '@expo/vector-icons';
import { Icon } from '@/components/ui/Icon';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { DesignSystem } from '@/constants/DesignSystem';
import { useDB, type User, type BankAccount, type ApplicationWithDetails } from '@/context/DBContext';

type Props = {
  visible: boolean;
  filterUserIds: string[];
  filterBrokers: string[];
  filterYear: string | null;
  filterIpoNames: string[];
  filterBankNames?: string[];
  hideBank?: boolean;
  hideBroker?: boolean;
  customIpoNames?: string[];
  onFilterChange: (
    userIds: string[],
    brokers: string[],
    year: string | null,
    ipoNames: string[],
    bankNames?: string[]
  ) => void;
  onClose: () => void;
};

type PickerType = 'bank' | 'user' | 'broker' | 'year' | 'ipo' | null;

const DEFAULT_POPULAR_BANKS = [
  'Axis Bank',
  'Bank of Baroda',
  'Canara Bank',
  'HDFC Bank',
  'ICICI Bank',
  'IDFC FIRST Bank',
  'IndusInd Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'State Bank of India (SBI)',
  'Union Bank of India',
  'Yes Bank',
];

export function FilterSheet({
  visible,
  filterUserIds,
  filterBrokers,
  filterYear,
  filterIpoNames,
  filterBankNames = [],
  hideBank = false,
  hideBroker = false,
  customIpoNames,
  onFilterChange,
  onClose,
}: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { users, applications, bankAccounts } = useDB();

  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const activeUsers = useMemo(() => users.filter((u: User) => u.archived !== 1), [users]);
  const brokers = useMemo(
    () => [...new Set(activeUsers.map((u: User) => u.broker).filter((b): b is string => Boolean(b)))].sort(),
    [activeUsers]
  );
  const banks = useMemo(
    () =>
      [
        ...new Set([
          ...DEFAULT_POPULAR_BANKS,
          ...activeUsers.map((u: User) => u.bank_name),
          ...bankAccounts.map((b: BankAccount) => b.bank_name),
          ...applications.map((a: ApplicationWithDetails) => a.user_bank_name),
          ...applications.map((a: ApplicationWithDetails) => (a as any).bank_name),
        ]),
      ]
        .filter((b): b is string => Boolean(b && typeof b === 'string' && b.trim().length > 0))
        .map((b) => b.trim())
        .filter((b, idx, self) => self.findIndex((x) => x.toLowerCase() === b.toLowerCase()) === idx)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [activeUsers, bankAccounts, applications]
  );

  const defaultIpoNames = useMemo(
    () => [...new Set(applications.map((a) => a.ipo_name).filter((name): name is string => Boolean(name)))].sort(),
    [applications]
  );

  const ipoNames = customIpoNames ?? defaultIpoNames;

  const currentYear = new Date().getFullYear().toString();
  const years = useMemo(
    () =>
      [
        ...new Set([
          currentYear,
          ...applications
            .map((a) => (a.open_date ? a.open_date.slice(0, 4) : null))
            .filter((y): y is string => y !== null),
        ]),
      ].sort((a, b) => b.localeCompare(a)),
    [applications, currentYear]
  );

  const activeCount =
    filterUserIds.length +
    filterBrokers.length +
    (filterYear ? 1 : 0) +
    filterIpoNames.length +
    filterBankNames.length;

  // Helper text formatters for dropdown trigger fields
  const bankLabel =
    filterBankNames.length === 0
      ? 'All Banks'
      : filterBankNames.length === 1
      ? filterBankNames[0]
      : `${filterBankNames.length} Selected`;

  const userLabel =
    filterUserIds.length === 0
      ? 'All Users'
      : filterUserIds.length === 1
      ? activeUsers.find((u) => u.id === filterUserIds[0])?.name || '1 Selected'
      : `${filterUserIds.length} Selected`;

  const brokerLabel =
    filterBrokers.length === 0
      ? 'All Brokers'
      : filterBrokers.length === 1
      ? filterBrokers[0]
      : `${filterBrokers.length} Selected`;

  const yearLabel = filterYear ? filterYear : 'All Years';

  const ipoLabel =
    filterIpoNames.length === 0
      ? 'All IPOs'
      : filterIpoNames.length === 1
      ? filterIpoNames[0]
      : `${filterIpoNames.length} Selected`;

  const openPicker = (type: PickerType) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setPickerSearch('');
    setActivePicker(type);
  };

  const handleClearAll = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
    onFilterChange([], [], null, [], []);
  };

  const handleApply = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    onClose();
  };

  return (
    <>
      {/* Main Filter Modal */}
      <Modal
        visible={visible && activePicker === null}
        animationType="fade"
        transparent
        onRequestClose={onClose}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable style={styles.backdropDismiss} onPress={onClose} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Modal Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <View style={styles.headerTitleGroup}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.title, { color: colors.foreground }]}>Filter Records</Text>
                    {activeCount > 0 && (
                      <View style={[styles.activeBadge, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.activeBadgeText, { color: colors.primaryForeground }]}>{activeCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                    Refine dashboard & application list
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {activeCount > 0 && (
                  <TouchableOpacity
                    onPress={handleClearAll}
                    style={[styles.clearBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    activeOpacity={0.7}
                  >
                    <Feather name="rotate-ccw" size={12} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={[styles.clearText, { color: colors.primary }]}>Reset</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.closeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  hitSlop={8}
                >
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

          <ScrollView
            style={{ flexShrink: 1, flexGrow: 0 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
          {/* If bank and broker are both hidden (Dashboard filter) */}
          {hideBank && hideBroker ? (
            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY USER</Text>
                <TouchableOpacity
                  onPress={() => openPicker('user')}
                  style={[
                    styles.dropdownTrigger,
                    {
                      borderColor: filterUserIds.length > 0 ? colors.primary : colors.border,
                      backgroundColor: filterUserIds.length > 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                    },
                  ]}
                  activeOpacity={0.75}
                >
                  <View style={styles.dropdownInner}>
                    <View
                      style={[
                        styles.fieldIconWrap,
                        {
                          backgroundColor: filterUserIds.length > 0 ? colors.primary + '20' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                        },
                      ]}
                    >
                      <Feather name="users" size={14} color={filterUserIds.length > 0 ? colors.primary : colors.mutedForeground} />
                    </View>
                    <Text
                      style={[
                        styles.dropdownValue,
                        { color: filterUserIds.length > 0 ? (isDark ? '#818CF8' : colors.primary) : colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {userLabel}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY YEAR</Text>
                <TouchableOpacity
                  onPress={() => openPicker('year')}
                  style={[
                    styles.dropdownTrigger,
                    {
                      borderColor: filterYear ? colors.primary : colors.border,
                      backgroundColor: filterYear ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                    },
                  ]}
                  activeOpacity={0.75}
                >
                  <View style={styles.dropdownInner}>
                    <View
                      style={[
                        styles.fieldIconWrap,
                        {
                          backgroundColor: filterYear ? colors.primary + '20' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                        },
                      ]}
                    >
                      <Feather name="calendar" size={14} color={filterYear ? colors.primary : colors.mutedForeground} />
                    </View>
                    <Text
                      style={[
                        styles.dropdownValue,
                        { color: filterYear ? (isDark ? '#818CF8' : colors.primary) : colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {yearLabel}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* 2-Column Grid Row 1: BY BANK & BY USER */}
              <View style={styles.gridRow}>
                {!hideBank && (
                  <View style={styles.gridCol}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY BANK</Text>
                    <TouchableOpacity
                      onPress={() => openPicker('bank')}
                      style={[
                        styles.dropdownTrigger,
                        {
                          borderColor: filterBankNames.length > 0 ? colors.primary : colors.border,
                          backgroundColor: filterBankNames.length > 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      <View style={styles.dropdownInner}>
                        <View
                          style={[
                            styles.fieldIconWrap,
                            {
                              backgroundColor: filterBankNames.length > 0 ? colors.primary + '20' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                            },
                          ]}
                        >
                          <Feather name="credit-card" size={14} color={filterBankNames.length > 0 ? colors.primary : colors.mutedForeground} />
                        </View>
                        <Text
                          style={[
                            styles.dropdownValue,
                            { color: filterBankNames.length > 0 ? (isDark ? '#818CF8' : colors.primary) : colors.foreground },
                          ]}
                          numberOfLines={1}
                        >
                          {bankLabel}
                        </Text>
                      </View>
                      <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.gridCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY USER</Text>
                  <TouchableOpacity
                    onPress={() => openPicker('user')}
                    style={[
                      styles.dropdownTrigger,
                      {
                        borderColor: filterUserIds.length > 0 ? colors.primary : colors.border,
                        backgroundColor: filterUserIds.length > 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <View style={styles.dropdownInner}>
                      <View
                        style={[
                          styles.fieldIconWrap,
                          {
                            backgroundColor: filterUserIds.length > 0 ? colors.primary + '20' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                          },
                        ]}
                      >
                        <Feather name="users" size={14} color={filterUserIds.length > 0 ? colors.primary : colors.mutedForeground} />
                      </View>
                      <Text
                        style={[
                          styles.dropdownValue,
                          { color: filterUserIds.length > 0 ? (isDark ? '#818CF8' : colors.primary) : colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {userLabel}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2-Column Grid Row 2: BY BROKER & BY YEAR */}
              <View style={styles.gridRow}>
                {!hideBroker && (
                  <View style={styles.gridCol}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY BROKER</Text>
                    <TouchableOpacity
                      onPress={() => openPicker('broker')}
                      style={[
                        styles.dropdownTrigger,
                        {
                          borderColor: filterBrokers.length > 0 ? colors.primary : colors.border,
                          backgroundColor: filterBrokers.length > 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      <View style={styles.dropdownInner}>
                        <View
                          style={[
                            styles.fieldIconWrap,
                            {
                              backgroundColor: filterBrokers.length > 0 ? colors.primary + '20' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                            },
                          ]}
                        >
                          <Feather name="briefcase" size={14} color={filterBrokers.length > 0 ? colors.primary : colors.mutedForeground} />
                        </View>
                        <Text
                          style={[
                            styles.dropdownValue,
                            { color: filterBrokers.length > 0 ? (isDark ? '#818CF8' : colors.primary) : colors.foreground },
                          ]}
                          numberOfLines={1}
                        >
                          {brokerLabel}
                        </Text>
                      </View>
                      <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.gridCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY YEAR</Text>
                  <TouchableOpacity
                    onPress={() => openPicker('year')}
                    style={[
                      styles.dropdownTrigger,
                      {
                        borderColor: filterYear ? colors.primary : colors.border,
                        backgroundColor: filterYear ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <View style={styles.dropdownInner}>
                      <View
                        style={[
                          styles.fieldIconWrap,
                          {
                            backgroundColor: filterYear ? colors.primary + '20' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                          },
                        ]}
                      >
                        <Feather name="calendar" size={14} color={filterYear ? colors.primary : colors.mutedForeground} />
                      </View>
                      <Text
                        style={[
                          styles.dropdownValue,
                          { color: filterYear ? (isDark ? '#818CF8' : colors.primary) : colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {yearLabel}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          {/* Full Width Row: BY IPO */}
          <View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY IPO NAME</Text>
            <TouchableOpacity
              onPress={() => openPicker('ipo')}
              style={[
                styles.dropdownTrigger,
                {
                  borderColor: filterIpoNames.length > 0 ? colors.primary : colors.border,
                  backgroundColor: filterIpoNames.length > 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                },
              ]}
              activeOpacity={0.75}
            >
              <View style={styles.dropdownInner}>
                <View
                  style={[
                    styles.fieldIconWrap,
                    {
                      backgroundColor: filterIpoNames.length > 0 ? colors.primary + '20' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    },
                  ]}
                >
                  <Feather name="trending-up" size={14} color={filterIpoNames.length > 0 ? colors.primary : colors.mutedForeground} />
                </View>
                <Text
                  style={[
                    styles.dropdownValue,
                    { color: filterIpoNames.length > 0 ? (isDark ? '#818CF8' : colors.primary) : colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {ipoLabel}
                </Text>
              </View>
              <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: 16 }]}>
          <TouchableOpacity
            onPress={handleApply}
            style={[styles.applyBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.applyBtnText, { color: colors.primaryForeground }]}>
              {activeCount > 0 ? `Apply Filters (${activeCount})` : 'Apply Filters'}
            </Text>
          </TouchableOpacity>
        </View>
          </View>
        </View>
      </Modal>

      {/* Option Picker Modal */}
      <Modal
        visible={visible && activePicker !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable style={styles.backdropDismiss} onPress={() => setActivePicker(null)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.pickerTitleRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.pickerTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {activePicker === 'bank' && 'Select Banks'}
                  {activePicker === 'user' && 'Select Users'}
                  {activePicker === 'broker' && 'Select Brokers'}
                  {activePicker === 'year' && 'Select Year'}
                  {activePicker === 'ipo' && 'Select IPOs'}
                </Text>
                <Text style={[styles.pickerSubtitle, { color: colors.mutedForeground }]}>
                  {activePicker === 'year' ? 'Choose specific filing year' : 'Choose one or multiple items'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActivePicker(null)}
                style={[styles.closeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                hitSlop={8}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

        {/* Search bar for option lists */}
        {(activePicker === 'bank' || activePicker === 'user' || activePicker === 'broker' || activePicker === 'ipo') && (
          <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Icon name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              placeholder="Search options..."
              placeholderTextColor={colors.mutedForeground}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              style={[styles.searchInput, { color: colors.foreground }]}
            />
            {pickerSearch.length > 0 && (
              <TouchableOpacity onPress={() => setPickerSearch('')}>
                <Icon name="x" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        )}

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexShrink: 1, flexGrow: 0, maxHeight: 380 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 4, gap: 6 }}
            showsVerticalScrollIndicator={false}
          >
          {/* PICKER: BANK */}
          {activePicker === 'bank' && (
            <>
              <TouchableOpacity
                onPress={() => {
                  onFilterChange(filterUserIds, filterBrokers, filterYear, filterIpoNames, []);
                  try { Haptics.selectionAsync(); } catch {}
                }}
                style={[
                  styles.pickerRow,
                  {
                    borderColor: filterBankNames.length === 0 ? colors.primary : colors.border,
                    backgroundColor: filterBankNames.length === 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.pickerRowName, { color: filterBankNames.length === 0 ? colors.primary : colors.foreground }]}>
                  All Banks
                </Text>
                {filterBankNames.length === 0 && (
                  <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
              {banks
                .filter((b) => b.toLowerCase().includes(pickerSearch.toLowerCase()))
                .map((b) => {
                  const selected = filterBankNames.some((x) => x.trim().toLowerCase() === b.trim().toLowerCase());
                  return (
                    <TouchableOpacity
                      key={b}
                      onPress={() => {
                        const next = selected
                          ? filterBankNames.filter((x) => x.trim().toLowerCase() !== b.trim().toLowerCase())
                          : [...filterBankNames, b];
                        onFilterChange(filterUserIds, filterBrokers, filterYear, filterIpoNames, next);
                        try { Haptics.selectionAsync(); } catch {}
                      }}
                      style={[
                        styles.pickerRow,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                        },
                      ]}
                    >
                      <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{b}</Text>
                      {selected && (
                        <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </>
          )}

          {/* PICKER: USER */}
          {activePicker === 'user' && (
            <>
              <TouchableOpacity
                onPress={() => {
                  onFilterChange([], filterBrokers, filterYear, filterIpoNames, filterBankNames);
                  try { Haptics.selectionAsync(); } catch {}
                }}
                style={[
                  styles.pickerRow,
                  {
                    borderColor: filterUserIds.length === 0 ? colors.primary : colors.border,
                    backgroundColor: filterUserIds.length === 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.pickerRowName, { color: filterUserIds.length === 0 ? colors.primary : colors.foreground }]}>
                  All Users
                </Text>
                {filterUserIds.length === 0 && (
                  <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
              {activeUsers
                .filter((u) => u.name.toLowerCase().includes(pickerSearch.toLowerCase()) || (u.broker || '').toLowerCase().includes(pickerSearch.toLowerCase()))
                .map((u) => {
                  const selected = filterUserIds.includes(u.id);
                  return (
                    <TouchableOpacity
                      key={u.id}
                      onPress={() => {
                        const next = selected ? filterUserIds.filter((x) => x !== u.id) : [...filterUserIds, u.id];
                        onFilterChange(next, filterBrokers, filterYear, filterIpoNames, filterBankNames);
                        try { Haptics.selectionAsync(); } catch {}
                      }}
                      style={[
                        styles.pickerRow,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{u.name}</Text>
                        {u.broker ? <Text style={[styles.pickerRowSub, { color: colors.mutedForeground }]}>{u.broker}</Text> : null}
                      </View>
                      {selected && (
                        <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </>
          )}

          {/* PICKER: BROKER */}
          {activePicker === 'broker' && (
            <>
              <TouchableOpacity
                onPress={() => {
                  onFilterChange(filterUserIds, [], filterYear, filterIpoNames, filterBankNames);
                  try { Haptics.selectionAsync(); } catch {}
                }}
                style={[
                  styles.pickerRow,
                  {
                    borderColor: filterBrokers.length === 0 ? colors.primary : colors.border,
                    backgroundColor: filterBrokers.length === 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.pickerRowName, { color: filterBrokers.length === 0 ? colors.primary : colors.foreground }]}>
                  All Brokers
                </Text>
                {filterBrokers.length === 0 && (
                  <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
              {brokers
                .filter((b) => b.toLowerCase().includes(pickerSearch.toLowerCase()))
                .map((b) => {
                  const selected = filterBrokers.includes(b);
                  return (
                    <TouchableOpacity
                      key={b}
                      onPress={() => {
                        const next = selected ? filterBrokers.filter((x) => x !== b) : [...filterBrokers, b];
                        onFilterChange(filterUserIds, next, filterYear, filterIpoNames, filterBankNames);
                        try { Haptics.selectionAsync(); } catch {}
                      }}
                      style={[
                        styles.pickerRow,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                        },
                      ]}
                    >
                      <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{b}</Text>
                      {selected && (
                        <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </>
          )}

          {/* PICKER: YEAR */}
          {activePicker === 'year' && (
            <>
              <TouchableOpacity
                onPress={() => {
                  onFilterChange(filterUserIds, filterBrokers, null, filterIpoNames, filterBankNames);
                  try { Haptics.selectionAsync(); } catch {}
                }}
                style={[
                  styles.pickerRow,
                  {
                    borderColor: !filterYear ? colors.primary : colors.border,
                    backgroundColor: !filterYear ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.pickerRowName, { color: !filterYear ? colors.primary : colors.foreground }]}>
                  All Years
                </Text>
                {!filterYear && (
                  <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
              {years.map((y) => {
                const selected = filterYear === y;
                return (
                  <TouchableOpacity
                    key={y}
                    onPress={() => {
                      onFilterChange(filterUserIds, filterBrokers, y, filterIpoNames, filterBankNames);
                      try { Haptics.selectionAsync(); } catch {}
                    }}
                    style={[
                      styles.pickerRow,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{y}</Text>
                    {selected && (
                      <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                        <Feather name="check" size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* PICKER: IPO */}
          {activePicker === 'ipo' && (
            <>
              <TouchableOpacity
                onPress={() => {
                  onFilterChange(filterUserIds, filterBrokers, filterYear, [], filterBankNames);
                  try { Haptics.selectionAsync(); } catch {}
                }}
                style={[
                  styles.pickerRow,
                  {
                    borderColor: filterIpoNames.length === 0 ? colors.primary : colors.border,
                    backgroundColor: filterIpoNames.length === 0 ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.pickerRowName, { color: filterIpoNames.length === 0 ? colors.primary : colors.foreground }]}>
                  All IPOs
                </Text>
                {filterIpoNames.length === 0 && (
                  <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
              {ipoNames
                .filter((name) => name.toLowerCase().includes(pickerSearch.toLowerCase()))
                .map((name) => {
                  const selected = filterIpoNames.includes(name);
                  return (
                    <TouchableOpacity
                      key={name}
                      onPress={() => {
                        const next = selected ? filterIpoNames.filter((x) => x !== name) : [...filterIpoNames, name];
                        onFilterChange(filterUserIds, filterBrokers, filterYear, next, filterBankNames);
                        try { Haptics.selectionAsync(); } catch {}
                      }}
                      style={[
                        styles.pickerRow,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : colors.surface,
                        },
                      ]}
                    >
                      <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{name}</Text>
                      {selected && (
                        <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: 16 }]}>
          <TouchableOpacity
            onPress={() => setActivePicker(null)}
            style={[styles.applyBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.applyBtnText, { color: colors.primaryForeground }]}>Done</Text>
          </TouchableOpacity>
        </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  activeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  activeBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 14,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCol: {
    flex: 1,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 50,
  },
  dropdownInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  fieldIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownValue: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  applyBtn: {
    borderRadius: 9999,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.2,
  },

  // Picker Styles
  pickerTitleRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  pickerTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  pickerSubtitle: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    height: 40,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  pickerRowName: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  pickerRowSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
    zIndex: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
