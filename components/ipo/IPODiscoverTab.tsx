import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { useCompare } from '@/context/CompareContext';
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';
import { getResolvedLogoUrl } from '@/utils/formatters';

const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'],
  ['#10B981', '#047857'],
  ['#3B82F6', '#1D4ED8'],
  ['#F59E0B', '#B45309'],
  ['#EC4899', '#BE185D'],
  ['#6366F1', '#4338CA'],
  ['#14B8A6', '#0F766E'],
  ['#F43F5E', '#BE123C'],
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

interface IPOExploreTabProps {
  repo?: any;
  allRecords?: IPOMasterRecord[];
  loading?: boolean;
  onSelectIPO?: (ipo: any) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onFilterPress?: () => void;
  onSelectSector?: (sectorName: string | null) => void;
}

export function IPOExploreTab({
  allRecords = [],
  onSelectIPO,
  onRefresh,
  refreshing,
  onFilterPress,
}: IPOExploreTabProps) {
  const router = useRouter();
  const colors = useColors();
  const { selectedIds } = useCompare();

  const [activeMarketView, setActiveMarketView] = useState<'highest_gmp' | 'most_subscribed' | 'top_listed'>('highest_gmp');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string | null>(null);

  // Highest GMP items
  const highestGmpItems = useMemo(() => {
    return [...allRecords]
      .filter((r) => (r as any).archived !== 1 && (r.gmp_percent != null || r.gmp_amount != null))
      .sort((a, b) => (b.gmp_percent || b.gmp_amount || 0) - (a.gmp_percent || a.gmp_amount || 0))
      .slice(0, 5);
  }, [allRecords]);

  // Most Subscribed items
  const mostSubscribedItems = useMemo(() => {
    return [...allRecords]
      .filter((r) => (r as any).archived !== 1 && r.total_sub != null && r.total_sub > 0)
      .sort((a, b) => (b.total_sub || 0) - (a.total_sub || 0))
      .slice(0, 5);
  }, [allRecords]);

  // Top Listed items
  const topListedItems = useMemo(() => {
    return [...allRecords]
      .filter((r) => (r as any).archived !== 1 && ((r.status || '').toUpperCase() === 'LISTED' || r.listing_gain_percent != null))
      .sort((a, b) => (b.listing_gain_percent || 0) - (a.listing_gain_percent || 0))
      .slice(0, 5);
  }, [allRecords]);

  const currentMarketViewList = useMemo(() => {
    if (activeMarketView === 'highest_gmp') return highestGmpItems;
    if (activeMarketView === 'most_subscribed') return mostSubscribedItems;
    return topListedItems;
  }, [activeMarketView, highestGmpItems, mostSubscribedItems, topListedItems]);

  const navigateToDetails = (ipo: IPOMasterRecord | string) => {
    Haptics.selectionAsync();
    if (onSelectIPO) {
      onSelectIPO(ipo);
    } else {
      const targetId = typeof ipo === 'string' ? ipo : ipo?.id;
      if (targetId && targetId !== 'undefined') {
        router.push({ pathname: '/ipo-details', params: { id: targetId } } as any);
      }
    }
  };

  const SECTOR_CATEGORIES = [
    { name: 'Finance', icon: 'shield' },
    { name: 'Technology', icon: 'cpu' },
    { name: 'Healthcare', icon: 'heart' },
    { name: 'Manufacturing', icon: 'box' },
    { name: 'Consumer', icon: 'shopping-bag' },
  ];

  return (
    <ScrollView
      style={styles.rootContainer}
      contentContainerStyle={styles.scrollPadding}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing || false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {/* 1. MARKET LEADERBOARDS (Primary Discovery) */}
      <View style={styles.sectionWrap}>
        <Text style={[styles.sectionHeaderTitle, { color: colors.foreground }]}>MARKET LEADERBOARDS</Text>
        
        {/* Segmented View Switcher */}
        <SegmentedTabControl
          variant="secondary"
          tabs={[
            { key: 'highest_gmp', label: 'Highest GMP' },
            { key: 'most_subscribed', label: 'Most Subscribed' },
            { key: 'top_listed', label: 'Top Listed' },
          ]}
          activeTab={activeMarketView}
          onChange={(newView) => setActiveMarketView(newView as any)}
          style={{ marginBottom: 12 }}
        />

        {/* Market Leaderboard Item Cards */}
        {currentMarketViewList.length > 0 ? (
          <View style={styles.leaderboardList}>
            {currentMarketViewList.map((ipo, rank) => {
              const gmpPct = ipo.gmp_percent;
              const gmpAmt = ipo.gmp_amount;
              const sub = ipo.total_sub;
              const gain = ipo.listing_gain_percent;
              const companyNameStr = ipo.company_name || ipo.ipo_name || 'IPO';
              const resolvedLogo = getResolvedLogoUrl(ipo.logo_url, ipo.website, companyNameStr);
              const initials = companyNameStr
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .split(' ')
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase();

              return (
                <TouchableOpacity
                  key={ipo.id}
                  style={[styles.leaderboardItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => navigateToDetails(ipo.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.rankBadge, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.rankText, { color: colors.primary }]}>#{rank + 1}</Text>
                  </View>

                  {/* IPO/Company Logo Avatar */}
                  {resolvedLogo ? (
                    <Image
                      source={{ uri: resolvedLogo }}
                      style={styles.logoImageSmall}
                    />
                  ) : (
                    <LinearGradient
                      colors={getAvatarGradient(companyNameStr)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatarSmall}
                    >
                      <Text style={styles.avatarTextSmall}>{initials}</Text>
                    </LinearGradient>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.leaderboardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {companyNameStr}
                    </Text>
                    <Text style={[styles.leaderboardSub, { color: colors.mutedForeground }]}>
                      {ipo.issue_type || 'Mainboard'} • {ipo.exchange || 'NSE'}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    {activeMarketView === 'highest_gmp' ? (
                      <>
                        <Text style={[styles.valText, { color: (gmpPct || 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                          {gmpPct != null ? `+${gmpPct.toFixed(1)}%` : '—'}
                        </Text>
                        <Text style={[styles.valSub, { color: colors.mutedForeground }]}>
                          {gmpAmt != null ? `+₹${gmpAmt}` : 'GMP'}
                        </Text>
                      </>
                    ) : activeMarketView === 'most_subscribed' ? (
                      <>
                        <Text style={[styles.valText, { color: '#3B82F6' }]}>
                          {sub != null ? `${sub.toFixed(1)}x` : '—'}
                        </Text>
                        <Text style={[styles.valSub, { color: colors.mutedForeground }]}>Subscription</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.valText, { color: (gain || 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                          {gain != null ? `${gain > 0 ? '+' : ''}${gain.toFixed(1)}%` : '—'}
                        </Text>
                        <Text style={[styles.valSub, { color: colors.mutedForeground }]}>Listing Gain</Text>
                      </>
                    )}
                  </View>

                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No leaderboard market data available in this category.
          </Text>
        )}
      </View>

      {/* 2. BROWSE BY SECTOR */}
      <View style={styles.sectionWrap}>
        <Text style={[styles.sectionHeaderTitle, { color: colors.foreground }]}>BROWSE BY SECTOR</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectorScroll}>
          {SECTOR_CATEGORIES.map((cat) => {
            const isSelected = selectedSectorFilter === cat.name;
            return (
              <TouchableOpacity
                key={cat.name}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedSectorFilter((prev) => (prev === cat.name ? null : cat.name));
                }}
                style={[
                  styles.sectorPill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Feather name={cat.icon as any} size={14} color={isSelected ? '#FFFFFF' : colors.primary} />
                <Text style={[styles.sectorText, { color: isSelected ? '#FFFFFF' : colors.foreground }]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. TOOLS & UTILITIES GRID */}
      <View style={styles.sectionWrap}>
        <Text style={[styles.sectionHeaderTitle, { color: colors.foreground }]}>TOOLS & UTILITIES</Text>
        <View style={styles.toolsGrid}>
          {/* Allotment Checker */}
          <TouchableOpacity
            style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/allotment-checker' as any);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.toolIconWrap, { backgroundColor: '#10B9811A' }]}>
              <Feather name="check-square" size={20} color="#10B981" />
            </View>
            <Text style={[styles.toolCardTitle, { color: colors.foreground }]}>Allotment Checker</Text>
            <Text style={[styles.toolCardSub, { color: colors.mutedForeground }]}>Verify status</Text>
          </TouchableOpacity>

          {/* IPO Alerts & Reminders */}
          <TouchableOpacity
            style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/notifications' as any);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.toolIconWrap, { backgroundColor: '#3B82F61A' }]}>
              <Feather name="bell" size={20} color="#3B82F6" />
            </View>
            <Text style={[styles.toolCardTitle, { color: colors.foreground }]}>IPO Alerts</Text>
            <Text style={[styles.toolCardSub, { color: colors.mutedForeground }]}>Live notifications</Text>
          </TouchableOpacity>

          {/* Compare IPOs */}
          <TouchableOpacity
            style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/ipo-compare' as any);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.toolIconWrap, { backgroundColor: '#8B5CF61A' }]}>
              <Feather name="columns" size={20} color="#8B5CF6" />
            </View>
            <Text style={[styles.toolCardTitle, { color: colors.foreground }]}>Compare IPOs</Text>
            <Text style={[styles.toolCardSub, { color: colors.mutedForeground }]}>
              {selectedIds && selectedIds.length > 0 ? `${selectedIds.length} Selected` : 'Side-by-side'}
            </Text>
          </TouchableOpacity>

          {/* Advanced Filters */}
          <TouchableOpacity
            style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              if (onFilterPress) onFilterPress();
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.toolIconWrap, { backgroundColor: '#F59E0B1A' }]}>
              <Feather name="sliders" size={20} color="#F59E0B" />
            </View>
            <Text style={[styles.toolCardTitle, { color: colors.foreground }]}>Filter & Search</Text>
            <Text style={[styles.toolCardSub, { color: colors.mutedForeground }]}>Fine-tune list</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// Backwards compatibility export
export const IPODiscoverTab = IPOExploreTab;

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  scrollPadding: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 72,
  },
  sectionWrap: {
    marginBottom: 24,
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  toolCard: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  toolIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  toolCardTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  toolCardSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  sectorScroll: {
    gap: 10,
  },
  sectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectorText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  marketViewSegment: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 12,
  },
  marketSegmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  marketSegmentText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  leaderboardList: {
    gap: 8,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  logoImageSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
    resizeMode: 'contain',
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  leaderboardTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  leaderboardSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  valText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  valSub: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginVertical: 12,
  },
});
