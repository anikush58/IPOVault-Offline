import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCompare } from '@/context/CompareContext';
import { IconButton } from '@/components/ui/IconButton';

type Props = {
  title?: string;
  onClear?: () => void;
};

export const CompareHeader = React.memo(function CompareHeader({ title = 'IPO Compare', onClear }: Props) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;
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
        { height: topPad + 60 },
      ]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? 90 : 75}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={
          isDark
            ? ['rgba(14, 17, 23, 0.96)', 'rgba(14, 17, 23, 0.88)', 'rgba(14, 17, 23, 0.35)']
            : ['rgba(248, 249, 250, 0.96)', 'rgba(248, 249, 250, 0.88)', 'rgba(248, 249, 250, 0.35)']
        }
        locations={[0, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.headerRow, { paddingTop: topPad }]}>
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
    </View>
  );
});

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  headerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
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
