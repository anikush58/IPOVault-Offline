import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Image,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
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
import defaultColors from '@/constants/colors';
import { OnboardingSlide } from '@/components/onboarding/OnboardingSlide';
import { PageIndicator } from '@/components/onboarding/PageIndicator';
import { PrimaryButton } from '@/components/onboarding/PrimaryButton';
import { AutoStatusBar } from '@/components/ui/AutoStatusBar';

import { useAuth } from '@/context/AuthContext';
import * as SplashScreen from 'expo-splash-screen';

const BG_IMAGES = [
  require('@/assets/images/onboarding-bg-1.png'),
  require('@/assets/images/onboarding-bg-2.png'),
  require('@/assets/images/onboarding-bg-3.png'),
];

function BackgroundLayers({
  scrollX,
  windowWidth,
}: {
  scrollX: SharedValue<number>;
  windowWidth: number;
}) {
  const layer1Style = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [0, windowWidth],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const layer2Style = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [windowWidth, 2 * windowWidth],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Base Layer 0: Always 100% opaque underneath to prevent background bleed/blink */}
      <Image source={BG_IMAGES[0]} style={StyleSheet.absoluteFillObject} resizeMode="cover" />

      {/* Layer 1: Dissolves seamlessly over Layer 0 */}
      <Animated.View style={[StyleSheet.absoluteFillObject, layer1Style]}>
        <Image source={BG_IMAGES[1]} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      </Animated.View>

      {/* Layer 2: Dissolves seamlessly over Layer 1 */}
      <Animated.View style={[StyleSheet.absoluteFillObject, layer2Style]}>
        <Image source={BG_IMAGES[2]} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      </Animated.View>
    </View>
  );
}

const FloatingStationaryLogo = React.memo(function FloatingStationaryLogo({
  isSmallScreen,
}: {
  isSmallScreen: boolean;
}) {
  const translateY = useSharedValue(0);

  React.useEffect(() => {
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

  const logoSource = require('@/assets/images/onboarding-brand-logo.png');
  const logoSize = isSmallScreen ? 96 : 120;
  const logoRadius = isSmallScreen ? 22 : 28;

  return (
    <Animated.View
      style={[
        styles.brandingContainer,
        {
          marginTop: isSmallScreen ? 0 : 4,
          marginBottom: isSmallScreen ? 4 : 8,
        },
        animStyle,
      ]}
    >
      <Image
        source={logoSource}
        style={[
          styles.logoImage,
          {
            width: logoSize,
            height: logoSize,
            borderRadius: logoRadius,
          },
        ]}
        resizeMode="cover"
      />
    </Animated.View>
  );
});

export function OnboardingScreenView() {
  const router = useRouter();
  const { user } = useAuth();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isSmallScreen = windowHeight < 720;
  const isNarrow = windowWidth < 360;

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;

  const scrollX = useSharedValue(0);
  const flatListRef = useRef<FlatList>(null);

  React.useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / windowWidth);
    if (index >= 0 && index < ONBOARDING_SLIDES.length && index !== currentIndexRef.current) {
      setCurrentIndex(index);
      currentIndexRef.current = index;
    }
  };

  const handleFinish = async () => {
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
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleContinue = () => {
    if (currentIndex < ONBOARDING_SLIDES.length - 1) {
      const nextIndex = currentIndex + 1;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * windowWidth,
        animated: true,
      });
    }
  };

  const handleGetStarted = () => {
    handleFinish();
  };

  const colors = defaultColors.light;
  const isDark = false;
  const bgColor = '#F9FBFE';
  const textColor = colors.foreground;
  const subtitleColor = colors.mutedForeground;

  const isLastSlide = currentIndex === ONBOARDING_SLIDES.length - 1;
  const buttonHeight = isSmallScreen ? 50 : 56;

  // Pure Opacity Cross-Fade without any translateY/position displacement
  const twoButtonsAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(ONBOARDING_SLIDES.length - 2) * windowWidth, (ONBOARDING_SLIDES.length - 1) * windowWidth],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const singleButtonAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(ONBOARDING_SLIDES.length - 2) * windowWidth, (ONBOARDING_SLIDES.length - 1) * windowWidth],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Auto-adjusting Status Bar: Automatically detects light background and applies dark content */}
      <AutoStatusBar backgroundColor={bgColor} />

      {/* Zero-Blink Cumulative Background Dissolve Layer Stack */}
      <BackgroundLayers scrollX={scrollX} windowWidth={windowWidth} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Top Header Bar */}
        <View style={styles.headerBar} />

        {/* Stationary Floating Logo (Stays fixed with persistent smooth breathing) */}
        <FloatingStationaryLogo isSmallScreen={isSmallScreen} />

        <View style={styles.content}>
          {/* Horizontal Carousel Driven on UI Thread (manual swiping only) */}
          <Animated.FlatList
            ref={flatListRef}
            data={ONBOARDING_SLIDES}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            onMomentumScrollEnd={handleScrollEnd}
            onScrollEndDrag={handleScrollEnd}
            scrollEventThrottle={16}
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            renderItem={({ item, index }) => (
              <OnboardingSlide
                slide={item}
                index={index}
                scrollX={scrollX}
                textColor={textColor}
                subtitleColor={subtitleColor}
                windowWidth={windowWidth}
                windowHeight={windowHeight}
              />
            )}
          />

          {/* Footer Controls (Screen Indicator in theme & Dynamic CTA Buttons) */}
          <View
            style={[
              styles.footer,
              {
                paddingHorizontal: isNarrow ? 16 : 24,
                paddingTop: isSmallScreen ? 10 : 16,
                paddingBottom: isSmallScreen ? 14 : 20,
                gap: isSmallScreen ? 16 : 24,
              },
            ]}
          >
            <PageIndicator
              total={ONBOARDING_SLIDES.length}
              scrollX={scrollX}
              activeColor={colors.primary}
              isDark={isDark}
              windowWidth={windowWidth}
              onSelectIndex={(index) => {
                flatListRef.current?.scrollToOffset({
                  offset: index * windowWidth,
                  animated: true,
                });
                currentIndexRef.current = index;
                setCurrentIndex(index);
              }}
            />

            {/* CTA Buttons: Exactly identical container and positioning across all screens with smooth cross-fade */}
            <View style={[styles.buttonWrapper, { height: buttonHeight }]}>
              {/* Screens 1 & 2 CTA: Skip & Continue side by side */}
              <Animated.View
                style={[styles.ctaLayer, { height: buttonHeight }, twoButtonsAnimStyle]}
                pointerEvents={!isLastSlide ? 'auto' : 'none'}
              >
                <View style={[styles.ctaRow, { height: buttonHeight, gap: isNarrow ? 8 : 12 }]}>
                  <PrimaryButton
                    label="Skip"
                    variant="outline"
                    isDark={isDark}
                    strokeOpacity={0.5}
                    onPress={handleSkip}
                    style={[styles.halfButton, { height: buttonHeight }]}
                  />
                  <PrimaryButton
                    label="Continue"
                    variant="primary"
                    isDark={isDark}
                    onPress={handleContinue}
                    style={[styles.halfButton, { height: buttonHeight }]}
                  />
                </View>
              </Animated.View>

              {/* Screen 3 CTA: Full-width Let's Get Started in the exact same ctaRow container */}
              <Animated.View
                style={[styles.ctaLayer, { height: buttonHeight }, singleButtonAnimStyle]}
                pointerEvents={isLastSlide ? 'auto' : 'none'}
              >
                <View style={[styles.ctaRow, { height: buttonHeight }]}>
                  <PrimaryButton
                    label="Let’s Get Started"
                    variant="primary"
                    isDark={isDark}
                    onPress={handleGetStarted}
                    style={[styles.fullButton, { height: buttonHeight }]}
                  />
                </View>
              </Animated.View>
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
  brandingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
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
    height: 56,
    position: 'relative',
  },
  ctaLayer: {
    ...StyleSheet.absoluteFillObject,
    height: 56,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    height: 56,
  },
  halfButton: {
    flex: 1,
    height: 56,
  },
  fullButton: {
    flex: 1,
    height: 56,
  },
});
