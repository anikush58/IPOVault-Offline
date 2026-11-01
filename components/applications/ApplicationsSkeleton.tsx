import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function ApplicationsSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.container}>
        {/* Overview Hero Card Skeleton */}
        <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <ShimmerBlock width={100} height={12} borderRadius={4} />
              <ShimmerBlock width={140} height={28} borderRadius={6} />
            </View>
            <ShimmerBlock width={52} height={26} borderRadius={13} />
          </View>

          <View style={[styles.statsGrid, { borderTopColor: colors.border }]}>
            {[1, 2, 3, 4].map((stat) => (
              <View key={stat} style={styles.statCol}>
                <ShimmerBlock width={45} height={10} borderRadius={3} />
                <ShimmerBlock width={35} height={16} borderRadius={4} style={{ marginTop: 4 }} />
              </View>
            ))}
          </View>
        </View>

        {/* Tab Pills Bar Skeleton */}
        <View style={styles.tabsRow}>
          <ShimmerBlock width={70} height={32} borderRadius={16} />
          <ShimmerBlock width={65} height={32} borderRadius={16} />
          <ShimmerBlock width={55} height={32} borderRadius={16} />
          <ShimmerBlock width={65} height={32} borderRadius={16} />
          <ShimmerBlock width={85} height={32} borderRadius={16} />
        </View>

        {/* Application Cards Skeletons */}
        {[1, 2, 3, 4].map((item) => (
          <View
            key={item}
            style={[styles.appCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.appHeader}>
              <ShimmerBlock width={40} height={40} borderRadius={12} />
              <View style={{ flex: 1, gap: 5 }}>
                <ShimmerBlock width="70%" height={15} borderRadius={4} />
                <ShimmerBlock width="45%" height={11} borderRadius={4} />
              </View>
              <ShimmerBlock width={68} height={22} borderRadius={8} />
            </View>

            <View style={[styles.appDetailsRow, { backgroundColor: colors.surface }]}>
              <ShimmerBlock width="30%" height={13} borderRadius={4} />
              <ShimmerBlock width="30%" height={13} borderRadius={4} />
              <ShimmerBlock width="30%" height={13} borderRadius={4} />
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
    marginBottom: 4,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  statCol: {
    alignItems: 'center',
    gap: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  appCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 38,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
});
