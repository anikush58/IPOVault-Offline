import React, { memo } from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useTheme } from "../../theme";
import { spacing, radius, typography } from "../../theme/tokens";

export interface SecondaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const SecondaryButton = memo<SecondaryButtonProps>(({
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
      activeOpacity={0.7}
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      style={[
        styles.button,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.foreground} size="small" />
      ) : (
        <Text style={[styles.text, { color: isInteractive ? colors.foreground : colors.mutedForeground }, textStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
});

SecondaryButton.displayName = "SecondaryButton";

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
