import React, { memo } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../../theme";
import { radius, typography } from "../../theme/tokens";

export interface BadgeProps {
  count?: number;
  dot?: boolean;
  style?: ViewStyle;
}

export const Badge = memo<BadgeProps>(({ count, dot = false, style }) => {
  const { colors } = useTheme();

  if (dot) {
    return <View style={[styles.dot, { backgroundColor: colors.primary }, style]} />;
  }

  if (count === undefined || count <= 0) return null;

  const displayCount = count > 99 ? "99+" : String(count);

  return (
    <View style={[styles.badge, { backgroundColor: colors.destructive }, style]}>
      <Text style={[styles.text, { color: colors.destructiveForeground }]}>{displayCount}</Text>
    </View>
  );
});

Badge.displayName = "Badge";

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  text: {
    ...typography.Label,
    fontSize: 10,
    fontWeight: "700",
  },
});
