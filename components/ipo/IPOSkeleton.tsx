import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function IPOSkeletonCard() {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <ShimmerBlock width={44} height={44} borderRadius={12} />
        <View style={styles.titleWrap}>
          <ShimmerBlock width="65%" height={16} borderRadius={4} />
          <ShimmerBlock width="38%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
        <ShimmerBlock width={48} height={20} borderRadius={6} />
      </View>

      <View style={[styles.specs, { backgroundColor: colors.surface }]}>
        <ShimmerBlock width="40%" height={14} borderRadius={4} />
        <ShimmerBlock width="40%" height={14} borderRadius={4} />
      </View>

      <View style={styles.footer}>
        <ShimmerBlock width={74} height={22} borderRadius={6} />
        <ShimmerBlock width={110} height={14} borderRadius={4} />
      </View>
    </View>
  );
}

export function IPOSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <ShimmerGroup>
      <View style={{ paddingTop: 8 }}>
        {Array.from({ length: count }).map((_, i) => (
          <IPOSkeletonCard key={i} />
        ))}
      </View>
    </ShimmerGroup>
  );
}

export function IPODetailsSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.detailsContainer}>
        {/* Top Hero Header */}
        <View style={[styles.detailsHero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <ShimmerBlock width={54} height={54} borderRadius={16} />
            <View style={{ flex: 1, gap: 6 }}>
              <ShimmerBlock width="75%" height={20} borderRadius={6} />
              <ShimmerBlock width="45%" height={13} borderRadius={4} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <ShimmerBlock width={70} height={24} borderRadius={12} />
            <ShimmerBlock width={85} height={24} borderRadius={12} />
          </View>
        </View>

        {/* Key Metrics Grid */}
        <View style={[styles.detailsMetricsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.metricsRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <ShimmerBlock width={60} height={11} borderRadius={4} />
              <ShimmerBlock width={95} height={18} borderRadius={4} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <ShimmerBlock width={60} height={11} borderRadius={4} />
              <ShimmerBlock width={95} height={18} borderRadius={4} />
            </View>
          </View>
          <View style={[styles.metricsRow, { marginTop: 16 }]}>
            <View style={{ flex: 1, gap: 6 }}>
              <ShimmerBlock width={70} height={11} borderRadius={4} />
              <ShimmerBlock width={110} height={18} borderRadius={4} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <ShimmerBlock width={70} height={11} borderRadius={4} />
              <ShimmerBlock width={110} height={18} borderRadius={4} />
            </View>
          </View>
        </View>

        {/* Timeline placeholder */}
        <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ShimmerBlock width={120} height={14} borderRadius={4} style={{ marginBottom: 16 }} />
          {[1, 2, 3, 4].map((step) => (
            <View key={step} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <ShimmerBlock width={10} height={10} borderRadius={5} />
              <ShimmerBlock width={110} height={13} borderRadius={4} />
              <View style={{ flex: 1 }} />
              <ShimmerBlock width={75} height={13} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>
    </ShimmerGroup>
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
  titleWrap: {
    flex: 1,
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
  detailsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 16,
  },
  detailsHero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  detailsMetricsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
});
