import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Image, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { OnboardingSlideData } from '@/constants/onboarding';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingSlideProps {
  slide: OnboardingSlideData;
  imageSource: any;
  isActive: boolean;
  textColor: string;
  subtitleColor: string;
}

export function OnboardingSlide({
  slide,
  imageSource,
  isActive,
  textColor,
  subtitleColor,
}: OnboardingSlideProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    if (isActive) {
      opacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });
      translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(12, { duration: 200 });
    }
  }, [isActive, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <View style={styles.slideContainer}>
      {/* 1. Prominent Logo & App Title Section */}
      <View style={styles.brandingHeader}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoImage}
          resizeMode="cover"
        />
        <Text style={styles.appName}>IPOVault</Text>
      </View>

      {/* 2. Illustration (Contain mode, shifted lower) */}
      <Animated.View style={[styles.illustrationContainer, animatedStyle]}>
        <Image
          source={imageSource}
          style={styles.illustrationImage}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={slide.title}
        />
      </Animated.View>

      {/* 3. Typography (Max 2 lines title, Max 3 lines subtitle) */}
      <Animated.View style={[styles.textContainer, animatedStyle]}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
          {slide.title}
        </Text>
        <Text style={[styles.subtitle, { color: subtitleColor }]} numberOfLines={3}>
          {slide.subtitle}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slideContainer: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  brandingHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  logoImage: {
    width: 88,
    height: 88,
    borderRadius: 22,
  },
  appName: {
    fontSize: 32,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#C39B27',
    letterSpacing: -0.5,
    marginTop: 12,
    textAlign: 'center',
  },
  illustrationContainer: {
    width: '100%',
    height: Math.min(SCREEN_HEIGHT * 0.44, 380),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  illustrationImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 32,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});
