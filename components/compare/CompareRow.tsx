import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { DifferenceHighlight } from './DifferenceHighlight';

type Props = {
  label: string;
  values: Array<{
    id: string;
    text: string;
    isBest?: boolean;
    customContent?: React.ReactNode;
  }>;
  columnWidth?: number;
  labelWidth?: number;
};

export const CompareRow = React.memo(function CompareRow({
  label,
  values,
  columnWidth = 160,
  labelWidth = 130,
}: Props) {
  const colors = useColors();

  return (
    <View style={[styles.row, { borderBottomColor: colors.border + '60' }]}>
      {/* Fixed Parameter Label Column */}
      <View style={[styles.labelCol, { width: labelWidth }]}>
        <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={2}>
          {label}
        </Text>
      </View>

      {/* Horizontal Values Columns */}
      {values.map((item) => (
        <View key={item.id} style={{ width: columnWidth, paddingHorizontal: 4 }}>
          <DifferenceHighlight isBest={item.isBest}>
            {item.customContent ? (
              item.customContent
            ) : (
              <Text
                style={[
                  styles.valueText,
                  { color: item.isBest ? '#B45309' : colors.foreground },
                  item.isBest && styles.bestText,
                ]}
                numberOfLines={3}
              >
                {item.text || '—'}
              </Text>
            )}
          </DifferenceHighlight>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    minHeight: 48,
  },
  labelCol: {
    paddingRight: 8,
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  valueText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  bestText: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
