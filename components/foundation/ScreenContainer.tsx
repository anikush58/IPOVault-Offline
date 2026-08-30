import React, { memo } from "react";
import { View, ScrollView, RefreshControl, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme";
import { spacing } from "../../theme/tokens";

export interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  edges?: Array<"top" | "right" | "bottom" | "left">;
}

export const ScreenContainer = memo<ScreenContainerProps>(({
  children,
  scrollable = false,
  refreshing = false,
  onRefresh,
  style,
  contentContainerStyle,
  edges = ["top", "left", "right"],
}) => {
  const { colors } = useTheme();

  const containerStyle = [
    styles.container,
    { backgroundColor: colors.background },
    style,
  ];

  if (scrollable) {
    return (
      <SafeAreaView edges={edges} style={containerStyle}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={containerStyle}>
      <View style={[styles.staticContent, contentContainerStyle]}>{children}</View>
    </SafeAreaView>
  );
});

ScreenContainer.displayName = "ScreenContainer";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
});
