import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { CalendarEventDot } from './WeekTimeline';
import { DayEventsSheet } from './DayEventsSheet';

import { useSwipeGesture } from '@/hooks/useSwipeGesture';

type DateEventsMap = Record<string, Array<{ ipo: IPOMasterRecord; eventType: CalendarEventDot }>>;

type Props = {
  dateEventsMap: DateEventsMap;
  currentDate?: Date;
  onMonthChange?: (newDate: Date) => void;
};

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const DOT_COLORS: Record<CalendarEventDot, string> = {
  open: '#10B981',
  close: '#EF4444',
  allotment: '#F59E0B',
  listing: '#3B82F6',
};

export const MonthGridView = React.memo(function MonthGridView({
  dateEventsMap,
  currentDate: externalCurrentDate,
  onMonthChange,
}: Props) {
  const colors = useColors();

  // Current displayed Month/Year state
  const [internalCurrentDate, setInternalCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  const activeDate = externalCurrentDate || internalCurrentDate;
  const year = activeDate.getFullYear();
  const month = activeDate.getMonth();

  const monthName = activeDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    const nextDate = new Date(year, month - 1, 1);
    if (onMonthChange) onMonthChange(nextDate);
    else setInternalCurrentDate(nextDate);
  };

  const handleNextMonth = () => {
    const nextDate = new Date(year, month + 1, 1);
    if (onMonthChange) onMonthChange(nextDate);
    else setInternalCurrentDate(nextDate);
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNextMonth,
    onSwipeRight: handlePrevMonth,
  });

  // Generate grid days for the month
  const gridDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{ dayNumber: number | null; dateStr: string | null }> = [];

    // Empty lead cells
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dayNumber: null, dateStr: null });
    }

    // Month day cells
    for (let d = 1; d <= totalDays; d++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      days.push({ dayNumber: d, dateStr });
    }

    return days;
  }, [year, month]);

  const selectedEvents = selectedDateStr ? dateEventsMap[selectedDateStr] || [] : [];

  return (
    <View style={styles.container} {...swipeHandlers}>
      {/* Month Selector Bar */}
      <View style={styles.header}>
        <Text style={[styles.monthTitle, { color: colors.foreground }]}>{monthName}</Text>
        <View style={styles.navBtns}>
          <TouchableOpacity
            onPress={handlePrevMonth}
            style={[styles.navBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            hitSlop={8}
          >
            <Feather name="chevron-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNextMonth}
            style={[styles.navBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            hitSlop={8}
          >
            <Feather name="chevron-right" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Weekday Labels Header */}
      <View style={styles.weekdayHeader}>
        {WEEKDAYS.map((wd) => (
          <Text key={wd} style={[styles.weekdayText, { color: colors.mutedForeground }]}>
            {wd}
          </Text>
        ))}
      </View>

      {/* Days Grid */}
      <View style={styles.grid}>
        {gridDays.map((cell, index) => {
          if (!cell.dayNumber || !cell.dateStr) {
            return <View key={`empty-${index}`} style={styles.cell} />;
          }

          const evs = dateEventsMap[cell.dateStr] || [];
          const isToday = cell.dateStr === new Date().toISOString().split('T')[0];

          return (
            <TouchableOpacity
              key={cell.dateStr}
              onPress={() => setSelectedDateStr(cell.dateStr)}
              style={[
                styles.cell,
                isToday && [styles.todayCell, { borderColor: colors.primary }],
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayNum,
                  { color: isToday ? colors.primary : colors.foreground },
                  isToday && styles.todayText,
                ]}
              >
                {cell.dayNumber}
              </Text>

              {/* Event Dots */}
              <View style={styles.dotRow}>
                {evs.slice(0, 4).map((ev, i) => (
                  <View
                    key={`${ev.ipo.id}-${ev.eventType}-${i}`}
                    style={[styles.dot, { backgroundColor: DOT_COLORS[ev.eventType] }]}
                  />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bottom Sheet for selected day */}
      <DayEventsSheet
        visible={!!selectedDateStr}
        dateStr={selectedDateStr}
        events={selectedEvents}
        onClose={() => setSelectedDateStr(null)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  navBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    borderRadius: 10,
  },
  todayCell: {
    borderWidth: 1.5,
  },
  dayNum: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  todayText: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
