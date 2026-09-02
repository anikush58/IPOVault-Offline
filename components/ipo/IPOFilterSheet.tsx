import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export type FilterState = {
  issueTypes: string[];   // 'Mainboard' | 'SME'
  exchanges: string[];    // 'NSE' | 'BSE' | 'NSE SME' | 'BSE SME'
  sectors: string[];
  registrars: string[];
  onlyFavorites: boolean;
};

type Props = {
  visible: boolean;
  filters: FilterState;
  availableSectors: string[];
  availableRegistrars: string[];
  onApply: (filters: FilterState) => void;
  onReset: () => void;
  onClose: () => void;
};

export function IPOFilterSheet({
  visible,
  filters,
  availableSectors,
  availableRegistrars,
  onApply,
  onReset,
  onClose,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = React.useState<FilterState>(filters);

  React.useEffect(() => {
    if (visible) {
      setDraft(filters);
    }
  }, [visible, filters]);

  const toggleItem = (category: 'issueTypes' | 'exchanges' | 'sectors' | 'registrars', item: string) => {
    setDraft((prev) => {
      const arr = prev[category];
      const exists = arr.includes(item);
      const updated = exists ? arr.filter((x) => x !== item) : [...arr, item];
      return { ...prev, [category]: updated };
    });
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  const activeCount =
    draft.issueTypes.length +
    draft.exchanges.length +
    draft.sectors.length +
    draft.registrars.length +
    (draft.onlyFavorites ? 1 : 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>Filter IPOs</Text>
            {activeCount > 0 ? (
              <TouchableOpacity onPress={handleReset} style={[styles.clearBtn, { borderColor: colors.border }]}>
                <Text style={[styles.clearText, { color: colors.primary }]}>Clear All ({activeCount})</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Favorites Toggle */}
            <TouchableOpacity
              onPress={() => setDraft((prev) => ({ ...prev, onlyFavorites: !prev.onlyFavorites }))}
              style={[
                styles.favRow,
                {
                  backgroundColor: draft.onlyFavorites ? colors.primary + '14' : colors.surface,
                  borderColor: draft.onlyFavorites ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.favLeft}>
                <Feather
                  name="star"
                  size={16}
                  color={draft.onlyFavorites ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.favText,
                    { color: draft.onlyFavorites ? colors.primary : colors.foreground },
                  ]}
                >
                  Show Favorites Only
                </Text>
              </View>
              {draft.onlyFavorites && <Feather name="check" size={16} color={colors.primary} />}
            </TouchableOpacity>

            {/* Issue Type */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ISSUE TYPE</Text>
            <View style={styles.chipRow}>
              {['Mainboard', 'SME'].map((type) => {
                const sel = draft.issueTypes.includes(type);
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => toggleItem('issueTypes', type)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: sel ? colors.primary : colors.surface,
                        borderColor: sel ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: sel ? '#FFFFFF' : colors.foreground }]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Exchange */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>EXCHANGE</Text>
            <View style={styles.chipRow}>
              {['NSE', 'BSE', 'NSE SME', 'BSE SME'].map((ex) => {
                const sel = draft.exchanges.includes(ex);
                return (
                  <TouchableOpacity
                    key={ex}
                    onPress={() => toggleItem('exchanges', ex)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: sel ? colors.primary : colors.surface,
                        borderColor: sel ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: sel ? '#FFFFFF' : colors.foreground }]}>
                      {ex}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Sector */}
            {availableSectors.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SECTOR</Text>
                <View style={styles.chipRow}>
                  {availableSectors.map((sector) => {
                    const sel = draft.sectors.includes(sector);
                    return (
                      <TouchableOpacity
                        key={sector}
                        onPress={() => toggleItem('sectors', sector)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: sel ? colors.primary : colors.surface,
                            borderColor: sel ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: sel ? '#FFFFFF' : colors.foreground }]}>
                          {sector}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* Registrar */}
            {availableRegistrars.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>REGISTRAR</Text>
                <View style={styles.chipRow}>
                  {availableRegistrars.map((reg) => {
                    const sel = draft.registrars.includes(reg);
                    return (
                      <TouchableOpacity
                        key={reg}
                        onPress={() => toggleItem('registrars', reg)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: sel ? colors.primary : colors.surface,
                            borderColor: sel ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: sel ? '#FFFFFF' : colors.foreground }]}>
                          {reg}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>

          {/* Sticky Apply button */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={handleApply}
              style={[styles.applyBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.applyBtnText}>
                {activeCount > 0 ? `Apply (${activeCount} Filters)` : 'Apply Filters'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    maxHeight: 600,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  clearBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  clearText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 24,
  },
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  favLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  favText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    height: 36,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  applyBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
