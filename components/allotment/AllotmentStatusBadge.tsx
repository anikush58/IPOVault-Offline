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
      textColor = isDark ? '#4ADE80' : '#2FA011';
      bg = isDark ? 'rgba(47, 160, 17, 0.18)' : '#EBFFDF';
      iconBg = isDark ? '#22C55E' : '#2FA011';
      iconType = 'feather';
      iconName = 'check';
      break;

    case 'PARTIALLY_ALLOTTED':
      label =
        label ||
        (sharesAllotted
          ? `Partial • ${sharesAllotted} Shares`
          : 'Partially Allotted');
      textColor = isDark ? '#4ADE80' : '#2FA011';
      bg = isDark ? 'rgba(47, 160, 17, 0.18)' : '#EBFFDF';
      iconBg = isDark ? '#22C55E' : '#2FA011';
      iconType = 'feather';
      iconName = 'check';
      break;

    case 'NOT_ALLOTTED':
      label = label || 'No Shares allotted';
      textColor = isDark ? '#FB7185' : '#F24E4E';
      bg = isDark ? 'rgba(242, 78, 78, 0.18)' : '#FFE8E8';
      iconBg = isDark ? '#FB7185' : '#F24E4E';
      iconType = 'feather';
      iconName = 'x';
      break;

    case 'NO_RECORD':
      label = label || 'No Record Found';
      textColor = isDark ? '#94A3B8' : '#607386';
      bg = isDark ? 'rgba(96, 115, 134, 0.18)' : '#EDF4F9';
      iconBg = isDark ? '#94A3B8' : '#607386';
      iconType = 'fa5';
      iconName = 'question';
      break;

    case 'NOT_AVAILABLE':
      label = label || 'Allotment Not Declared';
      textColor = isDark ? '#94A3B8' : '#607386';
      bg = isDark ? 'rgba(96, 115, 134, 0.18)' : '#EDF4F9';
      iconBg = isDark ? '#94A3B8' : '#607386';
      iconType = 'feather';
      iconName = 'info';
      break;

    case 'CHECK_FAILED':
    case 'UNAVAILABLE':
      label = label || 'Check Failed';
      textColor = isDark ? '#FB7185' : '#F24E4E';
      bg = isDark ? 'rgba(242, 78, 78, 0.18)' : '#FFE8E8';
      iconBg = isDark ? '#FB7185' : '#F24E4E';
      iconType = 'feather';
      iconName = 'slash';
      break;

    case 'NEEDS_REVIEW':
      label = label || 'Needs Review';
      textColor = isDark ? '#FBBF24' : '#D97706';
      bg = isDark ? 'rgba(217, 119, 6, 0.18)' : '#FFF0D9';
      iconBg = isDark ? '#FBBF24' : '#D97706';
      iconType = 'feather';
      iconName = 'clock';
      break;

    case 'CHECKING':
      label = label || 'Checking...';
      textColor = colors.primary;
      bg = isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFF0D9';
      iconBg = colors.primary;
      iconType = 'feather';
      iconName = 'loader';
      break;

    case 'PENDING':
    default:
      label = label || 'Pending';
      textColor = colors.mutedForeground;
      bg = isDark ? 'rgba(255, 255, 255, 0.06)' : '#EDF4F9';
      iconBg = colors.mutedForeground;
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
          borderRadius: 70,
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

