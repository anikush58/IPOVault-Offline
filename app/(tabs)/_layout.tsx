import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Tabs, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useAppExperience } from '@/context/AppExperienceContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const PRO_TABS = [
  { name: 'index',        title: 'Home',         iconOutline: 'layers-outline' as const,        iconFilled: 'layers' as const        },
  { name: 'ipos',         title: 'IPO Hub',      iconOutline: 'grid-outline' as const,          iconFilled: 'grid' as const          },
  { name: 'applications', title: 'Applications', iconOutline: 'document-text-outline' as const, iconFilled: 'document-text' as const },
  { name: 'settings',     title: 'Settings',     iconOutline: 'settings-outline' as const,      iconFilled: 'settings' as const      },
] as const;

const NON_PRO_TABS = [
  { name: 'ipos',              title: 'IPO Hub',           iconOutline: 'grid-outline' as const,   iconFilled: 'grid' as const   },
  { name: 'allotment-checker', title: 'Allotment',         iconOutline: 'ticket-rupee' as const,   iconFilled: 'ticket-rupee' as const },
  { name: 'users',             title: 'Users',             iconOutline: 'person-outline' as const, iconFilled: 'person' as const },
  { name: 'settings',          title: 'Settings',          iconOutline: 'settings-outline' as const, iconFilled: 'settings' as const },
] as const;

const ALL_TAB_NAMES = ['index', 'applications', 'ipos', 'bids', 'settings', 'forms', 'banks', 'users', 'hub', 'allotment-checker'] as const;

// Green -> Cyan -> Electric Blue -> Violet gradient matching the Auto Enhance CTA reference
const ACTIVE_TAB_GRADIENT: readonly [string, string, ...string[]] = [
  '#05D672',
  '#00BCD4',
  '#1A8CFF',
  '#7662FA',
];

function CustomFloatingTabBar({ state, descriptors, navigation, onOpenApply }: BottomTabBarProps & { onOpenApply: () => void }) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isNonPro, isLoading, isReady } = useAppExperience();
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < 360;

  const currentTabs = isNonPro ? NON_PRO_TABS : PRO_TABS;
  const currentRouteName = state.routes[state.index]?.name;
  const activeIndex = currentTabs.findIndex((t) => t.name === currentRouteName);

  const [isAppSelectionActive, setIsAppSelectionActive] = useState(false);
  const [appActiveTab, setAppActiveTab] = useState<string>('Applied');
  const [capsuleWidth, setCapsuleWidth] = useState(0);

  // FAB animation scale
  const fabScaleAnim = useRef(new Animated.Value(1)).current;

  // Liquid animation values
  const indicatorAnim = useRef(new Animated.Value(activeIndex >= 0 ? activeIndex : 0)).current;
  const liquidStretchAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (activeIndex >= 0) {
      Animated.parallel([
        Animated.spring(indicatorAnim, {
          toValue: activeIndex,
          friction: 8,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(liquidStretchAnim, {
            toValue: 1.06,
            duration: 90,
            useNativeDriver: true,
          }),
          Animated.spring(liquidStretchAnim, {
            toValue: 1.0,
            friction: 5,
            tension: 50,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [activeIndex, indicatorAnim, liquidStretchAnim]);

  useEffect(() => {
    const subSel = DeviceEventEmitter.addListener('SELECTION_MODE_CHANGED', (active: boolean) => {
      setIsAppSelectionActive(active);
      Animated.sequence([
        Animated.timing(fabScaleAnim, { toValue: 0.85, duration: 90, useNativeDriver: true }),
        Animated.spring(fabScaleAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
      ]).start();
    });

    const subTab = DeviceEventEmitter.addListener('APPLICATIONS_TAB_CHANGED', (tabName: string) => {
      setAppActiveTab(tabName);
    });

    return () => {
      subSel.remove();
      subTab.remove();
    };
  }, [fabScaleAnim]);

  // Synchronize navigator route if tier revocation leaves active route on a Pro-only tab
  useEffect(() => {
    if (isNonPro && isReady && !isLoading) {
      if (
        currentRouteName !== 'ipos' &&
        currentRouteName !== 'allotment-checker' &&
        currentRouteName !== 'users' &&
        currentRouteName !== 'settings'
      ) {
        if (typeof (router as any).navigate === 'function') {
          (router as any).navigate('/(tabs)/ipos');
        } else {
          router.replace('/(tabs)/ipos');
        }
      }
    }
  }, [isNonPro, isReady, isLoading, currentRouteName, router]);

  if (isLoading || !isReady) {
    return null;
  }

  if (isNonPro) {
    if (
      currentRouteName !== 'ipos' &&
      currentRouteName !== 'allotment-checker' &&
      currentRouteName !== 'users' &&
      currentRouteName !== 'settings'
    ) {
      return null;
    }
  } else {
    if (
      currentRouteName === 'users' ||
      currentRouteName === 'banks' ||
      currentRouteName === 'allotment-checker'
    ) {
      return null;
    }
  }

  const bottomPad = Platform.OS === 'web' ? 16 : Math.max(insets.bottom, 12);
  const blurMaskHeight = bottomPad + 110;

  const gradientColors: [string, string, string, string] = isDark
    ? ['rgba(9,10,15,0)', 'rgba(9,10,15,0.5)', 'rgba(9,10,15,0.88)', colors.background]
    : ['rgba(248,249,250,0)', 'rgba(248,249,250,0.45)', 'rgba(248,249,250,0.88)', colors.background];

  const handlePlusPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(fabScaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.spring(fabScaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();

    if (currentRouteName === 'applications') {
      if (appActiveTab === 'Applied') {
        // Toggle selection mode in Applied tab
        DeviceEventEmitter.emit('TOGGLE_BULK_MARK');
      } else {
        // In Allotted, Sold, Holding, Not Allotted -> Open Bulk Application Creator
        onOpenApply();
      }
    } else {
      onOpenApply();
    }
  };

  // Icon is check/x ONLY in Applied tab of Applications page. Otherwise plus!
  const getFabIconName = (): 'check' | 'x' | 'plus' => {
    if (currentRouteName === 'applications' && appActiveTab === 'Applied') {
      return isAppSelectionActive ? 'x' : 'check';
    }
    return 'plus';
  };

  const isDestructiveState = currentRouteName === 'applications' && appActiveTab === 'Applied' && isAppSelectionActive;

  const tabWidth = capsuleWidth > 0 ? (capsuleWidth - 12) / 4 : 0;
  const activeBg = isDark ? colors.primary : '#111827';

  const indicatorTranslateX = tabWidth > 0
    ? indicatorAnim.interpolate({
        inputRange: [0, 1, 2, 3],
        outputRange: [0, tabWidth, tabWidth * 2, tabWidth * 3],
      })
    : 0;

  return (
    <>
      {/* ── Background Blur & Mask Layer ── */}
      <View
        style={[styles.blurMask, { height: isAppSelectionActive ? bottomPad + 60 : blurMaskHeight, opacity: isAppSelectionActive ? 0 : 1 }]}
        pointerEvents="none"
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 45 : 30}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.35, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Floating Navigation Menu ── */}
      <View
        style={[
          styles.floatingContainer,
          {
            bottom: bottomPad,
            left: isNarrow ? 8 : 16,
            right: isNarrow ? 8 : 16,
            gap: isNarrow ? 6 : 10,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* ── Main Floating Capsule Bar ── */}
        <View
          onLayout={(e) => setCapsuleWidth(e.nativeEvent.layout.width)}
          style={[
            styles.mainCapsule,
            isNarrow && { height: 60, padding: 4 },
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Liquid Morphing Animated Background Pill Indicator */}
          {tabWidth > 0 && (
            <Animated.View
              style={[
                styles.liquidIndicator,
                {
                  width: tabWidth,
                  backgroundColor: activeBg,
                  transform: [
                    { translateX: indicatorTranslateX },
                    { scaleX: liquidStretchAnim },
                  ],
                },
              ]}
            />
          )}

          {currentTabs.map(({ name, title, iconOutline, iconFilled }) => {
            const isFocused = currentRouteName === name;

            const onPress = () => {
              Haptics.selectionAsync();
              const targetRoute = state.routes.find((r) => r.name === name);
              const event = navigation.emit({
                type: 'tabPress',
                target: targetRoute?.key ?? '',
                canPreventDefault: true,
              });

              if (name === 'allotment-checker') {
                DeviceEventEmitter.emit('ALLOTMENT_TAB_NAV_PRESS');
              }

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(name);
              }
            };

            const activeText = colors.primaryForeground;
            const inactiveText = colors.mutedForeground;

            return (
              <TouchableOpacity
                key={name}
                onPress={onPress}
                activeOpacity={0.85}
                style={[
                  styles.tabItem,
                  isNarrow && { height: 50, paddingHorizontal: 2, paddingVertical: 2, gap: 1.5 },
                ]}
              >
                <Icon
                  name={(isFocused ? iconFilled : iconOutline) as any}
                  size={isNarrow ? 18 : 20}
                  color={isFocused ? activeText : inactiveText}
                  strokeWidth={isFocused ? 2.2 : 1.8}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    isNarrow && { fontSize: 9.5 },
                    { color: isFocused ? activeText : inactiveText },
                    isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Animated Center FAB Button (Pro mode only) ── */}
        {!isNonPro && (
          <Animated.View style={{ transform: [{ scale: fabScaleAnim }] }}>
            <TouchableOpacity
              onPress={handlePlusPress}
              activeOpacity={0.85}
              style={[
                styles.circleBtn,
                isNarrow && { width: 58, height: 58, borderRadius: 29 },
                {
                  backgroundColor: isDestructiveState ? colors.destructive : 'transparent',
                  borderColor: isDestructiveState ? colors.destructive : 'transparent',
                  overflow: 'hidden',
                },
              ]}
            >
              {!isDestructiveState && (
                <LinearGradient
                  colors={ACTIVE_TAB_GRADIENT}
                  start={{ x: 0, y: 0.15 }}
                  end={{ x: 1, y: 0.85 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Icon
                name={getFabIconName()}
                size={24}
                color="#FFFFFF"
                strokeWidth={2.2}
              />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const { isNonPro } = useAppExperience();

  const handleOpenApply = useCallback(() => {
    if (isNonPro) return;
    router.push('/bulk-apply');
  }, [router, isNonPro]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('OPEN_BULK_APPLY', (paramIpoId?: string) => {
      if (isNonPro) return;
      if (paramIpoId && typeof paramIpoId === 'string') {
        router.push({ pathname: '/bulk-apply', params: { ipoId: paramIpoId } });
      } else {
        router.push('/bulk-apply');
      }
    });
    return () => sub.remove();
  }, [router, isNonPro]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        key={isNonPro ? 'tabs-non-pro' : 'tabs-pro'}
        initialRouteName={isNonPro ? 'ipos' : 'index'}
        tabBar={(props) => (
          <CustomFloatingTabBar
            {...props}
            onOpenApply={handleOpenApply}
          />
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        {ALL_TAB_NAMES.map((name) => (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: name,
            }}
          />
        ))}
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  blurMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
  },
  floatingContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 100,
  },
  mainCapsule: {
    flex: 1,
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    borderRadius: 100,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
  },
  liquidIndicator: {
    position: 'absolute',
    left: 6,
    top: 6,
    bottom: 6,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  tabItem: {
    flex: 1,
    height: 54,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 100,
    zIndex: 2,
  },
  tabLabel: {
    fontSize: 10.5,
  },
  tabLabelActive: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  tabLabelInactive: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  circleBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
});
