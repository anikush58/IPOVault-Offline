import React, { useState, useMemo } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

  const [showIpoDropdown, setShowIpoDropdown] = useState(false);
  const [ipoSearch, setIpoSearch] = useState('');

  const activeUsers = useMemo(() => users.filter((u: User) => u.archived !== 1), [users]);
  const brokers = useMemo(() => [...new Set(activeUsers.map((u: User) => u.broker).filter((b): b is string => Boolean(b)))], [activeUsers]);
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

  // Derive unique IPO names
  const ipoNames = [...new Set(applications.map((a) => a.ipo_name).filter(Boolean))].sort();
  const filteredIpoNames = ipoNames.filter((name) =>
    name.toLowerCase().includes(ipoSearch.toLowerCase())
  );

  // Derive available years from open_date across all applications, always including current year
  const currentYear = new Date().getFullYear().toString();
  const years = [...new Set([
    currentYear,
    ...applications
      .map((a) => {
        const y = a.open_date ? a.open_date.slice(0, 4) : '';
        return y || null;
      })
      .filter((y): y is string => y !== null),
  ])].sort((a, b) => b.localeCompare(a));

  return (
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
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Filter</Text>
            <TouchableOpacity
              onPress={() => {
                onFilterChange([], [], null, [], []);
                setIpoSearch('');
                setShowIpoDropdown(false);
              }}
              style={[styles.clearBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.clearText, { color: colors.primary }]}>Clear All</Text>
            </TouchableOpacity>
          </View>

          {/* BY BANK FILTER */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BY BANK</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {banks.map((b) => {
              const active = filterBankNames.includes(b);
              return (
                <TouchableOpacity
                  key={b}
                  onPress={() => {
                    const nextBanks = active
                      ? filterBankNames.filter((x) => x !== b)
                      : [...filterBankNames, b];
                    onFilterChange(filterUserIds, filterBrokers, filterYear, filterIpoNames, nextBanks);
                  }}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.card,
                    },
                  ]}
                >
                  {active && <View style={[styles.chipDot, { backgroundColor: '#fff' }]} />}
                  <Text style={[styles.chipText, { color: active ? '#fff' : colors.foreground }]}>
                    {b}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {banks.length === 0 && (
              <Text style={[styles.noData, { color: colors.mutedForeground }]}>No banks yet</Text>
            )}
          </ScrollView>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>BY USER</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {activeUsers.map((u: User) => {
              const active = filterUserIds.includes(u.id);
              return (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => {
                    const nextUserIds = active
                      ? filterUserIds.filter((id) => id !== u.id)
                      : [...filterUserIds, u.id];
                    onFilterChange(nextUserIds, filterBrokers, filterYear, filterIpoNames, filterBankNames);
                  }}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.card,
                    },
                  ]}
                >
                  {active && (
                    <View style={[styles.chipDot, { backgroundColor: '#fff' }]} />
                  )}
                  <Text style={[styles.chipText, { color: active ? '#fff' : colors.foreground }]}>
                    {u.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {users.length === 0 && (
              <Text style={[styles.noData, { color: colors.mutedForeground }]}>No users yet</Text>
            )}
          </ScrollView>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 22 }]}>
            BY BROKER
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {brokers.map((b) => {
              const active = filterBrokers.includes(b);
              return (
                <TouchableOpacity
                  key={b}
                  onPress={() => {
                    const nextBrokers = active
                      ? filterBrokers.filter((x) => x !== b)
                      : [...filterBrokers, b];
                    onFilterChange(filterUserIds, nextBrokers, filterYear, filterIpoNames, filterBankNames);
                  }}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.card,
                    },
                  ]}
                >
                  {active && <View style={[styles.chipDot, { backgroundColor: '#fff' }]} />}
                  <Text style={[styles.chipText, { color: active ? '#fff' : colors.foreground }]}>
                    {b}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {brokers.length === 0 && (
              <Text style={[styles.noData, { color: colors.mutedForeground }]}>No brokers yet</Text>
            )}
          </ScrollView>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 22 }]}>
            BY YEAR
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {years.map((y) => {
              const active = filterYear === y;
              return (
                <TouchableOpacity
                  key={y}
                  onPress={() => onFilterChange(filterUserIds, filterBrokers, active ? null : y, filterIpoNames, filterBankNames)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.card,
                    },
                  ]}
                >
                  {active && <View style={[styles.chipDot, { backgroundColor: '#fff' }]} />}
                  <Text style={[styles.chipText, { color: active ? '#fff' : colors.foreground }]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {years.length === 0 && (
              <Text style={[styles.noData, { color: colors.mutedForeground }]}>No data yet</Text>
            )}
          </ScrollView>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 22 }]}>
            BY IPO
          </Text>
          <TouchableOpacity
            style={[styles.dropdownTrigger, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => setShowIpoDropdown(!showIpoDropdown)}
          >
            <Text style={[styles.dropdownValue, { color: filterIpoNames.length > 0 ? colors.foreground : colors.mutedForeground }]}>
              {filterIpoNames.length > 0 ? `${filterIpoNames.length} Selected` : 'Select IPOs'}
            </Text>
            <Feather name={showIpoDropdown ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {showIpoDropdown && (
            <View style={[styles.dropdownList, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.searchBox, { borderBottomColor: colors.border }]}>
                <Feather name="search" size={14} color={colors.mutedForeground} />
                <TextInput
                  placeholder="Search IPO..."
                  placeholderTextColor={colors.mutedForeground}
                  value={ipoSearch}
                  onChangeText={setIpoSearch}
                  style={[styles.searchInput, { color: colors.foreground }]}
                />
              </View>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                <TouchableOpacity
                  style={styles.dropdownOption}
                  onPress={() => {
                    onFilterChange(filterUserIds, filterBrokers, filterYear, [], filterBankNames);
                  }}
                >
                  <Text style={[styles.dropdownOptionText, { color: filterIpoNames.length === 0 ? colors.primary : colors.foreground }]}>
                    All IPOs
                  </Text>
                </TouchableOpacity>
                {filteredIpoNames.map((name) => {
                  const active = filterIpoNames.includes(name);
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[styles.dropdownOption, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                      onPress={() => {
                        const nextIpos = active
                          ? filterIpoNames.filter((x) => x !== name)
                          : [...filterIpoNames, name];
                        onFilterChange(filterUserIds, filterBrokers, filterYear, nextIpos, filterBankNames);
                      }}
                    >
                      <Text style={[styles.dropdownOptionText, { color: active ? colors.primary : colors.foreground }]}>
                        {name}
                      </Text>
                      {active && <Feather name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            onPress={onClose}
            style={[styles.applyBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    borderTopWidth: 1,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 22 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  title: { fontSize: 20, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  clearBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  clearText: { fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium' },
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  chipRow: { gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1.5,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 14, fontFamily: 'GoogleSansFlex_500Medium' },
  noData: { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', fontStyle: 'italic' },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  dropdownValue: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  dropdownList: {
    borderWidth: 1.5,
    borderRadius: 12,
    marginTop: 6,
    overflow: 'hidden',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  dropdownScroll: {
    maxHeight: 160,
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownOptionText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  applyBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 26,
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.2 },
});
