import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency } from '@/utils/formatters';

type Props = {
  ipo: IPOMasterRecord;
  onRemove: (id: string) => void;
  width?: number;
};

export const CompareCard = React.memo(function CompareCard({ ipo, onRemove, width = 160 }: Props) {
  const colors = useColors();
  const [logoError, setLogoError] = React.useState(false);

  const priceText = React.useMemo(() => {
    if (ipo.price_band_max) return formatCurrency(ipo.price_band_max);
    if (ipo.price_band_min) return formatCurrency(ipo.price_band_min);
    return 'TBA';
  }, [ipo.price_band_min, ipo.price_band_max]);

  const initials = (ipo.company_name || ipo.ipo_name || 'I')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.card, { width, backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => onRemove(ipo.id)}
        style={[styles.removeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        hitSlop={8}
      >
        <Feather name="x" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>

      {ipo.logo_url && !logoError ? (
        <Image
          source={{ uri: ipo.logo_url }}
          style={styles.logo}
          onError={() => setLogoError(true)}
        />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.primary + '16' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
        </View>
      )}

      <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
        {ipo.company_name || ipo.ipo_name}
      </Text>

      <Text style={[styles.price, { color: colors.primary }]} numberOfLines={1}>
        {priceText}
      </Text>

      <Text style={[styles.exchange, { color: colors.mutedForeground }]} numberOfLines={1}>
        {ipo.exchange || 'BSE / NSE'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 130,
  },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  name: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 4,
    minHeight: 32,
  },
  price: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  exchange: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
});
