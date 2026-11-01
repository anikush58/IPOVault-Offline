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
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';

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
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = React.useState<FilterState>(filters);

  React.useEffect(() => {
    if (visible) {
      setDraft(filters);
    }
  }, [visible, filters]);

  const toggleItem = (category: 'issueTypes' | 'exchanges' | 'sectors' | 'registrars', item: string) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setDraft((prev) => {
      const arr = prev[category];
      const exists = arr.includes(item);
      const updated = exists ? arr.filter((x) => x !== item) : [...arr, item];
      return { ...prev, [category]: updated };
    });
  };

  const handleApply = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    onApply(draft);
    onClose();
  };

  const handleReset = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
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
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.centerModalOverlay}>
        <Pressable style={styles.backdropDismiss} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleGroup}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.title, { color: colors.foreground }]}>Filter IPOs</Text>
                  {activeCount > 0 && (
                    <View style={[styles.activeBadge, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.activeBadgeText, { color: colors.primaryForeground }]}>{activeCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Filter by sector, issue type & registrar
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {activeCount > 0 && (
                <TouchableOpacity
                  onPress={handleReset}
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
        {/* Favorites Toggle */}
        <TouchableOpacity
          onPress={() => {
            try { Haptics.selectionAsync(); } catch {}
            setDraft((prev) => ({ ...prev, onlyFavorites: !prev.onlyFavorites }));
          }}
          style={[
            styles.favRow,
            {
              backgroundColor: draft.onlyFavorites
                ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF')
                : colors.surface,
              borderColor: draft.onlyFavorites ? colors.primary : colors.border,
            },
          ]}
          activeOpacity={0.75}
        >
          <View style={styles.favLeft}>
            <View
              style={[
                styles.favIconWrap,
                {
                  backgroundColor: draft.onlyFavorites
                    ? colors.primary + '20'
                    : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                },
              ]}
            >
              <Feather
                name="star"
                size={14}
                color={draft.onlyFavorites ? colors.primary : colors.mutedForeground}
              />
            </View>
            <Text
              style={[
                styles.favText,
                { color: draft.onlyFavorites ? colors.primary : colors.foreground },
              ]}
            >
              Show Favorites Only
            </Text>
          </View>
          {draft.onlyFavorites && (
            <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
              <Feather name="check" size={12} color="#FFFFFF" />
            </View>
          )}
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
                    backgroundColor: sel ? (isDark ? 'rgba(99, 102, 241, 0.14)' : '#EEF2FF') : colors.surface,
                    borderColor: sel ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, { color: sel ? colors.primary : colors.foreground }]}>
                  {type}
                </Text>
                {sel && <Feather name="check" size={12} color={colors.primary} style={{ marginLeft: 4 }} />}
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
                    backgroundColor: sel ? (isDark ? 'rgba(99, 102, 241, 0.14)' : '#EEF2FF') : colors.surface,
                    borderColor: sel ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, { color: sel ? colors.primary : colors.foreground }]}>
                  {ex}
                </Text>
                {sel && <Feather name="check" size={12} color={colors.primary} style={{ marginLeft: 4 }} />}
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
                        backgroundColor: sel ? (isDark ? 'rgba(99, 102, 241, 0.14)' : '#EEF2FF') : colors.surface,
                        borderColor: sel ? colors.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, { color: sel ? colors.primary : colors.foreground }]}>
                      {sector}
                    </Text>
                    {sel && <Feather name="check" size={12} color={colors.primary} style={{ marginLeft: 4 }} />}
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
                        backgroundColor: sel ? (isDark ? 'rgba(99, 102, 241, 0.14)' : '#EEF2FF') : colors.surface,
                        borderColor: sel ? colors.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, { color: sel ? colors.primary : colors.foreground }]}>
                      {reg}
                    </Text>
                    {sel && <Feather name="check" size={12} color={colors.primary} style={{ marginLeft: 4 }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Sticky Apply button */}
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
  );
}

export const IPOFilterModal = IPOFilterSheet;

const styles = StyleSheet.create({
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
    maxHeight: '88%',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    paddingTop: 16,
    paddingBottom: 12,
  },
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  favLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  favIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favText: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  applyBtn: {
    height: 48,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.2,
  },
});
