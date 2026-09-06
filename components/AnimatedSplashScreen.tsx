import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface AnimatedSplashScreenProps {
  onAnimationComplete?: () => void;
  isReady: boolean;
}

export function AnimatedSplashScreen({ onAnimationComplete, isReady }: AnimatedSplashScreenProps) {
  const [pointerEvents, setPointerEvents] = React.useState<'auto' | 'none'>('auto');
  const isFadingRef = React.useRef(false);

  const logoScale = useSharedValue(0.7);
  const logoOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(20);
  const progressWidth = useSharedValue(0);
  const splashOpacity = useSharedValue(1);
  const splashScale = useSharedValue(1);
  const glowPulse = useSharedValue(0.4);

  const finishSplash = (duration = 350) => {
    if (isFadingRef.current) return;
    isFadingRef.current = true;
    setPointerEvents('none');

    progressWidth.value = 1;
    splashOpacity.value = withTiming(0, { duration, easing: Easing.inOut(Easing.ease) });
    splashScale.value = withTiming(1.03, { duration });

    setTimeout(() => {
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    }, duration + 50);
  };

  useEffect(() => {
    // Entrance animations
    logoScale.value = withSpring(1, { damping: 12, stiffness: 100 });
    logoOpacity.value = withTiming(1, { duration: 500 });

    textOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
    textTranslateY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) });

    // Progress bar animation: smoothly fill over 2000ms
    progressWidth.value = withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) });

    // Ambient glow pulse
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1000 }),
        withTiming(0.4, { duration: 1000 })
      ),
      -1,
      true
    );

    // Auto-advance after 2.2 seconds
    const splashTimer = setTimeout(() => {
      finishSplash(350);
    }, 2200);

    return () => clearTimeout(splashTimer);
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowPulse.value,
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
    transform: [{ scale: splashScale.value }],
  }));

  const handleDismiss = () => {
    finishSplash(250);
  };

  return (
    <Pressable onPress={handleDismiss} pointerEvents={pointerEvents} style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents={pointerEvents} style={[styles.container, containerAnimatedStyle]}>
        {/* Light Gradient Background */}
        <LinearGradient
          colors={['#FFFFFF', '#FAFAFC', '#F1F5F9']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />

      {/* Soft Ambient Radial Light Glow */}
      <Animated.View style={[styles.glowCircle, glowAnimatedStyle]} />

      {/* Decorative Accent Circles */}
      <View style={styles.gridLinesContainer}>
        <View style={styles.accentCircleTop} />
        <View style={styles.accentCircleBottom} />
      </View>

      {/* Main Brand Content */}
      <View style={styles.content}>
        {/* Animated Vault Logo Card */}
        <Animated.View style={[styles.logoCardWrapper, logoAnimatedStyle]}>
          <LinearGradient
            colors={['#FFFFFF', '#F8FAFC']}
            style={styles.logoCard}
          >
            <Image
              source={require('@/assets/images/splash-icon.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
          </LinearGradient>
        </Animated.View>

        {/* Brand Name & Tagline */}
        <Animated.View style={[styles.textContainer, textAnimatedStyle]}>
          <Text style={styles.brandTitle}>IPOVault</Text>
          
          <View style={styles.taglineBadge}>
            <Feather name="trending-up" size={14} color="#10B981" style={{ marginRight: 6 }} />
            <Text style={styles.taglineText}>YOUR IPO PORTFOLIO VAULT</Text>
          </View>
        </Animated.View>
      </View>

      {/* Progress Track & Security Badge */}
      <View style={styles.footer}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, progressAnimatedStyle]}>
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </View>

        <Text style={styles.securityText}>
          <Feather name="shield" size={11} color="#94A3B8" /> Secure Offline Finance Engine
        </Text>
      </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAFAFC',
  },
  glowCircle: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: (width * 1.2) / 2,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    top: height * 0.2,
    alignSelf: 'center',
  },
  gridLinesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  accentCircleTop: {
    position: 'absolute',
    top: -height * 0.15,
    right: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: (width * 0.8) / 2,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
  accentCircleBottom: {
    position: 'absolute',
    bottom: -height * 0.1,
    left: -width * 0.2,
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: (width * 0.9) / 2,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.4)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoCardWrapper: {
    marginBottom: 28,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  logoCard: {
    width: 140,
    height: 140,
    borderRadius: 36,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
  },
  brandTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 34,
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  taglineText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 11,
    color: '#334155',
    letterSpacing: 1.2,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 48,
    paddingHorizontal: 40,
  },
  progressTrack: {
    width: 160,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  securityText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12,
    color: '#94A3B8',
    letterSpacing: 0.2,
  },
});
