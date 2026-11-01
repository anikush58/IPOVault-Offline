import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar, setStatusBarStyle } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { isLightBackground, getStatusBarStyleForColor } from '@/utils/colorUtils';

export { isLightBackground, getStatusBarStyleForColor };

export interface AutoStatusBarProps {
  /**
   * The background color of the screen or area behind the status bar.
   * Can be hex (#RRGGBB, #RGB), rgb/rgba, or color name.
   * Default is '#F9FBFE' (standard canvas background for auth/onboarding).
   */
  backgroundColor?: string;
  /**
   * Optional manual override ('light' | 'dark' | 'auto').
   */
  style?: 'light' | 'dark' | 'auto';
  /**
   * Whether to animate status bar transitions. Defaults to true.
   */
  animated?: boolean;
}

/**
 * Automatically adjusts the status bar style (dark vs light icons/text)
 * based on the provided background color so the status bar is always clearly visible.
 *
 * - Light background -> 'dark' status bar content (black clock/battery/wifi)
 * - Dark background  -> 'light' status bar content (white clock/battery/wifi)
 * - Transparent & translucent for edge-to-edge layout on Android
 * - Reacts cleanly to navigation focus transitions
 */
export function AutoStatusBar({
  backgroundColor = '#F9FBFE',
  style: overrideStyle,
  animated = true,
}: AutoStatusBarProps) {
  const isFocused = useIsFocused();

  // If manual style is specified and not 'auto', use it; otherwise compute from background color
  const computedStyle: 'light' | 'dark' =
    overrideStyle && overrideStyle !== 'auto'
      ? overrideStyle
      : getStatusBarStyleForColor(backgroundColor);

  useEffect(() => {
    if (isFocused && Platform.OS !== 'web') {
      try {
        setStatusBarStyle(computedStyle, animated);
      } catch {}
    }
  }, [isFocused, computedStyle, animated]);

  if (!isFocused) {
    return null;
  }

  return (
    <StatusBar
      style={computedStyle}
      backgroundColor="transparent"
      translucent
      animated={animated}
    />
  );
}
