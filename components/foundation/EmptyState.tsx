import React, { memo } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../../theme";
import { spacing, typography } from "../../theme/tokens";
import { PrimaryButton } from "./PrimaryButton";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export const EmptyState = memo<EmptyStateProps>(({
  title,
  description,
  actionText,
  onAction,
  style,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
      )}
      {actionText && onAction && (
        <PrimaryButton title={actionText} onPress={onAction} style={styles.actionButton} />
      )}
    </View>
  );
});

EmptyState.displayName = "EmptyState";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    ...typography.Headline,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  description: {
    ...typography.Body,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  actionButton: {
    minWidth: 160,
  },
});
