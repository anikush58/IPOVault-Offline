import React, { memo } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../../theme";
import { spacing, typography } from "../../theme/tokens";
import { PrimaryButton } from "./PrimaryButton";

export interface ErrorViewProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export const ErrorView = memo<ErrorViewProps>(({
  title = "Something went wrong",
  message = "Failed to load data. Please try again.",
  onRetry,
  style,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.title, { color: colors.destructive }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
      {onRetry && (
        <PrimaryButton title="Retry" onPress={onRetry} style={styles.retryButton} />
      )}
    </View>
  );
});

ErrorView.displayName = "ErrorView";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    ...typography.Title,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  message: {
    ...typography.Body,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  retryButton: {
    minWidth: 140,
  },
});
