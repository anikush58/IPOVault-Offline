import React, { useRef, useState } from 'react';
import { Animated, Image, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { formatCurrency } from '@/utils/formatters';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDB } from '@/context/DBContext';
import type { ApplicationStatus, ApplicationWithDetails } from '@/context/DBContext';

type Props = {
  application: ApplicationWithDetails;
  onPress: () => void;
  isAppliedTab?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectToggle?: () => void;
};

// Avatar gradient palettes matching UserCard.tsx
const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'], // Purple
  ['#10B981', '#047857'], // Emerald
  ['#3B82F6', '#1D4ED8'], // Blue
  ['#F59E0B', '#B45309'], // Amber
  ['#EC4899', '#BE185D'], // Pink
  ['#6366F1', '#4338CA'], // Indigo
  ['#14B8A6', '#0F766E'], // Teal
  ['#F43F5E', '#BE123C'], // Rose
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

export function ApplicationCard({
  application: app,
  onPress,
  isAppliedTab = false,
  isSelectionMode = false,
  isSelected = false,
  onSelectToggle,
}: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { toggleFavorite, updateApplication } = useDB();

  // Collapsed by default for ALL cards (including Holding & Sold)
  const [expanded, setExpanded] = useState<boolean>(false);

  // Swipe animation value
  const pan = useRef(new Animated.ValueXY()).current;

  const isFav = app.is_favorite === 1;
  const showFavStar = app.status !== 'Applied' && app.status !== 'Mandate Approved' && app.status !== 'Not Allotted';

  // Values calculation
  const buyValue  = calcBuyValue(app.buy_price, app.quantity);
  const isSold    = app.status === 'Sold' && app.sell_price != null;
  const saleValue = isSold ? calcSaleValue(app.sell_price!, app.quantity) : null;
  const pl        = saleValue != null ? calcProfitLoss(saleValue, buyValue) : null;
  const netProfit = pl != null ? calcNetProfit(pl, app.tax ?? 0, app.user_cut ?? 0) : null;
  const isProfit  = netProfit != null && netProfit >= 0;

  // Holding Price calculation
  const holdingPrice = app.sell_price || (app.buy_price ? Math.round(app.buy_price * 1.25) : 0);
  const holdingValue = calcSaleValue(holdingPrice, app.quantity);
  const currentProfit = holdingValue - buyValue;

  // Avatar gradient matching Users page
  const avatarGradient = getAvatarGradient(app.user_name || 'User');

  // Subtitle format: Broker · Bank · UPI App
  const brokerBankDetails = [
    app.user_broker,
    app.user_bank_name,
    app.user_upi_app,
  ].filter(Boolean).join(' · ');

  // Status Badge Styling
  const getBadgeStyle = (status: ApplicationStatus) => {
    switch (status) {
      case 'Mandate Approved':
      case 'Applied':
        return {
          bg: isDark ? '#1E3A8A44' : '#EFF6FF',
          text: isDark ? '#93C5FD' : '#2563EB',
          label: status === 'Mandate Approved' ? 'Mandate Approved' : 'Applied',
          hasChevron: false,
        };
      case 'Allotted':
        return {
          bg: isDark ? '#064E3B44' : '#DCFCE7',
          text: isDark ? '#6EE7B7' : '#16A34A',
          label: 'Allotted',
          hasChevron: false,
        };
      case 'Not Allotted':
      case 'Cancelled':
        return {
          bg: isDark ? '#7F1D1D44' : '#FEE2E2',
          text: isDark ? '#FCA5A5' : '#DC2626',
          label: 'Not Allotted',
          hasChevron: false,
        };
      case 'Sold':
        return {
          bg: colors.statusSoldBg,
          text: colors.statusSold,
          label: 'Sold',
          hasChevron: false,
        };
      case 'Holding':
      default:
        return {
          bg: isDark ? '#581C8744' : '#F3E8FF',
          text: isDark ? '#E9D5FF' : '#9333EA',
          label: 'Holding',
          hasChevron: false,
        };
    }
  };

  const badgeStyle = getBadgeStyle(app.status);

  // Fast, Interpolated Swipe Opacity & Tilt
  const swipeOpacityRight = pan.x.interpolate({
    inputRange: [0, 40],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const swipeOpacityLeft = pan.x.interpolate({
    inputRange: [-40, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const cardRotate = pan.x.interpolate({
    inputRange: [-150, 0, 150],
    outputRange: ['-2.5deg', '0deg', '2.5deg'],
    extrapolate: 'clamp',
  });

  // Zero-re-render PanResponder (60 FPS smooth dragging)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          isAppliedTab &&
          !isSelectionMode &&
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        );
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (!isAppliedTab || isSelectionMode) return;

        if (gestureState.dx > 55) {
          // Fast Swipe Right -> Allotted
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
          Animated.timing(pan, { toValue: { x: 380, y: 0 }, duration: 120, useNativeDriver: false }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            updateApplication(app.id, 'Allotted');
          });
        } else if (gestureState.dx < -55) {
          // Fast Swipe Left -> Not Allotted
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch {}
          Animated.timing(pan, { toValue: { x: -380, y: 0 }, duration: 120, useNativeDriver: false }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            updateApplication(app.id, 'Not Allotted');
          });
        } else {
          // Instant spring snap back
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 6,
            tension: 65,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.outerWrapper}>
      {/* Background Action Panels for Swipe with Instant Fade */}
      {isAppliedTab && !isSelectionMode && (
        <View style={StyleSheet.absoluteFill}>
          {/* Swiping Right: Green Panel + Tick Icon + "Allotted" */}
          <Animated.View style={[styles.swipeBgRight, { backgroundColor: '#16A34A', opacity: swipeOpacityRight }]}>
            <Feather name="check-circle" size={22} color="#FFFFFF" />
            <Text style={styles.swipeText}>Allotted</Text>
          </Animated.View>

          {/* Swiping Left: Red Panel + Cross Icon + "Not Allotted" */}
          <Animated.View style={[styles.swipeBgLeft, { backgroundColor: '#DC2626', opacity: swipeOpacityLeft }]}>
            <Text style={styles.swipeText}>Not Allotted</Text>
            <Feather name="x-circle" size={22} color="#FFFFFF" />
          </Animated.View>
        </View>
      )}

      {/* Main Card View */}
      <Animated.View
        {...(isAppliedTab && !isSelectionMode ? panResponder.panHandlers : {})}
        style={[
          styles.cardContainer,
          {
            backgroundColor: isDark ? '#161622' : '#F3F4F6',
            borderColor: isSelectionMode && isSelected ? (isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)') : colors.border,
            transform: [{ translateX: pan.x }, { rotate: cardRotate }],
          },
        ]}
      >
        {/* Header Row */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={isSelectionMode && onSelectToggle ? onSelectToggle : onPress}
            activeOpacity={0.8}
            style={{ flex: 1 }}
          >
            <Text style={[styles.ipoTitle, { color: colors.foreground }]} numberOfLines={1}>
              {app.ipo_name}
            </Text>
          </TouchableOpacity>

          {/* 25% Reduced Selection Checkbox Circle (15x15) */}
          {isSelectionMode ? (
            <TouchableOpacity
              onPress={onSelectToggle}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.selectionCheckboxTouch}
            >
              {isSelected ? (
                <View style={[styles.selectedCircle, { backgroundColor: '#16A34A' }]}>
                  <Feather name="check" size={10} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.unselectedCircle, { borderColor: colors.mutedForeground }]} />
              )}
            </TouchableOpacity>
          ) : showFavStar ? (
            <TouchableOpacity
              onPress={() => toggleFavorite(app.id, !isFav)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather
                name="star"
                size={16}
                color={isFav ? '#EAB308' : isDark ? '#4B5563' : '#CBD5E1'}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Inner Surface Box */}
        <TouchableOpacity
          onPress={isSelectionMode && onSelectToggle ? onSelectToggle : onPress}
          activeOpacity={0.85}
          style={[styles.innerSurface, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.userRow}>
            {/* User Avatar matching Users Page */}
            {app.user_avatar_url ? (
              <Image source={{ uri: app.user_avatar_url }} style={styles.avatarImage} />
            ) : (
              <LinearGradient colors={avatarGradient} style={styles.avatarGradientCircle}>
                <Text style={styles.avatarInitial}>
                  {(app.user_name || 'U').charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}

            {/* User Details */}
            <View style={styles.userMetaCol}>
              <Text style={[styles.userNameText, { color: colors.foreground }]} numberOfLines={1}>
                {app.user_name}
              </Text>
              {!!brokerBankDetails && (
                <Text style={[styles.subtextDetails, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {brokerBankDetails}
                </Text>
              )}
            </View>

            {/* Status Badge & Chevron Expand Toggle */}
            <View style={styles.statusPillWrapper}>
              <View style={[styles.statusBadgePill, { backgroundColor: badgeStyle.bg }]}>
                <Text style={[styles.statusBadgeText, { color: badgeStyle.text }]}>
                  {badgeStyle.label}
                </Text>
              </View>

              {badgeStyle.hasChevron && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setExpanded((prev) => !prev);
                  }}
                  hitSlop={8}
                >
                  <Feather
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color={colors.mutedForeground}
                    style={{ marginLeft: 2 }}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 4-Column Metrics Grid */}
          {expanded && (
            <View style={styles.expandedMetricsGrid}>
              {/* Column 1: BUY PRICE */}
              <View style={styles.gridCellLeft}>
                <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>BUY PRICE</Text>
                <Text style={[styles.gridValue, { color: colors.foreground }]}>
                  {formatCurrency(app.buy_price || 0)}
                </Text>
              </View>

              {/* Column 2: SELL PRICE / HOLDING PRICE (All Caps) */}
              <View style={styles.gridCellLeft}>
                <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>
                  {app.status === 'Sold' ? 'SELL PRICE' : app.status === 'Holding' ? 'HOLDING PRICE' : 'BID PRICE'}
                </Text>
                <Text style={[styles.gridValue, { color: colors.foreground }]}>
                  {app.status === 'Sold'
                    ? formatCurrency(app.sell_price || 0)
                    : formatCurrency(holdingPrice)}
                </Text>
              </View>

              {/* Column 3: BUY VALUE */}
              <View style={styles.gridCellLeft}>
                <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>BUY VALUE</Text>
                <Text style={[styles.gridValue, { color: colors.foreground }]}>
                  {formatCurrency(buyValue)}
                </Text>
              </View>

              {/* Column 4: NET PROFIT / CURRENT PROFIT (All Caps) */}
              <View style={styles.gridCellLeft}>
                <Text style={[styles.gridLabel, { color: colors.mutedForeground }]}>
                  {app.status === 'Sold' ? 'NET PROFIT' : app.status === 'Holding' ? 'CURRENT PROFIT' : 'QTY'}
                </Text>
                {app.status === 'Sold' ? (
                  <Text style={[styles.gridValue, { color: isProfit ? '#16A34A' : colors.negative, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                    {formatCurrency(netProfit || 0)}
                  </Text>
                ) : app.status === 'Holding' ? (
                  <Text style={[styles.gridValue, { color: currentProfit >= 0 ? '#16A34A' : colors.negative, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                    {formatCurrency(currentProfit)}
                  </Text>
                ) : (
                  <Text style={[styles.gridValue, { color: colors.foreground }]}>
                    {app.quantity || 1}
                  </Text>
                )}
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },

  // Swipe Background Panels
  swipeBgRight: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 20,
    gap: 8,
    borderRadius: 16,
  },
  swipeBgLeft: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 20,
    gap: 8,
    borderRadius: 16,
  },
  swipeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
  },

  // Outer Container
  cardContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 5,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 6,
  },
  ipoTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },

  selectionCheckboxTouch: {
    padding: 2,
  },
  selectedCircle: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselectedCircle: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.5,
  },

  innerSurface: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  avatarGradientCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  userMetaCol: {
    flex: 1,
    gap: 2,
  },
  userNameText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  subtextDetails: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  statusPillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statusBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  expandedMetricsGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  gridCellLeft: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  gridLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
  },
  gridValue: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
