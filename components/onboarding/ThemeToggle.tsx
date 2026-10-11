import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle() {
  const { resolvedScheme, setPreference } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const toggleTheme = (target: 'light' | 'dark') => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setPreference(target);
  };

  return (
    <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      {/* Light Segment */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => toggleTheme('light')}
        style={[styles.segment, !isDark && styles.activeSegmentLight]}
        accessibilityRole="button"
        accessibilityLabel="Light Theme"
      >
        <Feather name="sun" size={14.5} color={!isDark ? '#F59E0B' : '#64748B'} />
      </TouchableOpacity>

      {/* Dark Segment */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => toggleTheme('dark')}
        style={[styles.segment, isDark && styles.activeSegmentDark]}
        accessibilityRole="button"
        accessibilityLabel="Dark Theme"
      >
        <Feather name="moon" size={14.5} color={isDark ? '#38BDF8' : '#94A3B8'} />
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
    borderWidth: 1.2,
  },
  containerDark: {
    backgroundColor: '#0F172A',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  containerLight: {
    backgroundColor: '#F1F5F9',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  segment: {
    width: 32,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSegmentDark: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  activeSegmentLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
