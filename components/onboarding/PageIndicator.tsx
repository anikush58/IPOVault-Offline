import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface PageIndicatorProps {
  total: number;
  currentIndex: number;
  isDark?: boolean;
}

function AnimatedDot({ isActive, isDark }: { isActive: boolean; isDark: boolean }) {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: withSpring(isActive ? 22 : 8, { damping: 15, stiffness: 120 }),
      backgroundColor: isActive
        ? isDark
          ? '#FFFFFF'
          : '#0F172A'
        : isDark
        ? 'rgba(255, 255, 255, 0.22)'
        : 'rgba(0, 0, 0, 0.22)',
    };
  }, [isActive, isDark]);

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export function PageIndicator({ total, currentIndex, isDark = true }: PageIndicatorProps) {
  return (
    <View style={styles.container} accessibilityRole="tablist" accessibilityLabel="Page Indicator">
      {Array.from({ length: total }).map((_, idx) => (
        <AnimatedDot key={idx} isActive={idx === currentIndex} isDark={isDark} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 20,
  },
  dot: {
    height: 8,
    borderRadius: 999,
  },
});
