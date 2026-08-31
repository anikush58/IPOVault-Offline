import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { IconButton } from '@/components/ui/IconButton';

type ViewMode = 'month' | 'week' | 'agenda';

type Props = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  onJumpToday?: () => void;
};

export const CalendarHeader = React.memo(function CalendarHeader({
  viewMode,
  onViewModeChange,
  showSearch,
  onToggleSearch,
  onJumpToday,
}: Props) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

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
        <Text style={[styles.eyebrow, { color: colors.primary }]}>DAILY DASHBOARD</Text>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPO Calendar</Text>
      </View>

      {/* Jump to Today Button */}
      {onJumpToday ? (
        <TouchableOpacity
          onPress={onJumpToday}
          style={[styles.todayBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}
          hitSlop={6}
        >
          <Text style={[styles.todayBtnText, { color: colors.primary }]}>Today</Text>
        </TouchableOpacity>
      ) : null}

      {/* View Mode Switcher */}
      <View style={[styles.switcher, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(['month', 'week', 'agenda'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => onViewModeChange(mode)}
            style={[
              styles.switchTab,
              viewMode === mode && [styles.switchTabActive, { backgroundColor: colors.card }],
            ]}
          >
            <Text
              style={[
                styles.switchText,
                { color: viewMode === mode ? colors.primary : colors.mutedForeground },
                viewMode === mode && styles.switchTextActive,
              ]}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <IconButton
        name="search"
        variant={showSearch ? 'primary' : 'surface'}
        size="md"
        onPress={onToggleSearch}
        style={{ marginLeft: 8 }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
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
    marginLeft: 10,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  switcher: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 2,
  },
  switchTab: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
  },
  switchTabActive: {},
  switchText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  switchTextActive: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  todayBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  todayBtnText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
