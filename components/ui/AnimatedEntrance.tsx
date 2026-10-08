import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

export interface AnimatedEntranceProps {
  children?: React.ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  scale?: number;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedEntrance({
  children,
  delay = 0,
  duration = 320,
  distance = 14,
  direction = 'up',
  scale = 1,
  style,
}: AnimatedEntranceProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(distance)).current;
  const scaleAnim = useRef(new Animated.Value(scale < 1 ? scale : 1)).current;

  useEffect(() => {
    let isMounted = true;
    const timeout = setTimeout(() => {
      if (!isMounted) return;

      const animations: Animated.CompositeAnimation[] = [
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateAnim, {
          toValue: 0,
          friction: 8,
          tension: 45,
          useNativeDriver: true,
        }),
      ];

      if (scale < 1) {
        animations.push(
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 7,
            tension: 50,
            useNativeDriver: true,
          })
        );
      }

      Animated.parallel(animations).start();
    }, Math.max(0, delay));

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [delay, duration, distance, scale, opacityAnim, translateAnim, scaleAnim]);

  const transformStyle = [];

  if (direction === 'up') {
    transformStyle.push({ translateY: translateAnim });
  } else if (direction === 'down') {
    transformStyle.push({
      translateY: translateAnim.interpolate({
        inputRange: [0, distance],
        outputRange: [0, -distance],
      }),
    });
  } else if (direction === 'left') {
    transformStyle.push({ translateX: translateAnim });
  } else if (direction === 'right') {
    transformStyle.push({
      translateX: translateAnim.interpolate({
        inputRange: [0, distance],
        outputRange: [0, -distance],
      }),
    });
  }

  if (scale < 1) {
    transformStyle.push({ scale: scaleAnim });
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: opacityAnim,
          transform: transformStyle,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Convenience component for staggered list/card items.
 */
export function StaggerItem({
  index = 0,
  baseDelay = 40,
  staggerMs = 50,
  children,
  style,
  distance = 12,
  scale,
}: {
  index?: number;
  baseDelay?: number;
  staggerMs?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  distance?: number;
  scale?: number;
}) {
  return (
    <AnimatedEntrance
      delay={baseDelay + Math.min(index, 10) * staggerMs}
      distance={distance}
      scale={scale}
      style={style}
    >
      {children}
    </AnimatedEntrance>
  );
}
