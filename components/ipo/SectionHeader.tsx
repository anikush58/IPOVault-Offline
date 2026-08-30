import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
};

export function SectionHeader({ title, subtitle, rightAction }: Props) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        ) : null}
      </View>
      {rightAction ? <View>{rightAction}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  left: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
});
