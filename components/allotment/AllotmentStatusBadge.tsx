import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { DesignSystem } from '@/constants/DesignSystem';

export type AllotmentBadgeStatus =
  | 'ALLOTTED'
  | 'PARTIALLY_ALLOTTED'
  | 'NOT_ALLOTTED'
  | 'NO_RECORD'
  | 'NEEDS_REVIEW'
  | 'PENDING'
  | 'CHECKING';

interface AllotmentStatusBadgeProps {
  status: AllotmentBadgeStatus;
  sharesAllotted?: number;
  customLabel?: string;
  size?: 'sm' | 'md';
}

export const AllotmentStatusBadge: React.FC<AllotmentStatusBadgeProps> = ({
  status,
  sharesAllotted,
  customLabel,
  size = 'md',
}) => {
  const colors = useColors();

  let label = customLabel;
  let bg = colors.surface;
  let color = colors.foreground;
  let iconName: any = 'circle';

  switch (status) {
    case 'CHECKING':
      label = label || 'Checking...';
      color = colors.primary;
      bg = '#FEF9C3';
      iconName = 'loader';
      break;

    case 'ALLOTTED':
      label = label || (sharesAllotted ? `Allotted • ${sharesAllotted} shares` : 'Allotted');
      color = colors.statusAllotted;
      bg = colors.statusAllottedBg;
      iconName = 'check-circle';
      break;

    case 'PARTIALLY_ALLOTTED':
      label = label || (sharesAllotted ? `Partial • ${sharesAllotted} shares` : 'Partially Allotted');
      color = '#10B981';
      bg = '#D1FAE5';
      iconName = 'check-circle';
      break;

    case 'NOT_ALLOTTED':
      label = label || 'Not Allotted';
      color = colors.statusNotAllotted;
      bg = colors.statusNotAllottedBg;
      iconName = 'x-circle';
      break;

    case 'NO_RECORD':
      label = label || 'No Record Found';
      color = colors.mutedForeground;
      bg = colors.statusRefundBg;
      iconName = 'help-circle';
      break;

    case 'NEEDS_REVIEW':
      label = label || 'Needs Review';
      color = colors.statusPending;
      bg = colors.statusPendingBg;
      iconName = 'alert-triangle';
      break;

    case 'PENDING':
    default:
      label = label || 'Pending';
      color = colors.statusPending;
      bg = colors.statusPendingBg;
      iconName = 'clock';
      break;
  }

  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          paddingHorizontal: isSmall ? 8 : 10,
          paddingVertical: isSmall ? 4 : 6,
          borderRadius: DesignSystem.radius.pill,
        },
      ]}
    >
      {status === 'CHECKING' ? (
        <ActivityIndicator size="small" color={color} style={{ marginRight: 4 }} />
      ) : (
        <Feather name={iconName} size={isSmall ? 11 : 13} color={color} style={{ marginRight: 4 }} />
      )}
      <Text
        style={[
          styles.text,
          {
            color,
            fontSize: isSmall ? DesignSystem.typography.size.caption : DesignSystem.typography.size.bodySm,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: DesignSystem.typography.fontBold,
    letterSpacing: -0.1,
  },
});
