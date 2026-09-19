import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useTheme } from '@/context/ThemeContext';

interface AnimatedSplashScreenProps {
  onAnimationComplete?: () => void;
  isReady: boolean;
}

export function AnimatedSplashScreen({ onAnimationComplete, isReady }: AnimatedSplashScreenProps) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const [isDismissed, setIsDismissed] = useState(false);
  const [canCaptureTouch, setCanCaptureTouch] = useState(true);
  const isFadingRef = useRef(false);
  const splashOpacity = useSharedValue(1);

  const finishSplash = (duration = 250) => {
    if (isFadingRef.current) return;
    isFadingRef.current = true;

    // Release touch events immediately so underlying app receives interactions
    setCanCaptureTouch(false);
    SplashScreen.hideAsync().catch(() => {});

    const complete = () => {
      setIsDismissed(true);
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    };

    splashOpacity.value = withTiming(
      0,
      { duration, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) {
          runOnJS(complete)();
        }
      }
    );

    // Guaranteed fallback timer
    setTimeout(complete, duration + 60);
  };

  // Hide the native OS splash as soon as React component mounts
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Show for 1.5 seconds and then automatically advance to the app
  useEffect(() => {
    const timer = setTimeout(() => {
      finishSplash(250);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  if (isDismissed) {
    return null;
  }

  const splashSource = isDark
    ? require('@/assets/images/splash-dark.png')
    : require('@/assets/images/splash-light.png');

  return (
    <View
      pointerEvents={canCaptureTouch ? 'auto' : 'none'}
      style={StyleSheet.absoluteFill}
    >
      <Pressable
        onPress={() => finishSplash(150)}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          style={[
            styles.container,
            { backgroundColor: isDark ? '#090A0C' : '#FAFAFC' },
            containerAnimatedStyle,
          ]}
        >
          <Image
            source={splashSource}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            priority="high"
          />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
});


