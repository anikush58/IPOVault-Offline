import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function DashboardSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.container}>
        {/* ── Net Profit Hero Skeleton ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroEyebrowRow}>
            <ShimmerBlock width={85} height={11} borderRadius={4} />
            <ShimmerBlock width={6} height={6} borderRadius={3} />
          </View>
          <ShimmerBlock
            width={175}
            height={38}
            borderRadius={8}
            style={{ marginVertical: 14 }}
          />
          <View style={styles.heroBadgeRow}>
            <ShimmerBlock width={68} height={20} borderRadius={10} />
            <ShimmerBlock width={90} height={12} borderRadius={4} />
          </View>
        </View>

        {/* ── Portfolio Details Card Skeleton ── */}
        <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.gridRow}>
            <View style={styles.gridCol}>
              <ShimmerBlock width={70} height={10} borderRadius={4} />
              <ShimmerBlock width={100} height={16} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
            <View style={styles.gridCol}>
              <ShimmerBlock width={70} height={10} borderRadius={4} />
              <ShimmerBlock width={100} height={16} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
          </View>

          <View style={[styles.gridRow, { marginTop: 16 }]}>
            <View style={styles.gridCol}>
              <ShimmerBlock width={90} height={10} borderRadius={4} />
              <ShimmerBlock width={120} height={16} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
            <View style={styles.gridCol}>
              <ShimmerBlock width={90} height={10} borderRadius={4} />
              <ShimmerBlock width={120} height={16} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
          </View>
        </View>

        {/* ── Section Header Skeleton ── */}
        <View style={styles.sectionHeader}>
          <ShimmerBlock width={140} height={13} borderRadius={4} />
          <ShimmerBlock width={55} height={13} borderRadius={4} />
        </View>

        {/* ── Applications / Overview List Skeletons ── */}
        {[1, 2, 3].map((idx) => (
          <View
            key={idx}
            style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.itemRow}>
              <ShimmerBlock width={38} height={38} borderRadius={12} />
              <View style={styles.itemTextCol}>
                <ShimmerBlock width="70%" height={15} borderRadius={4} />
                <ShimmerBlock width="45%" height={11} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
              <ShimmerBlock width={62} height={22} borderRadius={6} />
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
    gap: 16,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridCol: {
    flex: 1,
    gap: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  itemCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemTextCol: {
    flex: 1,
  },
});
