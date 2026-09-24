import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Switch,
  Modal,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDB } from '@/context/DBContext';
import { IPOMasterRecord } from '@/services/ipo/types';
import { calculateNormalizedIPOStatus } from '@/services/ipo/statusNormalizer';
import { IPOCard } from './IPOCard';
import { IPOEmptyState } from './IPOEmptyState';
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';

export type IPOSubTab = 'open' | 'upcoming' | 'listed';
export type SortOption = 'DEFAULT' | 'GMP' | 'DATE' | 'MIN_INVEST' | 'NAME';

interface IPOsTabProps {
  repo?: any;
  ipos?: any[];
  onSelectIPO?: (ipo: any) => void;
  onOpenManualAdd?: () => void;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  initialSubTab?: IPOSubTab;
}

export function IPOsTab({
  repo,
  ipos: propIpos,
  onSelectIPO,
  onOpenManualAdd,
  onRefresh,
  refreshing,
  initialSubTab = 'open',
}: IPOsTabProps) {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom + 110, 135);
  const { ipos: dbIpos, toggleFavorite: dbToggleFavorite } = useDB();

  const [activeSubTab, setActiveSubTab] = useState<IPOSubTab>(initialSubTab);
  const [includeSme, setIncludeSme] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('DEFAULT');
  const [showSortModal, setShowSortModal] = useState(false);

  const allIpos: any[] = propIpos || dbIpos || [];
  const activeIPOs = useMemo(() => {
    let list = allIpos.filter((ipo: any) => ipo.archived !== 1);
    if (!includeSme) {
      list = list.filter((item) => !(item.issue_type || '').toLowerCase().includes('sme'));
    }
    return list;
  }, [allIpos, includeSme]);

  const openIpos = useMemo(
    () => activeIPOs.filter((r) => calculateNormalizedIPOStatus(r) === 'OPEN'),
    [activeIPOs]
  );

  const upcomingIpos = useMemo(
    () => activeIPOs.filter((r) => calculateNormalizedIPOStatus(r) === 'UPCOMING'),
    [activeIPOs]
  );

  const listedIpos = useMemo(
    () => activeIPOs.filter((r) => calculateNormalizedIPOStatus(r) === 'LISTED'),
    [activeIPOs]
  );

  const rawTabList = useMemo(() => {
    switch (activeSubTab) {
      case 'open':
        return openIpos;
      case 'upcoming':
        return upcomingIpos;
      case 'listed':
        return listedIpos;
      default:
        return openIpos;
    }
  }, [activeSubTab, openIpos, upcomingIpos, listedIpos]);

  const currentList = useMemo(() => {
    let list = [...rawTabList];

    // Apply Sorting
    switch (sortBy) {
      case 'GMP': {
        const getGmpPercentage = (r: any): number => {
          if (r.gmp_percent != null && !isNaN(Number(r.gmp_percent))) {
            return Number(r.gmp_percent);
          }
          const price = r.price_band_max || r.price_band_min || 0;
          if (r.gmp_amount != null && Number(r.gmp_amount) > 0 && price > 0) {
            return (Number(r.gmp_amount) / price) * 100;
          }
          return 0;
        };

        list = list.filter((r) => {
          const hasActiveGmpAmount = r.gmp_amount != null && Number(r.gmp_amount) > 0;
          const hasActiveGmpPercent = r.gmp_percent != null && Number(r.gmp_percent) > 0;
          return hasActiveGmpAmount || hasActiveGmpPercent;
        });
        list.sort((a, b) => getGmpPercentage(b) - getGmpPercentage(a));
        break;
      }
      case 'DATE':
        list.sort((a, b) => (a.open_date || '').localeCompare(b.open_date || ''));
        break;
      case 'MIN_INVEST':
        list.sort((a, b) => {
          const valA = (a.price_band_max || a.price_band_min || 0) * (a.lot_size || 1);
          const valB = (b.price_band_max || b.price_band_min || 0) * (b.lot_size || 1);
          return valA - valB;
        });
        break;
      case 'NAME':
        list.sort((a, b) => (a.company_name || a.ipo_name || '').localeCompare(b.company_name || b.ipo_name || ''));
        break;
    }

    return list;
  }, [rawTabList, sortBy]);

  const handleCardPress = useCallback(
    (ipo: IPOMasterRecord) => {
      Haptics.selectionAsync();
      if (onSelectIPO) {
        onSelectIPO(ipo);
      } else if (ipo?.id) {
        router.push({ pathname: '/ipo-details', params: { id: ipo.id } } as any);
      }
    },
    [router, onSelectIPO]
  );

  const handleToggleFav = useCallback(
    async (id: string, currentFav?: boolean) => {
      Haptics.selectionAsync();
      const isFav = currentFav === true;
      if (repo && repo.toggleFavorite) {
        await repo.toggleFavorite(id, !isFav);
      } else {
        await dbToggleFavorite(id, !isFav);
      }
    },
    [repo, dbToggleFavorite]
  );

  const sortLabel = useMemo(() => {
    switch (sortBy) {
      case 'GMP': return 'GMP';
      case 'DATE': return 'Apply Date';
      case 'MIN_INVEST': return 'Min Investment';
      case 'NAME': return 'Name';
      default: return 'Default';
    }
  }, [sortBy]);

  const content = (
    <View style={styles.rootContainer}>
      {/* Sub-Tab Bar: Live | Upcoming | Listed */}
      <View style={styles.subTabBarWrap}>
        <SegmentedTabControl
          variant="secondary"
          tabs={[
            { key: 'open', label: `Live (${openIpos.length})`, dotColor: '#10B981' },
            { key: 'upcoming', label: `Upcoming (${upcomingIpos.length})`, icon: 'clock' },
            { key: 'listed', label: `Listed (${listedIpos.length})`, icon: 'check-circle' },
          ]}
          activeTab={activeSubTab}
          onChange={(newTab) => setActiveSubTab(newTab as IPOSubTab)}
        />
      </View>

      {/* SME IPOs Toggle & Sort Bar */}
      <View style={styles.toolbarRow}>
        <View style={styles.smeToggleWrap}>
          <Switch
            value={includeSme}
            onValueChange={(val) => {
              setIncludeSme(val);
              Haptics.selectionAsync();
            }}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={includeSme ? colors.primary : '#FFFFFF'}
          />
          <Text style={[styles.smeToggleText, { color: colors.foreground }]}>
            SME IPOs
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setShowSortModal(true);
          }}
          style={[styles.sortDropdownBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.sortBtnText, { color: colors.foreground }]}>
            Sort {sortLabel !== 'Default' ? `: ${sortLabel}` : ''}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Primary Feed View */}
      {currentList.length > 0 ? (
        <View style={[styles.feedContainer, { paddingBottom: bottomPad }]}>
          {currentList.map((ipo) => (
            <IPOCard
              key={ipo.id}
              ipo={ipo}
              onPress={handleCardPress}
              onToggleFavorite={(id, isFav) => handleToggleFav(id, isFav)}
            />
          ))}
        </View>
      ) : (
        <IPOEmptyState
          type={activeSubTab === 'open' ? 'open' : activeSubTab === 'upcoming' ? 'upcoming' : 'empty'}
          onAction={onOpenManualAdd}
        />
      )}

      {/* Sort Menu Modal */}
      <Modal visible={showSortModal} transparent animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortModal(false)}>
          <View style={[styles.sortModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Sort IPOs</Text>
              <TouchableOpacity onPress={() => setShowSortModal(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {[
              { key: 'DEFAULT', label: 'Default' },
              { key: 'GMP', label: 'GMP: Highest First' },
              { key: 'DATE', label: 'Apply Date: Opening Soon' },
              { key: 'MIN_INVEST', label: 'Min Investment: Low to High' },
              { key: 'NAME', label: 'Alphabetical: A-Z' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => {
                  setSortBy(opt.key as SortOption);
                  setShowSortModal(false);
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.sortOptionRow,
                  { borderBottomColor: colors.border },
                  sortBy === opt.key && { backgroundColor: colors.surface },
                ]}
              >
                <Text style={[styles.sortOptionText, { color: sortBy === opt.key ? colors.primary : colors.foreground }]}>
                  {opt.label}
                </Text>
                {sortBy === opt.key ? <Feather name="check" size={16} color={colors.primary} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );

  if (onRefresh) {
    return (
      <ScrollView
        style={styles.rootContainer}
        contentContainerStyle={[styles.scrollPadding, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {content}
      </ScrollView>
    );
  }

  return content;
}

// Backwards compatibility alias
export const IPOOverviewTab = IPOsTab;

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  scrollPadding: {
    paddingBottom: 72,
  },
  subTabBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  smeToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smeToggleText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  sortDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  sortBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  feedContainer: {
    paddingTop: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sortModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  sortOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sortOptionText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
});
