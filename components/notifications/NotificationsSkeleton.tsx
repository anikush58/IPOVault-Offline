import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ShimmerGroup, ShimmerBlock } from '@/components/ui/Shimmer';

export function NotificationsSkeleton() {
  const colors = useColors();

  return (
    <ShimmerGroup>
      <View style={styles.container}>
        {[1, 2, 3, 4, 5].map((item) => (
          <View
            key={item}
            style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ShimmerBlock width={40} height={40} borderRadius={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <ShimmerBlock width="60%" height={15} borderRadius={4} />
                <ShimmerBlock width={45} height={10} borderRadius={3} />
              </View>
              <ShimmerBlock width="95%" height={12} borderRadius={4} />
              <ShimmerBlock width="75%" height={12} borderRadius={4} />
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
    gap: 10,
  },
  notifCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
});
