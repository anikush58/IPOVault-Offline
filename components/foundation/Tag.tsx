import React, { memo } from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useTheme } from "../../theme";
import { radius, spacing, typography } from "../../theme/tokens";

export interface TagProps {
  label: string;
  variant?: "primary" | "positive" | "negative" | "neutral" | "warning";
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Tag = memo<TagProps>(({
  label,
  variant = "neutral",
  style,
  textStyle,
}) => {
  const { colors } = useTheme();

  const getVariantStyles = (): { bg: string; fg: string } => {
    switch (variant) {
      case "primary":
        return { bg: colors.primary + "1F", fg: colors.primary };
      case "positive":
        return { bg: colors.positiveBg, fg: colors.positive };
      case "negative":
        return { bg: colors.negativeBg, fg: colors.negative };
      case "warning":
        return { bg: colors.primaryLight + "29", fg: colors.primaryLight };
      case "neutral":
      default:
        return { bg: colors.muted, fg: colors.foreground };
    }
  };

  const { bg, fg } = getVariantStyles();

  return (
    <View style={[styles.tag, { backgroundColor: bg }, style]}>
      <Text style={[styles.label, { color: fg }, textStyle]}>{label}</Text>
    </View>
  );
});

Tag.displayName = "Tag";

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
    alignSelf: "flex-start",
  },
  label: {
    ...typography.Label,
  },
});
