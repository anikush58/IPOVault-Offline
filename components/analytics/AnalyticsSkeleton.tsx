import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function AnalyticsSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.container}>
        {/* Top Metric Grid */}
        <View style={styles.metricGrid}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <ShimmerBlock width={75} height={11} borderRadius={4} />
              <ShimmerBlock width={90} height={24} borderRadius={6} style={{ marginTop: 8 }} />
              <ShimmerBlock width={50} height={12} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>

        {/* Big Chart Card */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <ShimmerBlock width={130} height={16} borderRadius={4} />
            <ShimmerBlock width={60} height={20} borderRadius={10} />
          </View>
          <View style={{ height: 180, justifyContent: 'flex-end', paddingBottom: 10 }}>
            <View style={styles.chartBarsRow}>
              {[35, 65, 45, 80, 60, 95, 70, 50, 85].map((h, idx) => (
                <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
                  <ShimmerBlock width={18} height={`${h}%`} borderRadius={4} />
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Additional Breakdown Card */}
        <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ShimmerBlock width={140} height={16} borderRadius={4} style={{ marginBottom: 14 }} />
          {[1, 2, 3].map((row) => (
            <View key={row} style={styles.breakdownRow}>
              <ShimmerBlock width="40%" height={14} borderRadius={4} />
              <ShimmerBlock width="25%" height={14} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>
    </ShimmerGroup>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 16,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  chartCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    gap: 8,
  },
  breakdownCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
