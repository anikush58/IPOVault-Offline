import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { CalendarEventDot } from './WeekTimeline';
import { formatDate } from '@/utils/formatters';

type DayEvent = {
  ipo: IPOMasterRecord;
  eventType: CalendarEventDot;
};

type Props = {
  visible: boolean;
  dateStr: string | null;
  events: DayEvent[];
  onClose: () => void;
};

const DOT_COLORS: Record<CalendarEventDot, string> = {
  open: '#10B981',
  close: '#EF4444',
  allotment: '#F59E0B',
  listing: '#3B82F6',
};

const TYPE_TITLES: Record<CalendarEventDot, string> = {
  open: 'IPO Opens',
  close: 'IPO Closes',
  allotment: 'Allotment Out',
  listing: 'Listing Day',
};

export const DayEventsSheet = React.memo(function DayEventsSheet({
  visible,
  dateStr,
  events,
  onClose,
}: Props) {
  const colors = useColors();
  const router = useRouter();

  if (!dateStr) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>DATE EVENTS</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>{formatDate(dateStr)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface }]} hitSlop={8}>
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            {events.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No IPO activity scheduled for this date.
                </Text>
              </View>
            ) : (
              events.map(({ ipo, eventType }, idx) => (
                <TouchableOpacity
                  key={`${ipo.id}-${eventType}-${idx}`}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/ipo-details' as any, params: { id: ipo.id } });
                  }}
                  style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.dotBadge, { backgroundColor: DOT_COLORS[eventType] + '20' }]}>
                    <View style={[styles.dot, { backgroundColor: DOT_COLORS[eventType] }]} />
                    <Text style={[styles.dotText, { color: DOT_COLORS[eventType] }]}>
                      {TYPE_TITLES[eventType]}
                    </Text>
                  </View>

                  <Text style={[styles.companyName, { color: colors.foreground }]}>
                    {ipo.company_name || ipo.ipo_name}
                  </Text>

                  <View style={styles.metaRow}>
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                      {ipo.issue_type || 'Mainboard'} • {ipo.exchange || 'BSE/NSE'}
                    </Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingVertical: 14,
    gap: 10,
  },
  emptyWrap: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  itemCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  dotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  companyName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
});
