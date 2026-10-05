import React, { useMemo, useState, useRef } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Path, LinearGradient as SvgLinearGradient, RadialGradient, Ellipse, Stop } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { Tabs } from '@/components/ui/Tabs';
import { IconButton } from '@/components/ui/IconButton';
import { calculateAppTaxAndNet } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

type TabKey = 'user' | 'ipo';

type LeaderEntry = {
  id: string;
  name: string;
  netProfit: number;
  soldCount: number;
};

// ── Asset References for Easy Customization in assets/leaderboard ─────────────
const LEADERBOARD_ASSETS = {
  crown: require('@/assets/images/leaderboard/crown.png'),
  leafLeft: require('@/assets/images/leaderboard/leaf-left.png'),
  leafRight: require('@/assets/images/leaderboard/leaf-right.png'),
  rank1Badge: require('@/assets/images/leaderboard/rank-1-badge.png'),
  rank2Badge: require('@/assets/images/leaderboard/rank-2-badge.png'),
  rank3Badge: require('@/assets/images/leaderboard/rank-3-badge.png'),
  rank1Card: require('@/assets/images/leaderboard/rank-1-card.png'),
  rank2Card: require('@/assets/images/leaderboard/rank-2-card.png'),
  rank3Card: require('@/assets/images/leaderboard/rank-3-card.png'),
};

function computeRankings(
  applications: ApplicationWithDetails[],
  by: TabKey,
): LeaderEntry[] {
  const map: Record<string, { name: string; netProfit: number; soldCount: number }> = {};

  for (const a of applications) {
    if (a.status !== 'Sold' && a.status !== 'Holding') continue;
    const key = by === 'user' ? String(a.user_id) : String(a.ipo_id);
    const name = by === 'user' ? a.user_name : (a.ipo_name ?? 'Unknown');
    if (!map[key]) map[key] = { name, netProfit: 0, soldCount: 0 };
    const { netPL } = calculateAppTaxAndNet(a);
    map[key].netProfit += netPL;
    map[key].soldCount += 1;
  }

  return Object.entries(map)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.netProfit - a.netProfit);
}

// ── Crown Component (uses asset image with SVG vector fallback) ───────────────

function GoldenCrown() {
  const [imgError, setImgError] = useState(false);

  if (!imgError) {
    return (
      <Image
        source={LEADERBOARD_ASSETS.crown}
        style={{ width: 48, height: 30 }}
        resizeMode="contain"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <Svg width="48" height="30" viewBox="0 0 48 30" fill="none">
      <Defs>
        <SvgLinearGradient id="goldCrownGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FDE047" />
          <Stop offset="45%" stopColor="#F59E0B" />
          <Stop offset="100%" stopColor="#D97706" />
        </SvgLinearGradient>
      </Defs>
      <Path
        d="M5 23.5L8.5 8.5L17.5 16L24 3.5L30.5 16L39.5 8.5L43 23.5C43 25.2 41.5 26.5 39.5 26.5H8.5C6.5 26.5 5 25.2 5 23.5Z"
        fill="url(#goldCrownGrad)"
      />
      <Circle cx="24" cy="3.5" r="3" fill="#FEF08A" />
      <Circle cx="8.5" cy="8.5" r="2.5" fill="#FEF08A" />
      <Circle cx="39.5" cy="8.5" r="2.5" fill="#FEF08A" />
      <Circle cx="17.5" cy="16" r="2" fill="#FDE047" />
      <Circle cx="30.5" cy="16" r="2" fill="#FDE047" />
      <Path
        d="M7 23C15 25 33 25 41 23V25C33 27 15 27 7 25V23Z"
        fill="#B45309"
        opacity="0.5"
      />
    </Svg>
  );
}

// ── Laurel Leaf Branch Component ──────────────────────────────────────────────

function GoldenLaurelBranch({ flip = false }: { flip?: boolean }) {
  const [imgError, setImgError] = useState(false);

  if (!imgError) {
    return (
      <Image
        source={flip ? LEADERBOARD_ASSETS.leafRight : LEADERBOARD_ASSETS.leafLeft}
        style={{ width: 22, height: 72 }}
        resizeMode="contain"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <Svg
      width="22"
      height="72"
      viewBox="0 0 22 72"
      fill="none"
      style={{ transform: [{ scaleX: flip ? -1 : 1 }] }}
    >
      <Defs>
        <SvgLinearGradient id={`laurelGrad_${flip ? 'r' : 'l'}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FDE047" />
          <Stop offset="50%" stopColor="#F59E0B" />
          <Stop offset="100%" stopColor="#D97706" />
        </SvgLinearGradient>
      </Defs>
      <Path
        d="M18 68 C10 50 8 26 18 4"
        stroke={`url(#laurelGrad_${flip ? 'r' : 'l'})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M16 63 C9 63 6 57 11 53 C15 51 16 59 16 63 Z" fill={`url(#laurelGrad_${flip ? 'r' : 'l'})`} />
      <Path d="M18 59 C20 53 16 48 13 50 C11 54 15 59 18 59 Z" fill={`url(#laurelGrad_${flip ? 'r' : 'l'})`} />
      <Path d="M13 46 C6 44 4 38 9 34 C13 32 14 40 13 46 Z" fill={`url(#laurelGrad_${flip ? 'r' : 'l'})`} />
      <Path d="M16 42 C18 36 14 31 11 33 C9 37 13 42 16 42 Z" fill={`url(#laurelGrad_${flip ? 'r' : 'l'})`} />
      <Path d="M12 28 C6 25 5 19 10 17 C14 17 14 24 12 28 Z" fill={`url(#laurelGrad_${flip ? 'r' : 'l'})`} />
      <Path d="M15 25 C17 20 14 15 11 17 C9 21 12 25 15 25 Z" fill={`url(#laurelGrad_${flip ? 'r' : 'l'})`} />
      <Path d="M18 6 C13 3 13 -1 16 1 C19 3 20 6 18 6 Z" fill={`url(#laurelGrad_${flip ? 'r' : 'l'})`} />
    </Svg>
  );
}

// ── Feathered Radial Blur Halo & Shadow Underlays ─────────────────────────────

function BadgeHaloAndShadow({
  rank,
  size,
  isDark,
}: {
  rank: 1 | 2 | 3;
  size: number;
  isDark: boolean;
}) {
  const haloSize = size + 24;
  const shadowWidth = size + 16;
  const shadowHeight = 16;

  const haloColor =
    rank === 1
      ? (isDark ? '#F59E0B' : '#EAB308')
      : rank === 2
      ? (isDark ? '#CBD5E1' : '#94A3B8')
      : (isDark ? '#FB923C' : '#EA580C');

  // Shadow color matching badge color
  const bottomShadowColor =
    rank === 1
      ? (isDark ? '#D97706' : '#B45309')
      : rank === 2
      ? (isDark ? '#94A3B8' : '#64748B')
      : (isDark ? '#EA580C' : '#C2410C');

  const haloGradId = `medalHaloBlur_${rank}`;
  const shadowGradId = `medalShadowBlur_${rank}`;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 0,
      }}
    >
      {/* 1. Ambient Blurred Circular Halo / Glow Behind the Badge (-20% opacity) */}
      <View
        style={{
          position: 'absolute',
          width: haloSize,
          height: haloSize,
          top: (size - haloSize) / 2,
          left: (size - haloSize) / 2,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: haloColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isDark ? 0.48 : 0.36,
          shadowRadius: 10,
          elevation: 5,
        }}
      >
        <Svg width={haloSize} height={haloSize} viewBox={`0 0 ${haloSize} ${haloSize}`}>
          <Defs>
            <RadialGradient
              id={haloGradId}
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
              fx="50%"
              fy="50%"
            >
              <Stop offset="0%" stopColor={haloColor} stopOpacity={isDark ? 0.60 : 0.48} />
              <Stop offset="45%" stopColor={haloColor} stopOpacity={isDark ? 0.36 : 0.28} />
              <Stop offset="75%" stopColor={haloColor} stopOpacity={isDark ? 0.16 : 0.10} />
              <Stop offset="100%" stopColor={haloColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize / 2} fill={`url(#${haloGradId})`} />
        </Svg>
      </View>

      {/* 2. Feathered Blurred Drop Shadow Below the Badge (-40% opacity) */}
      <View
        style={{
          position: 'absolute',
          width: shadowWidth,
          height: shadowHeight,
          bottom: -8,
          left: (size - shadowWidth) / 2,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: bottomShadowColor,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: isDark ? 0.33 : 0.23,
          shadowRadius: 6,
          elevation: 3,
        }}
      >
        <Svg width={shadowWidth} height={shadowHeight} viewBox={`0 0 ${shadowWidth} ${shadowHeight}`}>
          <Defs>
            <RadialGradient
              id={shadowGradId}
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
              fx="50%"
              fy="50%"
            >
              <Stop offset="0%" stopColor={bottomShadowColor} stopOpacity={isDark ? 0.45 : 0.33} />
              <Stop offset="45%" stopColor={bottomShadowColor} stopOpacity={isDark ? 0.27 : 0.19} />
              <Stop offset="80%" stopColor={bottomShadowColor} stopOpacity={isDark ? 0.11 : 0.06} />
              <Stop offset="100%" stopColor={bottomShadowColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={shadowWidth / 2} cy={shadowHeight / 2} rx={shadowWidth / 2} ry={shadowHeight / 2} fill={`url(#${shadowGradId})`} />
        </Svg>
      </View>
    </View>
  );
}

// ── 3D Podium Medal Badge (with asset image support & blurred halo/shadow) ────

function PodiumMedalBadge({ rank, isDark }: { rank: 1 | 2 | 3; isDark: boolean }) {
  const [imgError, setImgError] = useState(false);

  const badgeSource =
    rank === 1
      ? LEADERBOARD_ASSETS.rank1Badge
      : rank === 2
      ? LEADERBOARD_ASSETS.rank2Badge
      : LEADERBOARD_ASSETS.rank3Badge;

  // Gold badge increased by 25% (from 52 to 65px; 120x120 asset)
  const size = rank === 1 ? 65 : 46;
  const radius = size / 2;

  return (
    <View style={medalStyles.badgeContainer}>
      {/* Blurred Halo Behind + Blurred Drop Shadow Below */}
      <BadgeHaloAndShadow rank={rank} size={size} isDark={isDark} />

      {/* Main Medal */}
      {!imgError ? (
        <View
          style={[
            medalStyles.imageWrapper,
            { width: size, height: size, borderRadius: radius },
          ]}
        >
          <Image
            source={badgeSource}
            style={{ width: size, height: size }}
            resizeMode="contain"
            onError={() => setImgError(true)}
          />
        </View>
      ) : rank === 1 ? (
        <View style={medalStyles.goldOuter}>
          <LinearGradient
            colors={['#FFF9DB', '#FDE047', '#EAB308', '#CA8A04']}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.9, y: 0.9 }}
            style={medalStyles.goldInner}
          >
            <View style={medalStyles.goldBevel}>
              <Text style={medalStyles.goldNumber}>1</Text>
            </View>
          </LinearGradient>
        </View>
      ) : rank === 2 ? (
        <View style={medalStyles.silverOuter}>
          <LinearGradient
            colors={['#FFFFFF', '#F1F5F9', '#CBD5E1', '#94A3B8']}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.9, y: 0.9 }}
            style={medalStyles.silverInner}
          >
            <View style={medalStyles.silverBevel}>
              <Text style={medalStyles.silverNumber}>2</Text>
            </View>
          </LinearGradient>
        </View>
      ) : (
        <View style={medalStyles.bronzeOuter}>
          <LinearGradient
            colors={['#FFF7ED', '#FFEDD5', '#FDBA74', '#EA580C']}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.9, y: 0.9 }}
            style={medalStyles.bronzeInner}
          >
            <View style={medalStyles.bronzeBevel}>
              <Text style={medalStyles.bronzeNumber}>3</Text>
            </View>
          </LinearGradient>
        </View>
      )}
    </View>
  );
}

const medalStyles = StyleSheet.create({
  badgeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  imageWrapper: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  goldOuter: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: '#FDE047',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  goldInner: {
    width: 57,
    height: 57,
    borderRadius: 28.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldBevel: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldNumber: {
    fontSize: 27,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#78350F',
    marginTop: Platform.OS === 'android' ? -2 : 0,
  },

  silverOuter: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  silverInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  silverBevel: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  silverNumber: {
    fontSize: 19,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#334155',
    marginTop: Platform.OS === 'android' ? -2 : 0,
  },

  bronzeOuter: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  bronzeInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bronzeBevel: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bronzeNumber: {
    fontSize: 19,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#7C2D12',
    marginTop: Platform.OS === 'android' ? -2 : 0,
  },
});

// ── Top 3 Podium Component (Below Tabs) ───────────────────────────────────────

function Top3Podium({
  top3,
  isDark,
}: {
  top3: LeaderEntry[];
  isDark: boolean;
}) {
  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  if (!first) return null;

  return (
    <View style={podiumStyles.container}>
      {/* Rank 2 (Left - Silver) */}
      {second ? (
        <View
          style={[
            podiumStyles.card,
            podiumStyles.cardSilver,
            {
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : '#F8FAFC',
              borderColor: isDark ? 'rgba(148, 163, 184, 0.3)' : '#E2E8F0',
            },
          ]}
        >
          <View style={podiumStyles.medalWrap}>
            <PodiumMedalBadge rank={2} isDark={isDark} />
          </View>
          <View style={podiumStyles.contentCenter}>
            <Text
              style={[
                podiumStyles.nameText,
                { color: isDark ? '#F8FAFC' : '#0F172A' },
              ]}
              numberOfLines={2}
            >
              {second.name}
            </Text>
            <Text
              style={[
                podiumStyles.subText,
                { color: isDark ? '#94A3B8' : '#64748B' },
              ]}
              numberOfLines={1}
            >
              {second.soldCount} {second.soldCount === 1 ? 'transaction' : 'transactions'}
            </Text>
          </View>
          <View
            style={[
              podiumStyles.profitPill,
              {
                backgroundColor: isDark ? 'rgba(148, 163, 184, 0.18)' : '#F1F5F9',
                borderColor: isDark ? 'rgba(148, 163, 184, 0.35)' : '#CBD5E1',
              },
            ]}
          >
            <Text
              style={[
                podiumStyles.profitText,
                { color: isDark ? '#E2E8F0' : '#475569' },
              ]}
              numberOfLines={1}
            >
              {second.netProfit >= 0 ? '+' : ''}{formatCurrency(second.netProfit)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={podiumStyles.cardPlaceholder} />
      )}

      {/* Rank 1 (Center - Gold) */}
      <View
        style={[
          podiumStyles.card,
          podiumStyles.cardGold,
          {
            backgroundColor: isDark ? '#231D12' : '#FFFDF0',
            borderColor: isDark ? 'rgba(245, 158, 11, 0.45)' : '#FDE68A',
          },
        ]}
      >
        <View style={podiumStyles.medalWrapGold}>
          <PodiumMedalBadge rank={1} isDark={isDark} />
        </View>

        {/* Laurel Wreaths flanking name */}
        <View style={podiumStyles.laurelContainer}>
          <View style={podiumStyles.laurelLeft}>
            <GoldenLaurelBranch />
          </View>
          <View style={podiumStyles.contentCenterGold}>
            <Text
              style={[
                podiumStyles.nameTextGold,
                { color: isDark ? '#FFFFFF' : '#0F172A' },
              ]}
              numberOfLines={2}
            >
              {first.name}
            </Text>
            <Text
              style={[
                podiumStyles.subTextGold,
                { color: isDark ? '#94A3B8' : '#64748B' },
              ]}
              numberOfLines={1}
            >
              {first.soldCount} {first.soldCount === 1 ? 'transaction' : 'transactions'}
            </Text>
          </View>
          <View style={podiumStyles.laurelRight}>
            <GoldenLaurelBranch flip />
          </View>
        </View>

        <View
          style={[
            podiumStyles.profitPill,
            podiumStyles.profitPillGold,
            {
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.20)' : '#FEF3C7',
              borderColor: isDark ? 'rgba(245, 158, 11, 0.45)' : '#FDE68A',
            },
          ]}
        >
          <Text
            style={[
              podiumStyles.profitTextGold,
              { color: isDark ? '#FDE047' : '#92400E' },
            ]}
            numberOfLines={1}
          >
            {first.netProfit >= 0 ? '+' : ''}{formatCurrency(first.netProfit)}
          </Text>
        </View>
      </View>

      {/* Rank 3 (Right - Bronze) */}
      {third ? (
        <View
          style={[
            podiumStyles.card,
            podiumStyles.cardBronze,
            {
              backgroundColor: isDark ? 'rgba(38, 29, 25, 0.95)' : '#FFF7F2',
              borderColor: isDark ? 'rgba(217, 119, 6, 0.30)' : '#FED7AA',
            },
          ]}
        >
          <View style={podiumStyles.medalWrap}>
            <PodiumMedalBadge rank={3} isDark={isDark} />
          </View>
          <View style={podiumStyles.contentCenter}>
            <Text
              style={[
                podiumStyles.nameText,
                { color: isDark ? '#F8FAFC' : '#0F172A' },
              ]}
              numberOfLines={2}
            >
              {third.name}
            </Text>
            <Text
              style={[
                podiumStyles.subText,
                { color: isDark ? '#94A3B8' : '#64748B' },
              ]}
              numberOfLines={1}
            >
              {third.soldCount} {third.soldCount === 1 ? 'transaction' : 'transactions'}
            </Text>
          </View>
          <View
            style={[
              podiumStyles.profitPill,
              {
                backgroundColor: isDark ? 'rgba(234, 88, 12, 0.18)' : '#FFEDD5',
                borderColor: isDark ? 'rgba(234, 88, 12, 0.35)' : '#FDBA74',
              },
            ]}
          >
            <Text
              style={[
                podiumStyles.profitText,
                { color: isDark ? '#FDBA74' : '#C2410C' },
              ]}
              numberOfLines={1}
            >
              {third.netProfit >= 0 ? '+' : ''}{formatCurrency(third.netProfit)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={podiumStyles.cardPlaceholder} />
      )}
    </View>
  );
}

// ── Summary KPI Card (Below Podiums) ──────────────────────────────────────────

function LeaderboardStatsCard({
  totalRanked,
  topPerformer,
  totalNetPL,
  colors,
  isDark,
}: {
  totalRanked: number;
  topPerformer?: LeaderEntry;
  totalNetPL: number;
  colors: ReturnType<typeof useColors>;
  isDark: boolean;
}) {
  const isPositiveNet = totalNetPL >= 0;

  return (
    <View
      style={[
        statsCardStyles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={statsCardStyles.item}>
        <Text style={[statsCardStyles.label, { color: colors.mutedForeground }]}>Total Ranked</Text>
        <Text style={[statsCardStyles.val, { color: colors.foreground }]}>{totalRanked}</Text>
      </View>

      <View style={[statsCardStyles.divider, { backgroundColor: colors.border }]} />

      <View style={statsCardStyles.item}>
        <Text style={[statsCardStyles.label, { color: colors.mutedForeground }]}>Top Performer</Text>
        <Text style={[statsCardStyles.val, { color: colors.primary }]} numberOfLines={1}>
          {topPerformer ? topPerformer.name : 'N/A'}
        </Text>
      </View>

      <View style={[statsCardStyles.divider, { backgroundColor: colors.border }]} />

      <View style={statsCardStyles.item}>
        <Text style={[statsCardStyles.label, { color: colors.mutedForeground }]}>Total Net P&L</Text>
        <Text
          style={[
            statsCardStyles.val,
            {
              color: isPositiveNet
                ? (isDark ? '#34D399' : '#059669')
                : (isDark ? '#F87171' : '#DC2626'),
            },
          ]}
          numberOfLines={1}
        >
          {`${isPositiveNet ? '+' : ''}${formatCurrency(totalNetPL)}`}
        </Text>
      </View>
    </View>
  );
}

const podiumStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 8,
  },
  card: {
    flex: 1,
    minHeight: 184,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    shadowOpacity: 0,
    elevation: 0,
  },
  cardPlaceholder: {
    flex: 1,
  },
  cardSilver: {},
  cardGold: {
    flex: 1.15,
    minHeight: 216,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginTop: -12,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardBronze: {},
  crownWrap: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
    zIndex: 10,
  },
  medalWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  medalWrapGold: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  laurelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    position: 'relative',
    marginVertical: 4,
    minHeight: 70,
  },
  laurelLeft: {
    position: 'absolute',
    left: 6,
    top: -10,
    bottom: 10,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  laurelRight: {
    position: 'absolute',
    right: 6,
    top: -10,
    bottom: 10,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  contentCenterGold: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    width: '100%',
  },
  contentCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: '100%',
    marginVertical: 6,
  },
  nameTextGold: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  nameText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: -0.2,
  },
  subTextGold: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 3,
    textAlign: 'center',
  },
  subText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    textAlign: 'center',
  },
  profitPill: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginHorizontal: 4,
  },
  profitPillGold: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginHorizontal: 6,
  },
  profitTextGold: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  profitText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
});

const statsCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 2,
    marginBottom: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  divider: {
    width: 1,
    height: 24,
  },
  label: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 2,
    textAlign: 'center',
  },
  val: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});

// ── Rank Badge for List items #4+ ─────────────────────────────────────────────

function RankBadge({ rank, colors }: { rank: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View
      style={[
        badge.wrap,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[badge.text, { color: colors.mutedForeground }]}>
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

// ── Screen Component ──────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: TabKey; q?: string }>();
  const insets = useSafeAreaInsets();
  const { applications, isLoading, refresh } = useDB();

  const [activeTab, setActiveTab] = useState<TabKey>(
    params.tab === 'ipo' ? 'ipo' : 'user',
  );
  const [showSearch, setShowSearch] = useState(!!params.q);
  const [searchQuery, setSearchQuery] = useState(params.q || '');
  const searchAnim = useRef(new Animated.Value(params.q ? 1 : 0)).current;
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

  const userRankings = useMemo(
    () => computeRankings(applications, 'user'),
    [applications],
  );

  const ipoRankings = useMemo(
    () => computeRankings(applications, 'ipo'),
    [applications],
  );

  const rankings = activeTab === 'user' ? userRankings : ipoRankings;

  const filteredRankings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rankings;
    return rankings.filter((e) => e.name.toLowerCase().includes(q));
  }, [rankings, searchQuery]);

  const top3 = useMemo(() => filteredRankings.slice(0, 3), [filteredRankings]);
  const remainingRankings = useMemo(() => filteredRankings.slice(3), [filteredRankings]);

  const tabsConfig = useMemo(
    () => [
      { key: 'user' as const, label: 'By user', count: userRankings.length },
      { key: 'ipo' as const, label: 'By IPO', count: ipoRankings.length },
    ],
    [userRankings.length, ipoRankings.length],
  );

  const totalNetPL = useMemo(
    () => rankings.reduce((acc, r) => acc + r.netProfit, 0),
    [rankings],
  );

  const topPerformer = rankings[0];

  const renderItem = ({ item, index }: { item: LeaderEntry; index: number }) => {
    const isPos = item.netProfit >= 0;
    const rank = index + 4;

    return (
      <View
        style={[
          styles.rowCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <RankBadge rank={rank} colors={colors} />
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
            {item.soldCount} {item.soldCount === 1 ? 'transaction' : 'transactions'}
          </Text>
        </View>
        <Text
          style={[
            styles.rowProfit,
            {
              color: isPos
                ? (isDark ? '#34D399' : '#059669')
                : (isDark ? '#F87171' : '#DC2626'),
            },
          ]}
        >
          {`${isPos ? '+' : ''}${formatCurrency(item.netProfit)}`}
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
          variant={showSearch || searchQuery.length > 0 ? 'primary' : 'surface'}
          size="md"
          onPress={toggleSearch}
        />
      </View>

      {/* Expandable Search Input */}
      <Animated.View
        style={[
          styles.searchBarWrap,
          { height: searchBarHeight, opacity: searchBarOpacity, backgroundColor: colors.background },
        ]}
      >
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            ref={searchRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search ${activeTab === 'user' ? 'users' : 'IPOs'}...`}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Pill Control */}
      <View style={[styles.tabBarWrap, { backgroundColor: colors.background }]}>
        <Tabs
          variant="pills"
          height={36}
          tabs={tabsConfig}
          activeTab={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
        />
      </View>

      {/* List with Top 3 Podium in Header */}
      <FlatList
        data={remainingRankings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />}
        ListHeaderComponent={
          top3.length > 0 ? (
            <View style={styles.headerComponentWrap}>
              <Top3Podium
                top3={top3}
                isDark={isDark}
              />
              <LeaderboardStatsCard
                totalRanked={rankings.length}
                topPerformer={topPerformer}
                totalNetPL={totalNetPL}
                colors={colors}
                isDark={isDark}
              />
              {remainingRankings.length > 0 && (
                <View style={styles.sectionDividerWrap}>
                  <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>
                    OTHER RANKINGS
                  </Text>
                </View>
              )}
            </View>
          ) : null
        }
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
  searchBarWrap: {
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 0,
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
    paddingVertical: 8,
    borderBottomWidth: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 10,
  },
  headerComponentWrap: {
    marginBottom: 6,
  },
  sectionDividerWrap: {
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
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
