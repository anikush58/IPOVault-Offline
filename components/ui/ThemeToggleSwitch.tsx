import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useColors } from '@/hooks/useColors';

interface ThemeToggleSwitchProps {
  size?: 'sm' | 'md';
}

export function ThemeToggleSwitch({ size = 'md' }: ThemeToggleSwitchProps) {
  const { setPreference, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const colors = useColors();

  const trackWidth = size === 'sm' ? 54 : 62;
  const trackHeight = size === 'sm' ? 28 : 32;
  const thumbSize = size === 'sm' ? 22 : 26;
  const padding = 3;
  const travelDistance = trackWidth - thumbSize - padding * 2;

  const anim = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isDark ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [isDark]);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreference(isDark ? 'light' : 'dark');
  };

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travelDistance],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={toggle}
      style={[
        styles.track,
        {
          width: trackWidth,
          height: trackHeight,
          borderRadius: trackHeight / 2,
          backgroundColor: isDark ? '#1E232D' : '#F1F3F7',
          borderColor: isDark ? '#333D4B' : '#E2E8F0',
        },
      ]}
    >
      {/* Sun Icon Placeholder on Left */}
      <View style={[styles.iconSlot, { left: padding, width: thumbSize, height: thumbSize }]}>
        <Feather name="sun" size={size === 'sm' ? 12.5 : 14.5} color={isDark ? '#64748B' : '#F59E0B'} />
      </View>

      {/* Moon Icon Placeholder on Right */}
      <View style={[styles.iconSlot, { right: padding, width: thumbSize, height: thumbSize }]}>
        <Feather name="moon" size={size === 'sm' ? 12.5 : 14.5} color={isDark ? '#93C5FD' : '#94A3B8'} />
      </View>

      {/* Animated Sliding Thumb */}
      <Animated.View
        style={[
          styles.thumb,
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            transform: [{ translateX }],
            backgroundColor: isDark ? '#0F172A' : '#FFFDF5',
            borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : '#FDE68A',
            shadowColor: isDark ? '#000000' : '#D97706',
            shadowOpacity: isDark ? 0.35 : 0.18,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1.5 },
            elevation: 2,
          },
        ]}
      >
        {isDark ? (
          <Feather name="moon" size={size === 'sm' ? 12.5 : 14.5} color="#60A5FA" />
        ) : (
          <Feather name="sun" size={size === 'sm' ? 12.5 : 14.5} color="#D97706" />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    borderWidth: 1.2,
    position: 'relative',
    justifyContent: 'center',
    padding: 3,
  },
  iconSlot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
