import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon, IconName } from '@/components/ui/Icon';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import { useAppExperience } from '@/context/AppExperienceContext';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import {
  userEntitlementService,
  UserEntitlementState,
} from '@/services/user/userEntitlementService';
import {
  CANONICAL_DEFAULT_PLANS,
  MobileProPlan,
  MobileProPlanBenefit,
  proPlanService,
  ProPlanState,
} from '@/services/pro/proPlanService';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { DesignSystem } from '@/constants/DesignSystem';

const DEFAULT_PRO_BENEFITS: MobileProPlanBenefit[] = [
  {
    id: 'default-ben-1',
    title: 'Record IPO Applications',
    description:
      'Record IPO applications with lot sizes, cut-off prices and family member linkages.',
    icon: 'file-text',
    displayOrder: 1,
  },
  {
    id: 'default-ben-2',
    title: 'Bulk Application Management',
    description:
      'Easily manage multiple profiles and applications across family accounts.',
    icon: 'users',
    displayOrder: 2,
  },
  {
    id: 'default-ben-3',
    title: 'Manage Applications',
    description:
      'Manage applications, view portfolio summaries, and track realized and unrealized investment outcomes.',
    icon: 'bar-chart-2',
    displayOrder: 3,
  },
  {
    id: 'default-ben-4',
    title: 'Track Application Status',
    description:
      'Track application status, monitor allotment results, and view detailed portfolio insights.',
    icon: 'trending-up',
    displayOrder: 4,
  },
  {
    id: 'default-ben-5',
    title: 'Bank Account Management',
    description:
      'Store bank details, account limits and linked UPI IDs for quick reference.',
    icon: 'credit-card',
    displayOrder: 5,
  },
  {
    id: 'default-ben-6',
    title: 'Ad-Free Experience',
    description:
      'Browse IPOVault without promotional advertisements.',
    icon: 'slash',
    displayOrder: 6,
  },
];

const FREE_FEATURES = [
  'Browse complete Mainboard & SME IPO details',
  'Add and manage family member profiles',
  'Check IPO allotment status across registrars',
];



export default function ProDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const { user: authUser } = useAuth();
  const { isPro: isExpPro } = useAppExperience();
  const { users } = useDB();

  const [avatarUri, setAvatarUri] = useState<string | null>(authUser?.photoURL || null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (authUser?.photoURL && authUser.photoURL.trim()) {
      setAvatarUri(authUser.photoURL.trim());
      setAvatarError(false);
    }
    safeAsyncStorage.getItem('@ipovault_avatar_uri').then((stored) => {
      if (!isMounted) return;
      if (stored && stored.trim()) {
        setAvatarUri(stored.trim());
        setAvatarError(false);
      } else if (authUser?.photoURL && authUser.photoURL.trim()) {
        setAvatarUri(authUser.photoURL.trim());
        setAvatarError(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [authUser?.photoURL]);

  const primaryDbUser = useMemo(() => {
    if (!users || users.length === 0) return null;
    if (authUser?.email) {
      const match = users.find((u) => (u as any).email?.toLowerCase() === authUser.email?.toLowerCase());
      if (match) return match;
    }
    if (authUser?.displayName) {
      const match = users.find((u) => u.name?.toLowerCase() === authUser.displayName?.toLowerCase());
      if (match) return match;
    }
    return users.find((u) => u.archived === 0) || users[0];
  }, [users, authUser]);

  const effectiveAvatar = useMemo(() => {
    if (avatarUri && !avatarError) return avatarUri;
    if (authUser?.photoURL && !avatarError) return authUser.photoURL;
    const dbAvatar = primaryDbUser?.avatar_url || (primaryDbUser as any)?.avatarUrl;
    if (dbAvatar && !avatarError) return dbAvatar;
    return null;
  }, [avatarUri, avatarError, authUser?.photoURL, primaryDbUser]);

  const displayName =
    authUser?.displayName ||
    primaryDbUser?.name ||
    (authUser?.email && authUser.email.includes('@') ? authUser.email.split('@')[0] : 'User');

  const initials = displayName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase() || 'U';

  // Entitlement State (Server-authoritative user Pro status)
  const [entitlement, setEntitlement] = useState<UserEntitlementState>(
    userEntitlementService.getCurrentState()
  );

  // Pro Plans State (Dynamically managed from backend)
  const [planState, setPlanState] = useState<ProPlanState>(
    proPlanService.getCurrentState()
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await proPlanService.fetchPublishedPlans();
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // 1. Entitlement subscription
    userEntitlementService.getEntitlementState().then(setEntitlement);
    const unsubEntitlement = userEntitlementService.subscribe((state) => {
      setEntitlement(state);
    });

    // 2. Pro Plans subscription & sync
    const unsubPlans = proPlanService.subscribe((state) => {
      setPlanState(state);
      if (state.plans.length > 0) {
        setSelectedPlanId((prev) => {
          if (prev && state.plans.some((p) => p.id === prev || p.code === prev)) {
            return prev;
          }
          const popular = state.plans.find((p) => p.isPopular);
          return popular ? popular.id : state.plans[0].id;
        });
      }
    });

    // Background refresh without screen flicker
    proPlanService.getPublishedPlans().catch(() => {});

    return () => {
      unsubEntitlement();
      unsubPlans();
    };
  }, []);

  const isUserPro = Boolean(entitlement.isPro || isExpPro);
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const plans = planState.plans.length > 0 ? planState.plans : CANONICAL_DEFAULT_PLANS;
  const activePlan: MobileProPlan =
    plans.find((p) => p.id === selectedPlanId || p.code === selectedPlanId) ||
    plans[0];

  const rawBenefits =
    activePlan && activePlan.benefits && activePlan.benefits.length > 0
      ? activePlan.benefits
      : DEFAULT_PRO_BENEFITS;
  const planBenefits = [...rawBenefits].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
  );

  // Dynamic pricing and attributes from backend active plan
  const activePlanPrice = activePlan.priceInr;
  const activePlanComparisonPrice = activePlan.comparisonPriceInr;
  const activePlanDuration = activePlan.duration;

  const scrollY = useRef(new Animated.Value(0)).current;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        eyebrow="SETTINGS"
        title="IPOVault Pro"
        centerTitle
        showBack
        scrollY={scrollY}
      />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressViewOffset={topPad + 60}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: DesignSystem.spacing.lg,
          paddingTop: topPad + 60 + DesignSystem.spacing.sm,
          paddingBottom: insets.bottom + DesignSystem.spacing.section,
        }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          More control over your IPO records and portfolio.
        </Text>

        {/* ── ACCOUNT STATUS CARD ── */}
        <View
          style={[
            styles.accountCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.accountRow}>
            <View
              style={[
                styles.accountAvatarWrap,
                {
                  backgroundColor: isUserPro
                    ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                    : (isDark ? 'rgba(99, 102, 241, 0.15)' : '#F1F5F9'),
                  borderColor: isUserPro
                    ? (isDark ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0')
                    : (isDark ? '#334155' : '#E2E8F0'),
                },
              ]}
            >
              {effectiveAvatar ? (
                <Image
                  source={{ uri: effectiveAvatar }}
                  style={styles.accountAvatarImage}
                  resizeMode="cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <Text
                  style={[
                    styles.accountAvatarText,
                    {
                      color: isUserPro ? '#10B981' : (isDark ? '#A5B4FC' : '#475569'),
                    },
                  ]}
                >
                  {initials}
                </Text>
              )}
            </View>

            <View style={styles.accountTextWrap}>
              <Text
                style={[
                  styles.accountTierTitle,
                  { color: colors.foreground },
                ]}
              >
                {isUserPro ? 'IPOVault Pro' : 'Standard Tier'}
              </Text>
              <Text
                style={[
                  styles.accountTierSubtitle,
                  { color: colors.mutedForeground },
                ]}
              >
                {isUserPro ? 'Your account has full access' : 'Currently on standard tier features'}
              </Text>
              {authUser?.email ? (
                <Text
                  style={[
                    styles.accountEmailText,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {authUser.email}
                </Text>
              ) : null}
            </View>

            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: isUserPro ? '#F59E0B' : (isDark ? '#334155' : '#64748B'),
                },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {isUserPro ? 'PRO ACTIVE' : 'NON-PRO'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── CHOOSE YOUR PLAN ── */}
        {plans.length > 0 && (
          <View style={styles.plansSection}>
            <View style={styles.plansHeaderRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Choose your plan
                </Text>
                <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                  Select a plan that fits your needs.
                </Text>
              </View>
            </View>

            {/* Interactive Plan Selector Cards (tierTabsContainer) */}
            <View style={styles.tierTabsContainer}>
              <View style={styles.planCardsRow}>
                {plans.map((p) => {
                  const isSelected = p.id === activePlan.id;
                  const isAnnual =
                    p.duration?.toLowerCase().includes('annual') ||
                    (p.durationDays ? p.durationDays > 100 : false);
                  const monthlyEquivalent =
                    isAnnual && p.durationDays
                      ? Math.round(p.priceInr / (p.durationDays / 30))
                      : isAnnual
                      ? Math.round(p.priceInr / 12)
                      : null;

                  const savingsPercent =
                    p.comparisonPriceInr && p.comparisonPriceInr > p.priceInr
                      ? Math.round(
                          ((p.comparisonPriceInr - p.priceInr) / p.comparisonPriceInr) * 100
                        )
                      : null;

                  const badgeText = p.badge || (savingsPercent ? `Save ${savingsPercent}%` : null);

                  return (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.88}
                      onPress={() => setSelectedPlanId(p.id)}
                      style={[
                        styles.planCardItem,
                        {
                          backgroundColor: isSelected
                            ? (isDark ? '#059669' : '#10B981')
                            : colors.card,
                          borderColor: isSelected
                            ? (isDark ? '#10B981' : '#059669')
                            : colors.border,
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                    >
                      {/* Floating Save Badge on Card */}
                      {badgeText ? (
                        <View style={styles.planBadgePill}>
                          <Text style={styles.planBadgePillText}>{badgeText}</Text>
                        </View>
                      ) : null}

                      {/* Card Top Row: Name + Radio Icon */}
                      <View style={styles.planCardTopRow}>
                        <Text
                          style={[
                            styles.planCardName,
                            {
                              color: isSelected ? '#FFFFFF' : colors.foreground,
                              fontFamily: DesignSystem.typography.fontBold,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                        {isSelected ? (
                          <View style={styles.planRadioSelectedCircle}>
                            <Icon
                              name="check"
                              size={12}
                              color={isDark ? '#059669' : '#10B981'}
                              strokeWidth={3}
                            />
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.planRadioCircle,
                              { borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : '#CBD5E1' },
                            ]}
                          />
                        )}
                      </View>

                      {/* Price Row with Billing Period beside it */}
                      <View style={styles.planPriceRow}>
                        <Text
                          style={[
                            styles.planPriceCurrency,
                            {
                              color: isSelected ? '#FFFFFF' : colors.foreground,
                            },
                          ]}
                        >
                          ₹
                        </Text>
                        <Text
                          style={[
                            styles.planPriceAmount,
                            {
                              color: isSelected ? '#FFFFFF' : colors.foreground,
                            },
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                          maxFontSizeMultiplier={1.2}
                        >
                          {p.priceInr.toLocaleString('en-IN')}
                        </Text>
                        <Text
                          style={[
                            styles.planPeriodBesideText,
                            {
                              color: isSelected
                                ? 'rgba(255, 255, 255, 0.88)'
                                : colors.mutedForeground,
                            },
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                          maxFontSizeMultiplier={1.2}
                        >
                          /{p.duration?.toLowerCase() === 'annual'
                            ? 'year'
                            : p.duration?.toLowerCase() === 'monthly'
                            ? 'month'
                            : p.duration?.toLowerCase() || 'period'}
                        </Text>
                      </View>

                      {/* Footer: Strikethrough & Monthly Equivalent */}
                      <View style={styles.planCardFooter}>
                        {isAnnual ? (
                          <View style={styles.annualBreakdownRow}>
                            {p.comparisonPriceInr && p.comparisonPriceInr > p.priceInr ? (
                              <>
                                <Text
                                  style={[
                                    styles.planStrikethrough,
                                    {
                                      color: isSelected
                                        ? 'rgba(255, 255, 255, 0.75)'
                                        : colors.mutedForeground,
                                    },
                                  ]}
                                >
                                  ₹{p.comparisonPriceInr.toLocaleString('en-IN')}
                                </Text>
                                <Text
                                  style={[
                                    styles.planDividerDot,
                                    {
                                      color: isSelected
                                        ? 'rgba(255, 255, 255, 0.60)'
                                        : colors.mutedForeground,
                                    },
                                  ]}
                                >
                                  {' | '}
                                </Text>
                              </>
                            ) : null}
                            {monthlyEquivalent ? (
                              <Text
                                style={[
                                  styles.planMonthlyEqGreen,
                                  isSelected && {
                                    color: '#FFFFFF',
                                    fontFamily: DesignSystem.typography.fontBold,
                                  },
                                ]}
                              >
                                ₹{monthlyEquivalent.toLocaleString('en-IN')} / month
                              </Text>
                            ) : null}
                          </View>
                        ) : p.comparisonPriceInr && p.comparisonPriceInr > p.priceInr ? (
                          <Text
                            style={[
                              styles.planStrikethrough,
                              {
                                color: isSelected
                                  ? 'rgba(255, 255, 255, 0.75)'
                                  : colors.mutedForeground,
                              },
                            ]}
                          >
                            ₹{p.comparisonPriceInr.toLocaleString('en-IN')}
                          </Text>
                        ) : (
                          <Text
                            style={[
                              styles.planFlexibleText,
                              {
                                color: isSelected
                                  ? 'rgba(255, 255, 255, 0.88)'
                                  : colors.mutedForeground,
                              },
                            ]}
                          >
                            Standard cycle
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ── EVERYTHING YOU GET WITH PRO ── */}
        <View style={styles.featuresSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Everything you get with Pro
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            Powerful features to manage your IPO journey.
          </Text>

          <View style={[styles.featuresCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {planBenefits.map((feature, idx) => {
              const isLast = idx === planBenefits.length - 1;

              return (
                <View
                  key={feature.id || feature.title}
                  style={[
                    styles.featureItemRow,
                    !isLast && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.featureContentWrap}>
                    <Text style={[styles.featureTitle, { color: colors.foreground }]}>
                      {feature.title}
                    </Text>
                    {feature.description ? (
                      <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
                        {feature.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── ALSO AVAILABLE ON FREE TIER ── */}
        <View
          style={[
            styles.freeCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.freeCardTitle, { color: colors.foreground }]}>
            Also available on Free Tier
          </Text>
          <View style={styles.freeItemsList}>
            {FREE_FEATURES.map((freeItem) => (
              <View key={freeItem} style={styles.freeItemRow}>
                <Icon name="check-circle" size={19} color="#10B981" strokeWidth={2} />
                <Text style={[styles.freeItemText, { color: colors.foreground }]}>
                  {freeItem}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenSubtitle: {
    fontSize: DesignSystem.typography.size.bodySm,
    fontFamily: DesignSystem.typography.fontRegular,
    textAlign: 'center',
    marginBottom: DesignSystem.spacing.lg,
    paddingHorizontal: DesignSystem.spacing.md,
  },

  // Account Status Card
  accountCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: DesignSystem.spacing.md,
    marginBottom: DesignSystem.spacing.xl,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  accountAvatarText: {
    fontSize: 16,
    fontFamily: DesignSystem.typography.fontBold,
  },
  accountTextWrap: {
    flex: 1,
    gap: 2,
  },
  accountTierTitle: {
    fontSize: 15,
    fontFamily: DesignSystem.typography.fontBold,
  },
  accountTierSubtitle: {
    fontSize: 12,
    fontFamily: DesignSystem.typography.fontRegular,
  },
  accountEmailText: {
    fontSize: 11.5,
    fontFamily: DesignSystem.typography.fontMedium,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: DesignSystem.typography.fontBold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Sections
  plansSection: {
    marginBottom: DesignSystem.spacing.xl,
  },
  plansHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: DesignSystem.spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: DesignSystem.typography.fontBold,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    fontFamily: DesignSystem.typography.fontRegular,
    marginTop: 4,
  },

  // Plan Cards
  tierTabsContainer: {
    marginBottom: DesignSystem.spacing.sm,
  },
  planCardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  planCardItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    padding: 14,
    position: 'relative',
    overflow: 'visible',
  },
  planBadgePill: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#EA580C',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: DesignSystem.radius.pill,
    zIndex: 5,
  },
  planBadgePillText: {
    fontSize: 9.5,
    fontFamily: DesignSystem.typography.fontBold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  planCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planCardName: {
    fontSize: 14,
    flex: 1,
  },
  planRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  planRadioSelectedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
    marginBottom: 8,
  },
  planPriceCurrency: {
    fontSize: 16,
    fontFamily: DesignSystem.typography.fontBold,
  },
  planPriceAmount: {
    fontSize: 26,
    fontFamily: DesignSystem.typography.fontBold,
    letterSpacing: -0.5,
  },
  planPeriodBesideText: {
    fontSize: 12.5,
    fontFamily: DesignSystem.typography.fontRegular,
    marginLeft: 2,
  },
  planCardFooter: {
    minHeight: 18,
    justifyContent: 'center',
  },
  annualBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  planStrikethrough: {
    fontSize: 11,
    fontFamily: DesignSystem.typography.fontRegular,
    textDecorationLine: 'line-through',
  },
  planDividerDot: {
    fontSize: 11,
  },
  planMonthlyEqGreen: {
    fontSize: 11,
    fontFamily: DesignSystem.typography.fontBold,
    color: '#10B981',
  },
  planFlexibleText: {
    fontSize: 11,
    fontFamily: DesignSystem.typography.fontRegular,
  },

  // Features Section
  featuresSection: {
    marginBottom: DesignSystem.spacing.xl,
  },
  featuresCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: DesignSystem.spacing.md,
  },
  featureItemRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  featureContentWrap: {
    gap: 3,
  },
  featureTitle: {
    fontSize: 14.5,
    fontFamily: DesignSystem.typography.fontSemiBold,
  },
  featureDesc: {
    fontSize: 12.5,
    fontFamily: DesignSystem.typography.fontRegular,
    lineHeight: 17,
  },

  // Free Tier Card
  freeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    marginBottom: DesignSystem.spacing.xl,
  },
  freeCardTitle: {
    fontSize: 15,
    fontFamily: DesignSystem.typography.fontBold,
  },
  freeItemsList: {
    gap: 12,
  },
  freeItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  freeItemText: {
    flex: 1,
    fontSize: 13,
    fontFamily: DesignSystem.typography.fontRegular,
    lineHeight: 18,
  },
});
