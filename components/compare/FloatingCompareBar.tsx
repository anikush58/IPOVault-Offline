import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCompare } from '@/context/CompareContext';

export const FloatingCompareBar = React.memo(function FloatingCompareBar() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedIds, clearCompare } = useCompare();

  if (selectedIds.length === 0) return null;

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + 16 }]}>
      <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.left}>
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>{selectedIds.length}</Text>
          </View>
          <Text style={[styles.label, { color: colors.foreground }]}>
            IPO{selectedIds.length > 1 ? 's' : ''} Selected
          </Text>
        </View>

        <View style={styles.right}>
          <TouchableOpacity onPress={clearCompare} style={styles.clearBtn} hitSlop={8}>
            <Text style={[styles.clearText, { color: colors.mutedForeground }]}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/ipo-compare' as any)}
            style={[styles.compareBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text style={styles.compareBtnText}>Compare ({selectedIds.length})</Text>
            <Feather name="arrow-right" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  label: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearBtn: {
    paddingHorizontal: 6,
  },
  clearText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  compareBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
