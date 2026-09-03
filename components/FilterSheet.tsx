import React, { useState, useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDB, type User, type BankAccount, type ApplicationWithDetails } from '@/context/DBContext';

type Props = {
  visible: boolean;
  filterUserIds: string[];
  filterBrokers: string[];
  filterYear: string | null;
  filterIpoNames: string[];
  filterBankNames?: string[];
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
  onFilterChange,
  onClose,
}: Props) {
  const colors = useColors();
  const { users, applications, bankAccounts } = useDB();
  const insets = useSafeAreaInsets();

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

  const ipoNames = useMemo(
    () => [...new Set(applications.map((a) => a.ipo_name).filter((name): name is string => Boolean(name)))].sort(),
    [applications]
  );

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
    setPickerSearch('');
    setActivePicker(type);
  };

  return (
    <>
      {/* Main Filter Sheet */}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.foreground }]}>Filter Applications</Text>
              <TouchableOpacity
                onPress={() => {
                  onFilterChange([], [], null, [], []);
                }}
                style={[styles.clearBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.clearText, { color: colors.primary }]}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
              {/* 2-Column Grid Row 1: BY BANK & BY USER */}
              <View style={styles.gridRow}>
                <View style={styles.gridCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY BANK</Text>
                  <TouchableOpacity
                    onPress={() => openPicker('bank')}
                    style={[
                      styles.dropdownTrigger,
                      {
                        borderColor: filterBankNames.length > 0 ? colors.primary : colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dropdownInner}>
                      <Feather name="credit-card" size={15} color={filterBankNames.length > 0 ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.dropdownValue, { color: filterBankNames.length > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                        {bankLabel}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                <View style={styles.gridCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY USER</Text>
                  <TouchableOpacity
                    onPress={() => openPicker('user')}
                    style={[
                      styles.dropdownTrigger,
                      {
                        borderColor: filterUserIds.length > 0 ? colors.primary : colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dropdownInner}>
                      <Feather name="users" size={15} color={filterUserIds.length > 0 ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.dropdownValue, { color: filterUserIds.length > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                        {userLabel}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2-Column Grid Row 2: BY BROKER & BY YEAR */}
              <View style={styles.gridRow}>
                <View style={styles.gridCol}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY BROKER</Text>
                  <TouchableOpacity
                    onPress={() => openPicker('broker')}
                    style={[
                      styles.dropdownTrigger,
                      {
                        borderColor: filterBrokers.length > 0 ? colors.primary : colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dropdownInner}>
                      <Feather name="briefcase" size={15} color={filterBrokers.length > 0 ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.dropdownValue, { color: filterBrokers.length > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                        {brokerLabel}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
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
                        backgroundColor: colors.surface,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dropdownInner}>
                      <Feather name="calendar" size={15} color={filterYear ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.dropdownValue, { color: filterYear ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                        {yearLabel}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Full Width Row: BY IPO */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BY IPO</Text>
                <TouchableOpacity
                  onPress={() => openPicker('ipo')}
                  style={[
                    styles.dropdownTrigger,
                    {
                      borderColor: filterIpoNames.length > 0 ? colors.primary : colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropdownInner}>
                    <Feather name="trending-up" size={15} color={filterIpoNames.length > 0 ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.dropdownValue, { color: filterIpoNames.length > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {ipoLabel}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity onPress={onClose} style={[styles.applyBtn, { backgroundColor: colors.primary }]} activeOpacity={0.85}>
              <Text style={styles.applyBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Field Option Selection Modal Dialog for All Fields */}
      <Modal visible={activePicker !== null} transparent animationType="fade" onRequestClose={() => setActivePicker(null)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setActivePicker(null)}>
          <Pressable
            style={[
              styles.pickerSheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.pickerTitleRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.foreground }]}>
                {activePicker === 'bank' && 'Select Banks'}
                {activePicker === 'user' && 'Select Users'}
                {activePicker === 'broker' && 'Select Brokers'}
                {activePicker === 'year' && 'Select Year'}
                {activePicker === 'ipo' && 'Select IPOs'}
              </Text>
              <TouchableOpacity onPress={() => setActivePicker(null)} style={styles.pickerCloseBtn}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Search bar for option lists */}
            {(activePicker === 'bank' || activePicker === 'user' || activePicker === 'broker' || activePicker === 'ipo') && (
              <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  placeholder="Search..."
                  placeholderTextColor={colors.mutedForeground}
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  style={[styles.searchInput, { color: colors.foreground }]}
                />
                {pickerSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setPickerSearch('')}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }} contentContainerStyle={{ paddingVertical: 4 }}>
              {/* PICKER: BANK */}
              {activePicker === 'bank' && (
                <>
                  <TouchableOpacity
                    onPress={() => onFilterChange(filterUserIds, filterBrokers, filterYear, filterIpoNames, [])}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: filterBankNames.length === 0 ? colors.primary + '12' : 'transparent' }]}
                  >
                    <Text style={[styles.pickerRowName, { color: filterBankNames.length === 0 ? colors.primary : colors.foreground }]}>
                      All Banks
                    </Text>
                    {filterBankNames.length === 0 && <Feather name="check" size={18} color={colors.primary} />}
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
                          }}
                          style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: selected ? colors.primary + '12' : 'transparent' }]}
                        >
                          <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{b}</Text>
                          {selected && <Feather name="check" size={18} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                </>
              )}

              {/* PICKER: USER */}
              {activePicker === 'user' && (
                <>
                  <TouchableOpacity
                    onPress={() => onFilterChange([], filterBrokers, filterYear, filterIpoNames, filterBankNames)}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: filterUserIds.length === 0 ? colors.primary + '12' : 'transparent' }]}
                  >
                    <Text style={[styles.pickerRowName, { color: filterUserIds.length === 0 ? colors.primary : colors.foreground }]}>
                      All Users
                    </Text>
                    {filterUserIds.length === 0 && <Feather name="check" size={18} color={colors.primary} />}
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
                          }}
                          style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: selected ? colors.primary + '12' : 'transparent' }]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{u.name}</Text>
                            {u.broker ? <Text style={[styles.pickerRowSub, { color: colors.mutedForeground }]}>{u.broker}</Text> : null}
                          </View>
                          {selected && <Feather name="check" size={18} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                </>
              )}

              {/* PICKER: BROKER */}
              {activePicker === 'broker' && (
                <>
                  <TouchableOpacity
                    onPress={() => onFilterChange(filterUserIds, [], filterYear, filterIpoNames, filterBankNames)}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: filterBrokers.length === 0 ? colors.primary + '12' : 'transparent' }]}
                  >
                    <Text style={[styles.pickerRowName, { color: filterBrokers.length === 0 ? colors.primary : colors.foreground }]}>
                      All Brokers
                    </Text>
                    {filterBrokers.length === 0 && <Feather name="check" size={18} color={colors.primary} />}
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
                          }}
                          style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: selected ? colors.primary + '12' : 'transparent' }]}
                        >
                          <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{b}</Text>
                          {selected && <Feather name="check" size={18} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                </>
              )}

              {/* PICKER: YEAR */}
              {activePicker === 'year' && (
                <>
                  <TouchableOpacity
                    onPress={() => onFilterChange(filterUserIds, filterBrokers, null, filterIpoNames, filterBankNames)}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: !filterYear ? colors.primary + '12' : 'transparent' }]}
                  >
                    <Text style={[styles.pickerRowName, { color: !filterYear ? colors.primary : colors.foreground }]}>
                      All Years
                    </Text>
                    {!filterYear && <Feather name="check" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                  {years.map((y) => {
                    const selected = filterYear === y;
                    return (
                      <TouchableOpacity
                        key={y}
                        onPress={() => onFilterChange(filterUserIds, filterBrokers, y, filterIpoNames, filterBankNames)}
                        style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: selected ? colors.primary + '12' : 'transparent' }]}
                      >
                        <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{y}</Text>
                        {selected && <Feather name="check" size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {/* PICKER: IPO */}
              {activePicker === 'ipo' && (
                <>
                  <TouchableOpacity
                    onPress={() => onFilterChange(filterUserIds, filterBrokers, filterYear, [], filterBankNames)}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: filterIpoNames.length === 0 ? colors.primary + '12' : 'transparent' }]}
                  >
                    <Text style={[styles.pickerRowName, { color: filterIpoNames.length === 0 ? colors.primary : colors.foreground }]}>
                      All IPOs
                    </Text>
                    {filterIpoNames.length === 0 && <Feather name="check" size={18} color={colors.primary} />}
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
                          }}
                          style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: selected ? colors.primary + '12' : 'transparent' }]}
                        >
                          <Text style={[styles.pickerRowName, { color: selected ? colors.primary : colors.foreground }]}>{name}</Text>
                          {selected && <Feather name="check" size={18} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                </>
              )}
            </ScrollView>

            <TouchableOpacity onPress={() => setActivePicker(null)} style={[styles.applyBtn, { backgroundColor: colors.primary, marginTop: 14 }]} activeOpacity={0.85}>
              <Text style={styles.applyBtnText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: {
    width: '92%',
    maxWidth: 440,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    maxHeight: '85%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: { fontSize: 20, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  clearBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  clearText: { fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium' },
  fieldLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1,
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
    height: 48,
  },
  dropdownInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dropdownValue: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
    flex: 1,
  },
  applyBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.2 },

  // Centered Modal Dialog Styles for All Option Pickers
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  pickerSheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
  },
  pickerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  pickerCloseBtn: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderBottomWidth: 1,
  },
  pickerRowName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  pickerRowSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
});
