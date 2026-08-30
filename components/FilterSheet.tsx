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
          ...activeUsers.map((u: User) => u.bank_name),
          ...bankAccounts.map((b: BankAccount) => b.bank_name),
          ...applications.map((a: ApplicationWithDetails) => a.user_bank_name),
        ]),
      ]
        .filter((b): b is string => Boolean(b))
        .sort(),
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
      : `${filterBankNames.length} Banks Selected`;

  const userLabel =
    filterUserIds.length === 0
      ? 'All Users'
      : filterUserIds.length === 1
      ? activeUsers.find((u) => u.id === filterUserIds[0])?.name || '1 User Selected'
      : `${filterUserIds.length} Users Selected`;

  const brokerLabel =
    filterBrokers.length === 0
      ? 'All Brokers'
      : filterBrokers.length === 1
      ? filterBrokers[0]
      : `${filterBrokers.length} Brokers Selected`;

  const yearLabel = filterYear ? filterYear : 'All Years';

  const ipoLabel =
    filterIpoNames.length === 0
      ? 'All IPOs'
      : filterIpoNames.length === 1
      ? filterIpoNames[0]
      : `${filterIpoNames.length} IPOs Selected`;

  const openPicker = (type: PickerType) => {
    setPickerSearch('');
    setActivePicker(type);
  };

  return (
    <>
      {/* Main Filter Sheet */}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderTopColor: colors.border,
                paddingBottom: Math.max(Math.round(insets.bottom * 0.5) + 12, 16),
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

            <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
              {/* Dropdown Field 1: BY BANK */}
              <View>
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
                    <Feather name="credit-card" size={16} color={filterBankNames.length > 0 ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.dropdownValue, { color: filterBankNames.length > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {bankLabel}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Dropdown Field 2: BY USER */}
              <View>
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
                    <Feather name="users" size={16} color={filterUserIds.length > 0 ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.dropdownValue, { color: filterUserIds.length > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {userLabel}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Dropdown Field 3: BY BROKER */}
              <View>
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
                    <Feather name="briefcase" size={16} color={filterBrokers.length > 0 ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.dropdownValue, { color: filterBrokers.length > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {brokerLabel}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Dropdown Field 4: BY YEAR */}
              <View>
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
                    <Feather name="calendar" size={16} color={filterYear ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.dropdownValue, { color: filterYear ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {yearLabel}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Dropdown Field 5: BY IPO */}
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
                    <Feather name="trending-up" size={16} color={filterIpoNames.length > 0 ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.dropdownValue, { color: filterIpoNames.length > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {ipoLabel}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity onPress={onClose} style={[styles.applyBtn, { backgroundColor: colors.primary }]} activeOpacity={0.85}>
              <Text style={styles.applyBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bulk-Apply Style Dropdown Option Selection Modal */}
      <Modal visible={activePicker !== null} transparent animationType="slide" onRequestClose={() => setActivePicker(null)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setActivePicker(null)}>
          <Pressable
            style={[
              styles.pickerSheet,
              {
                backgroundColor: colors.background,
                borderTopColor: colors.border,
                paddingBottom: Math.max(Math.round(insets.bottom * 0.5) + 12, 16),
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />

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

            {/* Optional Search bar for long option lists */}
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

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }} contentContainerStyle={{ paddingVertical: 6 }}>
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
                      const selected = filterBankNames.includes(b);
                      return (
                        <TouchableOpacity
                          key={b}
                          onPress={() => {
                            const next = selected ? filterBankNames.filter((x) => x !== b) : [...filterBankNames, b];
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

            <TouchableOpacity onPress={() => setActivePicker(null)} style={[styles.applyBtn, { backgroundColor: colors.primary, marginTop: 12 }]} activeOpacity={0.85}>
              <Text style={styles.applyBtnText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    borderTopWidth: 1,
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
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  dropdownInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dropdownValue: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
    flex: 1,
  },
  applyBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.2 },

  // Picker Modal Styles
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  pickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  pickerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 10,
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
