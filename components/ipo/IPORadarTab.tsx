import React, { useMemo, useState } from 'react';
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
import { evaluateIPORadarScore, RadarScoreBreakdown } from '@/services/ipo/radarScoringEngine';
import { IPOEmptyState } from './IPOEmptyState';

export type InsightCategoryFilter = 'all' | 'worth_watching' | 'strong_demand' | 'high_gmp' | 'keep_an_eye' | 'higher_risk';

interface SignalTag {
  key: string;
  label: string;
  iconName: string;
  iconColor: string;
}

interface IPOInsightsTabProps {
  repo?: any;
  ipos?: any[];
  onSelectIPO?: (ipo: any) => void;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
}

export function IPOInsightsTab({
  repo,
  ipos: propIpos,
  onSelectIPO,
  onRefresh,
  refreshing,
}: IPOInsightsTabProps) {
  const router = useRouter();
  const colors = useColors();
  const { ipos: dbIpos } = useDB();

  const [activeFilter, setActiveFilter] = useState<InsightCategoryFilter>('all');

  const allIpos: any[] = propIpos || dbIpos || [];
  const activeIPOs = useMemo(() => allIpos.filter((ipo: any) => ipo.archived !== 1), [allIpos]);

  // Evaluate Radar Scores and derive Signal Tags for each active IPO
  const deduplicatedItems = useMemo(() => {
    return activeIPOs.map((ipoItem: any) => {
      const ipo = ipoItem as IPOMasterRecord;
      const radar = evaluateIPORadarScore(ipo);
      const totalSub = ipo.total_sub != null ? Number(ipo.total_sub) : null;
      const gmpPct = ipo.gmp_percent != null ? Number(ipo.gmp_percent) : null;

      const signalTags: SignalTag[] = [];

      if (radar.category === 'HIGH_CONVICTION') {
        signalTags.push({ key: 'worth_watching', label: 'Worth Watching', iconName: 'star', iconColor: '#F59E0B' });
      }
      if ((totalSub != null && totalSub >= 5) || radar.category === 'MOMENTUM_CANDIDATE') {
        signalTags.push({ key: 'strong_demand', label: 'Strong Demand', iconName: 'trending-up', iconColor: '#10B981' });
      }
      if (gmpPct != null && gmpPct >= 20) {
        signalTags.push({ key: 'high_gmp', label: 'High GMP', iconName: 'zap', iconColor: '#EF4444' });
      }
      if (radar.category === 'WATCH') {
        signalTags.push({ key: 'keep_an_eye', label: 'Keep an Eye On', iconName: 'eye', iconColor: '#3B82F6' });
      }
      if (radar.category === 'AVOID') {
        signalTags.push({ key: 'higher_risk', label: 'Higher Risk', iconName: 'alert-triangle', iconColor: '#F97316' });
      }

      if (signalTags.length === 0) {
        signalTags.push({ key: 'market_signal', label: 'Market Signal', iconName: 'activity', iconColor: '#8B5CF6' });
      }

      return { ipo, radar, signalTags };
    });
  }, [activeIPOs]);

  // Filter deduplicated list based on selected Category Chip
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return deduplicatedItems;
    return deduplicatedItems.filter((item) =>
      item.signalTags.some((tag) => tag.key === activeFilter)
    );
  }, [deduplicatedItems, activeFilter]);

  const navigateToDetails = (ipo: IPOMasterRecord | string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onSelectIPO) {
      onSelectIPO(ipo);
    } else {
      const targetId = typeof ipo === 'string' ? ipo : ipo?.id;
      if (targetId && targetId !== 'undefined') {
        router.push({ pathname: '/ipo-details', params: { id: targetId } } as any);
      }
    }
  };

  // Helper to generate 2-4 simple "Why?" bullet points for each IPO
  const deriveSimpleReasons = (ipo: IPOMasterRecord, radar: RadarScoreBreakdown): string[] => {
    const reasons: string[] = [];
    const gmpPct = ipo.gmp_percent != null ? Number(ipo.gmp_percent) : null;
    const totalSub = ipo.total_sub != null ? Number(ipo.total_sub) : null;
    const qibSub = ipo.qib_sub != null ? Number(ipo.qib_sub) : null;

    if (gmpPct != null && gmpPct > 15) {
      reasons.push(`Strong expected listing premium (+${gmpPct.toFixed(1)}% GMP)`);
    } else if (gmpPct != null && gmpPct > 0) {
      reasons.push(`Positive market premium (+${gmpPct.toFixed(1)}% GMP)`);
    } else if (gmpPct != null && gmpPct < 0) {
      reasons.push(`Negative market premium (${gmpPct.toFixed(1)}% GMP)`);
    }

    if (totalSub != null && totalSub >= 10) {
      reasons.push(`High investor demand (${totalSub.toFixed(1)}x overall subscription)`);
    } else if (totalSub != null && totalSub >= 1) {
      reasons.push(`Fully subscribed (${totalSub.toFixed(1)}x total demand)`);
    }

    if (qibSub != null && qibSub >= 5) {
      reasons.push(`Strong institutional QIB participation (${qibSub.toFixed(1)}x)`);
    }

    if (ipo.score?.total_score != null && ipo.score.total_score >= 70) {
      reasons.push(`Solid financial & business fundamentals (${ipo.score.total_score}/100)`);
    }

    if (reasons.length === 0) {
      reasons.push('Standard market tracking signals');
      reasons.push('Further subscription data pending update');
    }

    return reasons.slice(0, 4);
  };

  // Render a single Deduplicated Insight Card with Multi-Signal Badges
  const renderInsightCard = (ipo: IPOMasterRecord, radar: RadarScoreBreakdown, tags: SignalTag[]) => {
    const reasons = deriveSimpleReasons(ipo, radar);
    const gmpAmt = ipo.gmp_amount;
    const gmpPct = ipo.gmp_percent;

    let overallView = 'Positive';
    let viewBg = colors.positiveBg;
    let viewColor = colors.positive;

    if (radar.category === 'HIGH_CONVICTION') {
      overallView = 'Strong Opportunity';
      viewBg = colors.positiveBg;
      viewColor = colors.positive;
    } else if (radar.category === 'WATCH') {
      overallView = 'Watch Carefully';
      viewBg = colors.statusAppliedBg;
      viewColor = colors.statusApplied;
    } else if (radar.category === 'AVOID') {
      overallView = 'Higher Risk';
      viewBg = colors.negativeBg;
      viewColor = colors.negative;
    }

    return (
      <TouchableOpacity
        key={ipo.id}
        onPress={() => navigateToDetails(ipo)}
        activeOpacity={0.88}
        style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        {/* Top Multi-Signal Tags */}
        <View style={styles.signalTagsRow}>
          {tags.map((tag) => (
            <View key={tag.key} style={[styles.signalChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name={tag.iconName as any} size={11} color={tag.iconColor} />
              <Text style={[styles.signalChipText, { color: colors.foreground }]}>{tag.label}</Text>
            </View>
          ))}
        </View>

        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.companyName, { color: colors.foreground }]} numberOfLines={1}>
              {ipo.company_name || ipo.ipo_name}
            </Text>
            <Text style={[styles.subText, { color: colors.mutedForeground }]}>
              {ipo.issue_type} • {ipo.exchange || 'NSE, BSE'}
            </Text>
          </View>

          <View style={[styles.viewPill, { backgroundColor: viewBg }]}>
            <Text style={[styles.viewPillText, { color: viewColor }]}>{overallView}</Text>
          </View>
        </View>

        {/* Highlight Banner: GMP & Subscription */}
        <View style={[styles.metricsBanner, { backgroundColor: colors.surface }]}>
          <View style={styles.metricCell}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>GMP</Text>
            <Text style={[styles.metricVal, { color: (gmpAmt || 0) >= 0 ? colors.positive : colors.negative }]}>
              {gmpAmt != null ? `${gmpAmt > 0 ? '+' : ''}₹${gmpAmt}` : '—'}
            </Text>
          </View>

          <View style={styles.metricCell}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>GMP %</Text>
            <Text style={[styles.metricVal, { color: (gmpPct || 0) >= 0 ? colors.positive : colors.negative }]}>
              {gmpPct != null ? `${gmpPct > 0 ? '+' : ''}${gmpPct.toFixed(1)}%` : '—'}
            </Text>
          </View>

          <View style={styles.metricCellRight}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>DEMAND</Text>
            <Text style={[styles.metricVal, { color: colors.foreground }]}>
              {ipo.total_sub != null ? `${ipo.total_sub.toFixed(1)}x` : '—'}
            </Text>
          </View>
        </View>

        {/* Why? Reasons Section */}
        <View style={styles.reasonsBox}>
          <Text style={[styles.reasonsTitle, { color: colors.mutedForeground }]}>WHY THIS INSIGHT?</Text>
          {reasons.map((r, i) => (
            <View key={i} style={styles.reasonRow}>
              <Feather name="check-circle" size={12} color={colors.positive} style={{ marginTop: 2 }} />
              <Text style={[styles.reasonText, { color: colors.foreground }]}>{r}</Text>
            </View>
          ))}
        </View>

        {/* Progressive Disclosure Action */}
        <TouchableOpacity
          style={[styles.fullAnalysisBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigateToDetails(ipo)}
          activeOpacity={0.8}
        >
          <Text style={[styles.fullAnalysisText, { color: colors.primary }]}>View Full Analysis</Text>
          <Feather name="chevron-right" size={14} color={colors.primary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const CATEGORY_CHIPS: { key: InsightCategoryFilter; label: string; iconName: string }[] = [
    { key: 'all', label: 'All Signals', iconName: 'layers' },
    { key: 'worth_watching', label: 'Worth Watching', iconName: 'star' },
    { key: 'strong_demand', label: 'Strong Demand', iconName: 'trending-up' },
    { key: 'high_gmp', label: 'High GMP', iconName: 'zap' },
    { key: 'keep_an_eye', label: 'Keep an Eye On', iconName: 'eye' },
    { key: 'higher_risk', label: 'Higher Risk', iconName: 'alert-triangle' },
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
      {/* Top Filter Chips */}
      <View style={styles.filterBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {CATEGORY_CHIPS.map((chip) => {
            const isSelected = activeFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveFilter(chip.key);
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Feather
                    name={chip.iconName as any}
                    size={12}
                    color={isSelected ? '#FFFFFF' : colors.mutedForeground}
                  />
                  <Text style={[styles.filterPillText, { color: isSelected ? '#FFFFFF' : colors.foreground }]}>
                    {chip.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Deduplicated Insights List */}
      {filteredItems.length > 0 ? (
        <View style={styles.feedContainer}>
          {filteredItems.map((item) => renderInsightCard(item.ipo, item.radar, item.signalTags))}
        </View>
      ) : (
        <IPOEmptyState type="search" />
      )}
    </ScrollView>
  );
}

// Backwards compatibility export
export const IPORadarTab = IPOInsightsTab;

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  scrollPadding: {
    paddingBottom: 72,
  },
  filterBarWrap: {
    paddingTop: 12,
    paddingBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  feedContainer: {
    paddingHorizontal: 16,
  },
  insightCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    marginBottom: 10,
  },
  signalTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  signalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  signalChipEmoji: {
    fontSize: 10,
  },
  signalChipText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  companyName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  subText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  viewPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  viewPillText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  metricsBanner: {
    flexDirection: 'row',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  metricCell: {
    flex: 1,
  },
  metricCellRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.4,
  },
  metricVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
  },
  reasonsBox: {
    marginBottom: 10,
    gap: 4,
  },
  reasonsTitle: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  reasonText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
    lineHeight: 16,
  },
  fullAnalysisBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
  },
  fullAnalysisText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
