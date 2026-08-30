import { useRef } from 'react';
import { PanResponder } from 'react-native';
import { useRouter, usePathname } from 'expo-router';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDeltaX?: number;
  maxDeltaY?: number;
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  minDeltaX = 40,
  maxDeltaY = 35,
}: SwipeGestureOptions) {
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          Math.abs(gestureState.dx) > minDeltaX &&
          Math.abs(gestureState.dy) < maxDeltaY
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -minDeltaX && onSwipeLeft) {
          onSwipeLeft();
        } else if (gestureState.dx > minDeltaX && onSwipeRight) {
          onSwipeRight();
        }
      },
    })
  ).current;

  return panResponder.panHandlers;
}

const BOTTOM_TAB_ROUTES = [
  '/(tabs)',
  '/(tabs)/applications',
  '/(tabs)/forms',
  '/(tabs)/banks',
  '/(tabs)/settings',
];

export function useBottomTabSwipe() {
  const router = useRouter();
  const pathname = usePathname();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 40 && Math.abs(gestureState.dy) < 35;
      },
      onPanResponderRelease: (_, gestureState) => {
        let currentIdx = BOTTOM_TAB_ROUTES.indexOf(pathname);
        if (currentIdx === -1) {
          if (pathname === '/' || pathname === '/(tabs)' || pathname === '/index' || pathname === '/(tabs)/index') {
            currentIdx = 0;
          } else {
            return;
          }
        }

        if (gestureState.dx < -50 && currentIdx < BOTTOM_TAB_ROUTES.length - 1) {
          router.replace(BOTTOM_TAB_ROUTES[currentIdx + 1] as any);
        } else if (gestureState.dx > 50 && currentIdx > 0) {
          router.replace(BOTTOM_TAB_ROUTES[currentIdx - 1] as any);
        }
      },
    })
  ).current;

  return panResponder.panHandlers;
}
