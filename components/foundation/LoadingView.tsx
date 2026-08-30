import React, { memo } from "react";
import { View, ActivityIndicator, Text, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../../theme";
import { spacing, typography } from "../../theme/tokens";

export interface LoadingViewProps {
  message?: string;
  style?: ViewStyle;
}

export const LoadingView = memo<LoadingViewProps>(({ message = "Loading...", style }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
      ) : null}
    </View>
  );
});

LoadingView.displayName = "LoadingView";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  message: {
    ...typography.Body,
    marginTop: spacing.md,
  },
});
