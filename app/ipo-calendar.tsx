import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { CalendarHeader } from '@/components/calendar/CalendarHeader';
import { TodayEventsSection, TodayEventItem } from '@/components/calendar/TodayEventsSection';
import { WeekTimeline, DayTimelineItem, CalendarEventDot } from '@/components/calendar/WeekTimeline';
import { MonthGridView } from '@/components/calendar/MonthGridView';
import { AgendaListView, AgendaItem } from '@/components/calendar/AgendaListView';

import { safeAsyncStorage } from '@/utils/safeAsyncStorage';

type ViewMode = 'month' | 'week' | 'agenda';
type CategoryFilter = 'All' | 'Opening' | 'Closing' | 'Allotment' | 'Listing' | 'Mainboard' | 'SME' | 'Favorites';

const CATEGORIES: CategoryFilter[] = ['All', 'Opening', 'Closing', 'Allotment', 'Listing', 'Mainboard', 'SME', 'Favorites'];

export default function IPOCalendarScreen() {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const repo = useMemo(() => new IPORepository(db), [db]);

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewModeState] = useState<ViewMode>('month');
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('All');

  const [allRecords, setAllRecords] = useState<IPOMasterRecord[]>([]);

  // Load saved viewMode preference
  useEffect(() => {
    safeAsyncStorage.getItem('calendar_last_view_mode').then((val) => {
      if (val === 'month' || val === 'week' || val === 'agenda') {
        setViewModeState(val);
      }
    });
  }, []);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    safeAsyncStorage.setItem('calendar_last_view_mode', mode);
  };

  const handleJumpToday = () => {
    setCurrentMonthDate(new Date());
  };

  // Load raw records from IPORepository
  const loadData = useCallback(async () => {
    try {
      // Fetch upcoming, open, closed, listed to form complete dataset
      const [up, op, cl, li] = await Promise.all([
        repo.getUpcoming(),
        repo.getOpen(),
        repo.getClosed(),
        repo.getListed(),
      ]);

      const map = new Map<string, IPOMasterRecord>();
      [...up, ...op, ...cl, ...li].forEach((r) => map.set(r.id, r));
      setAllRecords(Array.from(map.values()));
    } catch (err) {
      if (__DEV__) console.warn('[IPOCalendarScreen] Failed to load data', err);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter records based on category & search query
  const filteredRecords = useMemo(() => {
    return allRecords.filter((r) => {
      // Category filter
      if (selectedCategory === 'Favorites' && r.is_favorite !== 1) return false;
      if (selectedCategory === 'Mainboard' && r.issue_type !== 'Mainboard') return false;
      if (selectedCategory === 'SME' && r.issue_type !== 'SME') return false;
      if (selectedCategory === 'Opening' && !r.open_date) return false;
      if (selectedCategory === 'Closing' && !r.close_date) return false;
      if (selectedCategory === 'Allotment' && !r.allotment_date) return false;
      if (selectedCategory === 'Listing' && !r.listing_date) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = (r.company_name || r.ipo_name || '').toLowerCase().includes(q);
        const symMatch = (r.symbol || '').toLowerCase().includes(q);
        if (!nameMatch && !symMatch) return false;
      }

      return true;
    });
  }, [allRecords, selectedCategory, searchQuery]);

  // Calculate Today's Events
  const todayEvents = useMemo<TodayEventItem[]>(() => {
    const today = new Date().toISOString().split('T')[0];
    const items: TodayEventItem[] = [];

    allRecords.forEach((ipo) => {
      if (ipo.open_date === today) items.push({ ipo, type: 'open', dateStr: today });
      if (ipo.close_date === today) items.push({ ipo, type: 'close', dateStr: today });
      if (ipo.allotment_date === today) items.push({ ipo, type: 'allotment', dateStr: today });
      if (ipo.listing_date === today) items.push({ ipo, type: 'listing', dateStr: today });
    });

    return items;
  }, [allRecords]);

  // Calculate This Week Timeline (Current Monday -> Sunday)
  const weekTimeline = useMemo<DayTimelineItem[]>(() => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1; // Monday
    const days: DayTimelineItem[] = [];

    const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(curr.setDate(first + i));
      const dateStr = d.toISOString().split('T')[0];

      const events: Array<{ ipo: IPOMasterRecord; eventType: CalendarEventDot; title: string }> = [];

      filteredRecords.forEach((ipo) => {
        if (ipo.open_date === dateStr) events.push({ ipo, eventType: 'open', title: `${ipo.company_name || ipo.ipo_name} Opens` });
        if (ipo.close_date === dateStr) events.push({ ipo, eventType: 'close', title: `${ipo.company_name || ipo.ipo_name} Closes` });
        if (ipo.allotment_date === dateStr) events.push({ ipo, eventType: 'allotment', title: `${ipo.company_name || ipo.ipo_name} Allotment` });
        if (ipo.listing_date === dateStr) events.push({ ipo, eventType: 'listing', title: `${ipo.company_name || ipo.ipo_name} Listing` });
      });

      if (events.length > 0) {
        days.push({ dayName: dayNames[i], dateStr, events });
      }
    }

    return days;
  }, [filteredRecords]);

  // Calculate Date Events Map for Month View Grid
  const dateEventsMap = useMemo(() => {
    const map: Record<string, Array<{ ipo: IPOMasterRecord; eventType: CalendarEventDot }>> = {};

    filteredRecords.forEach((ipo) => {
      const add = (dStr: string | null, type: CalendarEventDot) => {
        if (!dStr) return;
        if (!map[dStr]) map[dStr] = [];
        map[dStr].push({ ipo, eventType: type });
      };

      add(ipo.open_date, 'open');
      add(ipo.close_date, 'close');
      add(ipo.allotment_date, 'allotment');
      add(ipo.listing_date, 'listing');
    });

    return map;
  }, [filteredRecords]);

  // Calculate Agenda Items grouped by date
  const agendaItems = useMemo<AgendaItem[]>(() => {
    const dates = Object.keys(dateEventsMap).sort();
    return dates.map((dStr) => ({
      dateStr: dStr,
      events: dateEventsMap[dStr],
    }));
  }, [dateEventsMap]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header & View Mode Switcher */}
      <CalendarHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showSearch={showSearch}
        onToggleSearch={() => {
          setShowSearch((prev) => !prev);
          if (showSearch) setSearchQuery('');
        }}
        onJumpToday={handleJumpToday}
      />

      {/* Expandable Search Input */}
      {showSearch ? (
        <View style={[styles.searchWrap, { borderBottomColor: colors.border }]}>
          <View style={[styles.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search IPO calendar..."
              placeholderTextColor={colors.mutedForeground + '80'}
              style={[styles.searchInput, { color: colors.foreground }]}
              autoFocus
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Feather name="x-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Category Filter Chips */}
      <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isActive ? colors.primary + '18' : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.filterText, { color: isActive ? colors.primary : colors.mutedForeground }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content Layout based on View Mode */}
      {viewMode === 'agenda' ? (
        <AgendaListView agenda={agendaItems} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Today's Events Carousel */}
          <TodayEventsSection events={todayEvents} />

          {/* View Mode Specific Section */}
          {viewMode === 'week' ? (
            <WeekTimeline timeline={weekTimeline} />
          ) : (
            <MonthGridView
              dateEventsMap={dateEventsMap}
              currentDate={currentMonthDate}
              onMonthChange={setCurrentMonthDate}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  filterBar: {
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  scrollContent: {
    paddingBottom: 40,
  },
});
