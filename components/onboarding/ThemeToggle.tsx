import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle() {
  const { resolvedScheme, setPreference } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const toggleTheme = (target: 'light' | 'dark') => {
    setPreference(target);
  };

  return (
    <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => toggleTheme('light')}
        style={[styles.segment, !isDark && styles.activeSegmentLight]}
        accessibilityRole="button"
        accessibilityLabel="Light Theme"
      >
        <Feather name="sun" size={15} color={!isDark ? '#C39B27' : '#9CA3AF'} />
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => toggleTheme('dark')}
        style={[styles.segment, isDark && styles.activeSegmentDark]}
        accessibilityRole="button"
        accessibilityLabel="Dark Theme"
      >
        <Feather name="moon" size={15} color={isDark ? '#C39B27' : '#6B7280'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 36,
    borderRadius: 999,
    padding: 3,
    alignItems: 'center',
    borderWidth: 1,
  },
  containerDark: {
    backgroundColor: '#171717',
    borderColor: '#262626',
  },
  containerLight: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  segment: {
    width: 32,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSegmentDark: {
    backgroundColor: '#262626',
  },
  activeSegmentLight: {
    backgroundColor: '#FFFFFF',
  },
});
