import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../../theme";
import { spacing, typography } from "../../theme/tokens";

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionText?: string;
  onActionPress?: () => void;
  style?: ViewStyle;
}

export const SectionHeader = memo<SectionHeaderProps>(({
  title,
  subtitle,
  actionText,
  onActionPress,
  style,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle && <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
      {actionText && onActionPress && (
        <TouchableOpacity activeOpacity={0.7} onPress={onActionPress}>
          <Text style={[styles.action, { color: colors.primary }]}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

SectionHeader.displayName = "SectionHeader";

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.Title,
  },
  subtitle: {
    ...typography.Caption,
    marginTop: 2,
  },
  action: {
    ...typography.Body,
    fontWeight: "600",
  },
});
