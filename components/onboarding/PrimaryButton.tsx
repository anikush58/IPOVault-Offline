import React from 'react';
import { StyleSheet, Text, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  isDark?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({ label, onPress, isDark = false }: PrimaryButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const btnBg = isDark ? '#FFFFFF' : '#0F172A';
  const btnTxt = isDark ? '#0F172A' : '#FFFFFF';

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.button, { backgroundColor: btnBg }, animatedStyle]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.buttonText, { color: btnTxt }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
