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

  const trackWidth = size === 'sm' ? 56 : 64;
  const trackHeight = size === 'sm' ? 30 : 34;
  const thumbSize = size === 'sm' ? 24 : 28;
  const padding = 3;
  const travelDistance = trackWidth - thumbSize - padding * 2;

  const anim = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isDark ? 1 : 0,
      damping: 17,
      stiffness: 240,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [isDark]);

  const toggle = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setPreference(isDark ? 'light' : 'dark');
  };

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travelDistance],
  });

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={toggle}
      accessibilityRole="switch"
      accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      style={[
        styles.track,
        {
          width: trackWidth,
          height: trackHeight,
          borderRadius: trackHeight / 2,
          backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
        },
      ]}
    >
      {/* Background Sun Placeholder (Left) */}
      <View style={[styles.iconSlot, { left: padding + 1, width: thumbSize, height: thumbSize }]}>
        <Feather name="sun" size={size === 'sm' ? 12 : 13.5} color={isDark ? '#475569' : '#F59E0B'} />
      </View>

      {/* Background Moon Placeholder (Right) */}
      <View style={[styles.iconSlot, { right: padding + 1, width: thumbSize, height: thumbSize }]}>
        <Feather name="moon" size={size === 'sm' ? 12 : 13.5} color={isDark ? '#38BDF8' : '#94A3B8'} />
      </View>

      {/* Animated Floating Thumb */}
      <Animated.View
        style={[
          styles.thumb,
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            transform: [{ translateX }],
            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
            borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(0, 0, 0, 0.06)',
            shadowColor: isDark ? '#000000' : '#000000',
            shadowOpacity: isDark ? 0.45 : 0.12,
            shadowRadius: 3.5,
            shadowOffset: { width: 0, height: 1.5 },
            elevation: 3,
          },
        ]}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          {isDark ? (
            <Feather name="moon" size={size === 'sm' ? 13 : 14.5} color="#38BDF8" />
          ) : (
            <Feather name="sun" size={size === 'sm' ? 13 : 14.5} color="#F59E0B" />
          )}
        </Animated.View>
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
