import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { OnboardingSlideData } from '@/constants/onboarding';

interface OnboardingSlideProps {
  slide: OnboardingSlideData;
  index: number;
  scrollX: SharedValue<number>;
  textColor: string;
  subtitleColor: string;
  windowWidth?: number;
  windowHeight?: number;
}

export function OnboardingSlide({
  slide,
  index,
  scrollX,
  textColor,
  subtitleColor,
  windowWidth: propWidth,
  windowHeight: propHeight,
}: OnboardingSlideProps) {
  const { width: hookWidth, height: hookHeight } = useWindowDimensions();
  const screenWidth = propWidth && propWidth > 0 ? propWidth : hookWidth;
  const screenHeight = propHeight && propHeight > 0 ? propHeight : hookHeight;
  const isSmallScreen = screenHeight < 720;
  const isNarrow = screenWidth < 360;

  const dissolveAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * screenWidth, index * screenWidth, (index + 1) * screenWidth],
      [0, 1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      // Shift texts downward by exactly 10px
      transform: [{ translateY: 10 }],
    };
  });

  return (
    <View style={[styles.slideContainer, { width: screenWidth }]}>
      {/* Spacer to balance the top fixed branding logo area */}
      <View style={styles.spacer} />

      {/* Typography Section with Pure Cross-Dissolve Animation shifted 10px downward */}
      <Animated.View style={[styles.textContainer, dissolveAnimStyle]}>
        <Animated.Text
          style={[
            styles.title,
            {
              color: textColor,
              fontSize: isSmallScreen || isNarrow ? 22 : 26,
              lineHeight: isSmallScreen || isNarrow ? 28 : 34,
              marginBottom: isSmallScreen ? 8 : 12,
            },
          ]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {slide.title}
        </Animated.Text>
        <Animated.Text
          style={[
            styles.subtitle,
            {
              color: subtitleColor,
              fontSize: isSmallScreen || isNarrow ? 13.5 : 15,
              lineHeight: isSmallScreen || isNarrow ? 19 : 22,
            },
          ]}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {slide.subtitle}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slideContainer: {
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
