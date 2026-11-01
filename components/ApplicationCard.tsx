import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import * as Haptics from 'expo-haptics';
import { formatCurrency, getResolvedLogoUrl } from '@/utils/formatters';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import type { ApplicationStatus, ApplicationWithDetails } from '@/context/DBContext';

type Props = {
  application: ApplicationWithDetails;
  onPress: () => void;
  isAppliedTab?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectToggle?: () => void;
  onToggleFavorite?: (id: string, isFav: boolean) => void;
  onUpdateStatus?: (id: string, status: ApplicationStatus) => void;
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

export const ApplicationCard = React.memo(function ApplicationCard({
  application: app,
  onPress,
  isAppliedTab = false,
  isSelectionMode = false,
  isSelected = false,
  onSelectToggle,
  onToggleFavorite,
  onUpdateStatus,
}: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  // Collapsed by default for ALL cards (including Holding & Sold)
  const [expanded, setExpanded] = useState<boolean>(false);

  // Swipe animation value
  const pan = useRef(new Animated.ValueXY()).current;

  const isFav = app.is_favorite === 1;
  const showFavStar = app.status !== 'Applied' && app.status !== 'Mandate Approved' && app.status !== 'Not Allotted';

  // Values calculation
  const isAllottedState =
    app.status === 'Allotted' ||
    app.status === 'Partially Allotted' ||
    app.status === 'Holding' ||
    app.status === 'Sold';

  const effectiveQty = isAllottedState
    ? (typeof app.allotted_shares === 'number' && app.allotted_shares > 0
        ? app.allotted_shares
        : (app.shares_count || app.quantity || 1))
    : (app.shares_count || app.quantity || 1);

  const buyValue  = calcBuyValue(app.buy_price, effectiveQty);
  const isSold    = app.status === 'Sold' && app.sell_price != null;
  const saleValue = isSold ? calcSaleValue(app.sell_price!, effectiveQty) : null;
  const pl        = saleValue != null ? calcProfitLoss(saleValue, buyValue) : null;
  const netProfit = pl != null ? calcNetProfit(pl, app.tax ?? 0, app.user_cut ?? 0) : null;
  const isProfit  = netProfit != null && netProfit >= 0;

  // Holding Price calculation (uses authoritative broker LTP / manual sell_price, or falls back to buy_price)
  const holdingPrice = app.sell_price != null && app.sell_price > 0 ? app.sell_price : (app.buy_price || 0);
  const holdingValue = calcSaleValue(holdingPrice, effectiveQty);
  const currentProfit = holdingValue - buyValue;

  const [logoError, setLogoError] = useState(false);
  const ipoLogoUrl = getResolvedLogoUrl(app.ipo_logo_url) || app.ipo_logo_url || null;

  useEffect(() => {
    setLogoError(false);
  }, [ipoLogoUrl]);

  const avatarGradient = getAvatarGradient(app.ipo_name || 'IPO');
  const avatarInitial = (app.ipo_name || 'I').replace(/[^a-zA-Z0-9]/g, '').trim().charAt(0).toUpperCase() || 'I';

  // Subtitle format: Broker · Bank
  const brokerBankDetails = [
    app.user_broker,
    app.user_bank_name,
  ].filter(Boolean).join(' · ');

  // Status Badge Styling
  const getBadgeStyle = (status: ApplicationStatus) => {
    switch (status) {
      case 'Mandate Approved':
      case 'Applied':
        return {
          bg: colors.statusAppliedBg,
          text: colors.statusApplied,
          label: status === 'Mandate Approved' ? 'Mandate Approved' : 'Applied',
          hasChevron: false,
        };
      case 'Allotted':
        return {
          bg: colors.statusAllottedBg,
          text: colors.statusAllotted,
          label: 'Allotted',
          hasChevron: false,
        };
      case 'Partially Allotted':
        return {
          bg: '#D97706',
          text: '#FFFFFF',
          label: 'Partially Allotted',
          hasChevron: false,
        };
      case 'Not Allotted':
      case 'Cancelled':
        return {
          bg: colors.statusNotAllottedBg,
          text: colors.statusNotAllotted,
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
          bg: colors.statusHoldingBg,
          text: colors.statusHolding,
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
            onUpdateStatus?.(app.id, 'Allotted');
          });
        } else if (gestureState.dx < -55) {
          // Fast Swipe Left -> Not Allotted
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch {}
          Animated.timing(pan, { toValue: { x: -380, y: 0 }, duration: 120, useNativeDriver: false }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            onUpdateStatus?.(app.id, 'Not Allotted');
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
            <Icon name="check-circle" size={22} color="#FFFFFF" />
            <Text style={styles.swipeText}>Allotted</Text>
          </Animated.View>

          {/* Swiping Left: Red Panel + Cross Icon + "Not Allotted" */}
          <Animated.View style={[styles.swipeBgLeft, { backgroundColor: '#DC2626', opacity: swipeOpacityLeft }]}>
            <Text style={styles.swipeText}>Not Allotted</Text>
            <Icon name="x-circle" size={22} color="#FFFFFF" />
          </Animated.View>
        </View>
      )}

      {/* Main Card View */}
      <Animated.View
        {...(isAppliedTab && !isSelectionMode ? panResponder.panHandlers : {})}
        style={[
          styles.cardContainer,
          {
            backgroundColor: colors.card,
            borderColor: isSelectionMode && isSelected ? (isDark ? 'rgba(255, 255, 255, 0.4)' : colors.primary) : colors.border,
            borderWidth: isSelectionMode && isSelected ? 1.5 : 1,
            transform: [{ translateX: pan.x }, { rotate: cardRotate }],
          },
        ]}
      >
        <TouchableOpacity
          onPress={isSelectionMode && onSelectToggle ? onSelectToggle : onPress}
          activeOpacity={0.88}
        >
          {/* Top Header Row: Logo/Avatar + Title & User Details on Left, Badges & Actions on Right */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerLeftWrap}>
              <View
                style={[
                  styles.logoWrap,
                  {
                    backgroundColor: '#FFFFFF',
                    borderColor: isDark ? '#334155' : '#E2E8F0',
                  },
                ]}
              >
                {ipoLogoUrl && !logoError ? (
                  <Image
                    source={{ uri: ipoLogoUrl }}
                    style={styles.logoImage}
                    resizeMode="contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <LinearGradient
                    colors={avatarGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarGradient}
                  >
                    <Text style={styles.avatarText}>
                      {avatarInitial}
                    </Text>
                  </LinearGradient>
                )}
              </View>

              <View style={styles.titleAndPriceWrap}>
                <Text
                  style={[styles.companyTitle, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {app.ipo_name}
                </Text>
                <View style={styles.subDetailRow}>
                  <Text style={[styles.subDetailText, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
                    {app.user_name}{brokerBankDetails ? ` • ${brokerBankDetails}` : ''}
                  </Text>
                </View>
              </View>
            </View>

            {/* Right Badges & Controls */}
            <View style={styles.badgesRow}>
              {/* Category Pill */}
              {app.category && app.category !== 'RETAIL' && (
                <View
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor:
                        app.category === 'SHAREHOLDER'
                          ? '#8B5CF6'
                          : '#F59E0B',
                      borderColor:
                        app.category === 'SHAREHOLDER' ? '#8B5CF6' : '#F59E0B',
                    },
                  ]}
                >
                  <Text style={styles.badgeTextWhite}>
                    {app.category === 'SHAREHOLDER' ? 'Shareholder' : app.category}
                  </Text>
                </View>
              )}

              {/* Status Pill (Full fill solid color) */}
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: badgeStyle.bg,
                    borderColor: badgeStyle.bg,
                  },
                ]}
              >
                <Text style={styles.badgeTextWhite}>
                  {badgeStyle.label}
                </Text>
              </View>

              {/* Selection Checkbox */}
              {isSelectionMode ? (
                <TouchableOpacity
                  onPress={onSelectToggle}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.actionIconTouch}
                >
                  {isSelected ? (
                    <View style={[styles.selectedCircle, { backgroundColor: '#10B981' }]}>
                      <Icon name="check" size={11} color="#FFFFFF" strokeWidth={2.5} />
                    </View>
                  ) : (
                    <View style={[styles.unselectedCircle, { borderColor: isDark ? '#64748B' : '#94A3B8' }]} />
                  )}
                </TouchableOpacity>
              ) : showFavStar ? (
                <TouchableOpacity
                  onPress={() => onToggleFavorite?.(app.id, !isFav)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.actionIconTouch}
                >
                  <Icon
                    name="star"
                    size={16}
                    color={isFav ? '#EAB308' : isDark ? colors.mutedForeground : '#CBD5E1'}
                    fill={isFav ? '#EAB308' : 'none'}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Inner Data Card (Matching IPOCard structure) */}
          <View
            style={[
              styles.innerDataCard,
              {
                backgroundColor: colors.cardAlt,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.dataRow}>
              {app.status === 'Applied' || app.status === 'Mandate Approved' ? (
                <>
                  <View style={styles.dataColFirst}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      QUANTITY
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {app.quantity || 1} Shares
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      BID PRICE
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(app.buy_price || 0)}
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      AMOUNT
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(buyValue)}
                    </Text>
                  </View>

                  <View style={styles.dataColLast}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      CATEGORY
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {app.category === 'SHAREHOLDER' ? 'Shareholder' : app.category || 'Retail'}
                    </Text>
                  </View>
                </>
              ) : app.status === 'Allotted' || app.status === 'Partially Allotted' ? (
                <>
                  <View style={styles.dataColFirst}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      ALLOTTED QTY
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {effectiveQty} Shares
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      ISSUE PRICE
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(app.buy_price || 0)}
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      INVESTED
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(buyValue)}
                    </Text>
                  </View>

                  <View style={styles.dataColLast}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      STATUS
                    </Text>
                    <Text
                      style={[
                        styles.dataVal,
                        { color: app.status === 'Partially Allotted' ? '#D97706' : '#10B981' },
                      ]}
                      numberOfLines={1}
                    >
                      {app.status === 'Partially Allotted' ? 'Partial' : 'Allotted'}
                    </Text>
                  </View>
                </>
              ) : app.status === 'Holding' ? (
                <>
                  <View style={styles.dataColFirst}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      BUY PRICE
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(app.buy_price || 0)}
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      EST. PRICE
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(holdingPrice)}
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      INVESTED
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(buyValue)}
                    </Text>
                  </View>

                  <View style={styles.dataColLast}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      EST. P&L
                    </Text>
                    <Text
                      style={[
                        styles.dataVal,
                        { color: currentProfit >= 0 ? '#10B981' : '#EF4444' },
                      ]}
                      numberOfLines={1}
                    >
                      {currentProfit >= 0 ? '+' : ''}{formatCurrency(currentProfit)}
                    </Text>
                  </View>
                </>
              ) : app.status === 'Sold' ? (
                <>
                  <View style={styles.dataColFirst}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      BUY PRICE
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(app.buy_price || 0)}
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      SELL PRICE
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(app.sell_price || 0)}
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      INVESTED
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(buyValue)}
                    </Text>
                  </View>

                  <View style={styles.dataColLast}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      NET PROFIT
                    </Text>
                    <Text
                      style={[
                        styles.dataVal,
                        { color: (netProfit ?? 0) >= 0 ? '#10B981' : '#EF4444' },
                      ]}
                      numberOfLines={1}
                    >
                      {(netProfit ?? 0) >= 0 ? '+' : ''}{formatCurrency(netProfit || 0)}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.dataColFirst}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      BID QTY
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {app.quantity || 1} Shares
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      BID PRICE
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(app.buy_price || 0)}
                    </Text>
                  </View>

                  <View style={styles.dataColMiddle}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      REFUND AMT
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {formatCurrency(buyValue)}
                    </Text>
                  </View>

                  <View style={styles.dataColLast}>
                    <Text style={[styles.dataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      CATEGORY
                    </Text>
                    <Text style={[styles.dataVal, { color: colors.foreground }]} numberOfLines={1}>
                      {app.category === 'SHAREHOLDER' ? 'Shareholder' : app.category || 'Retail'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  outerWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 18,
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
    borderRadius: 18,
  },
  swipeBgLeft: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 20,
    gap: 8,
    borderRadius: 18,
  },
  swipeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
  },

  // Outer Card
  cardContainer: {
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },

  // Header Row: Avatar + Title/Sub on Left, Badges on Right
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 10,
    minHeight: 40,
  },
  headerLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  logoWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    position: 'relative',
  },
  logoImage: {
    ...StyleSheet.absoluteFillObject,
    width: 40,
    height: 40,
    borderRadius: 12,
    resizeMode: 'contain',
  },
  avatarGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  titleAndPriceWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  companyTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  subDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subDetailText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  // Right Badges Row
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  categoryPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTextWhite: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.1,
  },
  actionIconTouch: {
    padding: 2,
    marginLeft: 2,
  },
  selectedCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselectedCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },

  // Inner Data Card
  innerDataCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dataColFirst: {
    flex: 1.1,
    alignItems: 'flex-start',
  },
  dataColMiddle: {
    flex: 1,
    alignItems: 'flex-start',
  },
  dataColLast: {
    flex: 1.1,
    alignItems: 'flex-end',
  },
  dataLabel: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.2,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  dataVal: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
