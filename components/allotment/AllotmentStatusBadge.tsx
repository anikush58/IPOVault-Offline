import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { DesignSystem } from '@/constants/DesignSystem';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type AllotmentBadgeStatus =
  | 'ALLOTTED'
  | 'PARTIALLY_ALLOTTED'
  | 'NOT_ALLOTTED'
  | 'NO_RECORD'
  | 'NOT_AVAILABLE'
  | 'CHECK_FAILED'
  | 'UNAVAILABLE'
  | 'NEEDS_REVIEW'
  | 'PENDING'
  | 'CHECKING'
  | 'allotted'
  | 'partially_allotted'
  | 'not_allotted'
  | 'no_record'
  | 'not_available'
  | 'check_failed'
  | 'unavailable'
  | 'needs_review'
  | 'pending'
  | 'checking';

interface AllotmentStatusBadgeProps {
  status: AllotmentBadgeStatus;
  sharesAllotted?: number;
  customLabel?: string;
  size?: 'sm' | 'md';
}

export const AllotmentStatusBadge: React.FC<AllotmentStatusBadgeProps> = ({
  status: rawStatus,
  sharesAllotted,
  customLabel,
  size = 'md',
}) => {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const status = (rawStatus || 'PENDING').toUpperCase() as AllotmentBadgeStatus;

  let label = customLabel;
  let bg = isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9';
  let textColor = colors.foreground;
  let iconBg = colors.mutedForeground;
  let iconType: 'feather' | 'fa5' = 'feather';
  let iconName: string = 'check';

  switch (status) {
    case 'ALLOTTED':
      label =
        label ||
        (sharesAllotted ? `Allotted • ${sharesAllotted} Shares` : 'Allotted');
      textColor = '#FFFFFF';
      bg = '#10B981';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'feather';
      iconName = 'check';
      break;

    case 'PARTIALLY_ALLOTTED':
      label =
        label ||
        (sharesAllotted
          ? `Partial • ${sharesAllotted} Shares`
          : 'Partially Allotted');
      textColor = '#FFFFFF';
      bg = '#F59E0B';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'feather';
      iconName = 'check';
      break;

    case 'NOT_ALLOTTED':
      label = label || 'No Shares allotted';
      textColor = '#FFFFFF';
      bg = '#EF4444';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'feather';
      iconName = 'x';
      break;

    case 'NO_RECORD':
      label = label || 'No Record Found';
      textColor = '#FFFFFF';
      bg = '#64748B';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'fa5';
      iconName = 'question';
      break;

    case 'NOT_AVAILABLE':
      label = label || 'Allotment Not Available';
      textColor = '#FFFFFF';
      bg = '#64748B';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'feather';
      iconName = 'info';
      break;

    case 'CHECK_FAILED':
    case 'UNAVAILABLE':
      label = label || 'Check Failed';
      textColor = '#FFFFFF';
      bg = '#EF4444';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'feather';
      iconName = 'slash';
      break;

    case 'NEEDS_REVIEW':
      label = label || 'Needs Review';
      textColor = '#FFFFFF';
      bg = '#F59E0B';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'feather';
      iconName = 'clock';
      break;

    case 'CHECKING':
      label = label || 'Checking...';
      textColor = '#FFFFFF';
      bg = '#2563EB';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'feather';
      iconName = 'loader';
      break;

    case 'PENDING':
    default:
      label = label || 'Pending';
      textColor = '#FFFFFF';
      bg = '#64748B';
      iconBg = 'rgba(255, 255, 255, 0.22)';
      iconType = 'feather';
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
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderRadius: 5,
        },
      ]}
    >
      {status === 'CHECKING' ? (
        <ActivityIndicator
          size="small"
          color={textColor}
          style={{ marginRight: 6 }}
        />
      ) : (
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: iconBg,
              width: 14,
              height: 14,
              borderRadius: 7,
              marginRight: 6,
            },
          ]}
        >
          {iconType === 'fa5' ? (
            <FontAwesome5
              name={iconName}
              size={8}
              color="#FFFFFF"
            />
          ) : (
            <Feather
              name={iconName as any}
              size={8.5}
              color="#FFFFFF"
            />
          )}
        </View>
      )}
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            fontSize: 10,
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
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: DesignSystem.typography.fontBold,
    letterSpacing: -0.2,
  },
});

