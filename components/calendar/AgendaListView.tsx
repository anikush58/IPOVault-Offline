import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { CalendarEventDot } from './WeekTimeline';
import { formatDate } from '@/utils/formatters';

export type AgendaItem = {
  dateStr: string;
  events: Array<{ ipo: IPOMasterRecord; eventType: CalendarEventDot }>;
};

type Props = {
  agenda: AgendaItem[];
};

const DOT_COLORS: Record<CalendarEventDot, string> = {
  open: '#10B981',
  close: '#EF4444',
  allotment: '#F59E0B',
  listing: '#3B82F6',
};

const TYPE_LABELS: Record<CalendarEventDot, string> = {
  open: 'Opens',
  close: 'Closes',
  allotment: 'Allotment',
  listing: 'Listing',
};

export const AgendaListView = React.memo(function AgendaListView({ agenda }: Props) {
  const colors = useColors();
  const router = useRouter();

  if (agenda.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Feather name="calendar" size={36} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Agenda Events</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
          No events match the selected calendar filters or search term.
        </Text>
      </View>
    );
  }

  const renderAgendaGroup = ({ item }: { item: AgendaItem }) => (
    <View style={styles.groupContainer}>
      <View style={[styles.dateHeader, { borderBottomColor: colors.border + '60' }]}>
        <Text style={[styles.dateText, { color: colors.primary }]}>{formatDate(item.dateStr)}</Text>
        <Text style={[styles.countText, { color: colors.mutedForeground }]}>
          {item.events.length} Event{item.events.length > 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.eventsList}>
        {item.events.map(({ ipo, eventType }, idx) => (
          <TouchableOpacity
            key={`${ipo.id}-${eventType}-${idx}`}
            onPress={() => router.push({ pathname: '/ipo-details' as any, params: { id: ipo.id } })}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.8}
          >
            <View style={[styles.dot, { backgroundColor: DOT_COLORS[eventType] }]} />

            <View style={styles.info}>
              <Text style={[styles.companyName, { color: colors.foreground }]} numberOfLines={1}>
                {ipo.company_name || ipo.ipo_name}
              </Text>
              <Text style={[styles.subText, { color: colors.mutedForeground }]}>
                {ipo.issue_type || 'Mainboard'} • {ipo.exchange || 'BSE/NSE'}
              </Text>
            </View>

            <View style={[styles.badge, { backgroundColor: DOT_COLORS[eventType] + '18' }]}>
              <Text style={[styles.badgeText, { color: DOT_COLORS[eventType] }]}>
                {TYPE_LABELS[eventType]}
              </Text>
            </View>

            <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <FlatList
      data={agenda}
      keyExtractor={(item) => item.dateStr}
      renderItem={renderAgendaGroup}
      contentContainerStyle={styles.listPadding}
    />
  );
});

const styles = StyleSheet.create({
  listPadding: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 40,
  },
  groupContainer: {
    marginBottom: 18,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  dateText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  countText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  eventsList: {
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  info: {
    flex: 1,
  },
  companyName: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  subText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 4,
  },
});
