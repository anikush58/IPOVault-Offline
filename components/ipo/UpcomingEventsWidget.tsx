import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency } from '@/utils/formatters';

export function UpcomingEventsWidget() {
  const colors = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const repo = useMemo(() => new IPORepository(db), [db]);

  const [events, setEvents] = useState<Array<{ ipo: IPOMasterRecord; label: string; color: string; dateStr: string }>>([]);

  useEffect(() => {
    async function loadEvents() {
      try {
        const [upcoming, open, closed, listed] = await Promise.all([
          repo.getUpcoming(),
          repo.getOpen(),
          repo.getClosed(),
          repo.getListed(),
        ]);

        const map = new Map<string, IPOMasterRecord>();
        [...upcoming, ...open, ...closed, ...listed].forEach((r) => map.set(r.id, r));
        const records = Array.from(map.values());

        const today = new Date().toISOString().split('T')[0];

        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrow = tomorrowDate.toISOString().split('T')[0];

        const items: Array<{ ipo: IPOMasterRecord; label: string; color: string; dateStr: string }> = [];

        records.forEach((r) => {
          if (r.open_date === today) {
            items.push({ ipo: r, label: 'Opening Today', color: '#10B981', dateStr: today });
          } else if (r.close_date === today) {
            items.push({ ipo: r, label: 'Closing Today', color: '#EF4444', dateStr: today });
          } else if (r.allotment_date === tomorrow) {
            items.push({ ipo: r, label: 'Allotment Tomorrow', color: '#F59E0B', dateStr: tomorrow });
          } else if (r.listing_date && r.listing_date >= today) {
            items.push({ ipo: r, label: 'Listing Soon', color: '#3B82F6', dateStr: r.listing_date });
          }
        });

        setEvents(items.slice(0, 5));
      } catch (err) {
        if (__DEV__) console.warn('[UpcomingEventsWidget] Failed to load', err);
      }
    }

    loadEvents();
  }, [repo]);

  if (events.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.primary }]}>UPCOMING IPO EVENTS</Text>
        <TouchableOpacity onPress={() => router.push('/ipo-calendar' as any)}>
          <Text style={[styles.viewAll, { color: colors.primary }]}>View Calendar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {events.map(({ ipo, label, color, dateStr }, idx) => {
          const price = ipo.price_band_max ? formatCurrency(ipo.price_band_max) : 'TBA';
          return (
            <TouchableOpacity
              key={`${ipo.id}-${idx}`}
              onPress={() => router.push({ pathname: '/ipo-details' as any, params: { id: ipo.id } })}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <View style={[styles.badge, { backgroundColor: color + '18' }]}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={[styles.badgeText, { color }]}>{label}</Text>
              </View>
              <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                {ipo.company_name || ipo.ipo_name}
              </Text>
              <Text style={[styles.price, { color: colors.mutedForeground }]}>{price}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
  },
  viewAll: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    width: 170,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  name: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 4,
  },
  price: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
});
