import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function WatchlistSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.container}>
        {[1, 2, 3, 4].map((item) => (
          <View
            key={item}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.topRow}>
              <ShimmerBlock width={42} height={42} borderRadius={12} />
              <View style={{ flex: 1, gap: 5 }}>
                <ShimmerBlock width="65%" height={16} borderRadius={4} />
                <ShimmerBlock width="40%" height={12} borderRadius={4} />
              </View>
              <ShimmerBlock width={24} height={24} borderRadius={12} />
            </View>

            <View style={[styles.bottomRow, { backgroundColor: colors.surface }]}>
              <ShimmerBlock width="35%" height={14} borderRadius={4} />
              <ShimmerBlock width="35%" height={14} borderRadius={4} />
            </View>
          </View>
        ))}
      </View>
    </ShimmerGroup>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
});
