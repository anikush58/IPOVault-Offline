import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  isBest?: boolean;
  children: React.ReactNode;
};

export const DifferenceHighlight = React.memo(function DifferenceHighlight({ isBest, children }: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  if (!isBest) {
    return <View style={styles.container}>{children}</View>;
  }

  // Subtle gold styling - never loud or bright
  const goldBg = isDark ? 'rgba(217, 119, 6, 0.16)' : 'rgba(254, 243, 199, 0.75)';
  const goldBorder = isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.5)';

  return (
    <View
      style={[
        styles.container,
        styles.highlighted,
        { backgroundColor: goldBg, borderColor: goldBorder },
      ]}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
    borderRadius: 8,
  },
  highlighted: {
    borderWidth: 1,
  },
});
