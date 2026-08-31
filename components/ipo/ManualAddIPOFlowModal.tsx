import React, { useState, useCallback, useMemo } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { IPOStatusChip } from './IPOStatusChip';
import { formatCurrency } from '@/utils/formatters';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenCreateForm: (prefillCompanyName: string) => void;
};

export const ManualAddIPOFlowModal = React.memo(function ManualAddIPOFlowModal({
  visible,
  onClose,
  onOpenCreateForm,
}: Props) {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const repo = useMemo(() => new IPORepository(db), [db]);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<IPOMasterRecord[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(
    async (text: string) => {
      setQuery(text);
      if (!text.trim()) {
        setResults([]);
        setHasSearched(false);
        return;
      }
      setSearching(true);
      try {
        const matches = await repo.search(text.trim());
        setResults(matches);
        setHasSearched(true);
      } catch (err) {
        if (__DEV__) console.warn('[ManualAddIPOFlowModal] Search failed', err);
      } finally {
        setSearching(false);
      }
    },
    [repo]
  );

  const handleSelectExisting = (ipo: IPOMasterRecord) => {
    Haptics.selectionAsync();
    onClose();
    router.push({
      pathname: '/ipo-details' as any,
      params: { id: ipo.id },
    });
  };

  const handleCreateManually = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    onOpenCreateForm(query.trim());
  };

  const renderItem = ({ item }: { item: IPOMasterRecord }) => {
    const priceText = item.price_band_max
      ? formatCurrency(item.price_band_max)
      : item.price_band_min
      ? formatCurrency(item.price_band_min)
      : 'TBA';

    return (
      <TouchableOpacity
        onPress={() => handleSelectExisting(item)}
        style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        activeOpacity={0.8}
      >
        <View style={styles.resultMain}>
          <Text style={[styles.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.company_name || item.ipo_name}
          </Text>
          <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
            {item.symbol ? `${item.symbol} • ` : ''}{item.exchange || 'BSE / NSE'} • {priceText}
          </Text>
        </View>
        <IPOStatusChip status={item.status} />
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>STEP 1 OF 2</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Check Existing IPO</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface }]} hitSlop={8}>
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Search Field */}
          <View style={styles.searchSection}>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="search" size={18} color={colors.mutedForeground} />
              <TextInput
                value={query}
                onChangeText={handleSearch}
                placeholder="Search company name or symbol..."
                placeholderTextColor={colors.mutedForeground + '80'}
                style={[styles.input, { color: colors.foreground }]}
                autoFocus
              />
              {query ? (
                <TouchableOpacity onPress={() => handleSearch('')} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Body Content */}
          {searching ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : results.length > 0 ? (
            <View style={styles.resultsWrap}>
              <Text style={[styles.resultsHeader, { color: colors.mutedForeground }]}>
                Matching IPOs found in database ({results.length})
              </Text>
              <FlatList
                data={results}
                keyExtractor={(i) => i.id}
                renderItem={renderItem}
                contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
                style={{ maxHeight: 260 }}
              />
            </View>
          ) : hasSearched && query.trim() ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '14' }]}>
                <Feather name="search" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>IPO Not Found</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                No IPO matches &quot;{query.trim()}&quot;. You can manually create it.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Search by company name or symbol before adding a new manual IPO.
              </Text>
            </View>
          )}

          {/* Footer Action */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={handleCreateManually}
              style={[styles.createBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Feather name="plus-circle" size={18} color="#FFFFFF" />
              <Text style={styles.createBtnText}>Create Manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSection: {
    marginTop: 16,
    marginBottom: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  loaderWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  resultsWrap: {
    marginVertical: 4,
  },
  resultsHeader: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginBottom: 10,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  resultMain: {
    flex: 1,
    marginRight: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  resultSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
