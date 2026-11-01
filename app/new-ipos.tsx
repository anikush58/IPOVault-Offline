import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { IOSToggle } from '@/components/ui/IOSToggle';
import { ScoopedBottomSheet } from '@/components/ui/ScoopedBottomSheet';
import { Tabs } from '@/components/ui/Tabs';
import { NativeAdCard } from '@/components/ads/NativeAdCard';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { useAppExperience } from '@/context/AppExperienceContext';
import { useDB } from '@/context/DBContext';
import { formatCurrency, formatIssueSize, getResolvedLogoUrl } from '@/utils/formatters';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { triggerCentralizedIPOSync } from '@/services/ipo/centralizedSync';
import { getISTDateTime } from '@/services/ipo/statusNormalizer';
import { getCachedBackendIpos, reconcileBackendIposWithCache } from '@/services/ipo/ipoHubCacheService';

import {
  NewIpoTab,
  getFirstAvailableIpoHubTab,
} from '@/utils/ipoHubTabUtils';
export { NewIpoTab, getFirstAvailableIpoHubTab };
export type SortOption = 'DEFAULT' | 'GMP' | 'CLOSING_SOON';
export type MarketFilterOption = 'ALL' | 'MAINBOARD' | 'SME';

export const MARKET_OPTIONS: {
  key: MarketFilterOption;
  label: string;
}[] = [
  { key: 'ALL', label: 'All Markets' },
  { key: 'MAINBOARD', label: 'Mainboard' },
  { key: 'SME', label: 'SME' },
];

function parseIpoDateToTimestamp(str?: string | null): number {
  if (!str) return Infinity;
  const clean = str.trim();
  if (!clean || clean.toUpperCase() === 'TBA' || clean.toUpperCase() === 'N/A') return Infinity;

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/);
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? Infinity : d.getTime();
  }

  // YYYY-MM-DD or ISO string
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(clean)) {
    const datePart = clean.split('T')[0];
    const parts = datePart.split(/[-/]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? Infinity : d.getTime();
  }

  const d = new Date(clean);
  return isNaN(d.getTime()) ? Infinity : d.getTime();
}

const SORT_OPTIONS: {
  key: SortOption;
  label: string;
  sub: string;
}[] = [
  {
    key: 'DEFAULT',
    label: 'Timeline',
    sub: 'Upcoming, live, then closed',
  },
  {
    key: 'GMP',
    label: 'Highest expected GMP',
    sub: 'Top profit potential first',
  },
  {
    key: 'CLOSING_SOON',
    label: 'Closing soon',
    sub: 'Nearest closing date first',
  },
];

function getSortOptionLabel(key: SortOption): string {
  switch (key) {
    case 'GMP':
      return 'Highest expected GMP';
    case 'CLOSING_SOON':
      return 'Closing soon';
    default:
      return 'Timeline';
  }
}

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList as any);

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
  const ist = getISTDateTime();

  // If backend status has already moved to CLOSED, ALLOTMENT, LISTED, etc., it is NOT closing today
  if (st === 'CLOSED' || st === 'LISTED' || st.includes('ALLOT') || st.includes('AWAIT')) {
    return false;
  }

  const closeDate = (item.closeDate || item.lifecycle?.closeDate || '').trim();
  if (closeDate && closeDate === ist.istDate) {
    // If it's closing day, check 17:00 IST cutoff
    return ist.istHours < 17;
  }

  if (st === 'CLOSING_TODAY' || st === 'CLOSING TODAY' || st === 'CLOSES TODAY') {
    return true;
  }

  return false;
}

function getStatusBadge(status?: string, openDate?: string | null) {
  const norm = (status || '').toUpperCase().trim().replace(/[\s-]+/g, '_');
  if (norm === 'CLOSING_TODAY' || norm === 'CLOSES_TODAY' || norm === 'CLOSING') {
    return { text: 'Closing Today', bg: '#FEF3C7', color: '#D97706', icon: 'alert-circle' };
  }
  if (norm === 'OPEN' || norm === 'ACTIVE' || norm === 'LIVE' || norm === 'BIDDING') {
    return { text: 'Live Now', bg: '#DCFCE7', color: '#15803D', icon: 'activity' };
  }
  if (norm === 'LISTED') {
    return { text: 'Listed', bg: '#E0E7FF', color: '#4338CA', icon: 'check-circle' };
  }
  if (
    norm === 'ALLOTMENT_AWAITING' ||
    norm === 'ALLOTMENT_AWAITED' ||
    norm === 'ALLOTMENT_PENDING' ||
    norm === 'ALLOTTED_PENDING' ||
    norm === 'AWAITING_ALLOTMENT' ||
    norm === 'PENDING_ALLOTMENT' ||
    norm.includes('AWAIT')
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
  onPress: (item: BackendIpo) => void;
}

const NewIpoCardItem = React.memo(
  function NewIpoCardItem({
    item,
    tab,
    colors,
    isDark,
    onPress,
  }: NewIpoCardItemProps) {
    const router = useRouter();
    const { isPro } = useAppExperience();
    const { applications } = useDB();
    const companyName = item.company?.displayName || item.companyName || item.symbol || 'IPO';

    const itemSymbol = (item.symbol || (item.company as any)?.symbol || '').trim().toUpperCase();
    const itemCompName = (companyName || item.companyName || '').trim().toLowerCase();
    const itemId = item.id;

    const ipoApps = React.useMemo(() => {
      if (!isPro) return [];
      return (applications || []).filter((a) => {
        if (a.status === 'Cancelled') return false;
        if (itemId && a.ipo_id === itemId) return true;
        if (itemSymbol && (a as any).symbol && String((a as any).symbol).trim().toUpperCase() === itemSymbol) return true;
        if (itemCompName && a.ipo_name && a.ipo_name.trim().toLowerCase() === itemCompName) return true;
        return false;
      });
    }, [isPro, applications, itemId, itemSymbol, itemCompName]);

    const appliedCount = isPro ? ipoApps.length : 0;
    const allottedCount = React.useMemo(() => {
      if (!isPro) return 0;
      return ipoApps.filter(
        (a) =>
          a.status === 'Allotted' ||
          a.status === 'Partially Allotted' ||
          a.status === 'Holding' ||
          a.status === 'Sold'
      ).length;
    }, [isPro, ipoApps]);

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

    const dateLabel = isListed ? 'Listing Date' : 'Apply Dates';
    const dateValueStr = isListed ? listingDateStr : applyDateStr;

    const minInvestmentLabel = isListed ? 'Issue Price' : 'Min Investment';
    const minInvestmentValue = isListed
      ? (upperPrice > 0 ? `₹${upperPrice}` : '—')
      : (minInvestment ? `₹${minInvestment.toLocaleString('en-IN')}` : '—');

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

    const row2Col1Label = isListed ? 'Listing Price' : 'Expt. GMP';
    const row2Col1Val = isListed
      ? (listingPrice != null ? `₹${listingPrice}` : gmpDisplay)
      : gmpDisplay;
    const row2Col1Color = isListed ? colors.foreground : gmpColor;

    const row2Col2Label = isListed ? 'Listing Gain' : 'Expt. Profit/Lot';
    const row2Col2Val = isListed
      ? (listingGainPct != null ? `${listingGainPct > 0 ? '+' : ''}${listingGainPct.toFixed(1)}%` : exptProfitDisplay)
      : exptProfitDisplay;
    const row2Col2Color = isListed
      ? (listingGainPct != null ? (listingGainPct >= 0 ? '#10B981' : '#EF4444') : profitColor)
      : profitColor;

    const row2Col3Label = isPro ? 'Applied' : (isListed ? 'Profit/Lot' : 'Allotment');
    const row2Col3Val = isPro
      ? `${appliedCount}`
      : (isListed
          ? (profitAmt != null
              ? (profitAmt >= 0 ? `₹${Math.round(profitAmt).toLocaleString('en-IN')}` : `-₹${Math.abs(Math.round(profitAmt)).toLocaleString('en-IN')}`)
              : (exptProfitDisplay !== '—' ? exptProfitDisplay : '—'))
          : (isAllotmentOut && allotmentDateStr === 'TBA' ? 'Out' : allotmentDateStr));
    const row2Col3Color = isPro
      ? colors.foreground
      : (isListed
          ? (profitAmt != null ? (profitAmt >= 0 ? '#10B981' : '#EF4444') : colors.foreground)
          : (isAllotmentOut ? '#10B981' : colors.foreground));

    const row2Col4Label = isPro ? 'Allotted' : (isListed ? 'Lot Size' : 'Listing');
    const row2Col4Val = isPro
      ? `${allottedCount}`
      : (isListed
          ? (lotQty > 0 ? `${lotQty} Shares` : '—')
          : listingDateStr);
    const row2Col4Color = isPro
      ? (allottedCount > 0 ? '#10B981' : colors.foreground)
      : colors.foreground;

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => onPress(item)}
        style={[
          styles.itemCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
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
                <Image source={{ uri: getResolvedLogoUrl(logoUrl) || logoUrl }} style={styles.logoImage} resizeMode="contain" />
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
                {
                  backgroundColor: isSme ? '#EC4899' : '#4F46E5',
                  borderColor: isSme ? '#EC4899' : '#4F46E5',
                },
              ]}
            >
              <Text
                style={[
                  styles.segmentBadgeText,
                  { color: '#FFFFFF' },
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
                      backgroundColor: '#F59E0B',
                      borderColor: '#F59E0B',
                    }
                  : isOpen
                  ? {
                      backgroundColor: '#10B981',
                      borderColor: '#10B981',
                    }
                  : isUpcoming
                  ? {
                      backgroundColor: '#3B82F6',
                      borderColor: '#3B82F6',
                    }
                  : isAllotmentOut
                  ? {
                      backgroundColor: '#06B6D4',
                      borderColor: '#06B6D4',
                    }
                  : isListed
                  ? {
                      backgroundColor: '#8B5CF6',
                      borderColor: '#8B5CF6',
                    }
                  : {
                      backgroundColor: '#64748B',
                      borderColor: '#64748B',
                    },
              ]}
            >
              {isItemClosingToday && (
                <Icon
                  name="clock"
                  size={12}
                  color="#FFFFFF"
                  style={{ marginRight: 2 }}
                />
              )}
              {isOpen && (
                <Icon
                  name="zap"
                  size={12}
                  color="#FFFFFF"
                  style={{ marginRight: 2 }}
                />
              )}
              {isUpcoming && (
                <Icon
                  name="calendar"
                  size={12}
                  color="#FFFFFF"
                  style={{ marginRight: 2 }}
                />
              )}
              {isAllotmentOut && (
                <Icon
                  name="check-circle"
                  size={12}
                  color="#FFFFFF"
                  style={{ marginRight: 2 }}
                />
              )}
              {isListed && (
                <Icon
                  name="award"
                  size={12}
                  color="#FFFFFF"
                  style={{ marginRight: 2 }}
                />
              )}
              <Text
                style={[
                  styles.statusTextNew,
                  {
                    color: '#FFFFFF',
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
              backgroundColor: colors.cardAlt,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Row 1: Apply Dates | Min Investment | Issue Size | Subscription */}
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
                {minInvestmentLabel}
              </Text>
              <Text style={[styles.innerDataVal, { color: colors.foreground }]} numberOfLines={1}>
                {minInvestmentValue}
              </Text>
            </View>

            <View style={{ flex: 0.95 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Issue Size
              </Text>
              <Text style={[styles.innerDataVal, { color: colors.foreground }]} numberOfLines={1}>
                {formatIssueSize(item.issueSize ?? (item as any).issue_size ?? (item as any).totalIssueSize ?? (item as any).total_issue_size)}
              </Text>
            </View>

            <View style={{ flex: 1.05, alignItems: 'flex-end' }}>
              <View style={{ width: 85, alignItems: 'flex-start' }}>
                <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Subscription
                </Text>
                <Text style={[styles.innerDataVal, { color: colors.foreground }]} numberOfLines={1}>
                  {subDisplay}
                </Text>
              </View>
            </View>
          </View>

          {/* Row 2: Expt. GMP | Expt. Profit/Lot | Allotment | Listing (or Listing Price | Listing Gain | Profit/Lot | Lot Size for Listed) */}
          <View style={[styles.innerDataRow, { marginTop: 14, alignItems: 'center' }]}>
            <View style={{ flex: 1.2 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {row2Col1Label}
              </Text>
              <Text style={[styles.innerDataVal, { color: row2Col1Color }]} numberOfLines={1}>
                {row2Col1Val}
              </Text>
            </View>

            <View style={{ flex: 1.2 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {row2Col2Label}
              </Text>
              <Text style={[styles.innerDataVal, { color: row2Col2Color }]} numberOfLines={1}>
                {row2Col2Val}
              </Text>
            </View>

            <View style={{ flex: 0.95 }}>
              <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {row2Col3Label}
              </Text>
              <Text
                style={[
                  styles.innerDataVal,
                  {
                    color: row2Col3Color,
                    fontFamily: isAllotmentOut && !isListed ? 'GoogleSansFlex_700Bold' : 'GoogleSansFlex_600SemiBold',
                  },
                ]}
                numberOfLines={1}
              >
                {row2Col3Val}
              </Text>
            </View>

            <View style={{ flex: 1.05, alignItems: 'flex-end' }}>
              <View style={{ width: 85, alignItems: 'flex-start' }}>
                <Text style={[styles.innerDataLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {row2Col4Label}
                </Text>
                <Text
                  style={[
                    styles.innerDataVal,
                    {
                      color: row2Col4Color,
                      fontFamily: isPro && allottedCount > 0 ? 'GoogleSansFlex_700Bold' : 'GoogleSansFlex_600SemiBold',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {row2Col4Val}
                </Text>
              </View>
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
  const { isNonPro } = useAppExperience();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const [rawIpos, setRawIpos] = useState<BackendIpo[]>(() => {
    return backendIpoApiService.getCachedIpos() || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return !(backendIpoApiService.getCachedIpos()?.length);
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({
    inputRange: [0, 24],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const toggleSearch = useCallback(() => {
    if (showSearch) {
      Keyboard.dismiss();
      searchRef.current?.blur();
      Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
      Animated.timing(searchAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
      setTimeout(() => {
        searchRef.current?.focus();
      }, 80);
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
  const userSelectedTabRef = useRef<boolean>(false);
  const hasAutoSelectedTabRef = useRef<boolean>(false);

  const [activeTab, setActiveTab] = useState<NewIpoTab>('live');
  const [marketFilter, setMarketFilter] = useState<MarketFilterOption>('ALL');
  const [includeSme, setIncludeSme] = useState(true);
  const [onlyActiveGmp, setOnlyActiveGmp] = useState(false);
  const [onlyClosingToday, setOnlyClosingToday] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('DEFAULT');
  const [tempMarketFilter, setTempMarketFilter] = useState<MarketFilterOption>('ALL');
  const [tempIncludeSme, setTempIncludeSme] = useState(true);
  const [tempOnlyActiveGmp, setTempOnlyActiveGmp] = useState(false);
  const [tempOnlyClosingToday, setTempOnlyClosingToday] = useState(false);
  const [tempSortBy, setTempSortBy] = useState<SortOption>('DEFAULT');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const hasActiveFilter = marketFilter !== 'ALL' || onlyActiveGmp || onlyClosingToday || sortBy !== 'DEFAULT';

  const activeFilterCount =
    (tempMarketFilter !== 'ALL' ? 1 : 0) +
    (tempOnlyActiveGmp ? 1 : 0) +
    (tempOnlyClosingToday ? 1 : 0) +
    (tempSortBy !== 'DEFAULT' ? 1 : 0);

  const filterChipLabel = useMemo(() => {
    const labels: string[] = [];
    if (marketFilter === 'MAINBOARD') labels.push('Mainboard');
    if (marketFilter === 'SME') labels.push('SME');
    if (onlyActiveGmp) labels.push('Positive GMP');
    if (onlyClosingToday) labels.push('Closing Today');
    if (sortBy === 'GMP') labels.push('GMP: Highest');
    if (sortBy === 'CLOSING_SOON') labels.push('Closing Soon');
    return labels.join(' · ');
  }, [marketFilter, onlyActiveGmp, onlyClosingToday, sortBy]);

  const handleQuickClearFilters = useCallback(() => {
    setMarketFilter('ALL');
    setIncludeSme(true);
    setOnlyActiveGmp(false);
    setOnlyClosingToday(false);
    setSortBy('DEFAULT');
    setTempMarketFilter('ALL');
    setTempIncludeSme(true);
    setTempOnlyActiveGmp(false);
    setTempOnlyClosingToday(false);
    setTempSortBy('DEFAULT');
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  }, []);

  const openFilterModal = useCallback(() => {
    setTempMarketFilter(marketFilter);
    setTempIncludeSme(marketFilter !== 'MAINBOARD');
    setTempOnlyActiveGmp(onlyActiveGmp);
    setTempOnlyClosingToday(onlyClosingToday);
    setTempSortBy(sortBy);
    setShowFilterModal(true);
    try { Haptics.selectionAsync(); } catch {}
  }, [marketFilter, onlyActiveGmp, onlyClosingToday, sortBy]);

  const handleTabPress = useCallback((tab: NewIpoTab) => {
    userSelectedTabRef.current = true;
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
      userSelectedTabRef.current = true;
      setActiveTab(TABS[index]);
    }
  }, [screenWidth, activeTab]);

  const db = useSQLiteContext();
  const mountTimeRef = useRef(Date.now());
  const isFetchingRef = useRef(false);
  const lastFetchedAtRef = useRef(0);
  const hasHydratedCacheRef = useRef(false);
  const firstCardRenderLoggedRef = useRef(false);
  const requestIdRef = useRef(0);
  const inFlightQueryRef = useRef<string | null>(null);

  // Extracted SQLite Cache Hydration (Offline-first / Instant Render)
  const hydrateFromCache = useCallback(async () => {
    if (!db) return [];
    try {
      const cached = await getCachedBackendIpos(db, searchQuery);
      if (cached.length > 0) {
        hasHydratedCacheRef.current = true;
        setRawIpos(cached);
        setLoading(false);

        // Pre-resolve default tab from cached data if user hasn't manually selected yet
        if (!userSelectedTabRef.current && !hasAutoSelectedTabRef.current) {
          const liveCount = cached.filter((item) => {
            const st = (item.status || '').toUpperCase().trim();
            return st === 'OPEN' || st === 'ACTIVE' || st === 'LIVE' || st === 'CLOSING_TODAY';
          }).length;
          const upcomingCount = cached.filter((item) => (item.status || '').toUpperCase().trim() === 'UPCOMING').length;
          const closedCount = cached.filter((item) => {
            const st = (item.status || '').toUpperCase().trim();
            return (
              (st === 'CLOSED' || st.includes('ALLOT') || st.includes('AWAIT') || st === 'LISTING_PENDING') &&
              st !== 'CLOSING_TODAY'
            );
          }).length;
          const listedCount = cached.filter((item) => {
            const st = (item.status || '').toUpperCase().trim();
            return st === 'LISTED' || st === 'LISTING_PENDING';
          }).length;

          const targetTab = getFirstAvailableIpoHubTab({
            live: liveCount,
            upcoming: upcomingCount,
            closed: closedCount,
            listed: listedCount,
          });
          hasAutoSelectedTabRef.current = true;
          if (targetTab !== activeTab) {
            setActiveTab(targetTab);
            const index = TABS.indexOf(targetTab);
            if (index > 0) {
              requestAnimationFrame(() => {
                horizontalScrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: false });
              });
            }
          }
        }

        if (!firstCardRenderLoggedRef.current) {
          firstCardRenderLoggedRef.current = true;
          const elapsed = Date.now() - mountTimeRef.current;
          console.log(`[IPO Hub Timing] First visible IPO cards (${cached.length} items) in ${elapsed}ms (Source: SQLite Cache)`);
        }
      }
      return cached;
    } catch (err) {
      if (__DEV__) console.warn('[IPO Hub] Cache hydration error:', err);
      return [];
    }
  }, [db, searchQuery, activeTab, screenWidth]);

  const fetchBackendIpos = useCallback(async (isUserRefresh = false) => {
    const trimmedQuery = searchQuery.trim();
    const isSearchMode = !!trimmedQuery;

    // Preserve deduplication for identical non-search background requests
    // while ensuring that newly typed search queries are NEVER dropped.
    if (isFetchingRef.current && !isUserRefresh) {
      if (!isSearchMode && inFlightQueryRef.current === null) {
        return; // Deduplicate background polling when catalog fetch is already in flight
      }
      if (isSearchMode && inFlightQueryRef.current === trimmedQuery) {
        return; // Deduplicate identical in-flight search query
      }
    }

    // Assign incrementing request ID to discard stale responses
    const thisRequestId = ++requestIdRef.current;
    inFlightQueryRef.current = isSearchMode ? trimmedQuery : null;
    isFetchingRef.current = true;
    lastFetchedAtRef.current = Date.now();
    const fetchStart = Date.now();

    try {
      setError(null);
      const data = await backendIpoApiService.listBackendIpos({
        q: trimmedQuery || undefined,
      });

      // Discard stale responses if a newer request was dispatched while this was running
      if (thisRequestId !== requestIdRef.current) {
        return;
      }

      if (Array.isArray(data)) {
        lastFetchedAtRef.current = Date.now();

        if (db && data.length > 0) {
          // Reconcile incoming data against SQLite cache to detect real changes
          const syncResult = await reconcileBackendIposWithCache(db, data);

          if (syncResult.hasChanges) {
            // Fresh records were inserted or updated in SQLite!
            // Refresh displayed data directly from SQLite
            const freshCached = await getCachedBackendIpos(db, searchQuery);
            setRawIpos(freshCached);
          } else {
            // Backend data is UNCHANGED!
            // Do not rewrite records, do not update timestamps, do not replace rawIpos!
            // If rawIpos is currently empty (e.g. cold start with empty cache), populate from SQLite
            setRawIpos((prev) => {
              if (prev.length === 0) {
                getCachedBackendIpos(db, searchQuery).then((cached) => {
                  if (cached.length > 0) {
                    setRawIpos(cached);
                  }
                });
              }
              return prev;
            });
          }
        } else if (!db) {
          // Fallback if db handle is unavailable
          setRawIpos(data);
        }

        const elapsed = Date.now() - fetchStart;
        console.log(`[IPO Hub Timing] Background refresh completed in ${elapsed}ms (${data.length} items)`);

        if (!firstCardRenderLoggedRef.current && data.length > 0) {
          firstCardRenderLoggedRef.current = true;
          console.log(`[IPO Hub Timing] First visible IPO cards (${data.length} items) in ${Date.now() - mountTimeRef.current}ms (Source: Backend API)`);
        }
      }
    } catch (e: any) {
      if (thisRequestId !== requestIdRef.current) {
        return;
      }
      console.warn('[IPO Hub] Network fetch error:', e?.message || e);
      // Keep valid cached cards if available; only display connection error screen if rawIpos is empty!
      setRawIpos((prev) => {
        if (prev.length === 0) {
          setError(e?.message || 'Failed to connect to IPOVault backend API');
        }
        return prev;
      });
    } finally {
      if (thisRequestId === requestIdRef.current) {
        isFetchingRef.current = false;
        inFlightQueryRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [searchQuery, db]);

  // Initial load: instantly display SQLite cache; only fetch from network if cache is completely empty
  useEffect(() => {
    let isMounted = true;
    hydrateFromCache().then((cached) => {
      if (isMounted) {
        if (cached && cached.length > 0) {
          setLoading(false);
        } else {
          // Local cache is empty (e.g. cold start on clean install) -> fetch initial catalog
          fetchBackendIpos();
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [hydrateFromCache, fetchBackendIpos]);

  // Query change listener: fetch search results when user searches
  useEffect(() => {
    if (searchQuery.trim()) {
      fetchBackendIpos();
    }
  }, [searchQuery, fetchBackendIpos]);

  // Global Event Sync: only refresh when there is an actual update to IPOs
  useEffect(() => {
    const unsubscribe = backendSyncEmitter.subscribe(async (event) => {
      if (event === 'applications') {
        // Application mutations don't alter IPO listings catalog; skip network fetch
        return;
      }
      // Re-hydrate immediately from local SQLite cache so newly synced IPOs are visible instantly
      await hydrateFromCache();
    });

    return () => {
      unsubscribe();
    };
  }, [hydrateFromCache]);

  const onRefresh = useCallback(async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setRefreshing(true);
    await fetchBackendIpos(true);
    if (db) {
      triggerCentralizedIPOSync(db, { force: true, source: 'IPO Hub Manual Refresh' }).catch(() => {});
    }
  }, [fetchBackendIpos, db]);

  const filteredRawIpos = useMemo(() => {
    let list = rawIpos;
    if (marketFilter === 'MAINBOARD') {
      list = list.filter((i) => i.marketSegment !== 'SME');
    } else if (marketFilter === 'SME') {
      list = list.filter((i) => i.marketSegment === 'SME' || ((i as any).issue_type || '').toUpperCase().includes('SME'));
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
  }, [rawIpos, marketFilter, onlyActiveGmp, onlyClosingToday, searchQuery]);

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
            if (gmpPctB !== gmpPctA) return gmpPctB - gmpPctA;
            // Deterministic tie-breakers:
            const tA = parseIpoDateToTimestamp(a.openDate || a.lifecycle?.openDate);
            const tB = parseIpoDateToTimestamp(b.openDate || b.lifecycle?.openDate);
            if (tA !== tB) {
              if (tA === Infinity) return 1;
              if (tB === Infinity) return -1;
              return tB - tA;
            }
            const nameA = (a.company?.displayName || a.companyName || a.symbol || '').toLowerCase();
            const nameB = (b.company?.displayName || b.companyName || b.symbol || '').toLowerCase();
            const nameCmp = nameA.localeCompare(nameB);
            if (nameCmp !== 0) return nameCmp;
            return a.id.localeCompare(b.id);
          });
        case 'CLOSING_SOON':
          return arr.sort((a, b) => {
            const dateA = a.closeDate || a.lifecycle?.closeDate;
            const dateB = b.closeDate || b.lifecycle?.closeDate;
            const tA = parseIpoDateToTimestamp(dateA);
            const tB = parseIpoDateToTimestamp(dateB);
            if (tA !== tB) {
              if (tA === Infinity) return 1;
              if (tB === Infinity) return -1;
              return tA - tB;
            }
            const nameA = (a.company?.displayName || a.companyName || a.symbol || '').toLowerCase();
            const nameB = (b.company?.displayName || b.companyName || b.symbol || '').toLowerCase();
            const nameCmp = nameA.localeCompare(nameB);
            if (nameCmp !== 0) return nameCmp;
            return a.id.localeCompare(b.id);
          });
        default:
          return arr.sort((a, b) => {
            // Timeline default: open_date DESC, then company name ASC, then id ASC
            const tA = parseIpoDateToTimestamp(a.openDate || a.lifecycle?.openDate);
            const tB = parseIpoDateToTimestamp(b.openDate || b.lifecycle?.openDate);
            if (tA !== tB) {
              if (tA === Infinity) return 1;
              if (tB === Infinity) return -1;
              return tB - tA; // DESC: newest open dates first
            }
            const nameA = (a.company?.displayName || a.companyName || a.symbol || '').toLowerCase();
            const nameB = (b.company?.displayName || b.companyName || b.symbol || '').toLowerCase();
            const nameCmp = nameA.localeCompare(nameB);
            if (nameCmp !== 0) return nameCmp;
            return a.id.localeCompare(b.id);
          });
      }
    };

    return {
      live: sortFn(liveList),
      upcoming: sortFn(upcomingList),
      closed: sortFn(closedList),
      listed: sortFn(listedList),
    };
  }, [liveList, upcomingList, closedList, listedList, sortBy]);

  // Automatically select the first non-empty category (live -> upcoming -> closed -> listed)
  // when IPO data is loaded, without repeatedly overriding user's manual selection
  useEffect(() => {
    if (userSelectedTabRef.current || hasAutoSelectedTabRef.current) return;
    if (loading && rawIpos.length === 0) return;

    const targetTab = getFirstAvailableIpoHubTab({
      live: liveList.length,
      upcoming: upcomingList.length,
      closed: closedList.length,
      listed: listedList.length,
    });

    hasAutoSelectedTabRef.current = true;
    if (targetTab !== activeTab) {
      setActiveTab(targetTab);
      const index = TABS.indexOf(targetTab);
      if (index !== -1) {
        requestAnimationFrame(() => {
          horizontalScrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: false });
        });
      }
    }
  }, [loading, rawIpos.length, liveList.length, upcomingList.length, closedList.length, listedList.length, activeTab, screenWidth]);

  const handleCardPress = useCallback(
    (item: BackendIpo) => {
      router.push({
        pathname: '/backend-ipo-details',
        params: { id: item.id, item: JSON.stringify(item) },
      });
    },
    [router]
  );

  const renderItemForTab = useCallback(
    (tab: NewIpoTab) => {
      const TabIpoCard = ({ item, index }: { item: BackendIpo; index: number }) => {
        const getTabCount = () => {
          switch (tab) {
            case 'live': return liveList.length;
            case 'upcoming': return upcomingList.length;
            case 'closed': return closedList.length;
            case 'listed': return listedList.length;
            default: return 0;
          }
        };
        const count = getTabCount();
        const showNativeAd = index === 2 || (count < 3 && index === count - 1);
        return (
          <View key={item.id}>
            <NewIpoCardItem
              item={item}
              tab={tab}
              colors={colors}
              isDark={isDark}
              onPress={handleCardPress}
            />
            {showNativeAd && <NativeAdCard />}
          </View>
        );
      };
      return TabIpoCard;
    },
    [colors, isDark, handleCardPress, liveList.length, upcomingList.length, closedList.length, listedList.length]
  );

  const renderLiveItem = useMemo(() => renderItemForTab('live'), [renderItemForTab]);
  const renderUpcomingItem = useMemo(() => renderItemForTab('upcoming'), [renderItemForTab]);
  const renderClosedItem = useMemo(() => renderItemForTab('closed'), [renderItemForTab]);
  const renderListedItem = useMemo(() => renderItemForTab('listed'), [renderItemForTab]);

  const keyExtractor = useCallback((item: any) => item.id || item.symbol, []);

  const tabsConfig = useMemo(
    () => [
      { key: 'live' as const, label: 'Live', count: liveList.length },
      { key: 'upcoming' as const, label: 'Upcoming', count: upcomingList.length },
      { key: 'closed' as const, label: 'Closed', count: closedList.length },
      { key: 'listed' as const, label: 'Listed', count: listedList.length },
    ],
    [liveList.length, upcomingList.length, closedList.length, listedList.length]
  );

  const listTopPad = topPad + (showSearch ? 168 : 120) + (hasActiveFilter ? 44 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Floating Blurred App Bar & Sub-Tabs Header */}
      <View
        style={[
          styles.floatingHeaderContainer,
          {
            paddingTop: topPad,
          },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerBlurOpacity }]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 90 : 75}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={
              isDark
                ? ['rgba(14, 17, 23, 0.96)', 'rgba(14, 17, 23, 0.88)', 'rgba(14, 17, 23, 0.35)']
                : ['rgba(248, 249, 250, 0.96)', 'rgba(248, 249, 250, 0.88)', 'rgba(248, 249, 250, 0.35)']
            }
            locations={[0, 0.75, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* App Bar Header */}
        <View style={styles.header}>
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
            <Icon name="search" size={16} color={colors.mutedForeground} />
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
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                <Icon name="x-circle" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Sub-Tab Bar matching Manage Users spacing & badge pills */}
        <View style={{ paddingHorizontal: 16, marginTop: 4, marginBottom: hasActiveFilter ? 8 : 12 }}>
          <Tabs
            variant="pills"
            height={36}
            tabs={tabsConfig}
            activeTab={activeTab}
            onChange={(newTab) => handleTabPress(newTab as NewIpoTab)}
          />
        </View>

        {/* Active Quick-Clear Filter Bar (Dashboard style) */}
        {hasActiveFilter && (
          <View
            style={[
              styles.filterBar,
              {
                backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : colors.primary + '15',
                borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : colors.primary + '30',
              },
            ]}
          >
            <Icon name="filter" size={12} color={colors.primary} />
            <Text style={[styles.filterBarText, { color: colors.primary }]} numberOfLines={1}>
              {filterChipLabel}
            </Text>
            <TouchableOpacity onPress={handleQuickClearFilters} hitSlop={8}>
              <Icon name="x" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}
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
          <Icon name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>Connection Error</Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>{error}</Text>
          <TouchableOpacity onPress={onRefresh} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryBtnText, { color: colors.primaryForeground }]}>Retry</Text>
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
            const renderItem =
              tab === 'live'
                ? renderLiveItem
                : tab === 'upcoming'
                ? renderUpcomingItem
                : tab === 'closed'
                ? renderClosedItem
                : renderListedItem;

            return (
              <View key={tab} style={{ width: screenWidth, flex: 1 }}>
                {listData.length === 0 ? (
                  <ScrollView
                    contentContainerStyle={[styles.emptyCenter, { paddingTop: listTopPad }]}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                      />
                    }
                  >
                    <Icon name="inbox" size={48} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
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
                  <AnimatedFlatList
                    data={listData}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    contentContainerStyle={{
                      paddingTop: listTopPad,
                      paddingBottom: Math.max(insets.bottom + 85, 100),
                    }}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={6}
                    maxToRenderPerBatch={6}
                    windowSize={5}
                    removeClippedSubviews={Platform.OS !== 'web'}
                    onScroll={Animated.event(
                      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                      { useNativeDriver: true }
                    )}
                    scrollEventThrottle={16}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        progressViewOffset={listTopPad - 4}
                      />
                    }
                  />
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Filter & Sort Modal Dialog */}
      {/* Filter & Sort Modal Dialog */}
      <Modal
        visible={showFilterModal}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowFilterModal(false);
        }}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable
            style={styles.backdropDismiss}
            onPress={() => {
              setShowFilterModal(false);
            }}
          />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.modalHeaderTitleGroup}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>Filter & Sort</Text>
                    {activeFilterCount > 0 && (
                      <View style={[styles.modalActiveBadge, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.modalActiveBadgeText, { color: colors.primaryForeground }]}>
                          {activeFilterCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                    Refine IPO listings & display order
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setShowFilterModal(false);
                }}
                style={[
                  styles.modalCloseBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Icon name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flexShrink: 1, flexGrow: 0 }}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalScrollContent}
            >
              {/* SECTION: Market as Single-Select Chips */}
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MARKET</Text>
                <View style={styles.chipRow}>
                  {MARKET_OPTIONS.map((opt) => {
                    const isSelected = tempMarketFilter === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        activeOpacity={0.75}
                        onPress={() => {
                          setTempMarketFilter(opt.key);
                          try { Haptics.selectionAsync(); } catch {}
                        }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(99, 102, 241, 0.14)' : '#EEF2FF')
                              : colors.surface,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: isSelected ? colors.primary : colors.foreground },
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {isSelected && (
                          <Icon name="check" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* SECTION: Conditions */}
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CONDITIONS</Text>
                <View style={[styles.filterTogglesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.filterSwitchRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.filterSwitchLabel, { color: colors.foreground }]}>
                        Positive GMP Only
                      </Text>
                      <Text style={[styles.filterSwitchSub, { color: colors.mutedForeground }]}>
                        Hide IPOs without positive grey market premium
                      </Text>
                    </View>
                    <IOSToggle
                      value={tempOnlyActiveGmp}
                      onValueChange={(val) => {
                        setTempOnlyActiveGmp(val);
                        try { Haptics.selectionAsync(); } catch {}
                      }}
                      activeColor={colors.primary}
                    />
                  </View>

                  <View style={[styles.filterSwitchDivider, { backgroundColor: colors.border }]} />

                  <View style={styles.filterSwitchRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.filterSwitchLabel, { color: colors.foreground }]}>
                        Closing Today
                      </Text>
                      <Text style={[styles.filterSwitchSub, { color: colors.mutedForeground }]}>
                        Show IPOs whose bidding window closes today
                      </Text>
                    </View>
                    <IOSToggle
                      value={tempOnlyClosingToday}
                      onValueChange={(val) => {
                        setTempOnlyClosingToday(val);
                        try { Haptics.selectionAsync(); } catch {}
                      }}
                      activeColor={colors.primary}
                    />
                  </View>
                </View>
              </View>

              {/* SECTION: Sort by as Single-Select Chips */}
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SORT BY</Text>
                <View style={styles.chipRow}>
                  {SORT_OPTIONS.map((opt) => {
                    const isSelected = tempSortBy === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        activeOpacity={0.75}
                        onPress={() => {
                          setTempSortBy(opt.key);
                          try { Haptics.selectionAsync(); } catch {}
                        }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(99, 102, 241, 0.14)' : '#EEF2FF')
                              : colors.surface,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: isSelected ? colors.primary : colors.foreground },
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {isSelected && (
                          <Icon name="check" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer: Reset & Apply */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setTempMarketFilter('ALL');
                  setTempOnlyActiveGmp(false);
                  setTempOnlyClosingToday(false);
                  setTempSortBy('DEFAULT');
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                }}
                style={[
                  styles.modalResetBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                activeOpacity={0.8}
              >
                <Icon name="rotate-ccw" size={13} color={colors.foreground} style={{ marginRight: 6 }} />
                <Text style={[styles.modalResetBtnText, { color: colors.foreground }]}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setMarketFilter(tempMarketFilter);
                  setIncludeSme(tempMarketFilter !== 'MAINBOARD');
                  setOnlyActiveGmp(tempOnlyActiveGmp);
                  setOnlyClosingToday(tempOnlyClosingToday);
                  setSortBy(tempSortBy);
                  setShowFilterModal(false);
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                }}
                style={[
                  styles.modalApplyBtn,
                  { backgroundColor: colors.primary },
                ]}
                activeOpacity={0.85}
              >
                <Text style={[styles.modalApplyBtnText, { color: colors.primaryForeground }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  floatingHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    height: 56,
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
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.8,
    lineHeight: 34,
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
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  filterBarText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
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
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 0,
    margin: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    position: 'relative',
  },
  logoImage: {
    ...StyleSheet.absoluteFillObject,
    width: 44,
    height: 44,
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
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  statusPillNew: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  statusTextNew: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
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
    borderRadius: 9999,
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
    borderRadius: 9999,
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
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  statusPillText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalHeaderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  modalActiveBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  modalActiveBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
  },
  sectionContainer: {},
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  filterTogglesCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  filterSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  filterSwitchLabel: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  filterSwitchSub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  filterSwitchDivider: {
    height: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  modalResetBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalResetBtnText: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  modalApplyBtn: {
    flex: 1.5,
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalApplyBtnText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
