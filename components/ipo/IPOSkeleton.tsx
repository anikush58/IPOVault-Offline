import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function IPOSkeletonCard() {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <View style={[styles.avatar, { backgroundColor: colors.surface }]} />
        <View style={styles.titleWrap}>
          <View style={[styles.bar, { width: '70%', height: 16, backgroundColor: colors.surface }]} />
          <View style={[styles.bar, { width: '40%', height: 12, marginTop: 8, backgroundColor: colors.surface }]} />
        </View>
      </View>

      <View style={[styles.specs, { backgroundColor: colors.surface }]}>
        <View style={[styles.bar, { width: '40%', height: 14, backgroundColor: colors.border }]} />
        <View style={[styles.bar, { width: '40%', height: 14, backgroundColor: colors.border }]} />
      </View>

      <View style={styles.footer}>
        <View style={[styles.bar, { width: 70, height: 20, borderRadius: 6, backgroundColor: colors.surface }]} />
        <View style={[styles.bar, { width: 120, height: 14, backgroundColor: colors.surface }]} />
      </View>
    </View>
  );
}

export function IPOSkeletonList() {
  return (
    <View>
      <IPOSkeletonCard />
      <IPOSkeletonCard />
      <IPOSkeletonCard />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  titleWrap: {
    flex: 1,
  },
  bar: {
    borderRadius: 4,
  },
  specs: {
    height: 42,
    borderRadius: 12,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
});
