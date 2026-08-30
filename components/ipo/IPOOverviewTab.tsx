import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useDB } from '@/context/DBContext';
import { IPOMasterRecord } from '@/services/ipo/types';
import { calculateNormalizedIPOStatus } from '@/services/ipo/statusNormalizer';
import { IPOCard } from './IPOCard';
import { IPOEmptyState } from './IPOEmptyState';
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';

export type IPOSubTab = 'open' | 'upcoming' | 'listed';

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
  const { ipos: dbIpos, toggleFavorite: dbToggleFavorite } = useDB();

  const [activeSubTab, setActiveSubTab] = useState<IPOSubTab>(initialSubTab);

  const allIpos: any[] = propIpos || dbIpos || [];
  const activeIPOs = useMemo(() => allIpos.filter((ipo: any) => ipo.archived !== 1), [allIpos]);

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

  const currentList = useMemo(() => {
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

  const highestGmp = useMemo(() => {
    let max = 0;
    openIpos.forEach((r) => {
      if (r.gmp_percent && r.gmp_percent > max) max = r.gmp_percent;
    });
    return max > 0 ? max : null;
  }, [openIpos]);

  const maxDemand = useMemo(() => {
    let max = 0;
    openIpos.forEach((r) => {
      if (r.total_sub && r.total_sub > max) max = r.total_sub;
    });
    return max > 0 ? max : null;
  }, [openIpos]);

  const content = (
    <View style={styles.rootContainer}>
      {/* Sub-Tab Bar: Open | Upcoming | Listed */}
      <View style={styles.subTabBarWrap}>
        <SegmentedTabControl
          variant="secondary"
          tabs={[
            { key: 'open', label: `Open (${openIpos.length})`, dotColor: '#10B981' },
            { key: 'upcoming', label: `Upcoming (${upcomingIpos.length})`, icon: 'clock' },
            { key: 'listed', label: `Listed (${listedIpos.length})`, icon: 'check-circle' },
          ]}
          activeTab={activeSubTab}
          onChange={(newTab) => setActiveSubTab(newTab as IPOSubTab)}
        />
      </View>

      {/* Primary Feed View */}
      {currentList.length > 0 ? (
        <View style={styles.feedContainer}>
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
    </View>
  );

  if (onRefresh) {
    return (
      <ScrollView
        style={styles.rootContainer}
        contentContainerStyle={styles.scrollPadding}
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
    paddingBottom: 12,
  },
  subTabBarContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  subTabBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  subTabBtnTextActive: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  dotPill: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  feedContainer: {
    paddingTop: 0,
  },
});
