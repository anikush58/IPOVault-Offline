import React from 'react';
import { StyleSheet, Text, Pressable, StyleProp, ViewStyle, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  isDark?: boolean;
  strokeOpacity?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  isDark = false,
  strokeOpacity,
  style,
  textStyle,
  testID,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  const isOutline = variant === 'outline';
  const effectiveStrokeOpacity = strokeOpacity ?? (isOutline ? 0.5 : 1);

  // Theme colors
  const primaryBg = isDark ? '#FFFFFF' : '#0F172A';
  const primaryTxt = isDark ? '#0F172A' : '#FFFFFF';

  const outlineBg = 'transparent';
  // Stroke with configurable opacity (defaults to 50% for outline), text remains 100% solid
  const outlineBorder = isDark
    ? `rgba(255, 255, 255, ${effectiveStrokeOpacity})`
    : `rgba(15, 23, 42, ${effectiveStrokeOpacity})`;
  const outlineTxt = isDark ? '#FFFFFF' : '#0F172A';

  const btnBg = isOutline ? outlineBg : primaryBg;
  const btnTxt = isOutline ? outlineTxt : primaryTxt;
  const borderWidth = isOutline ? 1.5 : 0;
  const borderColor = isOutline ? outlineBorder : 'transparent';

  return (
    <AnimatedPressable
      testID={testID}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.button,
        {
          backgroundColor: btnBg,
          borderWidth,
          borderColor,
        },
        style,
        animatedStyle,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[styles.buttonText, { color: btnTxt }, textStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
});
