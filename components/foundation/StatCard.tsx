import React, { memo } from "react";
import { Text, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { useTheme } from "../../theme";
import { spacing, typography } from "../../theme/tokens";
import { AppCard } from "./AppCard";

export interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  style?: StyleProp<ViewStyle>;
}

export const StatCard = memo<StatCardProps>(({
  label,
  value,
  subValue,
  trend,
  style,
}) => {
  const { colors } = useTheme();

  const getTrendColor = () => {
    if (trend === "up") return colors.positive;
    if (trend === "down") return colors.negative;
    return colors.mutedForeground;
  };

  return (
    <AppCard style={[styles.card, style]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      {subValue && (
        <Text style={[styles.subValue, { color: getTrendColor() }]}>{subValue}</Text>
      )}
    </AppCard>
  );
});

StatCard.displayName = "StatCard";

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    flex: 1,
  },
  label: {
    ...typography.Caption,
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.Headline,
    fontSize: 22,
  },
  subValue: {
    ...typography.Caption,
    fontWeight: "600",
    marginTop: 2,
  },
});
