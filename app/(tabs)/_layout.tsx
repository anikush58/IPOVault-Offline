import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const MAIN_BAR_TABS = [
  { name: 'index',        title: 'Home',         icon: 'home'        },
  { name: 'applications', title: 'Applications', icon: 'file-text'   },
  { name: 'bids',         title: 'Bids',         icon: 'layers'      },
  { name: 'settings',     title: 'Settings',     icon: 'settings'    },
] as const;

const ALL_TAB_NAMES = ['index', 'applications', 'ipos', 'bids', 'settings', 'forms', 'banks', 'users', 'hub'] as const;

function CustomFloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const insets = useSafeAreaInsets();

  const currentRouteName = state.routes[state.index]?.name;
  const isIpoActive = currentRouteName === 'ipos';

  const bottomPad = Platform.OS === 'web' ? 16 : Math.max(insets.bottom, 12);
  const blurMaskHeight = bottomPad + 84;

  const gradientColors: [string, string, string] = isDark
    ? ['rgba(14,17,23,0)', 'rgba(14,17,23,0.85)', colors.background]
    : ['rgba(248,249,250,0)', 'rgba(248,249,250,0.85)', colors.background];

  return (
    <>
      {/* ── Background Blur & Mask Layer (Hides scrolling content below nav menu) ── */}
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
          style={[
            styles.mainCapsule,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
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

            const activeBg = isDark ? colors.primary : '#111827';
            const activeText = isDark ? '#0E1117' : '#FFFFFF';
            const inactiveText = colors.mutedForeground;

            return (
              <TouchableOpacity
                key={name}
                onPress={onPress}
                activeOpacity={0.85}
                style={[
                  styles.tabItem,
                  isFocused && [styles.activeTabCapsule, { backgroundColor: activeBg }],
                ]}
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

        {/* ── Separate Circular Action Button (IPO Management) ── */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const targetRoute = state.routes.find((r) => r.name === 'ipos');
            const event = navigation.emit({
              type: 'tabPress',
              target: targetRoute?.key ?? '',
              canPreventDefault: true,
            });

            if (!isIpoActive && !event.defaultPrevented) {
              navigation.navigate('ipos');
            }
          }}
          activeOpacity={0.85}
          style={[
            styles.circleBtn,
            {
              backgroundColor: isIpoActive
                ? (isDark ? colors.primary : '#111827')
                : colors.card,
              borderColor: isIpoActive
                ? (isDark ? colors.primary : '#111827')
                : colors.border,
            },
          ]}
        >
          <Feather
            name="trending-up"
            size={22}
            color={
              isIpoActive
                ? (isDark ? '#0E1117' : '#FFFFFF')
                : (isDark ? colors.primary : colors.foreground)
            }
          />
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <CustomFloatingTabBar {...props} />}
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
    zIndex: 9998,
  },
  floatingContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 9999,
  },
  mainCapsule: {
    flex: 1,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingVertical: 5,

    // Soft floating shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  activeTabCapsule: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  tabLabel: {
    fontSize: 10.5,
    textAlign: 'center',
  },
  tabLabelActive: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  tabLabelInactive: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  circleBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginLeft: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',

    // Soft floating shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
});
