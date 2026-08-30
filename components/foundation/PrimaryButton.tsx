import React, { memo } from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useTheme } from "../../theme";
import { spacing, radius, typography } from "../../theme/tokens";

export interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const PrimaryButton = memo<PrimaryButtonProps>(({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const { colors } = useTheme();

  const isInteractive = !loading && !disabled;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      style={[
        styles.button,
        {
          backgroundColor: isInteractive ? colors.primary : colors.muted,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.primaryForeground} size="small" />
      ) : (
        <Text style={[styles.text, { color: isInteractive ? colors.primaryForeground : colors.mutedForeground }, textStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
});

PrimaryButton.displayName = "PrimaryButton";

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  text: {
    ...typography.Title,
    fontSize: 16,
    fontWeight: "600",
  },
});
