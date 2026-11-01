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
import { Icon, type IconName } from '@/components/ui/Icon';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { DesignSystem } from '@/constants/DesignSystem';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  title?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: IconName | React.ReactNode;
  iconRight?: IconName | React.ReactNode;
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
            color: colors.primaryForeground,
            fontFamily: DesignSystem.typography.fontBold,
          },
          spinnerColor: colors.primaryForeground,
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
            color: colors.primaryForeground,
            fontFamily: DesignSystem.typography.fontBold,
          },
          spinnerColor: colors.primaryForeground,
        };
      default:
        return {
          container: { backgroundColor: colors.primary, borderWidth: 0 },
          text: { color: colors.primaryForeground, fontFamily: DesignSystem.typography.fontBold },
          spinnerColor: colors.primaryForeground,
        };
    }
  };

  // Size Specs
  const getSizeSpecs = (): { minHeight: number; paddingHorizontal: number; paddingVertical: number; fontSize: number; radius: number; iconSize: number } => {
    switch (size) {
      case 'lg':
        return {
          minHeight: 52,
          paddingHorizontal: 20,
          paddingVertical: 14,
          fontSize: DesignSystem.typography.size.subhead, // 15
          radius: DesignSystem.radius.pill,
          iconSize: 18,
        };
      case 'sm':
        return {
          minHeight: 34,
          paddingHorizontal: 12,
          paddingVertical: 6,
          fontSize: DesignSystem.typography.size.bodySm, // 12
          radius: DesignSystem.radius.pill,
          iconSize: 14,
        };
      case 'md':
      default:
        return {
          minHeight: 44,
          paddingHorizontal: 16,
          paddingVertical: 10,
          fontSize: DesignSystem.typography.size.bodyLg, // 14
          radius: DesignSystem.radius.pill,
          iconSize: 16,
        };
    }
  };

  const variantStyle = getVariantStyles();
  const sizeSpec = getSizeSpecs();

  const renderIcon = (icon: IconName | React.ReactNode) => {
    if (!icon) return null;
    if (typeof icon === 'string') {
      return (
        <Icon
          name={icon as IconName}
          size={sizeSpec.iconSize}
          color={typeof variantStyle.text.color === 'string' ? variantStyle.text.color : undefined}
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
          minHeight: sizeSpec.minHeight,
          paddingVertical: sizeSpec.paddingVertical,
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
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.3}
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
