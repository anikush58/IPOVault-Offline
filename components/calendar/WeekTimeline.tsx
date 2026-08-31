import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatDate } from '@/utils/formatters';

export type CalendarEventDot = 'open' | 'close' | 'allotment' | 'listing';

export type DayTimelineItem = {
  dayName: string; // MON, TUE, WED...
  dateStr: string; // YYYY-MM-DD
  events: Array<{
    ipo: IPOMasterRecord;
    eventType: CalendarEventDot;
    title: string;
  }>;
};

type Props = {
  timeline: DayTimelineItem[];
};

const DOT_COLORS: Record<CalendarEventDot, string> = {
  open: '#10B981',
  close: '#EF4444',
  allotment: '#F59E0B',
  listing: '#3B82F6',
};

const EVENT_TYPE_LABELS: Record<CalendarEventDot, string> = {
  open: 'Opens',
  close: 'Closes',
  allotment: 'Allotment',
  listing: 'Listing',
};

export const WeekTimeline = React.memo(function WeekTimeline({ timeline }: Props) {
  const colors = useColors();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.primary }]}>THIS WEEK&apos;S TIMELINE</Text>

      {timeline.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No scheduled events for this week.
          </Text>
        </View>
      ) : (
        timeline.map((item) => (
          <View key={item.dateStr} style={[styles.dayRow, { borderBottomColor: colors.border + '50' }]}>
            <View style={styles.dayCol}>
              <Text style={[styles.dayName, { color: colors.primary }]}>{item.dayName}</Text>
              <Text style={[styles.dayDate, { color: colors.mutedForeground }]}>
                {formatDate(item.dateStr).split(',')[0]}
              </Text>
            </View>

            <View style={styles.eventsCol}>
              {item.events.map((ev, idx) => (
                <TouchableOpacity
                  key={`${ev.ipo.id}-${ev.eventType}-${idx}`}
                  onPress={() => router.push({ pathname: '/ipo-details' as any, params: { id: ev.ipo.id } })}
                  style={[styles.eventChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.dot, { backgroundColor: DOT_COLORS[ev.eventType] }]} />
                  <Text style={[styles.ipoTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {ev.ipo.company_name || ev.ipo.ipo_name}
                  </Text>
                  <Text style={[styles.eventBadge, { color: DOT_COLORS[ev.eventType] }]}>
                    {EVENT_TYPE_LABELS[ev.eventType]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  emptyBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  dayRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dayCol: {
    width: 60,
    justifyContent: 'center',
  },
  dayName: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  dayDate: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
  eventsCol: {
    flex: 1,
    gap: 8,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  ipoTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginRight: 6,
  },
  eventBadge: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
