import React, { memo } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../../theme";
import { spacing } from "../../theme/tokens";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  style?: ViewStyle;
}

export const Divider = memo<DividerProps>(({ orientation = "horizontal", style }) => {
  const { colors } = useTheme();

  return (
    <View
      style={[
        orientation === "horizontal" ? styles.horizontal : styles.vertical,
        { backgroundColor: colors.border },
        style,
      ]}
    />
  );
});

Divider.displayName = "Divider";

const styles = StyleSheet.create({
  horizontal: {
    height: 1,
    width: "100%",
    marginVertical: spacing.sm,
  },
  vertical: {
    width: 1,
    height: "100%",
    marginHorizontal: spacing.sm,
  },
});
