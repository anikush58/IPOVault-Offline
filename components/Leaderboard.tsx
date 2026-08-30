import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { type ApplicationWithDetails } from '@/context/DBContext';
import { Tabs } from '@/components/ui/Tabs';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue, calculateAppTaxAndNet } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey = 'user' | 'broker' | 'ipo';

type LeaderEntry = {
  id: string;
  name: string;
  netProfit: number;
  soldCount: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANK_COLORS = ['#F4C231', '#A8A9AD', '#CD7F32'];

function computeRankings(
  applications: ApplicationWithDetails[],
  by: TabKey,
): LeaderEntry[] {
  const map: Record<string, { name: string; netProfit: number; soldCount: number }> = {};

  for (const a of applications) {
    if (a.status !== 'Sold' && a.status !== 'Holding') continue;
    const key = by === 'user' ? String(a.user_id) : by === 'broker' ? (a.user_broker ?? 'Unknown') : String(a.ipo_id);
    const name = by === 'user' ? a.user_name : by === 'broker' ? (a.user_broker ?? 'Unknown') : (a.ipo_name ?? 'Unknown');
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

function RankBadge({ rank, colors }: { rank: number; colors: ReturnType<typeof useColors> }) {
  const medalColor = RANK_COLORS[rank - 1];
  const isMedal = rank <= 3;
  return (
    <View style={[
      badge.wrap,
      {
        backgroundColor: isMedal ? medalColor + '22' : colors.surface,
        borderColor: isMedal ? medalColor + '55' : colors.border,
      },
    ]}>
      <Text style={[badge.text, { color: isMedal ? medalColor : colors.mutedForeground }]}>
        {rank}
      </Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  text: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },
});

// ── Row ───────────────────────────────────────────────────────────────────────

function LeaderRow({
  entry,
  rank,
  isLast,
  colors,
}: {
  entry: LeaderEntry;
  rank: number;
  isLast: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const isPos = entry.netProfit >= 0;
  return (
    <View style={[row.wrap, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <RankBadge rank={rank} colors={colors} />
      <View style={row.info}>
        <Text style={[row.name, { color: colors.foreground }]} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={[row.sub, { color: colors.mutedForeground }]}>
          {entry.soldCount} {entry.soldCount === 1 ? 'sale' : 'sales'}
        </Text>
      </View>
      <Text style={[row.profit, { color: isPos ? colors.positive : colors.negative }]}>
        {isPos ? '+' : ''}{formatCurrency(entry.netProfit)}
      </Text>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  info: { flex: 1 },
  name: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: -0.1 },
  sub: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },
  profit: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
});

// ── Main component ────────────────────────────────────────────────────────────

type Props = { applications: ApplicationWithDetails[]; searchQuery?: string };

export function Leaderboard({ applications, searchQuery = '' }: Props) {
  const colors = useColors();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('user');

  const rankings = useMemo(
    () => computeRankings(applications, activeTab),
    [applications, activeTab],
  );

  const filteredRankings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rankings;
    return rankings.filter((e) => e.name.toLowerCase().includes(q));
  }, [rankings, searchQuery]);

  const top5 = filteredRankings.slice(0, 5);
  const hasData = filteredRankings.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Gradient wash */}
      <LinearGradient
        colors={[colors.primary + '0C', colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>RANKINGS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Leaderboard</Text>
        </View>

        {/* User / Broker / IPO tabs */}
        <Tabs
          variant="segmented"
          tabs={[
            { key: 'user', label: 'User' },
            { key: 'broker', label: 'Broker' },
            { key: 'ipo', label: 'IPO' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
          style={{ minWidth: 200 }}
        />
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
              colors={colors}
            />
          ))}
        </View>
      )}

      {/* View More footer */}
      {filteredRankings.length > 5 && (
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/leaderboard', params: { tab: activeTab } })}
          style={[styles.viewAll, { borderTopColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewAllText, { color: colors.primary }]}>
            View More
          </Text>
          <Feather name="chevron-right" size={15} color={colors.primary} />
        </TouchableOpacity>
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
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 4,
    gap: 12,
  },
  eyebrow: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  title: { fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },

  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  segTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segLabel: { fontSize: 12, fontFamily: 'GoogleSansFlex_600SemiBold' },

  list: { paddingHorizontal: 18, paddingTop: 10 },

  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 8 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  emptySub: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', textAlign: 'center', lineHeight: 18 },

  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingVertical: 14,
    marginTop: 4,
  },
  viewAllText: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    maxHeight: '85%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 14, marginBottom: 6 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  sheetEyebrow: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  sheetTitle: { fontSize: 22, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.4 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  list: { paddingHorizontal: 22, paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  rowName: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: -0.1 },
  rowSub: { fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2 },
  rowProfit: { fontSize: 14, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
});
