import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Haptics from 'expo-haptics';

const TAB_CONFIG: Record<string, { label: string; icon: string }> = {
  index: { label: 'Home', icon: 'home' },
  applications: { label: 'Holdings', icon: 'briefcase' },
  ipos: { label: 'IPOs', icon: 'trending-up' },
  bids: { label: 'Bids', icon: 'layers' },
  settings: { label: 'Settings', icon: 'sliders' },
};

export function CustomFloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  // Filter only visible routes
  const visibleRoutes = state.routes.filter(
    (route) => TAB_CONFIG[route.name] !== undefined
  );

  const bottomPad = Platform.OS === 'ios' ? Math.max(insets.bottom, 16) : 16;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.floatingContainer,
        { bottom: bottomPad },
      ]}
    >
      {/* ── Main Pill Navigation Capsule ── */}
      <View
        style={[
          styles.pillCapsule,
          {
            backgroundColor: isDark ? '#1F242D' : '#FFFFFF',
            borderColor: isDark ? '#2E3545' : '#E5E7EB',
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.4 : 0.08,
          },
        ]}
      >
        {visibleRoutes.map((route, index) => {
          const isFocused = state.routes[state.index].key === route.key;
          const config = TAB_CONFIG[route.name] || { label: route.name, icon: 'square' };

          const onPress = () => {
            Haptics.selectionAsync();
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const activeBg = isDark ? '#FFFFFF' : '#111827';
          const activeFg = isDark ? '#111827' : '#FFFFFF';
          const inactiveFg = isDark ? '#9CA3AF' : '#6B7280';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.8}
              style={[
                styles.tabItem,
                isFocused && [
                  styles.tabItemActive,
                  { backgroundColor: activeBg },
                ],
              ]}
            >
              <Feather
                name={config.icon as any}
                size={17}
                color={isFocused ? activeFg : inactiveFg}
              />
              {isFocused && (
                <Text
                  style={[
                    styles.activeLabel,
                    { color: activeFg },
                  ]}
                  numberOfLines={1}
                >
                  {config.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Secondary Circular Action Button (Floating alongside) ── */}
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate('bids');
        }}
        activeOpacity={0.85}
        style={[
          styles.circleBtn,
          {
            backgroundColor: isDark ? '#1F242D' : '#FFFFFF',
            borderColor: isDark ? '#2E3545' : '#E5E7EB',
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.4 : 0.08,
          },
        ]}
      >
        <Feather name="search" size={18} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 99,
  },
  pillCapsule: {
    flex: 1,
    height: 58,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 22,
    gap: 6,
  },
  tabItemActive: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    elevation: 2,
  },
  activeLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.1,
  },
  circleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
  },
});
