import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

type Props = {
  title: string;
  icon?: string;
  badge?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

export function CollapsibleIntelCard({
  title,
  icon,
  badge,
  defaultExpanded = true,
  children,
}: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.8}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          {icon ? (
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '14' }]}>
              <Feather name={icon as any} size={15} color={colors.primary} />
            </View>
          ) : null}
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: colors.surface }]}>
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{badge}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.headerRight}>
          <Feather
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.mutedForeground}
          />
        </View>
      </TouchableOpacity>

      {expanded ? <View style={[styles.body, { borderTopColor: colors.border }]}>{children}</View> : null}
    </View>
  );
}

export function IntelEmptyState({ message = 'Information will be available soon' }: { message?: string }) {
  const colors = useColors();

  return (
    <View style={[styles.emptyWrap, { backgroundColor: colors.surface }]}>
      <Feather name="clock" size={16} color={colors.mutedForeground} />
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textTransform: 'uppercase',
  },
  headerRight: {
    marginLeft: 8,
  },
  body: {
    padding: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  emptyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontStyle: 'italic',
  },
});
