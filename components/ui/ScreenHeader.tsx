import React, { ReactNode } from 'react';
import {
  Animated,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';

export interface ScreenHeaderProps {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  centerTitle?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  children?: ReactNode;
  height?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scrollY?: Animated.Value;
  blurOpacity?: Animated.AnimatedInterpolation<number> | Animated.Value | number;
  transparent?: boolean;
}

export function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  centerTitle = false,
  showBack = false,
  onBack,
  leftElement,
  rightElement,
  children,
  height,
  style,
  contentStyle,
  scrollY,
  blurOpacity,
  transparent = false,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const barHeight = height ?? topPad + 60;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  const computedBlurOpacity =
    blurOpacity !== undefined
      ? blurOpacity
      : scrollY !== undefined
      ? scrollY.interpolate({
          inputRange: [0, 24],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        })
      : 1;

  return (
    <View
      style={[
        styles.container,
        { height: barHeight, backgroundColor: 'transparent' },
        style,
      ]}
      pointerEvents="box-none"
    >
      {!transparent && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: computedBlurOpacity }]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 90 : 75}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={
              isDark
                ? ['rgba(9, 10, 15, 0.96)', 'rgba(9, 10, 15, 0.88)', 'rgba(9, 10, 15, 0.35)']
                : ['rgba(248, 249, 250, 0.96)', 'rgba(248, 249, 250, 0.88)', 'rgba(248, 249, 250, 0.35)']
            }
            locations={[0, 0.75, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {children ? (
        <View style={[{ paddingTop: topPad, flex: 1 }, contentStyle]} pointerEvents="box-none">
          {children}
        </View>
      ) : (
        <View
          style={[
            styles.contentRow,
            {
              paddingTop: topPad,
            },
            contentStyle,
          ]}
        >
          {/* Left Action / Back */}
          {leftElement ? (
            leftElement
          ) : showBack ? (
            <IconButton
              name="chevron-left"
              variant="surface"
              size="md"
              onPress={handleBack}
            />
          ) : null}

          {/* Title Area */}
          {(title || eyebrow || subtitle) && (
            <View
              style={[
                styles.titleArea,
                centerTitle && styles.titleAreaCentered,
                !leftElement && !showBack && { paddingLeft: 4 },
              ]}
            >
              {eyebrow && (
                <Text style={[styles.eyebrow, { color: colors.primary }]}>
                  {eyebrow}
                </Text>
              )}
              {title && (
                <Text
                  style={[
                    styles.title,
                    centerTitle && { textAlign: 'center' },
                    { color: colors.foreground },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {title}
                </Text>
              )}
              {subtitle && (
                <Text
                  style={[
                    styles.subtitle,
                    centerTitle && { textAlign: 'center' },
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {subtitle}
                </Text>
              )}
            </View>
          )}

          {/* Right Action */}
          {rightElement ? (
            rightElement
          ) : showBack && centerTitle ? (
            <View style={{ width: 40 }} />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 12,
  },
  titleArea: {
    flex: 1,
    justifyContent: 'center',
  },
  titleAreaCentered: {
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
});
