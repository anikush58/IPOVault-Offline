import React, { memo } from "react";
import { View, StyleSheet, ViewStyle, StyleProp, TouchableOpacity } from "react-native";
import { useTheme } from "../../theme";
import { radius, shadows, spacing } from "../../theme/tokens";

export interface AppCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: "flat" | "elevated" | "bordered";
}

export const AppCard = memo<AppCardProps>(({
  children,
  onPress,
  style,
  variant = "elevated",
}) => {
  const { colors } = useTheme();

  const getStyleVariant = (): ViewStyle => {
    switch (variant) {
      case "bordered":
        return {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        };
      case "flat":
        return {
          backgroundColor: colors.cardAlt,
        };
      case "elevated":
      default:
        return {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          ...shadows.sm,
        };
    }
  };

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.card, getStyleVariant(), style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.card, getStyleVariant(), style]}>{children}</View>;
});

AppCard.displayName = "AppCard";

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
});
