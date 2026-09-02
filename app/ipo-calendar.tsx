import React, { useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { IconButton } from '@/components/ui/IconButton';
import { useDB } from '@/context/DBContext';

export type EventStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'ALLOTMENT' | 'LISTING' | 'LISTED' | 'HOLIDAY';

export type CalendarEvent = {
  id: string;
  dateStr: string; // YYYY-MM-DD
  title: string;
  status: EventStatus;
  issueType: 'MAINBOARD' | 'NSE SME' | 'BSE SME';
  ipoId?: string;
  isHoliday?: boolean;
};

export type EventRowItem = {
  id: string;
  events: CalendarEvent[];
};

export type CalendarSection = {
  dateStr: string;
  displayDate: string;
  shortDate: string;
  isToday: boolean;
  isHolidayGroup: boolean;
  holidayTitle?: string;
  data: EventRowItem[];
};

// Market Holidays List
const MARKET_HOLIDAYS_2026: { dateStr: string; title: string }[] = [
  { dateStr: '2026-09-14', title: 'Ganesh Chaturthi' },
  { dateStr: '2026-10-02', title: 'Mahatma Gandhi Jayanti' },
  { dateStr: '2026-10-20', title: 'Dussehra' },
  { dateStr: '2026-11-10', title: 'Diwali-Balipratipada' },
  { dateStr: '2026-11-24', title: 'Prakash Gurpurb' },
  { dateStr: '2026-12-25', title: 'Christmas' },
];

// Events dataset
const SAMPLE_CALENDAR_EVENTS: CalendarEvent[] = [
  // Wed, 2 Sep 2026 (TODAY)
  { id: 's1', dateStr: '2026-09-02', title: 'Purple Style Labs', status: 'CLOSED', issueType: 'MAINBOARD' },
  { id: 's2', dateStr: '2026-09-02', title: 'Phychem Technologies', status: 'CLOSED', issueType: 'BSE SME' },
  { id: 's3', dateStr: '2026-09-02', title: 'Ashutosh Fibre', status: 'CLOSED', issueType: 'NSE SME' },
  { id: 's4', dateStr: '2026-09-02', title: 'Shanti Inorganics', status: 'CLOSED', issueType: 'NSE SME' },
  { id: 's5', dateStr: '2026-09-02', title: 'Priority Jewels', status: 'ALLOTMENT', issueType: 'MAINBOARD' },
  { id: 's6', dateStr: '2026-09-02', title: 'ESDS Software Solution', status: 'ALLOTMENT', issueType: 'MAINBOARD' },
  { id: 's7', dateStr: '2026-09-02', title: 'Paluck Technologies', status: 'ALLOTMENT', issueType: 'BSE SME' },
  { id: 's8', dateStr: '2026-09-02', title: 'Complete Sports Management India', status: 'ALLOTMENT', issueType: 'BSE SME' },
  { id: 's9', dateStr: '2026-09-02', title: 'Annu Projects', status: 'LISTED', issueType: 'MAINBOARD' },
  { id: 's10', dateStr: '2026-09-02', title: 'Sumax Engineering', status: 'LISTED', issueType: 'NSE SME' },

  // Thu, 3 Sep 2026
  { id: 's11', dateStr: '2026-09-03', title: 'Deepa Jewellers', status: 'CLOSING', issueType: 'MAINBOARD' },
  { id: 's12', dateStr: '2026-09-03', title: 'Rays of Belief', status: 'CLOSING', issueType: 'MAINBOARD' },
  { id: 's13', dateStr: '2026-09-03', title: 'Farm Peace', status: 'CLOSING', issueType: 'BSE SME' },
  { id: 's14', dateStr: '2026-09-03', title: 'Fly-Hi Maritime Travels', status: 'CLOSING', issueType: 'BSE SME' },
  { id: 's15', dateStr: '2026-09-03', title: 'Lumino Industries', status: 'LISTING', issueType: 'MAINBOARD' },
  { id: 's16', dateStr: '2026-09-03', title: 'Kwick Forensic Solutions', status: 'LISTING', issueType: 'BSE SME' },

  // Fri, 4 Sep 2026
  { id: 's17', dateStr: '2026-09-04', title: 'Qualiance International', status: 'OPEN', issueType: 'NSE SME' },
  { id: 's18', dateStr: '2026-09-04', title: 'Deepa Jewellers', status: 'ALLOTMENT', issueType: 'MAINBOARD' },
  { id: 's19', dateStr: '2026-09-04', title: 'Rays of Belief', status: 'ALLOTMENT', issueType: 'MAINBOARD' },
  { id: 's20', dateStr: '2026-09-04', title: 'Farm Peace', status: 'ALLOTMENT', issueType: 'BSE SME' },
  { id: 's21', dateStr: '2026-09-04', title: 'Fly-Hi Maritime Travels', status: 'ALLOTMENT', issueType: 'BSE SME' },
  { id: 's22', dateStr: '2026-09-04', title: 'Priority Jewels', status: 'LISTING', issueType: 'MAINBOARD' },
  { id: 's23', dateStr: '2026-09-04', title: 'ESDS Software Solution', status: 'LISTING', issueType: 'MAINBOARD' },
  { id: 's24', dateStr: '2026-09-04', title: 'Paluck Technologies', status: 'LISTING', issueType: 'BSE SME' },
  { id: 's25', dateStr: '2026-09-04', title: 'Complete Sports Management India', status: 'LISTING', issueType: 'BSE SME' },

  // Mon, 7 Sep 2026
  { id: 's26', dateStr: '2026-09-07', title: 'Manipal Payment & Identity Solutions', status: 'OPEN', issueType: 'MAINBOARD' },
  { id: 's27', dateStr: '2026-09-07', title: 'Pranav Constructions', status: 'OPEN', issueType: 'MAINBOARD' },
  { id: 's28', dateStr: '2026-09-07', title: 'Purple Style Labs', status: 'LISTING', issueType: 'MAINBOARD' },
  { id: 's29', dateStr: '2026-09-07', title: 'Phychem Technologies', status: 'LISTING', issueType: 'BSE SME' },
  { id: 's30', dateStr: '2026-09-07', title: 'Ashutosh Fibre', status: 'LISTING', issueType: 'NSE SME' },
  { id: 's31', dateStr: '2026-09-07', title: 'Shanti Inorganics', status: 'LISTING', issueType: 'NSE SME' },

  // Tue, 8 Sep 2026
  { id: 's32', dateStr: '2026-09-08', title: 'Qualiance International', status: 'CLOSING', issueType: 'NSE SME' },
  { id: 's33', dateStr: '2026-09-08', title: 'Deepa Jewellers', status: 'LISTING', issueType: 'MAINBOARD' },
  { id: 's34', dateStr: '2026-09-08', title: 'Rays of Belief', status: 'LISTING', issueType: 'MAINBOARD' },
  { id: 's35', dateStr: '2026-09-08', title: 'Farm Peace', status: 'LISTING', issueType: 'BSE SME' },

  // Wed, 9 Sep 2026
  { id: 's36', dateStr: '2026-09-09', title: 'Asset Reconstruction Company (India)', status: 'OPEN', issueType: 'MAINBOARD' },
  { id: 's37', dateStr: '2026-09-09', title: 'Manipal Payment & Identity Solutions', status: 'CLOSING', issueType: 'MAINBOARD' },
  { id: 's38', dateStr: '2026-09-09', title: 'Pranav Constructions', status: 'CLOSING', issueType: 'MAINBOARD' },
  { id: 's39', dateStr: '2026-09-09', title: 'Qualiance International', status: 'ALLOTMENT', issueType: 'NSE SME' },
  { id: 's40', dateStr: '2026-09-09', title: 'Fly-Hi Maritime Travels', status: 'LISTING', issueType: 'BSE SME' },

  // Thu, 10 Sep 2026
  { id: 's41', dateStr: '2026-09-10', title: 'Veegaland Developers', status: 'OPEN', issueType: 'MAINBOARD' },
  { id: 's42', dateStr: '2026-09-10', title: 'Manipal Payment & Identity Solutions', status: 'ALLOTMENT', issueType: 'MAINBOARD' },
  { id: 's43', dateStr: '2026-09-10', title: 'Pranav Constructions', status: 'ALLOTMENT', issueType: 'MAINBOARD' },

  // Fri, 11 Sep 2026
  { id: 's44', dateStr: '2026-09-11', title: 'Asset Reconstruction Company (India)', status: 'CLOSING', issueType: 'MAINBOARD' },
  { id: 's45', dateStr: '2026-09-11', title: 'Qualiance International', status: 'LISTING', issueType: 'NSE SME' },

  // Tue, 15 Sep 2026
  { id: 's46', dateStr: '2026-09-15', title: 'Veegaland Developers', status: 'CLOSING', issueType: 'MAINBOARD' },
  { id: 's47', dateStr: '2026-09-15', title: 'Asset Reconstruction Company (India)', status: 'ALLOTMENT', issueType: 'MAINBOARD' },
  { id: 's48', dateStr: '2026-09-15', title: 'Manipal Payment & Identity Solutions', status: 'LISTING', issueType: 'MAINBOARD' },
  { id: 's49', dateStr: '2026-09-15', title: 'Pranav Constructions', status: 'LISTING', issueType: 'MAINBOARD' },
];

function formatDateDisplay(dateStr: string): { full: string; short: string } {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return { full: dateStr, short: dateStr };
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      full: `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`,
      short: `${d.getDate()} ${months[d.getMonth()]}`,
    };
  } catch {
    return { full: dateStr, short: dateStr };
  }
}

export default function IPOCalendarScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { ipos, isLoading, refresh } = useDB();

  // Board Filter & View Mode State
  const [selectedBoard, setSelectedBoard] = useState<'ALL' | 'MAINBOARD' | 'SME'>('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  // Cutoff date: Today onwards (no past dates!)
  const TODAY_STR = '2026-09-02';

  // Build upcoming event sections for SectionList
  const sections: CalendarSection[] = useMemo(() => {
    const allEvents: CalendarEvent[] = [...SAMPLE_CALENDAR_EVENTS];

    // Merge database IPOs if they fall on or after TODAY_STR
    ipos.forEach((ipo) => {
      if (ipo.archived === 1) return;
      const issue: 'MAINBOARD' | 'NSE SME' | 'BSE SME' = (ipo.issue_type === 'SME' ? 'NSE SME' : 'MAINBOARD');

      if (ipo.open_date && ipo.open_date.slice(0, 10) >= TODAY_STR) {
        allEvents.push({
          id: `${ipo.id}_open`,
          dateStr: ipo.open_date.slice(0, 10),
          title: ipo.ipo_name,
          status: 'OPEN',
          issueType: issue,
          ipoId: ipo.id,
        });
      }
      if (ipo.close_date && ipo.close_date.slice(0, 10) >= TODAY_STR) {
        allEvents.push({
          id: `${ipo.id}_close`,
          dateStr: ipo.close_date.slice(0, 10),
          title: ipo.ipo_name,
          status: 'CLOSING',
          issueType: issue,
          ipoId: ipo.id,
        });
      }
      if (ipo.allotment_date && ipo.allotment_date.slice(0, 10) >= TODAY_STR) {
        allEvents.push({
          id: `${ipo.id}_allotment`,
          dateStr: ipo.allotment_date.slice(0, 10),
          title: ipo.ipo_name,
          status: 'ALLOTMENT',
          issueType: issue,
          ipoId: ipo.id,
        });
      }
      if (ipo.listing_date && ipo.listing_date.slice(0, 10) >= TODAY_STR) {
        allEvents.push({
          id: `${ipo.id}_listing`,
          dateStr: ipo.listing_date.slice(0, 10),
          title: ipo.ipo_name,
          status: 'LISTING',
          issueType: issue,
          ipoId: ipo.id,
        });
      }
    });

    // Add Market Holidays
    MARKET_HOLIDAYS_2026.forEach((h) => {
      if (h.dateStr >= TODAY_STR) {
        allEvents.push({
          id: `h_${h.dateStr}`,
          dateStr: h.dateStr,
          title: h.title,
          status: 'HOLIDAY',
          issueType: 'MAINBOARD',
          isHoliday: true,
        });
      }
    });

    // Filter by Board
    const filtered = allEvents.filter((e) => {
      if (e.dateStr < TODAY_STR) return false;
      if (selectedBoard === 'MAINBOARD' && !e.isHoliday && e.issueType !== 'MAINBOARD') return false;
      if (selectedBoard === 'SME' && !e.isHoliday && e.issueType === 'MAINBOARD') return false;
      return true;
    });

    // Group by Date
    const map = new Map<string, CalendarEvent[]>();
    filtered.forEach((e) => {
      const list = map.get(e.dateStr) || [];
      list.push(e);
      map.set(e.dateStr, list);
    });

    // Sort ascending by date
    const sortedDates = Array.from(map.keys()).sort();

    return sortedDates.map((dateStr) => {
      const items = map.get(dateStr) || [];
      const holidayItem = items.find((i) => i.isHoliday);
      const isToday = dateStr === TODAY_STR;
      const formatted = formatDateDisplay(dateStr);
      const cleanItems = items.filter((i) => !i.isHoliday);

      // Structure section data based on viewMode:
      // In List view: 1 item per row.
      // In Card view: Chunk into pairs of 2 for a 2-column grid layout!
      let dataRows: EventRowItem[] = [];
      if (viewMode === 'list') {
        dataRows = cleanItems.map((item) => ({
          id: item.id,
          events: [item],
        }));
      } else {
        // Chunk into pairs of 2 events per row
        for (let i = 0; i < cleanItems.length; i += 2) {
          const pair = cleanItems.slice(i, i + 2);
          dataRows.push({
            id: pair.map((p) => p.id).join('_'),
            events: pair,
          });
        }
      }

      return {
        dateStr,
        displayDate: formatted.full,
        shortDate: formatted.short,
        isToday,
        isHolidayGroup: !!holidayItem,
        holidayTitle: holidayItem?.title,
        data: dataRows,
      };
    });
  }, [ipos, selectedBoard, viewMode]);

  // High contrast badge styling for both Dark & Light themes
  const getStatusBadge = (status: EventStatus) => {
    switch (status) {
      case 'OPEN':
        return {
          bg: isDark ? '#1E3A8A55' : '#DBEAFE',
          text: isDark ? '#93C5FD' : '#1D4ED8',
          dot: isDark ? '#60A5FA' : '#2563EB',
          label: 'OPEN',
        };
      case 'ALLOTMENT':
        return {
          bg: isDark ? '#064E3B55' : '#D1FAE5',
          text: isDark ? '#6EE7B7' : '#047857',
          dot: isDark ? '#34D399' : '#059669',
          label: 'ALLOTMENT',
        };
      case 'LISTING':
      case 'LISTED':
        return {
          bg: isDark ? '#78350F55' : '#FEF3C7',
          text: isDark ? '#FDE047' : '#B45309',
          dot: isDark ? '#FACC15' : '#D97706',
          label: status,
        };
      case 'CLOSING':
      case 'CLOSED':
      default:
        return {
          bg: isDark ? '#37415155' : '#E2E8F0',
          text: isDark ? '#D1D5DB' : '#334155',
          dot: isDark ? '#9CA3AF' : '#64748B',
          label: status,
        };
    }
  };

  const getBoardBadge = (type: CalendarEvent['issueType']) => {
    switch (type) {
      case 'NSE SME':
        return {
          bg: isDark ? '#581C8755' : '#F3E8FF',
          text: isDark ? '#E9D5FF' : '#7E22CE',
          border: isDark ? '#7E22CE44' : '#D8B4FE',
          label: 'NSE SME',
        };
      case 'BSE SME':
        return {
          bg: isDark ? '#1E3A8A55' : '#E0F2FE',
          text: isDark ? '#BFDBFE' : '#0369A1',
          border: isDark ? '#1D4ED844' : '#7DD3FC',
          label: 'BSE SME',
        };
      case 'MAINBOARD':
      default:
        return {
          bg: isDark ? '#312E8155' : '#EEF2FF',
          text: isDark ? '#C7D2FE' : '#4338CA',
          border: isDark ? '#4338CA44' : '#C7D2FE',
          label: 'MAINBOARD',
        };
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Navigation Header (No grey line below header) */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            height: topPad + 60,
            backgroundColor: colors.background,
            borderBottomWidth: 0, // Removed grey line
          },
        ]}
      >
        <IconButton name="chevron-left" variant="surface" size="md" onPress={() => router.back()} />

        <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPO Event Calendar</Text>

        {/* View Mode Toggle: List vs 2-Column Card Grid */}
        <View style={[styles.viewModeToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => setViewMode('list')}
            style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: isDark ? colors.primary : '#0F172A' }]}
          >
            <Feather name="list" size={15} color={viewMode === 'list' ? '#FFFFFF' : colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('card')}
            style={[styles.toggleBtn, viewMode === 'card' && { backgroundColor: isDark ? colors.primary : '#0F172A' }]}
          >
            <Feather name="grid" size={15} color={viewMode === 'card' ? '#FFFFFF' : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter/Chips Bar (Matching reference screenshot: fully rounded pill shapes, no bottom line) */}
      <View style={[styles.filterBar, { backgroundColor: colors.background }]}>
        {(['ALL', 'MAINBOARD', 'SME'] as const).map((b) => {
          const active = selectedBoard === b;
          return (
            <TouchableOpacity
              key={b}
              onPress={() => setSelectedBoard(b)}
              style={[
                styles.boardPillChip,
                active
                  ? {
                      backgroundColor: isDark ? '#818CF8' : '#0F172A',
                      borderColor: isDark ? '#818CF8' : '#0F172A',
                    }
                  : {
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.boardPillChipText,
                  { color: active ? '#FFFFFF' : colors.foreground },
                  active && { fontFamily: 'GoogleSansFlex_700Bold' },
                ]}
              >
                {b === 'ALL' ? 'All Boards' : b === 'MAINBOARD' ? 'Mainboard' : 'SME Only'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Main Timeline SectionList with STICKY HEADERS */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={true}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 24 }}
        renderSectionHeader={({ section }) => (
          <View style={[styles.stickyHeaderContainer, { backgroundColor: colors.background }]}>
            {/* Distinct Date Header Card with Extra Highlight for Today */}
            <View
              style={[
                styles.distinctDateCard,
                section.isToday
                  ? {
                      backgroundColor: isDark ? '#312E81' : '#EEF2FF',
                      borderColor: '#6366F1',
                      borderWidth: 1.5,
                    }
                  : {
                      backgroundColor: isDark ? '#181826' : '#F1F5F9',
                      borderColor: isDark ? '#2D2D42' : '#CBD5E1',
                      borderWidth: 1,
                    },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={[
                    styles.dateIconCircle,
                    {
                      backgroundColor: section.isToday
                        ? '#6366F1'
                        : section.isHolidayGroup
                        ? '#3B82F6'
                        : isDark
                        ? '#2B2B3F'
                        : '#E2E8F0',
                    },
                  ]}
                >
                  <Feather
                    name={section.isHolidayGroup ? 'umbrella' : 'calendar'}
                    size={14}
                    color={section.isToday || section.isHolidayGroup ? '#FFFFFF' : colors.foreground}
                  />
                </View>

                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      style={[
                        styles.distinctDateTitle,
                        { color: section.isToday ? (isDark ? '#E0E7FF' : '#1E1B4B') : colors.foreground },
                      ]}
                    >
                      {section.displayDate}
                    </Text>

                    {/* Today's Extra Highlight Glow Badge */}
                    {section.isToday && (
                      <View style={styles.todaySparkleBadge}>
                        <Text style={styles.todaySparkleBadgeText}>✨ TODAY</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {section.isHolidayGroup ? (
                <View style={[styles.holidayPillBadge, { backgroundColor: '#3B82F622' }]}>
                  <Text style={[styles.holidayPillText, { color: '#3B82F6' }]}>MARKET HOLIDAY</Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.eventCountChip,
                    {
                      backgroundColor: section.isToday
                        ? (isDark ? '#4338CA66' : '#C7D2FE')
                        : isDark
                        ? '#252538'
                        : '#E2E8F0',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.eventCountChipText,
                      { color: section.isToday ? (isDark ? '#C7D2FE' : '#3730A3') : colors.mutedForeground },
                    ]}
                  >
                    {section.data.reduce((acc, curr) => acc + curr.events.length, 0)} events
                  </Text>
                </View>
              )}
            </View>

            {/* Festive Market Holiday Banner (if holiday section) */}
            {section.isHolidayGroup && section.holidayTitle ? (
              <View style={[styles.festiveHolidayCard, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF', borderColor: '#3B82F644' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.festiveHolidayTitle, { color: colors.foreground }]}>
                      {section.holidayTitle}
                    </Text>
                    <Text style={[styles.festiveHolidaySub, { color: colors.mutedForeground }]}>
                      Indian Stock Markets Closed Today
                    </Text>
                  </View>
                  <View style={styles.festiveHolidayIconBox}>
                    <Text style={{ fontSize: 22 }}>🌴</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        )}
        renderItem={({ item: rowItem, section }) => {
          // ── LIST VIEW: 1 event per row ──
          if (viewMode === 'list') {
            const event = rowItem.events[0];
            if (!event) return null;
            const statusInfo = getStatusBadge(event.status);
            const boardInfo = getBoardBadge(event.issueType);

            return (
              <TouchableOpacity
                key={event.id}
                onPress={() => {
                  if (event.ipoId) {
                    router.push({ pathname: '/ipo-details', params: { id: event.ipoId } } as any);
                  }
                }}
                activeOpacity={event.ipoId ? 0.75 : 1}
                style={[
                  styles.eventRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.eventCompanyTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {event.title}
                </Text>

                <View style={styles.rightBadgesCluster}>
                  {/* Board Badge */}
                  <View style={[styles.boardBadge, { backgroundColor: boardInfo.bg, borderColor: boardInfo.border }]}>
                    <Text style={[styles.boardBadgeText, { color: boardInfo.text }]}>
                      {boardInfo.label}
                    </Text>
                  </View>

                  {/* Status Badge */}
                  <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusInfo.dot }]} />
                    <Text style={[styles.statusBadgeText, { color: statusInfo.text }]}>
                      {statusInfo.label}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }

          // ── CARD VIEW: 2 COLUMNS side-by-side in each row ──
          return (
            <View style={styles.twoColumnGridRow} key={rowItem.id}>
              {rowItem.events.map((event) => {
                const statusInfo = getStatusBadge(event.status);
                const boardInfo = getBoardBadge(event.issueType);

                return (
                  <TouchableOpacity
                    key={event.id}
                    onPress={() => {
                      if (event.ipoId) {
                        router.push({ pathname: '/ipo-details', params: { id: event.ipoId } } as any);
                      }
                    }}
                    activeOpacity={event.ipoId ? 0.75 : 1}
                    style={[
                      styles.gridSquareCardTwoCol,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* Top Row: Board Badge on left, Date string on top right */}
                    <View style={styles.gridCardTopRow}>
                      <View style={[styles.boardBadge, { backgroundColor: boardInfo.bg, borderColor: boardInfo.border }]}>
                        <Text style={[styles.boardBadgeText, { color: boardInfo.text }]}>
                          {boardInfo.label}
                        </Text>
                      </View>

                      <Text style={[styles.gridCardTopDate, { color: colors.mutedForeground }]}>
                        {section.shortDate}
                      </Text>
                    </View>

                    {/* Middle: Company Title */}
                    <Text style={[styles.gridCardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {event.title}
                    </Text>

                    {/* Bottom: Status Badge directly BELOW IPO Name */}
                    <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                      <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusInfo.dot }]} />
                        <Text style={[styles.statusBadgeText, { color: statusInfo.text }]}>
                          {statusInfo.label}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Empty placeholder for odd number of items in row */}
              {rowItem.events.length === 1 && <View style={styles.gridSquareCardTwoColPlaceholder} />}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  viewModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },

  // Filter/Chips bar matching uploaded image (No bottom border)
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  boardPillChip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999, // Pill shape like screenshot
    borderWidth: 1,
  },
  boardPillChipText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // Sticky Section Header Container
  stickyHeaderContainer: {
    paddingVertical: 6,
    zIndex: 10,
  },

  // Distinct Date Header Card Design
  distinctDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  dateIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  distinctDateTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  todaySparkleBadge: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  todaySparkleBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  eventCountChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eventCountChipText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  holidayPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  holidayPillText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },

  // Festive Market Holiday Banner
  festiveHolidayCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 6,
  },
  festiveHolidayTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 2,
  },
  festiveHolidaySub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  festiveHolidayIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F618',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List View Styles
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 6,
  },
  eventCompanyTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  rightBadgesCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  boardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  boardBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.4,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.4,
  },

  // Refined 2-Column Grid Card View Styles
  twoColumnGridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 6,
  },
  gridSquareCardTwoCol: {
    flex: 1,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 110,
  },
  gridSquareCardTwoColPlaceholder: {
    flex: 1,
  },
  gridCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 8,
  },
  gridCardTopDate: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  gridCardTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 18,
    marginBottom: 8,
  },
});
