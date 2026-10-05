import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { useDB } from '@/context/DBContext';
import { formatCurrency, formatIssueSize } from '@/utils/formatters';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { triggerCentralizedIPOSync } from '@/services/ipo/centralizedSync';

type NewIpoTab = 'live' | 'upcoming' | 'closed' | 'listed';
type SortOption = 'DEFAULT' | 'GMP';

const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'],
  ['#10B981', '#047857'],
  ['#3B82F6', '#1D4ED8'],
  ['#F59E0B', '#B45309'],
  ['#EC4899', '#BE185D'],
  ['#6366F1', '#4338CA'],
  ['#14B8A6', '#0F766E'],
  ['#F43F5E', '#BE123C'],
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDateComponents(str?: string | null): { day: number; month: string; monthIdx: number } | null {
  if (!str) return null;
  const clean = str.trim();
  if (!clean || clean.toUpperCase() === 'TBA' || clean.toUpperCase() === 'N/A') return null;

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/);
    const day = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    if (!isNaN(day) && monthIdx >= 0 && monthIdx < 12) {
      return { day, month: MONTHS_SHORT[monthIdx], monthIdx };
    }
  }

  // YYYY-MM-DD or ISO string
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(clean)) {
    const datePart = clean.split('T')[0];
    const parts = datePart.split(/[-/]/);
    const day = parseInt(parts[2], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    if (!isNaN(day) && monthIdx >= 0 && monthIdx < 12) {
      return { day, month: MONTHS_SHORT[monthIdx], monthIdx };
    }
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return { day: d.getDate(), month: MONTHS_SHORT[d.getMonth()], monthIdx: d.getMonth() };
  }
  return null;
}

function formatSingleDate(dateStr?: string | null): string {
  if (!dateStr) return 'TBA';
  const parsed = parseDateComponents(dateStr);
  if (parsed) {
    return `${parsed.day} ${parsed.month}`;
  }
  return dateStr.trim() || 'TBA';
}

function formatApplyDates(openDate?: string | null, closeDate?: string | null): string {
  if (!openDate && !closeDate) return 'TBA';
  const o = parseDateComponents(openDate);
  const c = parseDateComponents(closeDate);

  if (o && c) {
    if (o.monthIdx === c.monthIdx) {
      return `${o.day}-${c.day} ${o.month}`;
    }
    return `${o.day} ${o.month} - ${c.day} ${c.month}`;
  }
  if (o) return `${o.day} ${o.month}`;
  if (c) return `${c.day} ${c.month}`;
  return 'TBA';
}

function getIpoGmpPercentage(item: BackendIpo): number {
  if (item.currentGmp?.gmpPercentage != null) {
    const p = parseFloat(String(item.currentGmp.gmpPercentage));
    if (!isNaN(p)) return p;
  }
  if (item.currentGmp?.gmpAmount != null) {
    const amt = parseFloat(String(item.currentGmp.gmpAmount));
    const price = item.priceBandHigh || item.priceBandLow || item.issuePriceInr || 0;
    if (!isNaN(amt) && price > 0) {
      return (amt / price) * 100;
    }
  }
  return 0;
}

function hasActiveGmp(item: BackendIpo): boolean {
  const gmpAmt = item.currentGmp?.gmpAmount != null ? parseFloat(String(item.currentGmp.gmpAmount)) : null;
  const gmpPct = item.currentGmp?.gmpPercentage != null ? parseFloat(String(item.currentGmp.gmpPercentage)) : null;
  const isAmtActive = gmpAmt !== null && !isNaN(gmpAmt) && gmpAmt > 0;
  const isPctActive = gmpPct !== null && !isNaN(gmpPct) && gmpPct > 0;
  return isAmtActive || isPctActive;
}

function isClosingToday(item: BackendIpo): boolean {
  const st = (item.status || '').toUpperCase().trim();
  if (st === 'CLOSING_TODAY' || st === 'CLOSING TODAY' || st === 'CLOSES TODAY') return true;

  const todayIso = new Date().toISOString().split('T')[0];
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const closeDate = (item.closeDate || item.lifecycle?.closeDate || '').trim();
  if (closeDate) {
    if (closeDate === todayIso || closeDate === localToday) return true;
  }
  return false;
}

function getStatusBadge(status?: string, openDate?: string | null) {
  const norm = (status || '').toUpperCase().trim();
  if (norm === 'CLOSING_TODAY' || norm === 'CLOSING TODAY' || norm === 'CLOSES TODAY') {
    return { text: 'Closing Today', bg: '#FEF3C7', color: '#D97706', icon: 'alert-circle' };
  }
  if (norm === 'OPEN' || norm === 'ACTIVE' || norm === 'LIVE') {
    return { text: 'Live Now', bg: '#DCFCE7', color: '#15803D', icon: 'activity' };
  }
  if (norm === 'LISTED') {
    return { text: 'Listed', bg: '#E0E7FF', color: '#4338CA', icon: 'check-circle' };
  }
  if (
    norm === 'ALLOTMENT_AWAITED' ||
    norm === 'ALLOTMENT AWAITED' ||
    norm === 'ALLOTMENT_PENDING' ||
    norm === 'ALLOTMENT PENDING' ||
    norm === 'ALLOTTED_PENDING' ||
    norm === 'AWAITING ALLOTMENT' ||
    norm === 'AWAITING_ALLOTMENT'
  ) {
    return { text: 'Allotment Awaited', bg: '#FEF3C7', color: '#D97706', border: 'transparent', borderWidth: 0, icon: 'clock' };
  }
  if (
    norm === 'ALLOTMENT_OUT' ||
    norm === 'ALLOTTED' ||
    norm === 'ALLOTMENT' ||
    norm === 'ALLOTMENT_COMPLETED' ||
    norm === 'ALLOTTED_AVAILABLE' ||
    norm.includes('ALLOT')
  ) {
    return { text: 'Allotment Out', bg: '#DCFCE7', color: '#059669', border: 'transparent', borderWidth: 0, icon: 'check-circle' };
  }
  if (norm === 'CLOSED' || (norm.includes('CLOSED') && norm !== 'CLOSING_TODAY')) {
    return { text: 'Closed', bg: '#F1F5F9', color: '#64748B', icon: 'lock' };
  }
  const formattedOpen = openDate ? formatApplyDates(openDate, null) : 'Soon';
  return { text: `Opens ${formattedOpen}`, bg: '#E0F2FE', color: '#0369A1', icon: 'calendar' };
}

interface NewIpoCardItemProps {
  item: BackendIpo;
  tab: NewIpoTab;
  colors: any;
  isDark: boolean;
  totalAppsCount: number;
  appliedCount: number;
  allottedCount: number;
  onPress: (item: BackendIpo) => void;
  onApplyPress: (item: BackendIpo) => void;
}

const NewIpoCardItem = React.memo(
  function NewIpoCardItem({
    item,
    tab,
    colors,
    isDark,
    totalAppsCount,
    appliedCount,
    allottedCount,
    onPress,
    onApplyPress,
  }: NewIpoCardItemProps) {
    const router = useRouter();
    const companyName = item.company?.displayName || item.companyName || item.symbol || 'IPO';
    const formatIntPrice = (val: any) => {
      if (val == null || val === '') return null;
      const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.]/g, ''));
      if (isNaN(num)) return null;
      return Math.round(num);
    };
    const lowPrice = formatIntPrice(item.priceBandLow);
    const highPrice = formatIntPrice(item.priceBandHigh);
    const priceBandText = lowPrice && highPrice
      ? lowPrice === highPrice
        ? `₹${highPrice}`
        : `₹${lowPrice} - ₹${highPrice}`
      : highPrice
      ? `₹${highPrice}`
      : lowPrice
      ? `₹${lowPrice}`
      : 'TBA';

    const isSme = item.marketSegment === 'SME' || ((item as any).issue_type || '').toUpperCase().includes('SME');
    const upperPrice = highPrice || lowPrice || 0;
    const lotQty = item.lotSize || 0;
    const minInvestment = upperPrice && lotQty ? (isSme ? upperPrice * lotQty * 2 : upperPrice * lotQty) : null;

    const subTotal = (item as any).total_sub ?? (item as any).total_subscription ?? (item.currentSubscription?.totalSubscriptionMultiple != null ? Number(item.currentSubscription.totalSubscriptionMultiple) : null);
    const qibCat = item.currentSubscription?.categories?.find((c: any) => c.category === 'QIB');
    const subQib = (item as any).qib_sub ?? (qibCat?.subscriptionMultiple != null ? Number(qibCat.subscriptionMultiple) : null);
    const subDisplay = subTotal != null ? `${Number(subTotal).toFixed(2)}x` : (subQib != null ? `${Number(subQib).toFixed(2)}x` : '—');

    const gmpAmt = item.currentGmp?.gmpAmount != null ? Number(item.currentGmp.gmpAmount) : null;
    const gmpPct = item.currentGmp?.gmpPercentage != null ? Number(item.currentGmp.gmpPercentage) : null;
    const hasGmp = gmpAmt != null || gmpPct != null;

    const gmpDisplay = gmpAmt != null
      ? `₹${Math.round(gmpAmt)}${gmpPct != null ? ` (${Math.round(gmpPct)}%)` : ''}`
      : gmpPct != null
      ? `${Math.round(gmpPct)}%`
      : '—';

    const gmpColor = hasGmp ? ((gmpAmt || gmpPct || 0) >= 0 ? '#10B981' : '#EF4444') : colors.mutedForeground;

    const normStatus = (item.status || '').toUpperCase().trim();
    const isItemClosingToday =
      normStatus === 'CLOSING_TODAY' ||
      normStatus === 'CLOSING TODAY' ||
      normStatus === 'CLOSES TODAY' ||
      normStatus === 'CLOSING' ||
      isClosingToday(item);
    const isClosedOrListed =
      normStatus === 'CLOSED' ||
      normStatus === 'LISTED' ||
      normStatus === 'ALLOTTED' ||
      normStatus === 'ALLOTMENT_OUT' ||
      normStatus === 'ALLOTMENT_COMPLETED' ||
      (normStatus.includes('CLOSED') && !isItemClosingToday) ||
      normStatus.includes('ALLOT') ||
      normStatus.includes('LIST');
    const isListed = normStatus === 'LISTED' || tab === 'listed';
    const isUpcoming = normStatus === 'UPCOMING' || tab === 'upcoming';
    const isOpen =
      !isItemClosingToday &&
      (normStatus === 'OPEN' ||
        normStatus === 'LIVE' ||
        normStatus === 'BIDDING' ||
        normStatus === 'ACTIVE' ||
        tab === 'live') &&
      !isUpcoming &&
      !isClosedOrListed;

    const applyDateStr = formatApplyDates(item.openDate, item.closeDate);
    const allotmentDateRaw =
      item.allotmentDate ||
      item.lifecycle?.basisOfAllotmentDate ||
      item.allotment?.expectedDate ||
      item.allotment?.expectedAllotmentDate ||
      (item as any).allotment_date;
    const allotmentDateStr = formatSingleDate(allotmentDateRaw);

    const listingDateRaw =
      item.listingDate ||
      item.lifecycle?.listingDate ||
      (item as any).listing_date;
    const listingDateStr = formatSingleDate(listingDateRaw);

    let dateLabel = 'Apply Dates';
    let dateValueStr = applyDateStr;

    if (isListed) {
      dateLabel = 'Listing Date';
      dateValueStr = listingDateStr;
    } else if (tab === 'closed' || isClosedOrListed) {
      dateLabel = 'Allotment Date';
      dateValueStr = allotmentDateStr;
    }

    const logoUrl = item.company?.logoUrl || (item as any).logoUrl || (item as any).logo_url;
    const initials = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

    const statusBadge = getStatusBadge(item.status, item.openDate);
    const isAllotmentOut =
      statusBadge.text === 'Allotment Out' ||
      normStatus === 'ALLOTTED_AVAILABLE' ||
      normStatus === 'ALLOTMENT_OUT' ||
      normStatus === 'ALLOTMENT_COMPLETED' ||
      (item.status || '').toUpperCase() === 'ALLOTMENT_COMPLETED' ||
      (item.status || '').toUpperCase() === 'ALLOTMENT_OUT';

    const issuePrice = upperPrice || 0;
    const listingPrice = item.listingPrice != null ? Number(item.listingPrice) : null;
    const listingGainPct = item.listingGainPct != null ? Number(item.listingGainPct) : (listingPrice && issuePrice > 0 ? ((listingPrice - issuePrice) / issuePrice) * 100 : null);
    const profitAmt = item.profitAmount != null ? Number(item.profitAmount) : (listingPrice && issuePrice > 0 && lotQty ? (listingPrice - issuePrice) * lotQty : null);

    const exptProfitPerLot = React.useMemo(() => {
      if (gmpAmt != null && lotQty > 0) {
        return Math.round(gmpAmt * lotQty);
      }
      if (gmpPct != null && minInvestment) {
        return Math.round(minInvestment * (gmpPct / 100));
      }
      if (isListed && profitAmt != null) {
        return Math.round(profitAmt);
      }
      return null;
    }, [gmpAmt, lotQty, gmpPct, minInvestment, isListed, profitAmt]);

    const exptProfitDisplay = exptProfitPerLot != null
      ? (exptProfitPerLot >= 0 ? `₹${exptProfitPerLot.toLocaleString('en-IN')}` : `-₹${Math.abs(exptProfitPerLot).toLocaleString('en-IN')}`)
      : '—';

    const profitColor = exptProfitPerLot != null
      ? (exptProfitPerLot >= 0 ? '#10B981' : '#EF4444')
      : colors.mutedForeground;

    const buttonLabel = isAllotmentOut
      ? 'Check'
      : isUpcoming || (tab as string) === 'upcoming'
      ? 'View'
      : isListed || isClosedOrListed
      ? 'Details'
      : 'Apply Now';

    const handleButtonAction = (e: any) => {
      e.stopPropagation?.();
      if (isAllotmentOut) {
        router.push({
          pathname: '/allotment-checker',
          params: { ipoId: item.id },
        } as any);
      } else if (isOpen) {
        onApplyPress(item);
      } else {
        onPress(item);
      }
    };

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => onPress(item)}
        style={[
          styles.itemCard,
          {
            backgroundColor: isDark ? '#1E293B' : '#F4F5F7',
            borderColor: isDark ? '#334155' : '#E5E7EB',
          },
        ]}
      >
        {/* Card Header Row: Logo + Company Title & Bid Price + Badges */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.headerLeftCol}>
            <View
              style={[
                styles.logoWrap,
                {
                  backgroundColor: '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#E5E7EB',
                },
              ]}
            >
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="contain" />
              ) : (
                <LinearGradient
                  colors={getAvatarGradient(companyName)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{initials}</Text>
                </LinearGradient>
              )}
            </View>

            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={[styles.companyTitle, { color: colors.foreground }]} numberOfLines={1} ellipsizeMode="tail">
                {companyName}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', color: isDark ? '#94A3B8' : '#64748B' }}>
                  Bid Price:{' '}
                </Text>
                <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: colors.foreground }}>
                  {priceBandText}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Segment Badge (SME vs Mainboard) */}
            <View
              style={[
                styles.segmentBadge,
                isSme
                  ? {
                      backgroundColor: isDark ? 'rgba(236,72,153,0.12)' : '#FDF2F8',
                      borderColor: isDark ? 'rgba(244,114,182,0.4)' : '#FBCFE8',
                    }
                  : {
                      backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF',
                      borderColor: isDark ? 'rgba(199,210,254,0.4)' : '#C7D2FE',
                    },
              ]}
            >
              <Text
                style={[
                  styles.segmentBadgeText,
                  { color: isSme ? (isDark ? '#F472B6' : '#BE185D') : (isDark ? '#818CF8' : '#4F46E5') },
                ]}
              >
                {isSme ? 'SME' : 'Mainboard'}
              </Text>
            </View>

            {/* Status Pill */}
            <View
              style={[
                styles.statusPillNew,
                isItemClosingToday
                  ? {
                      backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
                      borderColor: isDark ? 'rgba(251,191,36,0.4)' : '#FDE68A',
                    }
                  : isOpen
                  ? {
                      backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4',
                      borderColor: isDark ? 'rgba(134,239,172,0.4)' : '#86EFAC',
                    }
                  : isUpcoming
                  ? {
                      backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#EFF6FF',
                      borderColor: isDark ? 'rgba(147,197,253,0.4)' : '#93C5FD',
                    }
                  : isAllotmentOut
                  ? {
                      backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4',
                      borderColor: isDark ? 'rgba(134,239,172,0.4)' : '#86EFAC',
                    }
                  : isListed
                  ? {
                      backgroundColor: isDark ? 'rgba(139,92,246,0.12)' : '#F5F3FF',
                      borderColor: isDark ? 'rgba(221,214,254,0.4)' : '#DDD6FE',
                    }
                  : {
                      backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : '#F8FAFC',
                      borderColor: isDark ? 'rgba(203,213,225,0.4)' : '#CBD5E1',
                    },
              ]}
            >
              {isItemClosingToday && (
                <Feather
                  name="clock"
                  size={11.5}
                  color={isDark ? '#FBBF24' : '#D97706'}
                  style={{ marginRight: 2 }}
                />
              )}
              {isOpen && (
                <Feather
                  name="zap"
                  size={11.5}
                  color={isDark ? '#4ADE80' : '#16A34A'}
                  style={{ marginRight: 2 }}
                />
              )}
              <Text
                style={[
                  styles.statusTextNew,
                  {
                    color: isItemClosingToday
                      ? (isDark ? '#FBBF24' : '#D97706')
                      : isOpen
                      ? (isDark ? '#4ADE80' : '#15803D')
                      : isUpcoming
                      ? (isDark ? '#60A5FA' : '#1D4ED8')
                      : isAllotmentOut
                      ? (isDark ? '#4ADE80' : '#15803D')
                      : isListed
                      ? (isDark ? '#A78BFA' : '#7C3AED')
                      : (isDark ? '#94A3B8' : '#64748B'),
                  },
                ]}
              >
                {isItemClosingToday
                  ? 'Closing Today'
                  : isOpen
                  ? 'Live Now'
                  : isUpcoming
                  ? 'Upcoming'
                  : isAllotmentOut
                  ? 'Allotment Out'
                  : isListed
                  ? 'Listed'
                  : 'Closed'}
              </Text>
            </View>
          </View>
        </View>

        {/* Inner White Data Box */}
        <View
          style={[
            styles.innerDataCardBox,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E5E7EB',
            },
          ]}
        >
          {/* Row 1: Apply Dates | Min Investment | Lot Size | Issue Size */}
          <View style={styles.innerDataRow}>
            <View style={{ flex: 1.2 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {dateLabel}
              </Text>
              <Text style={[styles.innerDataVal, { color: colors.foreground }]} numberOfLines={1}>
                {dateValueStr}
              </Text>
            </View>

            <View style={{ flex: 1.2 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Min Investment
              </Text>
              <Text style={[styles.innerDataVal, { color: colors.foreground }]} numberOfLines={1}>
                {minInvestment ? `₹${minInvestment.toLocaleString('en-IN')}` : '—'}
              </Text>
            </View>

            <View style={{ flex: 0.85 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Lot Size
              </Text>
              <Text style={[styles.innerDataVal, { color: colors.foreground }]} numberOfLines={1}>
                {lotQty ? `${lotQty}` : '—'}
              </Text>
            </View>

            <View style={{ flex: 1.15, alignItems: 'flex-end' }}>
              <View style={{ width: 94, alignItems: 'flex-start' }}>
                <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Issue Size
                </Text>
                <Text style={[styles.innerDataVal, { color: colors.foreground }]} numberOfLines={1}>
                  {formatIssueSize(item.issueSize ?? (item as any).issue_size ?? (item as any).totalIssueSize ?? (item as any).total_issue_size)}
                </Text>
              </View>
            </View>
          </View>

          {/* Row 2: Expt. GMP | Expt. Profit/Lot | Subscription | Action CTA Button */}
          <View style={[styles.innerDataRow, { marginTop: 14, alignItems: 'center' }]}>
            <View style={{ flex: 1.2 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Expt. GMP
              </Text>
              <Text style={[styles.innerDataVal, { color: gmpColor }]} numberOfLines={1}>
                {gmpDisplay}
              </Text>
            </View>

            <View style={{ flex: 1.2 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Expt. Profit/Lot
              </Text>
              <Text style={[styles.innerDataVal, { color: profitColor }]} numberOfLines={1}>
                {exptProfitDisplay}
              </Text>
            </View>

            <View style={{ flex: 0.85 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Subscription
              </Text>
              <Text style={[styles.innerDataVal, { color: colors.foreground }]} numberOfLines={1}>
                {subDisplay}
              </Text>
            </View>

            <View style={{ flex: 1.15, alignItems: 'flex-end', justifyContent: 'center' }}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={handleButtonAction}
                style={[
                  styles.innerApplyBtn,
                  {
                    backgroundColor: isDark ? '#38BDF8' : '#0F172A',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.innerApplyBtnText,
                    { color: isDark ? '#0F172A' : '#FFFFFF' },
                  ]}
                >
                  {buttonLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }
);

const TABS: readonly NewIpoTab[] = ['live', 'upcoming', 'closed', 'listed'] as const;

export default function NewIposScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { applications } = useDB();

  const [rawIpos, setRawIpos] = useState<BackendIpo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);

  const toggleSearch = useCallback(() => {
    if (showSearch) {
      Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
      Animated.timing(searchAnim, { toValue: 1, duration: 220, useNativeDriver: false }).start(() =>
        searchRef.current?.focus()
      );
    }
  }, [showSearch, searchAnim]);

  const searchBarHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });
  const searchBarOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const { width: screenWidth } = useWindowDimensions();
  const horizontalScrollViewRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<NewIpoTab>('live');
  const [includeSme, setIncludeSme] = useState(true);
  const [onlyActiveGmp, setOnlyActiveGmp] = useState(false);
  const [onlyClosingToday, setOnlyClosingToday] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('DEFAULT');
  const [tempIncludeSme, setTempIncludeSme] = useState(true);
  const [tempOnlyActiveGmp, setTempOnlyActiveGmp] = useState(false);
  const [tempOnlyClosingToday, setTempOnlyClosingToday] = useState(false);
  const [tempSortBy, setTempSortBy] = useState<SortOption>('DEFAULT');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const hasActiveFilter = !includeSme || onlyActiveGmp || onlyClosingToday || sortBy !== 'DEFAULT';

  const openFilterModal = useCallback(() => {
    setTempIncludeSme(includeSme);
    setTempOnlyActiveGmp(onlyActiveGmp);
    setTempOnlyClosingToday(onlyClosingToday);
    setTempSortBy(sortBy);
    setShowFilterModal(true);
    try { Haptics.selectionAsync(); } catch {}
  }, [includeSme, onlyActiveGmp, onlyClosingToday, sortBy]);

  const handleTabPress = useCallback((tab: NewIpoTab) => {
    setActiveTab(tab);
    try { Haptics.selectionAsync(); } catch {}
    const index = TABS.indexOf(tab);
    if (index !== -1) {
      horizontalScrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    }
  }, [screenWidth]);

  const handleHorizontalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / screenWidth);
    if (TABS[index] && TABS[index] !== activeTab) {
      setActiveTab(TABS[index]);
    }
  }, [screenWidth, activeTab]);

  const db = useSQLiteContext();

  const fetchBackendIpos = useCallback(async () => {
    try {
      setError(null);
      const data = await backendIpoApiService.listBackendIpos({
        q: searchQuery.trim() || undefined,
      });
      setRawIpos(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to connect to IPOVault backend API');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    setLoading(true);
    fetchBackendIpos();
  }, [fetchBackendIpos]);

  // Screen Focus Auto-Refresh
  useFocusEffect(
    useCallback(() => {
      fetchBackendIpos();
    }, [fetchBackendIpos])
  );

  // 15-Second Periodic Polling & Global Event Sync Auto-Refresh
  useEffect(() => {
    const timer = setInterval(() => {
      fetchBackendIpos();
    }, 15000);

    const unsubscribe = backendSyncEmitter.subscribe(() => {
      fetchBackendIpos();
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [fetchBackendIpos]);

  const onRefresh = useCallback(async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setRefreshing(true);
    await fetchBackendIpos();
    if (db) {
      triggerCentralizedIPOSync(db, { force: true, source: 'IPO Hub Manual Refresh' }).catch(() => {});
    }
  }, [fetchBackendIpos, db]);

  // Memoized application statistics map (O(N) calculation run only when rawIpos or applications change)
  const appStatsMap = useMemo(() => {
    const map = new Map<string, { total: number; applied: number; allotted: number }>();
    if (!rawIpos.length) return map;

    for (const item of rawIpos) {
      const companyName = (item.company?.displayName || item.companyName || item.symbol || '').toLowerCase().trim();
      let total = 0;
      let applied = 0;
      let allotted = 0;

      for (let i = 0; i < applications.length; i++) {
        const a = applications[i];
        let matched = a.ipo_id === item.id;
        if (!matched && companyName) {
          const aName = (a.ipo_name || '').toLowerCase().trim();
          if (aName && (aName === companyName || aName.includes(companyName) || companyName.includes(aName))) {
            matched = true;
          }
        }
        if (matched) {
          total++;
          if (a.status === 'Applied' || a.status === 'Mandate Approved') applied++;
          if (a.status === 'Allotted' || a.status === 'Partially Allotted' || a.status === 'Holding' || a.status === 'Sold') allotted++;
        }
      }
      map.set(item.id, { total, applied, allotted });
    }
    return map;
  }, [rawIpos, applications]);

  const filteredRawIpos = useMemo(() => {
    let list = rawIpos;
    if (!includeSme) {
      list = list.filter((i) => i.marketSegment !== 'SME');
    }
    if (onlyActiveGmp) {
      list = list.filter(hasActiveGmp);
    }
    if (onlyClosingToday) {
      list = list.filter(isClosingToday);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => {
        const name = (i.company?.displayName || i.companyName || i.symbol || '').toLowerCase();
        return name.includes(q);
      });
    }
    return list;
  }, [rawIpos, includeSme, onlyActiveGmp, onlyClosingToday, searchQuery]);

  const liveList = useMemo(() => {
    return filteredRawIpos.filter((item) => {
      const st = (item.status || '').toUpperCase().trim();
      return st === 'OPEN' || st === 'ACTIVE' || st === 'LIVE' || st === 'CLOSING_TODAY';
    });
  }, [filteredRawIpos]);

  const upcomingList = useMemo(() => {
    return filteredRawIpos.filter((item) => item.status === 'UPCOMING');
  }, [filteredRawIpos]);

  const closedList = useMemo(() => {
    return filteredRawIpos.filter((item) => {
      const st = (item.status || '').toUpperCase();
      return (
        (st === 'CLOSED' || st.includes('ALLOT') || st.includes('AWAIT') || st === 'LISTING_PENDING') &&
        st !== 'CLOSING_TODAY'
      );
    });
  }, [filteredRawIpos]);

  const listedList = useMemo(() => {
    return filteredRawIpos.filter((item) => {
      const st = (item.status || '').toUpperCase();
      return st === 'LISTED' || st === 'LISTING_PENDING';
    });
  }, [filteredRawIpos]);

  // Pre-sorted lists for all 4 tabs so tab switching never executes array sorts
  const sortedTabLists = useMemo(() => {
    const sortFn = (list: BackendIpo[]) => {
      const arr = [...list];
      switch (sortBy) {
        case 'GMP':
          return arr.sort((a, b) => {
            const gmpPctA = getIpoGmpPercentage(a);
            const gmpPctB = getIpoGmpPercentage(b);
            return gmpPctB - gmpPctA;
          });
        default:
          return arr;
      }
    };

    return {
      live: sortFn(liveList),
      upcoming: sortFn(upcomingList),
      closed: sortFn(closedList),
      listed: sortFn(listedList),
    };
  }, [liveList, upcomingList, closedList, listedList, sortBy]);

  const handleCardPress = useCallback(
    (item: BackendIpo) => {
      router.push({
        pathname: '/backend-ipo-details',
        params: { id: item.id, item: JSON.stringify(item) },
      });
    },
    [router]
  );

  const handleApplyPress = useCallback(
    (item: BackendIpo) => {
      router.push({
        pathname: '/apply-ipo',
        params: {
          ipoId: item.id,
          item: JSON.stringify(item),
          name: item.company?.displayName || item.companyName || item.symbol,
          company_name: item.company?.displayName || item.companyName || item.symbol,
          symbol: item.symbol,
          priceBandLow: item.priceBandLow != null ? String(item.priceBandLow) : undefined,
          priceBandHigh: item.priceBandHigh != null ? String(item.priceBandHigh) : undefined,
          buy_price: String(item.priceBandHigh || item.priceBandLow || item.issuePriceInr || 0),
          lotSize: item.lotSize != null ? String(item.lotSize) : undefined,
          closeDate: item.closeDate || undefined,
          openDate: item.openDate || undefined,
          logoUrl: item.company?.logoUrl || item.logoUrl || undefined,
          issueType: item.marketSegment === 'SME' ? 'SME' : 'Mainboard',
        },
      } as any);
    },
    [router]
  );

  const renderTabCard = useCallback(
    (tab: NewIpoTab) => {
      const TabCardItem = ({ item }: { item: BackendIpo }) => {
        const stats = appStatsMap.get(item.id) || { total: 0, applied: 0, allotted: 0 };
        return (
          <NewIpoCardItem
            key={item.id}
            item={item}
            tab={tab}
            colors={colors}
            isDark={isDark}
            totalAppsCount={stats.total}
            appliedCount={stats.applied}
            allottedCount={stats.allotted}
            onPress={handleCardPress}
            onApplyPress={handleApplyPress}
          />
        );
      };
      TabCardItem.displayName = 'TabCardItem';
      return TabCardItem;
    },
    [appStatsMap, colors, isDark, handleCardPress, handleApplyPress]
  );

  const tabsConfig = useMemo(
    () => [
      { key: 'live' as const, label: 'Live', count: liveList.length },
      { key: 'upcoming' as const, label: 'Upcoming', count: upcomingList.length },
      { key: 'closed' as const, label: 'Closed', count: closedList.length },
      { key: 'listed' as const, label: 'Listed', count: listedList.length },
    ],
    [liveList.length, upcomingList.length, closedList.length, listedList.length]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* App Bar Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            height: topPad + 60,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>
            PRIMARY MARKET
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            IPO Hub
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <IconButton
            name={showSearch ? 'x' : 'search'}
            variant={showSearch ? 'primary' : 'surface'}
            size="md"
            onPress={toggleSearch}
          />
          <IconButton
            name="sliders"
            variant={hasActiveFilter ? 'primary' : 'surface'}
            size="md"
            onPress={openFilterModal}
          />
        </View>
      </View>

      {/* Expandable Search Input */}
      <Animated.View
        style={[
          styles.searchWrap,
          {
            height: searchBarHeight,
            opacity: searchBarOpacity,
            overflow: 'hidden',
          },
        ]}
      >
        <View
          style={[
            styles.searchInputWrap,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            ref={searchRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search IPOs..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Sub-Tab Bar matching Manage Users spacing & badge pills */}
      <View style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 12 }}>
        <Tabs
          variant="pills"
          height={36}
          tabs={tabsConfig}
          activeTab={activeTab}
          onChange={(newTab) => handleTabPress(newTab as NewIpoTab)}
        />
      </View>

      {/* Main Catalog Feed List with Horizontal Swiping between Tabs */}
      {loading ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading...
          </Text>
        </View>
      ) : error && rawIpos.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.centerContainer, { flexGrow: 1, paddingBottom: Math.max(insets.bottom + 110, 135) }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>Connection Error</Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>{error}</Text>
          <TouchableOpacity onPress={onRefresh} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView
          ref={horizontalScrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleHorizontalScroll}
          style={{ flex: 1 }}
        >
          {TABS.map((tab) => {
            const listData = sortedTabLists[tab];
            return (
              <View key={tab} style={{ width: screenWidth, flex: 1 }}>
                {listData.length === 0 ? (
                  <ScrollView
                    contentContainerStyle={styles.emptyCenter}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                      />
                    }
                  >
                    <Feather name="inbox" size={48} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
                    <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No {tab} IPOs found</Text>
                    <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                      {searchQuery
                        ? `No results matching "${searchQuery}"`
                        : !includeSme
                        ? 'Try enabling SME IPOs in filters'
                        : `There are currently no ${tab} IPOs listed.`}
                    </Text>
                  </ScrollView>
                ) : (
                  <FlatList
                    data={listData}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTabCard(tab)}
                    contentContainerStyle={{
                      paddingTop: 12,
                      paddingBottom: Math.max(insets.bottom + 85, 100),
                    }}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={6}
                    maxToRenderPerBatch={6}
                    windowSize={5}
                    removeClippedSubviews={Platform.OS !== 'web'}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                      />
                    }
                  />
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Filter & Sort Modal */}
      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)}>
          <Pressable style={[styles.filterModalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            {/* Drag handle */}
            <View style={styles.modalHandleWrap}>
              <View style={[styles.modalHandle, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)' }]} />
            </View>

            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Filter & Sort</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  Customize IPO Hub listings & ranking
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                hitSlop={8}
                style={[styles.modalCloseBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)' }]}
              >
                <Feather name="x" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {/* Filter Section */}
              <View style={styles.sectionHeaderRow}>
                <Feather name="filter" size={11} color={colors.primary} />
                <Text style={[styles.sectionHeaderTitle, { color: colors.mutedForeground }]}>
                  Filters
                </Text>
              </View>

              <View style={[styles.filterSectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* SME Toggle */}
                <View style={styles.filterRow}>
                  <View style={[styles.filterIconWrap, { backgroundColor: isDark ? 'rgba(236, 72, 153, 0.15)' : '#FCE7F3' }]}>
                    <Feather name="layers" size={15} color={isDark ? '#F472B6' : '#DB2777'} />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.filterItemTitle, { color: colors.foreground }]}>
                      Include SME IPOs
                    </Text>
                    <Text style={[styles.filterItemSub, { color: colors.mutedForeground }]}>
                      Show Small & Medium Enterprise IPOs
                    </Text>
                  </View>
                  <Switch
                    value={tempIncludeSme}
                    onValueChange={(val) => {
                      setTempIncludeSme(val);
                      try { Haptics.selectionAsync(); } catch {}
                    }}
                    trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: '#10B98180' }}
                    thumbColor={tempIncludeSme ? '#10B981' : '#FFFFFF'}
                  />
                </View>

                <View style={[styles.filterItemDivider, { backgroundColor: colors.border }]} />

                {/* Only Active GMP Toggle */}
                <View style={styles.filterRow}>
                  <View style={[styles.filterIconWrap, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7' }]}>
                    <Feather name="trending-up" size={15} color="#10B981" />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.filterItemTitle, { color: colors.foreground }]}>
                      Only Active GMP
                    </Text>
                    <Text style={[styles.filterItemSub, { color: colors.mutedForeground }]}>
                      Show IPOs with GMP price or % greater than 0
                    </Text>
                  </View>
                  <Switch
                    value={tempOnlyActiveGmp}
                    onValueChange={(val) => {
                      setTempOnlyActiveGmp(val);
                      try { Haptics.selectionAsync(); } catch {}
                    }}
                    trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: '#10B98180' }}
                    thumbColor={tempOnlyActiveGmp ? '#10B981' : '#FFFFFF'}
                  />
                </View>

                <View style={[styles.filterItemDivider, { backgroundColor: colors.border }]} />

                {/* Closing Today Toggle */}
                <View style={styles.filterRow}>
                  <View style={[styles.filterIconWrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }]}>
                    <Feather name="clock" size={15} color={isDark ? '#FBBF24' : '#D97706'} />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.filterItemTitle, { color: colors.foreground }]}>
                      Closing Today
                    </Text>
                    <Text style={[styles.filterItemSub, { color: colors.mutedForeground }]}>
                      Show only IPOs ending subscription today
                    </Text>
                  </View>
                  <Switch
                    value={tempOnlyClosingToday}
                    onValueChange={(val) => {
                      setTempOnlyClosingToday(val);
                      try { Haptics.selectionAsync(); } catch {}
                    }}
                    trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: '#10B98180' }}
                    thumbColor={tempOnlyClosingToday ? '#10B981' : '#FFFFFF'}
                  />
                </View>
              </View>

              {/* Sort Section */}
              <View style={[styles.sectionHeaderRow, { marginTop: 4 }]}>
                <Feather name="bar-chart-2" size={11} color={colors.primary} />
                <Text style={[styles.sectionHeaderTitle, { color: colors.mutedForeground }]}>
                  Sort By
                </Text>
              </View>

              <View style={{ gap: 8 }}>
                {[
                  {
                    key: 'DEFAULT',
                    label: 'Default Order',
                    sub: 'Standard catalog & timeline order',
                    icon: 'list',
                    color: colors.primary,
                  },
                  {
                    key: 'GMP',
                    label: 'GMP: Highest First',
                    sub: 'Rank by highest grey market premium',
                    icon: 'arrow-up-right',
                    color: '#10B981',
                  },
                ].map((opt) => {
                  const isSelected = tempSortBy === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      activeOpacity={0.75}
                      onPress={() => {
                        setTempSortBy(opt.key as SortOption);
                        try { Haptics.selectionAsync(); } catch {}
                      }}
                      style={[
                        styles.sortCard,
                        {
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected
                            ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF')
                            : colors.surface,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.sortIconWrap,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(99, 102, 241, 0.2)' : '#E0E7FF')
                              : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                          },
                        ]}
                      >
                        <Feather name={opt.icon as any} size={15} color={isSelected ? colors.primary : colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.sortCardTitle, { color: isSelected ? colors.primary : colors.foreground }]}>
                          {opt.label}
                        </Text>
                        <Text style={[styles.sortCardSub, { color: colors.mutedForeground }]}>
                          {opt.sub}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.radioCircle,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {isSelected && <Feather name="check" size={10} color="#FFFFFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Modal Actions Footer */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setTempIncludeSme(true);
                  setTempOnlyActiveGmp(false);
                  setTempOnlyClosingToday(false);
                  setTempSortBy('DEFAULT');
                  setIncludeSme(true);
                  setOnlyActiveGmp(false);
                  setOnlyClosingToday(false);
                  setSortBy('DEFAULT');
                  setShowFilterModal(false);
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
                }}
                style={[styles.modalFooterResetBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.resetBtnText, { color: colors.mutedForeground }]}>
                  Reset All
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setIncludeSme(tempIncludeSme);
                  setOnlyActiveGmp(tempOnlyActiveGmp);
                  setOnlyClosingToday(tempOnlyClosingToday);
                  setSortBy(tempSortBy);
                  setShowFilterModal(false);
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                }}
                style={[styles.modalFooterApplyBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Feather name="check" size={14} color={colors.primaryForeground} style={{ marginRight: 6 }} />
                <Text style={[styles.applyBtnText, { color: colors.primaryForeground }]}>
                  Apply Filters
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    position: 'relative',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.5,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  subTabBarWrap: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  smeToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smeToggleText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  sortDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  sortBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  errorSub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptyCenter: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },
  itemCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 14,
    paddingLeft: 5,
    paddingRight: 5,
    paddingBottom: 5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 9,
  },
  headerLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  avatar: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  companyTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  segmentBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  statusPillNew: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
  },
  statusTextNew: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  innerDataCardBox: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  innerDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  innerDataLabel: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 3.5,
  },
  innerDataVal: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  innerApplyBtn: {
    width: 94,
    borderRadius: 20,
    paddingVertical: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerApplyBtnText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.1,
  },
  viewDetailsText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  checkAllotmentCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 10,
    backgroundColor: '#000000',
  },
  checkAllotmentCtaText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  filterModalCard: {
    width: '100%',
    maxWidth: 410,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  modalHandleWrap: {
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 8,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingTop: 14,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  filterSectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  filterIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  filterItemTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  filterItemSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1.5,
  },
  filterItemDivider: {
    height: 1,
    marginHorizontal: -4,
  },
  sortCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  sortIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sortCardTitle: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  sortCardSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  modalFooterResetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  modalFooterApplyBtn: {
    flex: 1.8,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
