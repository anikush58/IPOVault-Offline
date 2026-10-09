import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { OnboardingSlideData } from '@/constants/onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingSlideProps {
  slide: OnboardingSlideData;
  index: number;
  scrollX: SharedValue<number>;
  textColor: string;
  subtitleColor: string;
}

export function OnboardingSlide({
  slide,
  index,
  scrollX,
  textColor,
  subtitleColor,
}: OnboardingSlideProps) {
  const dissolveAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [0, 1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
    };
  });

  return (
    <View style={styles.slideContainer}>
      {/* Spacer to balance the top fixed branding logo area */}
      <View style={styles.spacer} />

      {/* Typography Section with Pure Cross-Dissolve Animation */}
      <Animated.View style={[styles.textContainer, dissolveAnimStyle]}>
        <Animated.Text
          style={[styles.title, { color: textColor }]}
          numberOfLines={2}
        >
          {slide.title}
        </Animated.Text>
        <Animated.Text
          style={[styles.subtitle, { color: subtitleColor }]}
          numberOfLines={3}
        >
          {slide.subtitle}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slideContainer: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  spacer: {
    flex: 1,
  },
  textContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 26,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});




