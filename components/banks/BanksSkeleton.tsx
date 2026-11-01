import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function BanksSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.container}>
        {/* Bank Overview Card Skeleton */}
        <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.overviewTop}>
            <View style={{ gap: 6 }}>
              <ShimmerBlock width={110} height={12} borderRadius={4} />
              <ShimmerBlock width={150} height={26} borderRadius={6} />
            </View>
            <ShimmerBlock width={75} height={26} borderRadius={13} />
          </View>

          <View style={[styles.overviewGrid, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <ShimmerBlock width={60} height={10} borderRadius={3} />
              <ShimmerBlock width={80} height={16} borderRadius={4} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <ShimmerBlock width={60} height={10} borderRadius={3} />
              <ShimmerBlock width={80} height={16} borderRadius={4} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <ShimmerBlock width={60} height={10} borderRadius={3} />
              <ShimmerBlock width={50} height={16} borderRadius={4} />
            </View>
          </View>
        </View>

        {/* Section Header */}
        <ShimmerBlock width={90} height={12} borderRadius={3} style={{ marginVertical: 6 }} />

        {/* Bank Account Cards Skeletons */}
        {[1, 2, 3].map((item) => (
          <View
            key={item}
            style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.bankHeader}>
              <ShimmerBlock width={44} height={44} borderRadius={12} />
              <View style={{ flex: 1, gap: 6 }}>
                <ShimmerBlock width="60%" height={16} borderRadius={4} />
                <ShimmerBlock width="40%" height={12} borderRadius={4} />
              </View>
              <ShimmerBlock width={50} height={22} borderRadius={6} />
            </View>

            <View style={[styles.bankDetails, { backgroundColor: colors.surface }]}>
              <View style={{ gap: 4 }}>
                <ShimmerBlock width={55} height={10} borderRadius={3} />
                <ShimmerBlock width={85} height={15} borderRadius={4} />
              </View>
              <View style={{ gap: 4, alignItems: 'flex-end' }}>
                <ShimmerBlock width={55} height={10} borderRadius={3} />
                <ShimmerBlock width={85} height={15} borderRadius={4} />
              </View>
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
  overviewCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  overviewGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 14,
    gap: 12,
  },
  bankCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bankDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
});
