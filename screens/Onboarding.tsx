import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Image,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { ONBOARDING_SLIDES, ONBOARDING_STORAGE_KEY } from '@/constants/onboarding';
import { useColorSchemeAssets } from '@/hooks/useColorSchemeAssets';
import { useColors } from '@/hooks/useColors';
import { OnboardingSlide } from '@/components/onboarding/OnboardingSlide';
import { PageIndicator } from '@/components/onboarding/PageIndicator';
import { PrimaryButton } from '@/components/onboarding/PrimaryButton';
import { ThemeToggle } from '@/components/onboarding/ThemeToggle';

import { useAuth } from '@/context/AuthContext';
import * as SplashScreen from 'expo-splash-screen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const BG_IMAGES = {
  dark: [
    require('@/assets/images/onboarding-bg-dark-1.png'),
    require('@/assets/images/onboarding-bg-dark-2.png'),
    require('@/assets/images/onboarding-bg-dark-3.png'),
  ],
  light: [
    require('@/assets/images/onboarding-bg-1.png'),
    require('@/assets/images/onboarding-bg-2.png'),
    require('@/assets/images/onboarding-bg-3.png'),
  ],
};

function BackgroundLayers({
  scrollX,
  isDark,
}: {
  scrollX: SharedValue<number>;
  isDark: boolean;
}) {
  const layer1Style = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [0, SCREEN_WIDTH],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const layer2Style = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [SCREEN_WIDTH, 2 * SCREEN_WIDTH],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const sources = isDark ? BG_IMAGES.dark : BG_IMAGES.light;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Base Layer 0: Always 100% opaque underneath to prevent background bleed/blink */}
      <Image source={sources[0]} style={StyleSheet.absoluteFillObject} resizeMode="cover" />

      {/* Layer 1: Dissolves seamlessly over Layer 0 */}
      <Animated.View style={[StyleSheet.absoluteFillObject, layer1Style]}>
        <Image source={sources[1]} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      </Animated.View>

      {/* Layer 2: Dissolves seamlessly over Layer 1 */}
      <Animated.View style={[StyleSheet.absoluteFillObject, layer2Style]}>
        <Image source={sources[2]} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      </Animated.View>
    </View>
  );
}

const FloatingStationaryLogo = React.memo(function FloatingStationaryLogo({
  isDark,
}: {
  isDark: boolean;
}) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, [translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const logoSource = isDark
    ? require('@/assets/images/onboarding-brand-logo-dark.png')
    : require('@/assets/images/onboarding-brand-logo.png');

  return (
    <Animated.View style={[styles.brandingContainer, animStyle]}>
      <Image
        source={logoSource}
        style={styles.logoImage}
        resizeMode="cover"
      />
    </Animated.View>
  );
});

export function OnboardingScreenView() {
  const router = useRouter();
  const { user } = useAuth();
  const { isDark } = useColorSchemeAssets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;

  const scrollX = useSharedValue(0);
  const flatListRef = useRef<FlatList>(null);
  const isUserTouchingRef = useRef(false);

  React.useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // 3-Second Smooth Auto-Scroll Dissolve Interval (stops at final CTA slide)
  useEffect(() => {
    const timer = setInterval(() => {
      if (isUserTouchingRef.current) return;
      if (currentIndexRef.current < ONBOARDING_SLIDES.length - 1) {
        const nextIndex = currentIndexRef.current + 1;
        flatListRef.current?.scrollToOffset({
          offset: nextIndex * SCREEN_WIDTH,
          animated: true,
        });
        currentIndexRef.current = nextIndex;
        setCurrentIndex(nextIndex);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleScrollBeginDrag = () => {
    isUserTouchingRef.current = true;
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    if (index >= 0 && index < ONBOARDING_SLIDES.length) {
      setCurrentIndex(index);
      currentIndexRef.current = index;
    }
    setTimeout(() => {
      isUserTouchingRef.current = false;
    }, 1000);
  };

  const handleNext = async () => {
    if (currentIndex < ONBOARDING_SLIDES.length - 1) {
      const nextIndex = currentIndex + 1;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * SCREEN_WIDTH,
        animated: true,
      });
    } else {
      try {
        await safeAsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      } catch (e) {
        if (__DEV__) console.warn('Failed to save onboarding completion state', e);
      }
      if (user) {
        router.replace('/(tabs)');
      } else {
        router.replace('/auth');
      }
    }
  };

  const colors = useColors();
  const bgColor = colors.background;
  const textColor = colors.foreground;
  const subtitleColor = colors.mutedForeground;

  const buttonLabel = currentIndex === ONBOARDING_SLIDES.length - 1 ? 'Get Started' : 'Next';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Zero-Blink Cumulative Background Dissolve Layer Stack */}
      <BackgroundLayers scrollX={scrollX} isDark={isDark} />


      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Top Header Bar with Theme Switcher */}
        <View style={styles.headerBar}>
          <View style={styles.headerRight}>
            <ThemeToggle />
          </View>
        </View>

        {/* Stationary Floating Logo (Stays fixed with persistent smooth breathing) */}
        <FloatingStationaryLogo isDark={isDark} />

        <View style={styles.content}>
          {/* Horizontal Carousel Driven on UI Thread */}
          <Animated.FlatList
            ref={flatListRef}
            data={ONBOARDING_SLIDES}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            onScrollBeginDrag={handleScrollBeginDrag}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            scrollEventThrottle={16}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            renderItem={({ item, index }) => (
              <OnboardingSlide
                slide={item}
                index={index}
                scrollX={scrollX}
                textColor={textColor}
                subtitleColor={subtitleColor}
              />
            )}
          />

          {/* Footer Controls (Continuous Page Indicator & Primary Button) */}
          <View style={styles.footer}>
            <PageIndicator
              total={ONBOARDING_SLIDES.length}
              scrollX={scrollX}
              isDark={isDark}
            />
            <View style={styles.buttonWrapper}>
              <PrimaryButton label={buttonLabel} onPress={handleNext} isDark={isDark} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerBar: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerRight: {
    alignItems: 'center',
  },
  brandingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
    zIndex: 10,
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 24,
  },
  buttonWrapper: {
    width: '100%',
  },
});


