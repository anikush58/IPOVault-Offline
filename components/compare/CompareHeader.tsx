import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCompare } from '@/context/CompareContext';
import { IconButton } from '@/components/ui/IconButton';

type Props = {
  title?: string;
  onClear?: () => void;
};

export const CompareHeader = React.memo(function CompareHeader({ title = 'IPO Compare', onClear }: Props) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { selectedIds, clearCompare, maxLimit } = useCompare();

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      clearCompare();
    }
  };

  return (
    <View
      style={[
        styles.topBar,
        { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}
    >
      <IconButton
        name="chevron-left"
        variant="surface"
        size="md"
        onPress={() => router.back()}
      />

      <View style={styles.titleWrap}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>SIDE-BY-SIDE ANALYTICS</Text>
        <View style={styles.titleRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
          <View style={[styles.countBadge, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.countText, { color: colors.primary }]}>
              {selectedIds.length}/{maxLimit}
            </Text>
          </View>
        </View>
      </View>

      {selectedIds.length > 0 ? (
        <TouchableOpacity
          onPress={handleClear}
          style={[styles.clearBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.clearText, { color: colors.mutedForeground }]}>Clear</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.4,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  clearText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
