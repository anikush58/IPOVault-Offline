import React from 'react';
import {
  Pressable,
  StyleSheet,
  ViewStyle,
  PressableStateCallbackType,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { DesignSystem } from '@/constants/DesignSystem';

export type IconButtonVariant = 'surface' | 'primary' | 'ghost' | 'destructive';
export type IconButtonSize = 'lg' | 'md' | 'sm';

export interface IconButtonProps {
  name: keyof typeof Feather.glyphMap;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  iconSize?: number;
  color?: string;
  round?: boolean;
  disabled?: boolean;
  haptic?: boolean;
  style?: ViewStyle | ((state: PressableStateCallbackType) => ViewStyle);
  onPress?: () => void;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  testID?: string;
}

export function IconButton({
  name,
  variant = 'surface',
  size = 'md',
  iconSize: customIconSize,
  color: customColor,
  round = true,
  disabled = false,
  haptic = true,
  style,
  onPress,
  hitSlop = 6,
  testID,
}: IconButtonProps) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const handlePress = () => {
    if (disabled) return;
    if (haptic) {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress?.();
  };

  const getSpecs = (): { dimension: number; iconSize: number; radius: number; bg: string; border: string; iconColor: string } => {
    let dimension = 44;
    let iconSize = customIconSize ?? (name === 'x' ? 15 : 18);

    if (size === 'lg') {
      dimension = 50;
      iconSize = customIconSize ?? (name === 'x' ? 18 : 22);
    } else if (size === 'sm') {
      dimension = 36;
      iconSize = customIconSize ?? (name === 'x' ? 14 : 16);
    }

    let radius: number = round ? dimension / 2 : DesignSystem.radius.sm;

    let bg = colors.card;
    let border = colors.border;
    let iconColor = colors.foreground;

    if (name === 'x' && (variant === 'primary' || variant === 'surface')) {
      iconSize = customIconSize ?? (size === 'lg' ? 16 : size === 'sm' ? 12 : 13);
      bg = isDark ? '#FFFFFF' : '#0F172A';
      border = 'transparent';
      iconColor = isDark ? '#0F172A' : '#FFFFFF';
    } else if (variant === 'primary') {
      bg = colors.primary + '18';
      border = colors.primary;
      iconColor = colors.primary;
    } else if (variant === 'ghost') {
      bg = 'transparent';
      border = 'transparent';
      iconColor = colors.foreground;
    } else if (variant === 'destructive') {
      bg = colors.destructiveBg;
      border = colors.destructive;
      iconColor = colors.destructive;
    }

    if (customColor) {
      iconColor = customColor;
    }

    return { dimension, iconSize, radius, bg, border, iconColor };
  };

  const specs = getSpecs();

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={(state) => [
        styles.base,
        {
          width: specs.dimension,
          height: specs.dimension,
          borderRadius: specs.radius,
          backgroundColor: specs.bg,
          borderColor: specs.border,
          borderWidth: variant === 'ghost' ? 0 : 1,
          opacity: disabled ? 0.45 : state.pressed ? 0.78 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <Feather name={name} size={specs.iconSize} color={specs.iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
