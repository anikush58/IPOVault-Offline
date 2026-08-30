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
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  isLast,
  isDark,
  colors,
}: {
  entry: LeaderEntry;
  rank: number;
  isLast: boolean;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const isPos = entry.netProfit >= 0;
  const initial = (entry.name || 'U').charAt(0).toUpperCase();

  return (
    <View style={[row.wrap, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <RankBadge rank={rank} isDark={isDark} colors={colors} />
      
      <View style={[row.avatar, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
        <Text style={[row.avatarText, { color: colors.foreground }]}>{initial}</Text>
      </View>

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

const row = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 18 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },
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
    <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: colors.border }]}>

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
              isDark={isDark}
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
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
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
