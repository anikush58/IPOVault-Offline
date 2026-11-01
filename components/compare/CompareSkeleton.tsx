import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function CompareSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.container}>
        {/* Comparison Header Cards (2 columns) */}
        <View style={styles.colsHeader}>
          <View style={[styles.colCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ShimmerBlock width={40} height={40} borderRadius={12} />
            <ShimmerBlock width="80%" height={15} borderRadius={4} style={{ marginTop: 8 }} />
            <ShimmerBlock width="50%" height={11} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
          <View style={[styles.colCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ShimmerBlock width={40} height={40} borderRadius={12} />
            <ShimmerBlock width="80%" height={15} borderRadius={4} style={{ marginTop: 8 }} />
            <ShimmerBlock width="50%" height={11} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        </View>

        {/* Comparison Rows */}
        {[1, 2, 3, 4, 5].map((row) => (
          <View
            key={row}
            style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ShimmerBlock width={100} height={12} borderRadius={4} style={{ marginBottom: 12, alignSelf: 'center' }} />
            <View style={styles.rowCols}>
              <ShimmerBlock width="45%" height={18} borderRadius={4} />
              <ShimmerBlock width="45%" height={18} borderRadius={4} />
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
    paddingTop: 12,
    gap: 12,
  },
  colsHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  colCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  rowCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  rowCols: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
