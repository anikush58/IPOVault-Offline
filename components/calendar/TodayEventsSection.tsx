import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { IPOStatusChip } from '@/components/ipo/IPOStatusChip';

export type TodayEventType = 'open' | 'close' | 'allotment' | 'listing';

export type TodayEventItem = {
  ipo: IPOMasterRecord;
  type: TodayEventType;
  dateStr: string;
};

type Props = {
  events: TodayEventItem[];
};

export const TodayEventsSection = React.memo(function TodayEventsSection({ events }: Props) {
  const colors = useColors();
  const router = useRouter();

  if (events.length === 0) {
    return (
      <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="calendar" size={24} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No IPO Activity Today</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
          There are no IPOs opening, closing, allotting, or listing today.
        </Text>
      </View>
    );
  }

  const getConfig = (type: TodayEventType) => {
    switch (type) {
      case 'open':
        return { label: 'Opening Today', color: '#10B981', bg: '#ECFDF5', icon: 'play-circle' };
      case 'close':
        return { label: 'Closing Today', color: '#EF4444', bg: '#FEF2F2', icon: 'stop-circle' };
      case 'allotment':
        return { label: 'Allotment Today', color: '#F59E0B', bg: '#FFFBEB', icon: 'pie-chart' };
      case 'listing':
        return { label: 'Listing Today', color: '#3B82F6', bg: '#EFF6FF', icon: 'trending-up' };
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.primary }]}>TODAY'S ACTIVITY ({events.length})</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {events.map(({ ipo, type, dateStr }, index) => {
          const cfg = getConfig(type);
          const priceText = ipo.price_band_max
            ? formatCurrency(ipo.price_band_max)
            : ipo.price_band_min
            ? formatCurrency(ipo.price_band_min)
            : 'TBA';

          return (
            <TouchableOpacity
              key={`${ipo.id}-${type}-${index}`}
              onPress={() => router.push({ pathname: '/ipo-details' as any, params: { id: ipo.id } })}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.85}
            >
              <View style={styles.topRow}>
                <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
                  <Feather name={cfg.icon as any} size={12} color={cfg.color} />
                  <Text style={[styles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                <IPOStatusChip status={ipo.status} />
              </View>

              <Text style={[styles.companyName, { color: colors.foreground }]} numberOfLines={1}>
                {ipo.company_name || ipo.ipo_name}
              </Text>

              <View style={styles.bottomRow}>
                <View>
                  <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>PRICE BAND</Text>
                  <Text style={[styles.metaValue, { color: colors.primary }]}>{priceText}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>EXCHANGE</Text>
                  <Text style={[styles.metaValue, { color: colors.foreground }]}>{ipo.exchange || 'BSE/NSE'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 230,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  companyName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginBottom: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.1)',
  },
  metaLabel: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.6,
  },
  metaValue: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 2,
  },
  emptyBox: {
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 4,
  },
});
