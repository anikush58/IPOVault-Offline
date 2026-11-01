import React from 'react';
import { StyleSheet, View, useWindowDimensions, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';

interface PageIndicatorProps {
  total: number;
  scrollX: SharedValue<number>;
  activeColor?: string;
  isDark?: boolean;
  onSelectIndex?: (index: number) => void;
  windowWidth?: number;
}

function AnimatedDot({
  index,
  scrollX,
  activeColor,
  screenWidth,
  inactiveOpacity = 0.22,
}: {
  index: number;
  scrollX: SharedValue<number>;
  activeColor: string;
  screenWidth: number;
  inactiveOpacity?: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const isNarrow = screenWidth < 360;
    const activeWidth = isNarrow ? 22 : 28;
    // Active pill expands, inactive shrinks to 8px
    const width = interpolate(
      scrollX.value,
      [(index - 1) * screenWidth, index * screenWidth, (index + 1) * screenWidth],
      [8, activeWidth, 8],
      Extrapolation.CLAMP
    );

    // Active pill has full opacity (1), inactive has subtle muted opacity
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * screenWidth, index * screenWidth, (index + 1) * screenWidth],
      [inactiveOpacity, 1, inactiveOpacity],
      Extrapolation.CLAMP
    );

    return {
      width,
      opacity,
      backgroundColor: activeColor,
    };
  });

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export function PageIndicator({
  total,
  scrollX,
  activeColor,
  isDark,
  onSelectIndex,
  windowWidth: propWidth,
}: PageIndicatorProps) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const { width: hookWidth } = useWindowDimensions();
  const screenWidth = propWidth && propWidth > 0 ? propWidth : hookWidth;

  const isDarkTheme = isDark !== undefined ? isDark : resolvedScheme === 'dark';
  const color = activeColor || colors.primary || (isDarkTheme ? '#FFFFFF' : '#0F172A');
  const inactiveOpacity = isDarkTheme ? 0.25 : 0.22;

  return (
    <View style={styles.container} accessibilityRole="tablist" accessibilityLabel="Page Indicator">
      {Array.from({ length: total }).map((_, idx) => {
        const dot = (
          <AnimatedDot
            index={idx}
            scrollX={scrollX}
            activeColor={color}
            screenWidth={screenWidth}
            inactiveOpacity={inactiveOpacity}
          />
        );

        if (onSelectIndex) {
          return (
            <Pressable
              key={idx}
              onPress={() => onSelectIndex(idx)}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              accessibilityRole="tab"
              accessibilityLabel={`Page ${idx + 1}`}
            >
              {dot}
            </Pressable>
          );
        }

        return <View key={idx}>{dot}</View>;
      })}
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
    borderRadius: 9999,
  },
});
