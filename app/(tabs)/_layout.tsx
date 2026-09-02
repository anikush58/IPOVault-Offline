import React, { useEffect, useRef, useState } from 'react';
import { Animated, DeviceEventEmitter, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { BulkApplySheet } from '@/components/BulkApplySheet';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const MAIN_BAR_TABS = [
  { name: 'index',        title: 'Home',         icon: 'home'        },
  { name: 'applications', title: 'Applications', icon: 'file-text'   },
  { name: 'ipos',         title: 'IPO Hub',      icon: 'grid'        },
  { name: 'settings',     title: 'Settings',     icon: 'settings'    },
] as const;

const ALL_TAB_NAMES = ['index', 'applications', 'ipos', 'bids', 'settings', 'forms', 'banks', 'users', 'hub'] as const;

function CustomFloatingTabBar({ state, descriptors, navigation, onOpenApply }: BottomTabBarProps & { onOpenApply: () => void }) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const currentRouteName = state.routes[state.index]?.name;
  if (currentRouteName === 'users' || currentRouteName === 'banks') {
    return null;
  }
  const activeIndex = MAIN_BAR_TABS.findIndex((t) => t.name === currentRouteName);

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
            toValue: 1.15,
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
  }, [activeIndex]);

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

  const bottomPad = Platform.OS === 'web' ? 16 : Math.max(insets.bottom, 12);
  const blurMaskHeight = bottomPad + 84;

  const gradientColors: [string, string, string] = isDark
    ? ['rgba(14,17,23,0)', 'rgba(14,17,23,0.85)', colors.background]
    : ['rgba(248,249,250,0)', 'rgba(248,249,250,0.85)', colors.background];

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
    } else if (currentRouteName === 'ipos') {
      router.push('/add-ipo');
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

  const tabWidth = capsuleWidth > 0 ? (capsuleWidth - 8) / 4 : 0;
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
        style={[styles.blurMask, { height: blurMaskHeight }]}
        pointerEvents="none"
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 70 : 45}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Floating Navigation Menu ── */}
      <View style={[styles.floatingContainer, { bottom: bottomPad }]} pointerEvents="box-none">
        {/* ── Main Floating Capsule Bar ── */}
        <View
          onLayout={(e) => setCapsuleWidth(e.nativeEvent.layout.width)}
          style={[
            styles.mainCapsule,
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

          {MAIN_BAR_TABS.map(({ name, title, icon }) => {
            const isFocused = currentRouteName === name;

            const onPress = () => {
              Haptics.selectionAsync();
              const targetRoute = state.routes.find((r) => r.name === name);
              const event = navigation.emit({
                type: 'tabPress',
                target: targetRoute?.key ?? '',
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(name);
              }
            };

            const activeText = '#FFFFFF';
            const inactiveText = colors.mutedForeground;

            return (
              <TouchableOpacity
                key={name}
                onPress={onPress}
                activeOpacity={0.85}
                style={styles.tabItem}
              >
                <Feather
                  name={icon as any}
                  size={18}
                  color={isFocused ? activeText : inactiveText}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isFocused ? activeText : inactiveText },
                    isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Animated Center FAB Button ── */}
        <Animated.View style={{ transform: [{ scale: fabScaleAnim }] }}>
          <TouchableOpacity
            onPress={handlePlusPress}
            activeOpacity={0.85}
            style={[
              styles.circleBtn,
              {
                backgroundColor: isDestructiveState ? colors.destructive : colors.primary,
                borderColor: isDestructiveState ? colors.destructive : colors.primary,
              },
            ]}
          >
            <Feather
              name={getFabIconName()}
              size={22}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </>
  );
}

export default function TabLayout() {
  const [showApplySheet, setShowApplySheet] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => (
          <CustomFloatingTabBar
            {...props}
            onOpenApply={() => setShowApplySheet(true)}
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

      <BulkApplySheet
        visible={showApplySheet}
        onClose={() => setShowApplySheet(false)}
      />
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
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 4,
    borderRadius: 100,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
  },
  liquidIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  tabItem: {
    flex: 1,
    height: 48,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 100,
    zIndex: 2,
  },
  tabLabel: {
    fontSize: 10,
  },
  tabLabelActive: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  tabLabelInactive: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  circleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
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
