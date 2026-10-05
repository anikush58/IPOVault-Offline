import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type ApplicationWithDetails } from '@/context/DBContext';
import { calculateAppTaxAndNet } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────

type LeaderEntry = {
  id: string;
  name: string;
  netProfit: number;
  soldCount: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeRankings(applications: ApplicationWithDetails[]): LeaderEntry[] {
  const map: Record<string, { name: string; netProfit: number; soldCount: number }> = {};

  for (const a of applications) {
    if (a.status !== 'Sold' && a.status !== 'Holding') continue;
    const key = String(a.user_id);
    const name = a.user_name;
    if (!map[key]) map[key] = { name, netProfit: 0, soldCount: 0 };
    const { netPL } = calculateAppTaxAndNet(a);
    map[key].netProfit += netPL;
    map[key].soldCount += 1;
  }

  return Object.entries(map)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.netProfit - a.netProfit);
}

// ── Rank badge ────────────────────────────────────────────────────────────────

function RankBadge({ rank, isDark, colors }: { rank: number; isDark: boolean; colors: ReturnType<typeof useColors> }) {
  if (rank === 1) {
    return (
      <View style={[badge.wrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7', borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A' }]}>
        <Text style={[badge.text, { color: isDark ? '#FBBF24' : '#D97706' }]}>1</Text>
      </View>
    );
  }
  if (rank === 2) {
    return (
      <View style={[badge.wrap, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.18)' : '#F1F5F9', borderColor: isDark ? 'rgba(148, 163, 184, 0.4)' : '#E2E8F0' }]}>
        <Text style={[badge.text, { color: isDark ? '#CBD5E1' : '#475569' }]}>2</Text>
      </View>
    );
  }
  if (rank === 3) {
    return (
      <View style={[badge.wrap, { backgroundColor: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FFEDD5', borderColor: isDark ? 'rgba(217, 119, 6, 0.4)' : '#FED7AA' }]}>
        <Text style={[badge.text, { color: isDark ? '#F97316' : '#C2410C' }]}>3</Text>
      </View>
    );
  }
  return (
    <View style={[badge.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[badge.text, { color: colors.mutedForeground }]}>{rank}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  text: { fontSize: 12, fontFamily: 'GoogleSansFlex_700Bold' },
});

// ── Row ───────────────────────────────────────────────────────────────────────

function LeaderRow({
  entry,
  rank,
  isDark,
  colors,
}: {
  entry: LeaderEntry;
  rank: number;
  isLast?: boolean;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const isPos = entry.netProfit >= 0;

  return (
    <View style={row.wrap}>
      <RankBadge rank={rank} isDark={isDark} colors={colors} />

      <View style={row.info}>
        <Text style={[row.name, { color: colors.foreground }]} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={[row.sub, { color: colors.mutedForeground }]}>
          {entry.soldCount} {entry.soldCount === 1 ? 'sale' : 'sales'}
        </Text>
      </View>
      <Text style={[row.profit, { color: isPos ? '#10B981' : colors.destructive }]}>
        {isPos ? '+' : ''}{formatCurrency(entry.netProfit)}
      </Text>
    </View>
  );
}

const CARD_PADDING_H = 18;

const row = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: CARD_PADDING_H },
  info: { flex: 1 },
  name: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: -0.1 },
  sub: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 1 },
  profit: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
});

// ── Main component ────────────────────────────────────────────────────────────

type Props = { applications: ApplicationWithDetails[]; searchQuery?: string };

export function Leaderboard({ applications, searchQuery = '' }: Props) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const rankings = useMemo(
    () => computeRankings(applications),
    [applications],
  );

  const filteredRankings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rankings;
    return rankings.filter((e) => e.name.toLowerCase().includes(q));
  }, [rankings, searchQuery]);

  const top5 = filteredRankings.slice(0, 5);
  const hasData = filteredRankings.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: colors.border }]}>

      {/* Header with View More matching Design System */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Leaderboard</Text>
        
        <TouchableOpacity
          onPress={() => router.push('/leaderboard')}
          style={[
            styles.viewMoreBtn,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
              borderColor: isDark ? '#374151' : '#E5E7EB',
            },
          ]}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewMoreText, { color: colors.foreground }]}>
            View More
          </Text>
          <Feather name="chevron-right" size={13} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {!hasData ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Feather name="award" size={24} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No rankings yet</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Rankings appear once applications are marked as Sold
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {top5.map((entry, i) => (
            <LeaderRow
              key={entry.id}
              entry={entry}
              rank={i + 1}
              isLast={i === top5.length - 1}
              isDark={isDark}
              colors={colors}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 20,
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 18,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_PADDING_H,
    marginBottom: 10,
  },
  title: { fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },

  viewMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  viewMoreText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  list: { paddingTop: 2 },

  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 8 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  emptySub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 18 },
});


