import React, { useMemo, useState, useRef } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { Tabs } from '@/components/ui/Tabs';
import { IconButton } from '@/components/ui/IconButton';
import { calculateAppTaxAndNet } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

type TabKey = 'user' | 'broker' | 'ipo';

type LeaderEntry = {
  id: string;
  name: string;
  netProfit: number;
  soldCount: number;
};

const RANK_COLORS = ['#F4C231', '#A8A9AD', '#CD7F32'];

function computeRankings(
  applications: ApplicationWithDetails[],
  by: TabKey,
): LeaderEntry[] {
  const map: Record<string, { name: string; netProfit: number; soldCount: number }> = {};

  for (const a of applications) {
    if (a.status !== 'Sold' && a.status !== 'Holding') continue;
    const key =
      by === 'user'
        ? String(a.user_id)
        : by === 'broker'
        ? a.user_broker ?? 'Unknown'
        : String(a.ipo_id);
    const name =
      by === 'user'
        ? a.user_name
        : by === 'broker'
        ? a.user_broker ?? 'Unknown'
        : a.ipo_name ?? 'Unknown';
    if (!map[key]) map[key] = { name, netProfit: 0, soldCount: 0 };
    const { netPL } = calculateAppTaxAndNet(a);
    map[key].netProfit += netPL;
    map[key].soldCount += 1;
  }

  return Object.entries(map)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.netProfit - a.netProfit);
}

function RankBadge({ rank, colors }: { rank: number; colors: ReturnType<typeof useColors> }) {
  const medalColor = RANK_COLORS[rank - 1];
  const isMedal = rank <= 3;
  return (
    <View
      style={[
        badge.wrap,
        {
          backgroundColor: isMedal ? medalColor + '22' : colors.surface,
          borderColor: isMedal ? medalColor + '55' : colors.border,
        },
      ]}
    >
      <Text style={[badge.text, { color: isMedal ? medalColor : colors.mutedForeground }]}>
        #{rank}
      </Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  text: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },
});

export default function LeaderboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: TabKey }>();
  const insets = useSafeAreaInsets();
  const { applications, isLoading, refresh } = useDB();

  const [activeTab, setActiveTab] = useState<TabKey>(
    params.tab === 'broker' || params.tab === 'ipo' ? params.tab : 'user',
  );
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const toggleSearch = () => {
    if (showSearch) {
      Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
      Animated.timing(searchAnim, { toValue: 1, duration: 220, useNativeDriver: false }).start(() =>
        searchRef.current?.focus(),
      );
    }
  };

  const searchBarHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });
  const searchBarOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const rankings = useMemo(
    () => computeRankings(applications, activeTab),
    [applications, activeTab],
  );

  const filteredRankings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rankings;
    return rankings.filter((e) => e.name.toLowerCase().includes(q));
  }, [rankings, searchQuery]);

  const totalNetPL = useMemo(
    () => rankings.reduce((acc, r) => acc + r.netProfit, 0),
    [rankings],
  );

  const topPerformer = rankings[0];

  const renderItem = ({ item, index }: { item: LeaderEntry; index: number }) => {
    const isPos = item.netProfit >= 0;
    const isTop3 = index < 3;

    return (
      <View
        style={[
          styles.rowCard,
          { backgroundColor: colors.card, borderColor: colors.border },
          isTop3 && { borderColor: RANK_COLORS[index] + '55', backgroundColor: RANK_COLORS[index] + '08' },
        ]}
      >
        <RankBadge rank={index + 1} colors={colors} />
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
            {item.soldCount} {item.soldCount === 1 ? 'transaction' : 'transactions'}
          </Text>
        </View>
        <Text style={[styles.rowProfit, { color: isPos ? colors.positive : colors.negative }]}>
          {isPos ? '+' : ''}{formatCurrency(item.netProfit)}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background },
        ]}
      >
        <IconButton
          name="chevron-left"
          variant="surface"
          size="md"
          onPress={() => router.back()}
        />

        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Rankings</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Leaderboard</Text>
        </View>

        <IconButton
          name={showSearch ? 'x' : 'search'}
          variant={showSearch ? 'primary' : 'surface'}
          size="md"
          onPress={() => setShowSearch(!showSearch)}
        />
      </View>

      {/* Expandable Search Input */}
      <Animated.View
        style={[
          styles.searchBarWrap,
          { height: searchBarHeight, opacity: searchBarOpacity, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            ref={searchRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search ${activeTab === 'user' ? 'users' : activeTab === 'broker' ? 'brokers' : 'IPOs'}...`}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            clearButtonMode="while-editing"
          />
        </View>
      </Animated.View>

      {/* Segmented Control */}
      <View style={[styles.tabBarWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Tabs
          variant="segmented"
          tabs={[
            { key: 'user', label: 'By User' },
            { key: 'broker', label: 'By Broker' },
            { key: 'ipo', label: 'By IPO' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </View>

      {/* Summary KPI Bar */}
      {rankings.length > 0 && (
        <View style={[styles.summaryBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total Ranked</Text>
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>{rankings.length}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Top Performer</Text>
            <Text style={[styles.summaryVal, { color: colors.primary }]} numberOfLines={1}>
              {topPerformer ? topPerformer.name : 'N/A'}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total Net P&L</Text>
            <Text
              style={[
                styles.summaryVal,
                { color: totalNetPL >= 0 ? colors.positive : colors.negative },
              ]}
            >
              {totalNetPL >= 0 ? '+' : ''}{formatCurrency(totalNetPL)}
            </Text>
          </View>
        </View>
      )}

      {/* List */}
      <FlatList
        data={filteredRankings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather name="award" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No rankings available</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Rankings are generated from applications marked as Holding or Sold.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    position: 'relative',
  },
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerCenter: { alignItems: 'center' },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  searchBarWrap: {
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
    padding: 0,
  },
  tabBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
  },
  segTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    position: 'relative',
  },
  segLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  summaryBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 24,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginBottom: 2,
  },
  summaryVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  rowInfo: { flex: 1 },
  rowName: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.1,
  },
  rowSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  rowProfit: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },
});
