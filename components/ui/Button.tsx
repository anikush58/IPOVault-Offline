import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
  PressableStateCallbackType,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { DesignSystem } from '@/constants/DesignSystem';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  title?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: keyof typeof Feather.glyphMap | React.ReactNode;
  iconRight?: keyof typeof Feather.glyphMap | React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  style?: ViewStyle | ((state: PressableStateCallbackType) => ViewStyle);
  textStyle?: TextStyle;
  onPress?: () => void;
  testID?: string;
}

export function Button({
  title,
  children,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = true,
  style,
  textStyle,
  onPress,
  testID,
}: ButtonProps) {
  const colors = useColors();

  const handlePress = () => {
    if (disabled || loading) return;
    if (haptic) {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress?.();
  };

  // Variant Styles
  const getVariantStyles = (): { container: ViewStyle; text: TextStyle; spinnerColor: string } => {
    switch (variant) {
      case 'primary':
        return {
          container: {
            backgroundColor: colors.primary,
            borderWidth: 0,
          },
          text: {
            color: '#FFFFFF',
            fontFamily: DesignSystem.typography.fontBold,
          },
          spinnerColor: '#FFFFFF',
        };
      case 'secondary':
        return {
          container: {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
          },
          text: {
            color: colors.foreground,
            fontFamily: DesignSystem.typography.fontSemiBold,
          },
          spinnerColor: colors.foreground,
        };
      case 'outline':
        return {
          container: {
            backgroundColor: 'transparent',
            borderColor: colors.border,
            borderWidth: 1,
          },
          text: {
            color: colors.foreground,
            fontFamily: DesignSystem.typography.fontSemiBold,
          },
          spinnerColor: colors.foreground,
        };
      case 'ghost':
        return {
          container: {
            backgroundColor: 'transparent',
            borderWidth: 0,
          },
          text: {
            color: colors.foreground,
            fontFamily: DesignSystem.typography.fontSemiBold,
          },
          spinnerColor: colors.foreground,
        };
      case 'destructive':
        return {
          container: {
            backgroundColor: colors.destructive,
            borderWidth: 0,
          },
          text: {
            color: colors.destructiveForeground || '#FFFFFF',
            fontFamily: DesignSystem.typography.fontBold,
          },
          spinnerColor: colors.destructiveForeground || '#FFFFFF',
        };
      case 'success':
        return {
          container: {
            backgroundColor: colors.positive,
            borderWidth: 0,
          },
          text: {
            color: '#FFFFFF',
            fontFamily: DesignSystem.typography.fontBold,
          },
          spinnerColor: '#FFFFFF',
        };
      default:
        return {
          container: { backgroundColor: colors.primary },
          text: { color: '#FFFFFF', fontFamily: DesignSystem.typography.fontBold },
          spinnerColor: '#FFFFFF',
        };
    }
  };

  // Size Specs
  const getSizeSpecs = (): { height: number; paddingHorizontal: number; fontSize: number; radius: number; iconSize: number } => {
    switch (size) {
      case 'lg':
        return {
          height: 54,
          paddingHorizontal: 20,
          fontSize: DesignSystem.typography.size.subhead, // 15
          radius: DesignSystem.radius.md, // 14
          iconSize: 18,
        };
      case 'sm':
        return {
          height: 36,
          paddingHorizontal: 12,
          fontSize: DesignSystem.typography.size.bodySm, // 12
          radius: DesignSystem.radius.sm, // 10
          iconSize: 14,
        };
      case 'md':
      default:
        return {
          height: 46,
          paddingHorizontal: 16,
          fontSize: DesignSystem.typography.size.bodyLg, // 14
          radius: DesignSystem.radius.md, // 14
          iconSize: 16,
        };
    }
  };

  const variantStyle = getVariantStyles();
  const sizeSpec = getSizeSpecs();

  const renderIcon = (icon: keyof typeof Feather.glyphMap | React.ReactNode) => {
    if (!icon) return null;
    if (typeof icon === 'string') {
      return (
        <Feather
          name={icon as keyof typeof Feather.glyphMap}
          size={sizeSpec.iconSize}
          color={variantStyle.text.color}
        />
      );
    }
    return icon;
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        variantStyle.container,
        {
          height: sizeSpec.height,
          paddingHorizontal: sizeSpec.paddingHorizontal,
          borderRadius: sizeSpec.radius,
          width: fullWidth ? '100%' : undefined,
          opacity: disabled ? 0.45 : state.pressed ? 0.82 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyle.spinnerColor} />
      ) : (
        <View style={styles.contentRow}>
          {renderIcon(iconLeft)}
          {title ? (
            <Text
              style={[
                styles.textBase,
                variantStyle.text,
                { fontSize: sizeSpec.fontSize },
                textStyle,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : (
            children
          )}
          {renderIcon(iconRight)}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  textBase: {
    textAlign: 'center',
  },
});
