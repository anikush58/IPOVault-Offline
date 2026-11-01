import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function UsersSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.container}>
        {/* User Card Skeletons */}
        {[1, 2, 3, 4, 5].map((item) => (
          <View
            key={item}
            style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.userRow}>
              <ShimmerBlock width={44} height={44} borderRadius={22} />
              <View style={{ flex: 1, gap: 6 }}>
                <ShimmerBlock width="55%" height={16} borderRadius={4} />
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <ShimmerBlock width={65} height={18} borderRadius={6} />
                  <ShimmerBlock width={55} height={18} borderRadius={6} />
                </View>
              </View>
              <ShimmerBlock width={20} height={20} borderRadius={10} />
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
  userCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
