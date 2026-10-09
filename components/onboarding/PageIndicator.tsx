import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PageIndicatorProps {
  total: number;
  scrollX: SharedValue<number>;
  isDark?: boolean;
}

function AnimatedDot({
  index,
  scrollX,
  isDark,
}: {
  index: number;
  scrollX: SharedValue<number>;
  isDark: boolean;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const width = interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [8, 24, 8],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [0.25, 1, 0.25],
      Extrapolation.CLAMP
    );
    return {
      width,
      opacity,
      backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
    };
  });

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export function PageIndicator({ total, scrollX, isDark = true }: PageIndicatorProps) {
  return (
    <View style={styles.container} accessibilityRole="tablist" accessibilityLabel="Page Indicator">
      {Array.from({ length: total }).map((_, idx) => (
        <AnimatedDot key={idx} index={idx} scrollX={scrollX} isDark={isDark} />
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

