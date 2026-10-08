import React, { useEffect, useRef, useState } from 'react';
import { Animated, DeviceEventEmitter, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const LEFT_TABS = [
  { name: 'index',        title: 'Home',         iconOutline: 'layers-outline' as const,        iconFilled: 'layers' as const        },
  { name: 'ipos',         title: 'IPO Hub',      iconOutline: 'grid-outline' as const,          iconFilled: 'grid' as const          },
] as const;

const RIGHT_TABS = [
  { name: 'applications', title: 'Applications', iconOutline: 'document-text-outline' as const, iconFilled: 'document-text' as const },
  { name: 'settings',     title: 'Settings',     iconOutline: 'settings-outline' as const,      iconFilled: 'settings' as const      },
] as const;

export function ElevatedCrestFloatingTabBar({ state, descriptors, navigation, onOpenApply }: BottomTabBarProps & { onOpenApply: () => void }) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const currentRouteName = state.routes[state.index]?.name;

  const [isAppSelectionActive, setIsAppSelectionActive] = useState(false);
  const [appActiveTab, setAppActiveTab] = useState<string>('Applied');
  const [barWidth, setBarWidth] = useState(0);

  // FAB animation scale
  const fabScaleAnim = useRef(new Animated.Value(1)).current;

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

  if (currentRouteName === 'users' || currentRouteName === 'banks') {
    return null;
  }

  const bottomPad = Platform.OS === 'web' ? 16 : Math.max(insets.bottom, 12);
  const blurMaskHeight = bottomPad + 110;

  const gradientColors: [string, string, string, string] = isDark
    ? ['rgba(14,17,23,0)', 'rgba(14,17,23,0.5)', 'rgba(14,17,23,0.88)', colors.background]
    : ['rgba(248,249,250,0)', 'rgba(248,249,250,0.45)', 'rgba(248,249,250,0.88)', colors.background];

  const handlePlusPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(fabScaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.spring(fabScaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();

    if (currentRouteName === 'applications') {
      if (appActiveTab === 'Applied') {
        DeviceEventEmitter.emit('TOGGLE_BULK_MARK');
      } else {
        onOpenApply();
      }
    } else {
      onOpenApply();
    }
  };

  const getFabIconName = (): 'check' | 'x' | 'plus' => {
    if (currentRouteName === 'applications' && appActiveTab === 'Applied') {
      return isAppSelectionActive ? 'x' : 'check';
    }
    return 'plus';
  };

  const isDestructiveState = currentRouteName === 'applications' && appActiveTab === 'Applied' && isAppSelectionActive;

  const BAR_HEIGHT = 64;
  const BAR_RADIUS = 32;
  const OFFSET_Y = 28; // SVG coordinate offset to prevent negative Y clipping on Android
  const SVG_TOTAL_HEIGHT = BAR_HEIGHT + OFFSET_Y;

  // Custom SVG path using positive coordinate space with smooth organic crest
  const getPillSvgPath = (w: number) => {
    if (w <= 0) return '';
    const cx = w / 2;
    const crestW = 56;
    const crestH = 26; // Peak elevation

    const topY = OFFSET_Y;
    const peakY = OFFSET_Y - crestH; // = 2px (always positive)
    const botY = OFFSET_Y + BAR_HEIGHT;
    const r = BAR_RADIUS;

    return `M 0 ${topY + r}
      A ${r} ${r} 0 0 1 ${r} ${topY}
      L ${cx - crestW} ${topY}
      C ${cx - 36} ${topY}, ${cx - 30} ${peakY + 3}, ${cx - 16} ${peakY}
      C ${cx - 6} ${peakY - 1}, ${cx + 6} ${peakY - 1}, ${cx + 16} ${peakY}
      C ${cx + 30} ${peakY + 3}, ${cx + 36} ${topY}, ${cx + crestW} ${topY}
      L ${w - r} ${topY}
      A ${r} ${r} 0 0 1 ${w} ${topY + r}
      L ${w} ${botY - r}
      A ${r} ${r} 0 0 1 ${w - r} ${botY}
      L ${r} ${botY}
      A ${r} ${r} 0 0 1 0 ${botY - r}
      Z`;
  };

  const renderTabItem = ({ name, title, iconOutline, iconFilled }: { name: string; title: string; iconOutline: keyof typeof Ionicons.glyphMap; iconFilled: keyof typeof Ionicons.glyphMap }) => {
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

    const activeColor = '#FFFFFF';
    const inactiveColor = '#94A3B8';

    return (
      <TouchableOpacity
        key={name}
        onPress={onPress}
        activeOpacity={0.75}
        style={styles.tabItem}
      >
        <Ionicons
          name={isFocused ? iconFilled : iconOutline}
          size={20}
          color={isFocused ? activeColor : inactiveColor}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: isFocused ? activeColor : inactiveColor },
            isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </TouchableOpacity>
    );
  };

  const barBgColor = '#101216';

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
      <View style={[styles.floatingContainer, { bottom: bottomPad }]} pointerEvents="box-none">
        <View
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          style={[styles.mainBarWrapper, { height: BAR_HEIGHT }]}
        >
          {/* Custom SVG Pill Background with Organic Center Wave */}
          {barWidth > 0 && (
            <Svg
              width={barWidth}
              height={SVG_TOTAL_HEIGHT}
              style={[StyleSheet.absoluteFill, { top: -OFFSET_Y, left: 0 }]}
            >
              <Path
                d={getPillSvgPath(barWidth)}
                fill={barBgColor}
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth={1}
              />
            </Svg>
          )}

          {/* Left Tab Pair */}
          <View style={styles.tabGroup}>
            {LEFT_TABS.map((tab) => renderTabItem(tab))}
          </View>

          {/* Center Elevated Glossy Plus Button */}
          <View style={styles.centerFabSlot}>
            <Animated.View style={{ transform: [{ scale: fabScaleAnim }] }}>
              <TouchableOpacity
                onPress={handlePlusPress}
                activeOpacity={0.88}
                style={styles.gradientFabContainer}
              >
                <LinearGradient
                  colors={
                    isDestructiveState
                      ? ['#EF4444', '#DC2626']
                      : ['#FF5E7E', '#FF4E50', '#FF6B35', '#FFA040']
                  }
                  start={{ x: 0.15, y: 0.1 }}
                  end={{ x: 0.9, y: 0.95 }}
                  style={styles.gradientFab}
                >
                  {/* Frosted Glass Top Crescent Reflection */}
                  <View style={styles.fabGlassRim} />
                  <Feather
                    name={getFabIconName()}
                    size={28}
                    color="#FFFFFF"
                  />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Right Tab Pair */}
          <View style={styles.tabGroup}>
            {RIGHT_TABS.map((tab) => renderTabItem(tab))}
          </View>
        </View>
      </View>
    </>
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
    left: 14,
    right: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  mainBarWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    position: 'relative',
    overflow: 'visible',
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: '100%',
  },
  tabItem: {
    flex: 1,
    height: 52,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 2,
    zIndex: 2,
  },
  tabLabel: {
    fontSize: 10.5,
  },
  tabLabelActive: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  tabLabelInactive: {
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  centerFabSlot: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    marginTop: -22,
    overflow: 'visible',
  },
  gradientFabContainer: {
    shadowColor: '#FF4E64',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 14,
  },
  gradientFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.8,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  fabGlassRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 25,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});
