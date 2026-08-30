import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

type Props = {
  type: 'upcoming' | 'open' | 'search' | 'favorites' | 'empty';
  onAction?: () => void;
  actionText?: string;
};

export function IPOEmptyState({ type, onAction, actionText }: Props) {
  const colors = useColors();

  const config = {
    upcoming: {
      icon: 'clock',
      title: 'No Upcoming IPOs',
      subtitle: 'There are currently no upcoming IPO filings scheduled. Check back soon.',
    },
    open: {
      icon: 'trending-up',
      title: 'No Open IPOs',
      subtitle: 'No IPOs are currently open for subscription today.',
    },
    search: {
      icon: 'search',
      title: 'No Matching IPOs',
      subtitle: 'We couldn’t find any IPOs matching your search query or filter criteria.',
    },
    favorites: {
      icon: 'star',
      title: 'No Favorite IPOs',
      subtitle: 'Tap the star icon on any IPO card to bookmark it here for quick access.',
    },
    empty: {
      icon: 'database',
      title: 'No IPO Records',
      subtitle: 'Your IPO database is currently empty.',
    },
  }[type];

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
        <Feather name={config.icon as any} size={32} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{config.title}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{config.subtitle}</Text>
      {onAction && actionText ? (
        <TouchableOpacity
          onPress={onAction}
          style={[styles.btn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.btnText, { color: colors.primary }]}>{actionText}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 19,
  },
  btn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
