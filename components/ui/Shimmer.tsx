import React, { createContext, useContext, useEffect, useRef } from 'react';
import {
  Animated,
  DimensionValue,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

interface ShimmerContextType {
  opacity: Animated.Value;
}

const ShimmerContext = createContext<ShimmerContextType | null>(null);

export interface ShimmerGroupProps {
  children: React.ReactNode;
  duration?: number;
  minOpacity?: number;
  maxOpacity?: number;
}

/**
 * ShimmerGroup synchronizes the pulsing shimmer opacity animation
 * across all child ShimmerBlock components.
 */
export function ShimmerGroup({
  children,
  duration = 850,
  minOpacity = 0.38,
  maxOpacity = 0.85,
}: ShimmerGroupProps) {
  const opacity = useRef(new Animated.Value(minOpacity)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: maxOpacity,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: minOpacity,
          duration,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, duration, minOpacity, maxOpacity]);

  return (
    <ShimmerContext.Provider value={{ opacity }}>
      {children}
    </ShimmerContext.Provider>
  );
}

export function useShimmerOpacity() {
  const context = useContext(ShimmerContext);
  const localOpacity = useRef(new Animated.Value(0.38)).current;

  useEffect(() => {
    if (context) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(localOpacity, {
          toValue: 0.85,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(localOpacity, {
          toValue: 0.38,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [context, localOpacity]);

  return context ? context.opacity : localOpacity;
}

export interface ShimmerBlockProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  color?: string;
}

/**
 * Atomic ShimmerBlock placeholder for rendering polished skeleton states.
 */
export function ShimmerBlock({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style,
  color,
}: ShimmerBlockProps) {
  const colors = useColors();
  const opacity = useShimmerOpacity();

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: color || colors.surface,
          opacity,
        },
        style,
      ]}
    />
  );
}
