import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  recentSearches?: string[];
  onSelectRecent?: (term: string) => void;
  placeholder?: string;
};

export function IPOSearchBar({
  value,
  onChangeText,
  onClear,
  recentSearches = [],
  onSelectRecent,
  placeholder = 'Search company, symbol, sector, registrar…',
}: Props) {
  const colors = useColors();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Instant focus when search opens
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.wrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.foreground }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {value ? (
          <TouchableOpacity
            onPress={onClear}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.clearBtn}
          >
            <Feather name="x-circle" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Recent Searches Pills */}
      {!value && recentSearches.length > 0 && onSelectRecent ? (
        <View style={styles.recentWrap}>
          <Text style={[styles.recentTitle, { color: colors.mutedForeground }]}>RECENT</Text>
          <View style={styles.recentRow}>
            {recentSearches.slice(0, 5).map((term) => (
              <TouchableOpacity
                key={term}
                onPress={() => onSelectRecent(term)}
                style={[styles.recentPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Feather name="clock" size={11} color={colors.mutedForeground} />
                <Text style={[styles.recentText, { color: colors.foreground }]}>{term}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    height: '100%',
  },
  clearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentWrap: {
    marginTop: 8,
  },
  recentTitle: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  recentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  recentText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
});
