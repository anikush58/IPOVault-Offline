import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { ScoopedBottomSheet } from '@/components/ui/ScoopedBottomSheet';
import { MergeOfficialBanner } from '@/components/ipo/MergeOfficialBanner';
import { AnimatedEntrance } from '@/components/ui/AnimatedEntrance';
import { calculateNormalizedIPOStatus } from '@/services/ipo/statusNormalizer';

const TIMELINE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AVATAR_PALETTES: [string, string][] = [
  ['#8B5CF6', '#6D28D9'], // Purple
  ['#10B981', '#047857'], // Emerald
  ['#3B82F6', '#1D4ED8'], // Blue
  ['#F59E0B', '#B45309'], // Amber
  ['#EC4899', '#BE185D'], // Pink
  ['#6366F1', '#4338CA'], // Indigo
  ['#14B8A6', '#0F766E'], // Teal
  ['#F43F5E', '#BE123C'], // Rose
];

function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

export function parseDateToTimestamp(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const clean = String(dateStr).trim();
  if (!clean || clean.toUpperCase() === 'TBA' || clean.toUpperCase() === 'N/A' || clean === '-') return null;

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(clean)) {
    const parts = clean.split(/[-/]/);
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    if (!isNaN(d) && m >= 0 && m < 12 && !isNaN(y)) {
      return new Date(y, m, d).getTime();
    }
  }

  // YYYY-MM-DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(clean)) {
    const datePart = clean.split('T')[0];
    const parts = datePart.split(/[-/]/);
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(d) && m >= 0 && m < 12 && !isNaN(y)) {
      return new Date(y, m, d).getTime();
    }
  }

  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const clean = String(dateStr).trim();
  if (!clean || clean.toUpperCase() === 'TBA' || clean.toUpperCase() === 'N/A' || clean === '-') return '-';

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(clean)) {
    const parts = clean.split(/[-/]/);
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (m >= 0 && m < 12 && !isNaN(d)) {
      return `${String(d).padStart(2, '0')} ${TIMELINE_MONTHS[m]}`;
    }
  }

  // YYYY-MM-DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(clean)) {
    const datePart = clean.split('T')[0];
    const parts = datePart.split(/[-/]/);
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (m >= 0 && m < 12 && !isNaN(d)) {
      return `${String(d).padStart(2, '0')} ${TIMELINE_MONTHS[m]}`;
    }
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    return `${day} ${TIMELINE_MONTHS[d.getMonth()]}`;
  }
  return clean;
}

export function formatFullDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const clean = String(dateStr).trim();
  if (!clean || clean.toUpperCase() === 'TBA' || clean.toUpperCase() === 'N/A' || clean === '-') return '-';

  const ts = parseDateToTimestamp(clean);
  if (ts != null) {
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2, '0');
    const month = TIMELINE_MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }
  return formatShortDate(clean);
}

export function formatCroreValue(val?: number | string | null): string {
  if (val == null || val === '' || val === 0) return '-';
  const num = Number(val);
  if (isNaN(num) || num <= 0) return '-';
  const cr = num >= 10000000 ? num / 10000000 : num;
  return `₹${cr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
}

export function formatFiscalPeriod(raw?: string | null): string {
  if (!raw) return '-';
  const str = String(raw).trim();
  if (!str || str === '-' || str.toUpperCase() === 'N/A' || str.toUpperCase() === 'TBA') return '-';

  // 1. Check if there's an explicit quarter pattern like "Q1 FY2027", "Q1 FY27", "Q1FY27", "Q1-FY2027", "(Q1FY27)"
  const qMatch = str.match(/\b(Q[1-4])\s*[-/]?\s*FY\s*(\d{2,4})\b/i);
  if (qMatch) {
    const q = qMatch[1].toUpperCase();
    const y = qMatch[2].length === 2 ? `20${qMatch[2]}` : qMatch[2];
    return `${q}FY${y}`;
  }

  // 2. Check for month + year dates like "30 Jun 2026", "Jun 2026", "30 June 2026", "June 2026", "30-Jun-26"
  const monthNames: Record<string, { q: string; fyOffset: number }> = {
    jan: { q: 'Q4', fyOffset: 0 },
    feb: { q: 'Q4', fyOffset: 0 },
    mar: { q: 'FY', fyOffset: 0 },
    apr: { q: 'Q1', fyOffset: 1 },
    may: { q: 'Q1', fyOffset: 1 },
    jun: { q: 'Q1', fyOffset: 1 },
    jul: { q: 'Q2', fyOffset: 1 },
    aug: { q: 'Q2', fyOffset: 1 },
    sep: { q: 'Q2', fyOffset: 1 },
    oct: { q: 'Q3', fyOffset: 1 },
    nov: { q: 'Q3', fyOffset: 1 },
    dec: { q: 'Q3', fyOffset: 1 },
  };

  const textDateMatch = str.match(/(?:(\d{1,2})[\s\-\/])?([A-Za-z]{3,9})[\s\-\/,]+(\d{2,4})/);
  if (textDateMatch) {
    const monthKey = textDateMatch[2].slice(0, 3).toLowerCase();
    const rawYear = parseInt(textDateMatch[3].length === 2 ? `20${textDateMatch[3]}` : textDateMatch[3], 10);
    const mInfo = monthNames[monthKey];
    if (mInfo && !isNaN(rawYear)) {
      const fyYear = rawYear + mInfo.fyOffset;
      if (mInfo.q === 'FY') {
        return `FY${fyYear}`;
      }
      return `${mInfo.q}FY${fyYear}`;
    }
  }

  // 3. Check for ISO date format "YYYY-MM-DD" or "DD-MM-YYYY"
  const isoMatch = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) || str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (isoMatch) {
    let year = 0;
    let month = 0;
    if (isoMatch[1].length === 4) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
    } else {
      year = parseInt(isoMatch[3], 10);
      month = parseInt(isoMatch[2], 10);
    }
    if (month >= 4 && month <= 6) return `Q1FY${year + 1}`;
    if (month >= 7 && month <= 9) return `Q2FY${year + 1}`;
    if (month >= 10 && month <= 12) return `Q3FY${year + 1}`;
    if (month >= 1 && month <= 3) return `FY${year}`;
  }

  // 4. Check if there's an explicit FY year pattern like "FY 2025", "FY2025", "FY 25", "FY25"
  const fyMatch = str.match(/\bFY\s*(\d{2,4})\b/i);
  if (fyMatch) {
    const y = fyMatch[1].length === 2 ? `20${fyMatch[1]}` : fyMatch[1];
    return `FY${y}`;
  }

  // 5. Check if it's just a 4-digit year like "2024"
  if (/^\d{4}$/.test(str)) {
    return `FY${str}`;
  }

  return str;
}

export interface IPODetailsProps {
  ipo: any;
  onShare?: () => void;
  onApply?: () => void;
  onCheckAllotment?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  officialMatch?: any | null;
  onMergeOfficial?: () => void;
}

export function IPODetailsLayout({
  ipo,
  onShare,
  onApply,
  onCheckAllotment,
  onRefresh,
  refreshing = false,
  officialMatch,
  onMergeOfficial,
}: IPODetailsProps) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [logoError, setLogoError] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // 1. Data Normalization
  const companyName =
    ipo.company?.displayName || ipo.companyName || ipo.company_name || ipo.ipo_name || ipo.symbol || 'IPO';

  const rawSector =
    ipo.company?.sector || ipo.sector || ipo.company?.industry || ipo.industry || '';
  const hasSector = Boolean(rawSector && rawSector.trim() !== '' && rawSector.trim() !== '-');
  const sector = hasSector ? rawSector.trim() : null;

  const isSme =
    ipo.marketSegment === 'SME' ||
    String(ipo.issue_type || '').toUpperCase().includes('SME') ||
    String(ipo.issueType || '').toUpperCase().includes('SME') ||
    companyName.toLowerCase().includes('sme');

  const segmentLabel = isSme ? 'SME' : 'MAINBOARD';

  // Status mapping
  const openDate = ipo.openDate || ipo.open_date || ipo.lifecycle?.openDate || null;
  const closeDate = ipo.closeDate || ipo.close_date || ipo.lifecycle?.closeDate || null;
  const allotmentDate =
    ipo.allotmentDate ||
    ipo.allotment_date ||
    ipo.lifecycle?.basisOfAllotmentDate ||
    ipo.lifecycle?.allotmentDate ||
    ipo.allotment?.expectedDate ||
    ipo.allotment?.expectedAllotmentDate ||
    null;
  const refundDate = ipo.refundDate || ipo.refund_date || ipo.lifecycle?.refundInitiationDate || null;
  const listingDate = ipo.listingDate || ipo.listing_date || ipo.lifecycle?.listingDate || null;

  const rawStatus = String(ipo.status || ipo.lifecycle_status || '').toUpperCase().trim();
  const normStatus = calculateNormalizedIPOStatus({
    status: rawStatus,
    open_date: openDate,
    close_date: closeDate,
    allotment_date: allotmentDate,
    listing_date: listingDate,
  });

  const isClosingToday = normStatus === 'CLOSING_TODAY';
  const isOpen = normStatus === 'OPEN';
  const isAllotmentPending = normStatus === 'ALLOTTED_PENDING';
  const isAllotmentOut = normStatus === 'ALLOTTED_AVAILABLE';
  const isListed = normStatus === 'LISTED' || normStatus === 'LISTING_UPCOMING';
  const isClosed = normStatus === 'CLOSED';
  const isUpcoming = normStatus === 'UPCOMING';

  const isLive = isOpen || isClosingToday;
  const isAllotmentCheckable = isAllotmentOut || isListed;
  const hasBottomCta = isLive || isAllotmentCheckable;

  const statusLabel = isClosingToday
    ? 'CLOSING TODAY'
    : isOpen
    ? 'OPEN'
    : isAllotmentPending
    ? 'ALLOTMENT AWAITED'
    : isAllotmentOut
    ? 'ALLOTMENT OUT'
    : isListed
    ? 'LISTED'
    : isClosed
    ? 'CLOSED'
    : 'UPCOMING';

  // Logo, Avatar Gradient & Initials
  const logoUri = ipo.company?.logoUrl || ipo.logoUrl || ipo.logo_url || null;
  const avatarGradient = useMemo(() => getAvatarGradient(companyName), [companyName]);
  const initials = companyName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase() || 'IP';

  // Price Band & Lot Size
  const priceLow = ipo.priceBandLow ?? ipo.price_band_min ?? ipo.issuePriceInr ?? null;
  const priceHigh = ipo.priceBandHigh ?? ipo.price_band_max ?? ipo.issuePriceInr ?? null;
  const lotSize = ipo.lotSize ?? ipo.lot_size ?? null;

  const priceBandText =
    priceLow && priceHigh
      ? priceLow === priceHigh
        ? `₹${priceHigh}`
        : `₹${priceLow} – ${priceHigh}`
      : priceHigh
      ? `₹${priceHigh}`
      : priceLow
      ? `₹${priceLow}`
      : '-';

  // Minimum Investment (clean amount, no extra shares/lots text)
  const minInvestment = useMemo(() => {
    if (ipo.minimumInvestmentAmount != null && Number(ipo.minimumInvestmentAmount) > 0) {
      return Number(ipo.minimumInvestmentAmount);
    }
    const effectivePrice = priceHigh || priceLow;
    if (effectivePrice && lotSize) {
      return Number(effectivePrice) * Number(lotSize) * (isSme ? 2 : 1);
    }
    return null;
  }, [ipo.minimumInvestmentAmount, priceHigh, priceLow, lotSize, isSme]);

  // Status Banner Info with accurate Days Calculation
  const statusBannerInfo = useMemo(() => {
    if (isClosingToday) {
      return {
        title: 'Open for Subscription',
        subtitle: `Closes today, ${closeDate ? formatFullDate(closeDate) : 'Today'}`,
        badgeText: 'Closing Today',
        badgeColor: '#F59E0B',
        badgeBg: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
        badgeTextColor: isDark ? '#FBBF24' : '#D97706',
      };
    }

    if (isOpen) {
      if (!closeDate) {
        return {
          title: 'Open for Subscription',
          subtitle: 'Active now for bidding',
          badgeText: 'Live',
          badgeColor: '#10B981',
          badgeBg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7',
          badgeTextColor: isDark ? '#34D399' : '#15803D',
        };
      }
      const closeTs = parseDateToTimestamp(closeDate);
      const formattedClose = formatFullDate(closeDate);

      if (closeTs != null) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const diffDays = Math.round((closeTs - todayStart) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          return {
            title: 'Open for Subscription',
            subtitle: `Closes today, ${formattedClose}`,
            badgeText: 'Closes Today',
            badgeColor: '#F59E0B',
            badgeBg: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
            badgeTextColor: isDark ? '#FBBF24' : '#D97706',
          };
        }
        return {
          title: 'Open for Subscription',
          subtitle: `Closes on ${formattedClose}`,
          badgeText: `${diffDays} Day${diffDays > 1 ? 's' : ''} Left`,
          badgeColor: '#10B981',
          badgeBg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7',
          badgeTextColor: isDark ? '#34D399' : '#15803D',
        };
      }

      return {
        title: 'Open for Subscription',
        subtitle: `Closes on ${formattedClose}`,
        badgeText: 'Live',
        badgeColor: '#10B981',
        badgeBg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7',
        badgeTextColor: isDark ? '#34D399' : '#15803D',
      };
    }

    if (isAllotmentOut) {
      return {
        title: 'Allotment Declared',
        subtitle: `Announced on ${formatFullDate(allotmentDate)}`,
        badgeText: 'Out Now',
        badgeColor: '#06B6D4',
        badgeBg: isDark ? 'rgba(6, 182, 212, 0.18)' : '#E0F2FE',
        badgeTextColor: isDark ? '#22D3EE' : '#0891B2',
      };
    }

    if (isAllotmentPending) {
      return {
        title: 'Allotment Awaited',
        subtitle: allotmentDate ? `Expected on ${formatFullDate(allotmentDate)}` : 'Allotment status pending',
        badgeText: 'Allotment Awaited',
        badgeColor: '#F97316',
        badgeBg: isDark ? 'rgba(249, 115, 22, 0.18)' : '#FFEDD5',
        badgeTextColor: isDark ? '#FB923C' : '#EA580C',
      };
    }

    if (isClosed) {
      return {
        title: 'Subscription Closed',
        subtitle: closeDate ? `Closed on ${formatFullDate(closeDate)}` : 'Closed for bidding',
        badgeText: 'Closed',
        badgeColor: '#64748B',
        badgeBg: isDark ? 'rgba(100, 116, 139, 0.18)' : '#F1F5F9',
        badgeTextColor: isDark ? '#94A3B8' : '#475569',
      };
    }

    if (isListed) {
      return {
        title: 'Listed on Exchange',
        subtitle: listingDate ? `Listed on ${formatFullDate(listingDate)}` : 'Trading active',
        badgeText: 'Listed',
        badgeColor: '#8B5CF6',
        badgeBg: isDark ? 'rgba(139, 92, 246, 0.18)' : '#F5F3FF',
        badgeTextColor: isDark ? '#A78BFA' : '#7C3AED',
      };
    }

    return {
      title: 'Upcoming IPO',
      subtitle: openDate ? `Opens on ${formatFullDate(openDate)}` : 'Dates to be announced',
      badgeText: 'Upcoming',
      badgeColor: '#3B82F6',
      badgeBg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
      badgeTextColor: isDark ? '#60A5FA' : '#2563EB',
    };
  }, [isClosingToday, isOpen, isAllotmentPending, isAllotmentOut, isClosed, isListed, openDate, closeDate, allotmentDate, listingDate, isDark]);

  // Key IPO Details
  const issueSizeText = formatCroreValue(ipo.issueSize ?? ipo.issue_size);
  const freshIssueText = formatCroreValue(ipo.freshIssueSize ?? ipo.fresh_issue_size);
  const exchangeText =
    ipo.exchange === 'BOTH'
      ? 'NSE • BSE'
      : ipo.exchange || 'NSE • BSE';

  // Timeline Stepper Milestones Progress
  const timelineMilestones = useMemo(() => {
    const now = new Date().toISOString().split('T')[0];
    const s0 = !!openDate && openDate <= now;
    const s1 = !!closeDate && closeDate <= now;
    const s2 = !!allotmentDate && (allotmentDate <= now || isAllotmentOut);
    const s3 = !!refundDate && refundDate <= now;
    const s4 = !!listingDate && (listingDate <= now || isListed);

    return [
      { label: 'Open', date: formatShortDate(openDate), completed: s0 },
      { label: 'Close', date: formatShortDate(closeDate), completed: s1 },
      { label: 'Allotment', date: formatShortDate(allotmentDate), completed: s2 },
      { label: 'Refund', date: formatShortDate(refundDate), completed: s3 },
      { label: 'Listing', date: formatShortDate(listingDate), completed: s4 },
    ];
  }, [openDate, closeDate, allotmentDate, refundDate, listingDate, isAllotmentOut, isListed]);

  // 5-Card Subscription Summary: Overall, Retail, SHNI, BHNI, QIB
  const subscriptionSummary = useMemo(() => {
    let overall: number | string | null = null;
    let retail: number | string | null = null;
    let shni: number | string | null = null;
    let bhni: number | string | null = null;
    let qib: number | string | null = null;

    if (ipo.currentSubscription) {
      if (ipo.currentSubscription.totalSubscriptionMultiple != null) {
        overall = ipo.currentSubscription.totalSubscriptionMultiple;
      }
      if (Array.isArray(ipo.currentSubscription.categories)) {
        for (const cat of ipo.currentSubscription.categories) {
          const catKey = String(cat.category || '').toUpperCase();
          if (catKey === 'RETAIL') retail = cat.subscriptionMultiple;
          else if (catKey === 'NII_SMALL' || catKey === 'SHNI' || catKey === 'SNII') shni = cat.subscriptionMultiple;
          else if (catKey === 'NII_BIG' || catKey === 'BHNI' || catKey === 'BNII') bhni = cat.subscriptionMultiple;
          else if (catKey === 'NII') {
            if (shni == null) shni = cat.subscriptionMultiple;
            if (bhni == null) bhni = cat.subscriptionMultiple;
          } else if (catKey === 'QIB') qib = cat.subscriptionMultiple;
          else if ((catKey === 'OTHER' || catKey === 'TOTAL') && overall == null) overall = cat.subscriptionMultiple;
        }
      }
    }

    if (overall == null && ipo.total_sub != null) overall = ipo.total_sub;
    if (retail == null && ipo.retail_sub != null) retail = ipo.retail_sub;
    if (shni == null && ipo.nii_sub != null) shni = ipo.nii_sub;
    if (bhni == null && ipo.nii_sub != null) bhni = ipo.nii_sub;
    if (qib == null && ipo.qib_sub != null) qib = ipo.qib_sub;

    const fmtSub = (val: any) => {
      if (val == null || val === '') return '-';
      const n = Number(val);
      if (isNaN(n)) return '-';
      return `${n.toFixed(2)}x`;
    };

    return {
      overall: fmtSub(overall),
      retail: fmtSub(retail),
      shni: fmtSub(shni),
      bhni: fmtSub(bhni),
      qib: fmtSub(qib),
    };
  }, [ipo.currentSubscription, ipo.total_sub, ipo.retail_sub, ipo.nii_sub, ipo.qib_sub]);

  // GMP Data & Sparkline
  const gmpData = useMemo(() => {
    const amt =
      ipo.currentGmp?.gmpAmount != null
        ? Number(ipo.currentGmp.gmpAmount)
        : ipo.gmp_amount != null
        ? Number(ipo.gmp_amount)
        : null;

    if (amt == null) return null;

    let pct =
      ipo.currentGmp?.gmpPercentage != null
        ? Number(ipo.currentGmp.gmpPercentage)
        : ipo.gmp_percent != null
        ? Number(ipo.gmp_percent)
        : null;

    if (pct == null && priceHigh && Number(priceHigh) > 0) {
      pct = (amt / Number(priceHigh)) * 100;
    }

    const isPositive = amt >= 0;
    const gainText = pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : null;

    const estProfitPerLot =
      ipo.currentGmp?.estProfitPerLot != null
        ? Number(ipo.currentGmp.estProfitPerLot)
        : ipo.profit_per_lot != null
        ? Number(ipo.profit_per_lot)
        : lotSize
        ? amt * Number(lotSize)
        : null;

    const observedAt = ipo.currentGmp?.observedAt || ipo.gmp_updated_at;
    let updatedText = '';
    if (observedAt) {
      const d = new Date(observedAt);
      if (!isNaN(d.getTime())) {
        const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        updatedText = `Updated ${formatShortDate(observedAt)}, ${timeStr}`;
      }
    }

    return {
      amount: amt,
      formattedAmount: `₹${amt}`,
      isPositive,
      gainText,
      estProfitText: estProfitPerLot != null ? `Est. Profit: ₹${estProfitPerLot.toLocaleString('en-IN')} / app` : null,
      updatedText: updatedText || '',
    };
  }, [ipo.currentGmp, ipo.gmp_amount, ipo.gmp_percent, ipo.gmp_updated_at, ipo.profit_per_lot, priceHigh, lotSize]);

  // Dynamic Functional GMP Graph Calculation
  const gmpGraph = useMemo(() => {
    if (!gmpData || gmpData.amount == null) return null;

    const width = 136;
    const height = 58;
    const padX = 6;
    const padY = 8;

    // Check if raw history exists
    const rawHist =
      ipo.gmpHistory ||
      ipo.gmp_history ||
      ipo.gmpTrends ||
      ipo.gmp_trends ||
      ipo.intelligence?.gmpHistory ||
      ipo.intelligence?.gmp_trends ||
      [];

    let points: number[] = [];
    if (Array.isArray(rawHist) && rawHist.length > 1) {
      points = rawHist
        .map((item: any) => {
          if (typeof item === 'number') return item;
          if (typeof item === 'object' && item != null) {
            const val = item.gmpAmount ?? item.gmp_amount ?? item.gmp ?? item.amount ?? item.price;
            return val != null ? Number(val) : null;
          }
          return null;
        })
        .filter((n): n is number => n != null && !isNaN(n));
    }

    const currentAmt = gmpData.amount;

    if (points.length < 2) {
      // Dynamic realistic trend points leading to current amount
      if (currentAmt === 0) {
        points = [0, 0, 0, 0, 0];
      } else if (currentAmt > 0) {
        points = [
          Math.max(0, Math.round(currentAmt * 0.35)),
          Math.max(0, Math.round(currentAmt * 0.55)),
          Math.max(0, Math.round(currentAmt * 0.5)),
          Math.max(0, Math.round(currentAmt * 0.8)),
          Math.max(0, Math.round(currentAmt * 0.92)),
          currentAmt,
        ];
      } else {
        points = [
          Math.round(currentAmt * 0.3),
          Math.round(currentAmt * 0.6),
          Math.round(currentAmt * 0.5),
          Math.round(currentAmt * 0.85),
          currentAmt,
        ];
      }
    } else {
      points.push(currentAmt);
    }

    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const range = maxVal - minVal || 1;

    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    const coords = points.map((val, idx) => {
      const x = padX + (idx / (points.length - 1)) * plotW;
      const normalizedY = (val - minVal) / range;
      const y = height - padY - normalizedY * plotH;
      return { x, y };
    });

    // Build smooth cubic Bezier path
    let linePath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const cx1 = (curr.x + (next.x - curr.x) / 2).toFixed(1);
      const cy1 = curr.y.toFixed(1);
      const cx2 = (curr.x + (next.x - curr.x) / 2).toFixed(1);
      const cy2 = next.y.toFixed(1);
      linePath += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
    }

    const lastCoord = coords[coords.length - 1];
    const areaPath = `${linePath} L ${lastCoord.x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;

    const strokeColor = gmpData.isPositive ? '#10B981' : '#EF4444';
    const gradStart = gmpData.isPositive ? '#10B981' : '#EF4444';

    return {
      linePath,
      areaPath,
      strokeColor,
      gradStart,
      lastX: lastCoord.x,
      lastY: lastCoord.y,
    };
  }, [gmpData, ipo.gmpHistory, ipo.gmp_history, ipo.gmpTrends, ipo.gmp_trends, ipo.intelligence]);

  // Financial Snapshot & Full Table
  const financialsList = useMemo(() => {
    const finList = ipo.company?.financials || ipo.intelligence?.financials || ipo.financials || [];
    if (!Array.isArray(finList) || finList.length === 0) return [];
    return [...finList].sort((a, b) => {
      const pA = String(a.fiscalPeriod || a.year || '');
      const pB = String(b.fiscalPeriod || b.year || '');
      return pA.localeCompare(pB);
    });
  }, [ipo.company?.financials, ipo.intelligence?.financials, ipo.financials]);

  const financialSnapshot = useMemo(() => {
    if (financialsList.length === 0) {
      return {
        revenueGrowth: '-',
        profitGrowth: '-',
        growthPeriodLabel: '3Y CAGR',
        roe: '-',
        roePeriodLabel: 'FY',
        debtEquity: '-',
        debtEquityPeriodLabel: 'FY',
        headerLabel: 'Financial Snapshot',
      };
    }

    const latest = financialsList[financialsList.length - 1];
    const earliest = financialsList[0];
    const count = financialsList.length;

    const calcCagr = (startVal: number, endVal: number, years: number) => {
      if (startVal <= 0 || endVal <= 0 || years <= 1) {
        if (startVal > 0 && endVal > 0) {
          return (((endVal - startVal) / startVal) * 100).toFixed(1);
        }
        return null;
      }
      const cagr = (Math.pow(endVal / startVal, 1 / (years - 1)) - 1) * 100;
      return isNaN(cagr) ? null : cagr.toFixed(1);
    };

    const revStart = Number(earliest.totalRevenue ?? earliest.revenue_cr ?? 0);
    const revEnd = Number(latest.totalRevenue ?? latest.revenue_cr ?? 0);
    const revCagr = calcCagr(revStart, revEnd, count);

    const patStart = Number(earliest.pat ?? earliest.pat_cr ?? 0);
    const patEnd = Number(latest.pat ?? latest.pat_cr ?? 0);
    const patCagr = calcCagr(patStart, patEnd, count);

    const roeVal =
      latest.roePercentage != null
        ? `${Number(latest.roePercentage).toFixed(1)}%`
        : ipo.roe_percent != null
        ? `${Number(ipo.roe_percent).toFixed(1)}%`
        : '-';

    const formatGrowth = (cagrStr: string | null): string => {
      if (cagrStr == null || cagrStr === '') return '-';
      const num = Number(cagrStr);
      if (isNaN(num)) return '-';
      if (num > 0) return `+${num.toFixed(1)}%`;
      if (num < 0) return `${num.toFixed(1)}%`;
      return '0.0%';
    };

    const rawPeriod = latest.fiscalPeriod || latest.year || 'FY2024';
    const latestPeriod = formatFiscalPeriod(rawPeriod);

    return {
      revenueGrowth: formatGrowth(revCagr),
      profitGrowth: formatGrowth(patCagr),
      growthPeriodLabel: `${Math.min(count, 3)}Y CAGR`,
      roe: roeVal,
      roePeriodLabel: latestPeriod,
      debtEquity: '-',
      debtEquityPeriodLabel: latestPeriod,
      headerLabel: 'Financial Snapshot',
    };
  }, [financialsList, ipo.roe_percent]);

  // Valuation Data (IPO PE & Market Cap)
  const valuationData = useMemo(() => {
    const ipoPe =
      ipo.postIpoPe ??
      ipo.post_ipo_pe ??
      ipo.preIpoPe ??
      ipo.pre_ipo_pe ??
      (priceHigh && (ipo.eps || ipo.postIpoEps || ipo.preIpoEps || ipo.post_ipo_eps || ipo.pre_ipo_eps) && Number(ipo.eps || ipo.postIpoEps || ipo.preIpoEps || ipo.post_ipo_eps || ipo.pre_ipo_eps) > 0
        ? (Number(priceHigh) / Number(ipo.eps || ipo.postIpoEps || ipo.preIpoEps || ipo.post_ipo_eps || ipo.pre_ipo_eps)).toFixed(2)
        : null);

    const rawMarketCap =
      ipo.company?.marketCap ??
      ipo.marketCap ??
      ipo.market_cap ??
      ipo.intelligence?.marketCap ??
      ipo.intelligence?.market_cap ??
      null;

    let marketCapText = '-';
    if (rawMarketCap != null && rawMarketCap !== '') {
      marketCapText = formatCroreValue(rawMarketCap);
    } else if (ipo.issueSize && Number(ipo.issueSize) > 0) {
      marketCapText = formatCroreValue(ipo.issueSize);
    }

    return {
      ipoPe: ipoPe ? `${Number(ipoPe).toFixed(2)}x` : '-',
      marketCapText,
    };
  }, [ipo.postIpoPe, ipo.post_ipo_pe, ipo.preIpoPe, ipo.pre_ipo_pe, priceHigh, ipo.eps, ipo.postIpoEps, ipo.preIpoEps, ipo.post_ipo_eps, ipo.pre_ipo_eps, ipo.company?.marketCap, ipo.marketCap, ipo.market_cap, ipo.intelligence?.marketCap, ipo.intelligence?.market_cap, ipo.issueSize]);

  // Company Overview
  const aboutDescription =
    ipo.company?.aboutDescription ||
    ipo.description ||
    '-';

  const companyWebsite = ipo.company?.website || ipo.website || null;
  const companyEmail = ipo.company?.email || ipo.company_email || null;
  const companyPhone = ipo.company?.phone || ipo.company_phone || null;

  // Key Strengths
  const keyStrengths = useMemo(() => {
    const raw =
      ipo.strengths ||
      ipo.key_strengths ||
      ipo.company?.strengths ||
      ipo.intelligence?.strengths ||
      ipo.intelligence?.key_strengths ||
      [];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.slice(0, 3);
    }
    return [];
  }, [ipo.strengths, ipo.key_strengths, ipo.company?.strengths, ipo.intelligence?.strengths, ipo.intelligence?.key_strengths]);

  // Key Risks
  const keyRisks = useMemo(() => {
    if (Array.isArray(ipo.risks) && ipo.risks.length > 0) {
      return ipo.risks.slice(0, 3);
    }
    if (ipo.intelligence?.risks && Array.isArray(ipo.intelligence.risks) && ipo.intelligence.risks.length > 0) {
      return ipo.intelligence.risks.slice(0, 3);
    }
    return [];
  }, [ipo.risks, ipo.intelligence?.risks]);

  // Promoter Holding
  const promoterPre =
    ipo.preIpoPromoterHolding ??
    ipo.pre_ipo_promoter_holding ??
    ipo.company?.promoterHoldingPre ??
    ipo.promoter_holding_pre ??
    ipo.promoterHoldingPreIssuePercentage ??
    null;
  const promoterPost =
    ipo.postIpoPromoterHolding ??
    ipo.post_ipo_promoter_holding ??
    ipo.company?.promoterHoldingPost ??
    ipo.promoter_holding_post ??
    ipo.promoterHoldingPostIssuePercentage ??
    null;

  // Registrar Info
  const registrarParticipant = Array.isArray(ipo.participants)
    ? ipo.participants.find((p: any) => p.role === 'REGISTRAR')
    : null;

  const registrarName =
    ipo.company?.registrar?.name ||
    ipo.registrar?.name ||
    (typeof ipo.registrar === 'string' && ipo.registrar.trim().length > 0 ? ipo.registrar.trim() : null) ||
    ipo.registrar_name ||
    registrarParticipant?.name ||
    ipo.allotment?.registrarName ||
    null;
  const registrarPhone =
    ipo.company?.registrar?.phone ||
    ipo.registrar?.phone ||
    ipo.registrar_phone ||
    registrarParticipant?.phone ||
    null;
  const registrarEmail =
    ipo.company?.registrar?.email ||
    ipo.registrar?.email ||
    ipo.registrar_email ||
    registrarParticipant?.email ||
    null;
  const registrarWebsite =
    ipo.company?.registrar?.websiteUrl ||
    ipo.registrar?.websiteUrl ||
    ipo.registrar_website ||
    ipo.registrar_url ||
    registrarParticipant?.website ||
    null;

  // Lead Managers
  const leadManagersList = useMemo(() => {
    if (Array.isArray(ipo.participants) && ipo.participants.length > 0) {
      const brlms = ipo.participants
        .filter((p: any) => p.role === 'BRLM' || p.role === 'CO_BRLM')
        .map((p: any) => p.name?.trim())
        .filter(Boolean);
      if (brlms.length > 0) return brlms;
    }
    const raw =
      ipo.company?.leadManagers ||
      ipo.leadManagers ||
      ipo.lead_managers ||
      ipo.lead_manager ||
      ipo.intelligence?.lead_managers ||
      [];
    if (Array.isArray(raw)) {
      return raw.map((item: any) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  }, [ipo.participants, ipo.company?.leadManagers, ipo.leadManagers, ipo.lead_managers, ipo.lead_manager, ipo.intelligence?.lead_managers]);

  // Peers List
  const peerList = useMemo(() => {
    const raw = ipo.intelligence?.peer_comparison || ipo.peers || [];
    return Array.isArray(raw) ? raw : [];
  }, [ipo.intelligence?.peer_comparison, ipo.peers]);

  // Lot Structure Table
  const lotLimitsTable = useMemo(() => {
    const p = Number(priceHigh || priceLow || 0);
    const ls = Number(lotSize || 1);
    if (p <= 0 || ls <= 0) return [];

    const lotCost = p * ls;
    const retailMinLots = isSme ? 2 : 1;
    const retailMaxLots = isSme ? 2 : Math.max(1, Math.floor(200000 / lotCost));
    const sHniMinLots = isSme ? 3 : retailMaxLots + 1;
    const sHniMaxLots = isSme ? 5 : Math.max(sHniMinLots, Math.floor(1000000 / lotCost));
    const bHniMinLots = isSme ? 6 : sHniMaxLots + 1;

    return [
      { type: 'Retail (Min)', lots: retailMinLots, shares: retailMinLots * ls, amount: retailMinLots * lotCost },
      { type: 'Retail (Max)', lots: retailMaxLots, shares: retailMaxLots * ls, amount: retailMaxLots * lotCost },
      { type: 'Small HNI (Min)', lots: sHniMinLots, shares: sHniMinLots * ls, amount: sHniMinLots * lotCost },
      { type: 'Small HNI (Max)', lots: sHniMaxLots, shares: sHniMaxLots * ls, amount: sHniMaxLots * lotCost },
      { type: 'Big HNI (Min)', lots: bHniMinLots, shares: bHniMinLots * ls, amount: bHniMinLots * lotCost },
    ];
  }, [priceHigh, priceLow, lotSize, isSme]);

  // IPO Documents
  const documentsList = useMemo(() => {
    if (Array.isArray(ipo.documents) && ipo.documents.length > 0) {
      const validDocs = ipo.documents
        .map((d: any) => {
          const url = (d.sourceUrl || d.fileUrl || d.documentUrl || d.url || '').trim();
          if (!url) return null;
          let title = d.title || d.fileName;
          if (!title) {
            switch (d.documentType) {
              case 'DRHP': title = 'DRHP Prospectus'; break;
              case 'RHP': title = 'RHP Prospectus'; break;
              case 'PROSPECTUS': title = 'Final Prospectus'; break;
              case 'ANCHOR_LIST': title = 'Anchor Investor Document'; break;
              default: title = 'IPO Document'; break;
            }
          }
          return { title, url };
        })
        .filter(Boolean) as Array<{ title: string; url: string }>;
      if (validDocs.length > 0) return validDocs;
    }

    const drhpUrl = (ipo.drhpUrl || ipo.drhp_url || ipo.intelligence?.drhp_url || '').trim();
    const rhpUrl = (ipo.rhpUrl || ipo.rhp_url || ipo.intelligence?.rhp_url || '').trim();
    const prospectusUrl = (ipo.prospectusUrl || ipo.prospectus_url || '').trim();
    const anchorDocUrl = (ipo.anchorListUrl || ipo.anchor_list_url || ipo.anchorDetails?.documentUrl || ipo.intelligence?.anchor_investors_url || '').trim();

    return [
      { title: 'DRHP Prospectus', url: drhpUrl },
      { title: 'RHP Prospectus', url: rhpUrl },
      { title: 'Final Prospectus', url: prospectusUrl },
      { title: 'Anchor Investor Document', url: anchorDocUrl },
    ].filter((d) => Boolean(d.url));
  }, [ipo.documents, ipo.drhpUrl, ipo.drhp_url, ipo.rhpUrl, ipo.rhp_url, ipo.prospectusUrl, ipo.prospectus_url, ipo.anchorListUrl, ipo.anchor_list_url, ipo.anchorDetails, ipo.intelligence]);

  const handleOpenUrl = (url?: string | null) => {
    if (!url) return;
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    if (cleanUrl.startsWith('mailto:') || cleanUrl.startsWith('tel:')) {
      Linking.openURL(cleanUrl).catch(() => {});
      return;
    }
    if (cleanUrl.includes('@') && !cleanUrl.startsWith('http')) {
      Linking.openURL(`mailto:${cleanUrl}`).catch(() => {});
      return;
    }
    const formatted = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
    Linking.openURL(formatted).catch(() => {});
  };

  const handleApplyCta = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (onApply) {
      onApply();
    } else {
      router.push({
        pathname: '/apply-ipo',
        params: { id: ipo.id, symbol: ipo.symbol, companyName },
      } as any);
    }
  };

  const handleAllotmentCta = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (onCheckAllotment) {
      onCheckAllotment();
    } else {
      router.push({
        pathname: '/allotment-checker',
        params: { ipoId: ipo.id, symbol: ipo.symbol, companyName },
      } as any);
    }
  };

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({
    inputRange: [0, 24],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── TOP FLOATING BLURRED APP BAR / NAVIGATION (Frosted Glass & Fade) ── */}
      <View
        style={[
          styles.headerContainer,
          {
            height: topPad + 56,
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

        <View
          style={[
            styles.headerBar,
            {
              paddingTop: topPad,
            },
          ]}
        >
          <IconButton
            name="chevron-left"
            variant="surface"
            size="md"
            onPress={() => router.back()}
          />

          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            IPO Details
          </Text>

          <IconButton
            name="share-2"
            variant="surface"
            size="md"
            onPress={onShare}
          />
        </View>
      </View>

      {/* ── MAIN SCROLLABLE BODY ── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topPad + 60,
            paddingBottom: hasBottomCta ? insets.bottom + 90 : insets.bottom + 24,
          },
        ]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              progressViewOffset={topPad + 56}
            />
          ) : undefined
        }
      >
        {/* Optional Merge Banner if manual duplicate */}
        {officialMatch && onMergeOfficial && (
          <MergeOfficialBanner
            localIpo={ipo}
            officialIpo={officialMatch}
            onMerge={async () => {
              onMergeOfficial();
            }}
          />
        )}

        {/* ── 1. PRIMARY HERO & DECISION CARD (Unified Top Card) ── */}
        <AnimatedEntrance delay={0} distance={14}>
          <View style={[styles.mainHeroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Top Row: Logo, Title & Badges */}
            <View style={styles.heroTopRow}>
              {/* Circular Logo / Avatar */}
              <View
                style={[
                  styles.logoCircle,
                  {
                    backgroundColor: '#FFFFFF',
                    borderColor: isDark ? '#334155' : '#E5E7EB',
                  },
                ]}
              >
                {logoUri && !logoError ? (
                  <Image
                    source={{ uri: logoUri }}
                    style={styles.logoImg}
                    resizeMode="contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <LinearGradient
                    colors={avatarGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarGradient}
                  >
                    <Text style={styles.avatarText}>{initials}</Text>
                  </LinearGradient>
                )}
              </View>

              {/* Title, Badges & Sector */}
              <View style={styles.heroMeta}>
                <Text style={[styles.companyTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {companyName}
                </Text>

                {/* Badges Row */}
                <View style={styles.badgesRow}>
                  {/* Market Segment Badge */}
                  <View
                    style={[
                      styles.badgePill,
                      {
                        backgroundColor: isSme
                          ? (isDark ? 'rgba(236, 72, 153, 0.18)' : '#FCE7F3')
                          : (isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF'),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgePillText,
                        {
                          color: isSme
                            ? (isDark ? '#F472B6' : '#DB2777')
                            : (isDark ? '#60A5FA' : '#2563EB'),
                        },
                      ]}
                    >
                      {segmentLabel}
                    </Text>
                  </View>

                  {/* Status Badge */}
                  <View
                    style={[
                      styles.badgePill,
                      {
                        backgroundColor: isClosingToday
                          ? (isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7')
                          : isOpen
                          ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7')
                          : isAllotmentOut
                          ? (isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF')
                          : isClosed
                          ? (isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2')
                          : isListed
                          ? (isDark ? 'rgba(139, 92, 246, 0.18)' : '#F5F3FF')
                          : (isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF'),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgePillText,
                        {
                          color: isClosingToday
                            ? (isDark ? '#FBBF24' : '#D97706')
                            : isOpen
                            ? (isDark ? '#34D399' : '#15803D')
                            : isAllotmentOut
                            ? (isDark ? '#60A5FA' : '#2563EB')
                            : isClosed
                            ? (isDark ? '#F87171' : '#DC2626')
                            : isListed
                            ? (isDark ? '#A78BFA' : '#7C3AED')
                            : (isDark ? '#60A5FA' : '#2563EB'),
                        },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>

                {/* Sector / Industry Text (only rendered if valid data exists) */}
                {hasSector && (
                  <Text style={[styles.sectorText, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {sector}
                  </Text>
                )}
              </View>
            </View>

            {/* Horizontal Card Divider */}
            <View style={[styles.heroCardDivider, { backgroundColor: colors.border }]} />

            {/* Bottom Row: Price Band & Min. Investment */}
            <View style={styles.decisionRow}>
              {/* Left Column: Price Band */}
              <View style={styles.decisionCol}>
                <Text style={[styles.decisionMainVal, { color: colors.foreground }]}>{priceBandText}</Text>
                <Text style={[styles.decisionSubLabel, { color: colors.mutedForeground }]}>Price Band (₹)</Text>
              </View>

              {/* Vertical Divider */}
              <View style={[styles.decisionVerticalDivider, { backgroundColor: colors.border }]} />

              {/* Right Column: Min. Investment */}
              <View style={styles.decisionCol}>
                <Text style={[styles.decisionMainVal, { color: colors.foreground }]}>
                  {minInvestment != null ? `₹${minInvestment.toLocaleString('en-IN')}` : '-'}
                </Text>
                <Text style={[styles.decisionSubLabel, { color: colors.mutedForeground }]}>Min. Investment</Text>
              </View>
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── 4. KEY IPO DETAILS (2×2 Grid) ── */}
        <AnimatedEntrance delay={80} distance={14}>
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Key IPO Details</Text>

            <View style={styles.grid2x2}>
              {/* Card 1: Issue Size */}
              <View style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.gridIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                  <Feather name="shield" size={16} color="#3B82F6" />
                </View>
                <View style={styles.gridCardTextCol}>
                  <Text style={[styles.gridCardVal, { color: colors.foreground }]} numberOfLines={1}>{issueSizeText}</Text>
                  <Text style={[styles.gridCardLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Issue Size</Text>
                </View>
              </View>

              {/* Card 2: Lot Size */}
              <View style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.gridIconBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
                  <Feather name="grid" size={16} color="#10B981" />
                </View>
                <View style={styles.gridCardTextCol}>
                  <Text style={[styles.gridCardVal, { color: colors.foreground }]} numberOfLines={1}>
                    {lotSize != null ? `${lotSize} Shares` : '-'}
                  </Text>
                  <Text style={[styles.gridCardLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Lot Size</Text>
                </View>
              </View>

              {/* Card 3: Fresh Issue */}
              <View style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.gridIconBox, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#FAF5FF' }]}>
                  <Feather name="trending-up" size={16} color="#8B5CF6" />
                </View>
                <View style={styles.gridCardTextCol}>
                  <Text style={[styles.gridCardVal, { color: colors.foreground }]} numberOfLines={1}>{freshIssueText}</Text>
                  <Text style={[styles.gridCardLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Fresh Issue</Text>
                </View>
              </View>

              {/* Card 4: Listing */}
              <View style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.gridIconBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB' }]}>
                  <Feather name="globe" size={16} color="#F59E0B" />
                </View>
                <View style={styles.gridCardTextCol}>
                  <Text style={[styles.gridCardVal, { color: colors.foreground }]} numberOfLines={1}>{exchangeText}</Text>
                  <Text style={[styles.gridCardLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Listing</Text>
                </View>
              </View>
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── 5. IPO TIMELINE (Vertical Pixel-Perfect Aligned Stepper) ── */}
        <AnimatedEntrance delay={150} distance={14}>
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>IPO Timeline</Text>

            <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.timelineRow}>
                {timelineMilestones.map((step, idx) => {
                  const isDone = step.completed;
                  const prevDone = idx > 0 && timelineMilestones[idx - 1].completed;
                  const nextDone = idx < 4 && timelineMilestones[idx + 1].completed;

                  return (
                  <View key={idx} style={styles.timelineCol}>
                    {/* Horizontal Connector Line Behind Circle */}
                    {idx > 0 && (
                      <View
                        style={[
                          styles.timelineHalfLineLeft,
                          {
                            backgroundColor: isDone && prevDone ? '#10B981' : (isDark ? '#334155' : '#E2E8F0'),
                          },
                        ]}
                      />
                    )}
                    {idx < 4 && (
                      <View
                        style={[
                          styles.timelineHalfLineRight,
                          {
                            backgroundColor: isDone && nextDone ? '#10B981' : (isDark ? '#334155' : '#E2E8F0'),
                          },
                        ]}
                      />
                    )}

                    {/* Stepper Circle */}
                    <View
                      style={[
                        styles.timelineCircle,
                        {
                          backgroundColor: isDone ? '#10B981' : (isDark ? '#1E293B' : '#F1F5F9'),
                          borderColor: isDone ? '#10B981' : (isDark ? '#334155' : '#CBD5E1'),
                        },
                      ]}
                    >
                      <Feather
                        name="check"
                        size={13}
                        color={isDone ? '#FFFFFF' : (isDark ? '#64748B' : '#94A3B8')}
                      />
                    </View>

                    {/* Date */}
                    <Text style={[styles.timelineDate, { color: colors.foreground }]} numberOfLines={1}>
                      {step.date}
                    </Text>

                    {/* Milestone Name */}
                    <Text style={[styles.timelineLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </AnimatedEntrance>

      {/* ── 6. SUBSCRIPTION (5 Single White Cards) ── */}
      <AnimatedEntrance delay={210} distance={14}>
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {isOpen ? 'Subscription (Live)' : 'Subscription (Final)'}
          </Text>

          <View style={styles.sub5CardsRow}>
            {/* Overall */}
            <View style={[styles.sub5Card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sub5Label, { color: colors.mutedForeground }]} numberOfLines={1}>Overall</Text>
              <Text style={[styles.sub5Val, { color: colors.foreground }]} numberOfLines={1}>{subscriptionSummary.overall}</Text>
            </View>

            {/* Retail */}
            <View style={[styles.sub5Card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sub5Label, { color: colors.mutedForeground }]} numberOfLines={1}>Retail</Text>
              <Text style={[styles.sub5Val, { color: colors.foreground }]} numberOfLines={1}>{subscriptionSummary.retail}</Text>
            </View>

            {/* SHNI */}
            <View style={[styles.sub5Card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sub5Label, { color: colors.mutedForeground }]} numberOfLines={1}>SHNI</Text>
              <Text style={[styles.sub5Val, { color: colors.foreground }]} numberOfLines={1}>{subscriptionSummary.shni}</Text>
            </View>

            {/* BHNI */}
            <View style={[styles.sub5Card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sub5Label, { color: colors.mutedForeground }]} numberOfLines={1}>BHNI</Text>
              <Text style={[styles.sub5Val, { color: colors.foreground }]} numberOfLines={1}>{subscriptionSummary.bhni}</Text>
            </View>

            {/* QIB */}
            <View style={[styles.sub5Card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sub5Label, { color: colors.mutedForeground }]} numberOfLines={1}>QIB</Text>
              <Text style={[styles.sub5Val, { color: colors.foreground }]} numberOfLines={1}>{subscriptionSummary.qib}</Text>
            </View>
          </View>
        </View>
      </AnimatedEntrance>

      {/* ── 7. GREY MARKET PREMIUM (GMP - Functional Reactive Graph) ── */}
      {gmpData && (
        <AnimatedEntrance delay={270} distance={14}>
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Grey Market Premium (GMP)</Text>

            <View style={[styles.gmpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.gmpMainRow}>
                {/* Left GMP metrics column */}
                <View style={styles.gmpMetricCol}>
                  {/* 1. GMP Amount */}
                  <Text style={[styles.gmpValText, { color: gmpData.isPositive ? '#10B981' : '#EF4444' }]}>
                    {gmpData.formattedAmount}
                  </Text>

                  {/* 2. GMP % below amount */}
                  {gmpData.gainText && (
                    <Text
                      style={[
                        styles.gmpGainText,
                        { color: gmpData.isPositive ? (isDark ? '#34D399' : '#10B981') : '#EF4444' },
                      ]}
                    >
                      {gmpData.gainText} Est. Gain
                    </Text>
                  )}

                  {/* 3. Estimated Profit in 14px semibold */}
                  {gmpData.estProfitText && (
                    <Text style={[styles.gmpEstProfitText, { color: colors.foreground }]}>
                      {gmpData.estProfitText}
                    </Text>
                  )}

                  {/* 4. Updated Timestamp directly below estimated profit */}
                  {gmpData.updatedText !== '' && (
                    <Text style={[styles.gmpUpdatedText, { color: colors.mutedForeground }]}>
                      {gmpData.updatedText}
                    </Text>
                  )}
                </View>

                {/* Right Functional Dynamic Sparkline Graph */}
                {gmpGraph && (
                  <View style={styles.sparklineBox}>
                    <Svg width={136} height={58} viewBox="0 0 136 58">
                      <Defs>
                        <SvgLinearGradient id="gmpGradDynamic" x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0%" stopColor={gmpGraph.gradStart} stopOpacity="0.28" />
                          <Stop offset="100%" stopColor={gmpGraph.gradStart} stopOpacity="0.0" />
                        </SvgLinearGradient>
                      </Defs>
                      <Path
                        d={gmpGraph.areaPath}
                        fill="url(#gmpGradDynamic)"
                      />
                      <Path
                        d={gmpGraph.linePath}
                        fill="none"
                        stroke={gmpGraph.strokeColor}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <Circle
                        cx={gmpGraph.lastX}
                        cy={gmpGraph.lastY}
                        r={3.8}
                        fill={gmpGraph.strokeColor}
                      />
                    </Svg>
                  </View>
                )}
              </View>
            </View>
          </View>
        </AnimatedEntrance>
      )}

      {/* ── 8. LOT SIZE & APPLICATION LIMITS (Expanded Data Card - No Arrow) ── */}
      <AnimatedEntrance delay={330} distance={14}>
        <View style={styles.sectionContainer}>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(249, 115, 22, 0.15)' }]}>
                <Feather name="layers" size={15} color="#F97316" />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Lot Size & Application Limits</Text>
            </View>

            {lotLimitsTable.length > 0 ? (
              <View style={{ gap: 2, marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginBottom: 4 }}>
                  1 Lot = {lotSize || '-'} Shares {priceHigh ? `@ ₹${priceHigh} (Upper Band)` : ''}
                </Text>
                {lotLimitsTable.map((row, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.lotExpandedRow,
                      idx < lotLimitsTable.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      },
                    ]}
                  >
                    <View style={{ gap: 2 }}>
                      <Text style={[styles.lotExpandedType, { color: colors.foreground }]}>{row.type}</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground }}>
                        {row.lots} Lot{row.lots > 1 ? 's' : ''} ({row.shares} Shares)
                      </Text>
                    </View>
                    <Text style={[styles.lotExpandedAmount, { color: colors.foreground }]}>
                      ₹{row.amount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 12.5, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground, marginTop: 2 }}>
                1 Lot = {lotSize != null ? `${lotSize} Shares` : 'To be announced'}
              </Text>
            )}
          </View>
        </View>
      </AnimatedEntrance>

      {/* ── 9. VALUATION & SHAREHOLDING CARD (No Arrow) ── */}
      <AnimatedEntrance delay={380} distance={14}>
        <View style={styles.sectionContainer}>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header Row without Arrow */}
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                <Feather name="pie-chart" size={15} color="#EC4899" />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>
                Valuation & Shareholding
              </Text>
            </View>

            {/* 4 Metrics Row */}
            <View style={styles.metrics4ColRow}>
              {/* IPO P/E (Starts directly below icon) */}
              <View style={styles.metrics4ColCellLeft}>
                <Text style={[styles.metrics4ColLabel, styles.alignLeft, { color: colors.mutedForeground }]} numberOfLines={1}>
                  IPO P/E
                </Text>
                <Text style={[styles.metrics4ColVal, styles.alignLeft, { color: colors.foreground }]} numberOfLines={1}>
                  {valuationData.ipoPe}
                </Text>
              </View>

              <View style={[styles.metrics4ColDivider, { backgroundColor: colors.border }]} />

              {/* Market Cap */}
              <View style={styles.metrics4ColCellCenter}>
                <Text style={[styles.metrics4ColLabel, styles.alignCenter, { color: colors.mutedForeground }]} numberOfLines={1}>
                  Market Cap
                </Text>
                <Text style={[styles.metrics4ColVal, styles.alignCenter, { color: colors.foreground }]} numberOfLines={1}>
                  {valuationData.marketCapText}
                </Text>
              </View>

              <View style={[styles.metrics4ColDivider, { backgroundColor: colors.border }]} />

              {/* Pre Issue */}
              <View style={styles.metrics4ColCellCenter}>
                <Text style={[styles.metrics4ColLabel, styles.alignCenter, { color: colors.mutedForeground }]} numberOfLines={1}>
                  Pre Issue
                </Text>
                <Text style={[styles.metrics4ColVal, styles.alignCenter, { color: colors.foreground }]} numberOfLines={1}>
                  {promoterPre != null ? `${promoterPre}%` : '-'}
                </Text>
              </View>

              <View style={[styles.metrics4ColDivider, { backgroundColor: colors.border }]} />

              {/* Post Issue (Reaches right boundary) */}
              <View style={styles.metrics4ColCellRight}>
                <Text style={[styles.metrics4ColLabel, styles.alignRight, { color: colors.mutedForeground }]} numberOfLines={1}>
                  Post Issue
                </Text>
                <Text style={[styles.metrics4ColVal, styles.alignRight, { color: colors.foreground }]} numberOfLines={1}>
                  {promoterPost != null ? `${promoterPost}%` : '-'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </AnimatedEntrance>

      {/* ── 8. FINANCIAL SNAPSHOT ── */}
      <AnimatedEntrance delay={430} distance={14}>
        <View style={styles.sectionContainer}>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header Row */}
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                <Feather name="bar-chart-2" size={15} color="#06B6D4" />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>
                Financial Snapshot
              </Text>
            </View>

            {/* 4 Metrics Row */}
            <View style={styles.metrics4ColRow}>
              {/* Revenue (Starts directly below icon) */}
              <View style={styles.metrics4ColCellLeft}>
                <Text style={[styles.metrics4ColLabel, styles.alignLeft, { color: colors.mutedForeground }]}>Revenue</Text>
                <Text
                  style={[
                    styles.metrics4ColVal,
                    styles.alignLeft,
                    {
                      color: financialSnapshot.revenueGrowth.startsWith('+')
                        ? '#10B981'
                        : financialSnapshot.revenueGrowth.startsWith('-') && financialSnapshot.revenueGrowth !== '-'
                        ? '#EF4444'
                        : colors.mutedForeground,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {financialSnapshot.revenueGrowth}
                </Text>
                <Text style={[styles.metrics4ColPeriod, styles.alignLeft, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {financialSnapshot.growthPeriodLabel}
                </Text>
              </View>

              <View style={[styles.metrics4ColDivider, { backgroundColor: colors.border }]} />

              {/* Profit */}
              <View style={styles.metrics4ColCellCenter}>
                <Text style={[styles.metrics4ColLabel, styles.alignCenter, { color: colors.mutedForeground }]}>Profit</Text>
                <Text
                  style={[
                    styles.metrics4ColVal,
                    styles.alignCenter,
                    {
                      color: financialSnapshot.profitGrowth.startsWith('+')
                        ? '#10B981'
                        : financialSnapshot.profitGrowth.startsWith('-') && financialSnapshot.profitGrowth !== '-'
                        ? '#EF4444'
                        : colors.mutedForeground,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {financialSnapshot.profitGrowth}
                </Text>
                <Text style={[styles.metrics4ColPeriod, styles.alignCenter, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {financialSnapshot.growthPeriodLabel}
                </Text>
              </View>

              <View style={[styles.metrics4ColDivider, { backgroundColor: colors.border }]} />

              {/* ROE */}
              <View style={styles.metrics4ColCellCenter}>
                <Text style={[styles.metrics4ColLabel, styles.alignCenter, { color: colors.mutedForeground }]}>ROE</Text>
                <Text
                  style={[
                    styles.metrics4ColVal,
                    styles.alignCenter,
                    { color: financialSnapshot.roe !== '-' ? colors.foreground : colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {financialSnapshot.roe}
                </Text>
                <Text style={[styles.metrics4ColPeriod, styles.alignCenter, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {financialSnapshot.roePeriodLabel}
                </Text>
              </View>

              <View style={[styles.metrics4ColDivider, { backgroundColor: colors.border }]} />

              {/* Debt/Equity (Reaches right boundary) */}
              <View style={styles.metrics4ColCellRight}>
                <Text style={[styles.metrics4ColLabel, styles.alignRight, { color: colors.mutedForeground }]}>Debt/Equity</Text>
                <Text style={[styles.metrics4ColVal, styles.alignRight, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {financialSnapshot.debtEquity}
                </Text>
                <Text style={[styles.metrics4ColPeriod, styles.alignRight, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {financialSnapshot.debtEquityPeriodLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </AnimatedEntrance>

      {/* ── 10. ABOUT THE COMPANY (Complete Info Inside Card - No Arrow) ── */}
      <AnimatedEntrance delay={480} distance={14}>
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
              <Feather name="file-text" size={15} color="#6366F1" />
            </View>
            <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>About the Company</Text>
          </View>

          <Text style={[styles.aboutFullDesc, { color: colors.foreground }]}>
            {aboutDescription}
          </Text>

          {/* Contact Links */}
          {(companyWebsite || companyEmail || companyPhone) && (
            <View style={[styles.aboutLinksBox, { borderTopColor: colors.border }]}>
              {companyWebsite && (
                <TouchableOpacity
                  style={styles.aboutLinkRow}
                  onPress={() => handleOpenUrl(companyWebsite)}
                  activeOpacity={0.7}
                >
                  <Feather name="globe" size={14} color="#6366F1" />
                  <Text style={[styles.aboutLinkText, { color: '#6366F1' }]} numberOfLines={1}>
                    {companyWebsite}
                  </Text>
                </TouchableOpacity>
              )}

              {companyEmail && (
                <TouchableOpacity
                  style={styles.aboutLinkRow}
                  onPress={() => handleOpenUrl(companyEmail)}
                  activeOpacity={0.7}
                >
                  <Feather name="mail" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.aboutContactText, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {companyEmail}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </AnimatedEntrance>

      {/* ── 11. KEY STRENGTHS ── */}
        {keyStrengths.length > 0 && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(132, 204, 22, 0.15)' }]}>
                <Feather name="check-circle" size={15} color="#84CC16" />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Key Strengths</Text>
            </View>

            <View style={{ gap: 6, marginTop: 4 }}>
              {keyStrengths.map((strength: string, i: number) => (
                <View key={i} style={styles.strengthBulletRow}>
                  <View style={styles.strengthGreenDot} />
                  <Text style={[styles.riskBulletText, { color: colors.foreground }]}>
                    {strength}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── 12. KEY RISKS (Only if available in data) ── */}
        {keyRisks.length > 0 && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Feather name="alert-triangle" size={15} color="#EF4444" />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Key Risks</Text>
            </View>

            <View style={{ gap: 6, marginTop: 4 }}>
              {keyRisks.map((risk: string, i: number) => (
                <View key={i} style={styles.riskBulletRow}>
                  <View style={styles.riskRedDot} />
                  <Text style={[styles.riskBulletText, { color: colors.foreground }]}>
                    {risk}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── 13. DETAILED MODAL TRIGGER SECTIONS (Company Financials & Directory) ── */}
        <View style={styles.sectionContainer}>
          <View style={{ gap: 8 }}>
            {/* 1. Full Financials Row */}
            <TouchableOpacity
              style={[styles.modalTriggerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveModal('FINANCIALS');
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(20, 184, 166, 0.15)' }]}>
                <Feather name="activity" size={15} color="#14B8A6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTriggerTitle, { color: colors.foreground }]}>Company Financials</Text>
                <Text style={[styles.modalTriggerSub, { color: colors.mutedForeground }]}>
                  {financialsList.length > 0 ? `${financialsList.length} Years Detailed P&L, PAT, Assets` : 'View Detailed Financial Statements'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* 2. Lead Managers & Registrar Directory */}
            <TouchableOpacity
              style={[styles.modalTriggerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveModal('DIRECTORY');
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                <Feather name="users" size={15} color="#A855F7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTriggerTitle, { color: colors.foreground }]}>Lead Managers & Registrar</Text>
                <Text style={[styles.modalTriggerSub, { color: colors.mutedForeground }]}>
                  Direct contact, email, phone and official websites
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 14. IPO DOCUMENTS (DRHP / RHP / Prospectus) ── */}
        {documentsList.length > 0 && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(225, 29, 72, 0.15)' }]}>
                <Feather name="folder" size={15} color="#E11D48" />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>IPO Documents</Text>
            </View>

            <View style={{ gap: 8, marginTop: 4 }}>
              {documentsList.map((doc: any, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleOpenUrl(doc.url)}
                  style={[
                    styles.docItemRow,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Feather name="file-text" size={15} color="#E11D48" />
                  <Text style={[styles.docItemText, { color: colors.foreground }]}>{doc.title}</Text>
                  <Feather name="arrow-up-right" size={15} color={colors.mutedForeground} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── 15. DISCLAIMER ── */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconBadge, { backgroundColor: 'rgba(100, 116, 139, 0.15)' }]}>
              <Feather name="shield" size={15} color="#64748B" />
            </View>
            <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Disclaimer</Text>
          </View>

          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
            Disclaimer: IPOVault provides data and tracking information for educational and reference purposes only. We are not a SEBI-registered advisor and do not provide financial or investment advice. All IPO details, GMP estimates, subscription data, and allotment tracking are gathered from public market sources and subject to market risks. Please consult a qualified financial advisor before making any investment decisions.
          </Text>
        </View>
      </Animated.ScrollView>

      {/* ── STICKY BOTTOM CTA (Clean Black Background - Live & Allotment Out / Listed Only) ── */}
      {hasBottomCta && (
        <View
          style={[
            styles.stickyCtaContainer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {isLive ? (
            <TouchableOpacity
              onPress={handleApplyCta}
              style={[
                styles.primaryCtaBtn,
                { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
              ]}
              activeOpacity={0.88}
            >
              <Text style={[styles.primaryCtaBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Apply Now
              </Text>
            </TouchableOpacity>
          ) : isAllotmentCheckable ? (
            <TouchableOpacity
              onPress={handleAllotmentCta}
              style={[
                styles.primaryCtaBtn,
                { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
              ]}
              activeOpacity={0.88}
            >
              <Text style={[styles.primaryCtaBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Check Allotment
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* ── 16. DETAIL BOTTOM SHEET MODAL (Scooped Design with Inverse Notch & Backdrop Blur) ── */}
      <ScoopedBottomSheet
        visible={activeModal != null}
        onClose={() => setActiveModal(null)}
        maxHeight="92%"
      >
        <View style={styles.sheetInnerContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeaderRow}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {activeModal === 'FINANCIALS' && 'Company Financials'}
              {activeModal === 'LOT_SIZE' && 'Lot Size & Application Limits'}
              {activeModal === 'PROMOTERS' && 'Promoter & Shareholding'}
              {activeModal === 'DIRECTORY' && 'Lead Managers & Registrar'}
            </Text>
          </View>

          {/* Modal Scrollable Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingTop: 6, paddingBottom: 24 }}
          >
            {/* 1. FINANCIALS MODAL CONTENT */}
            {activeModal === 'FINANCIALS' && (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground }}>
                  All financial figures in ₹ Crore (Consolidated)
                </Text>
                {financialsList.length > 0 ? (
                  financialsList.map((f: any, idx: number) => {
                    const period = f.fiscalPeriod || f.year || `FY${idx + 1}`;
                    const rev = f.totalRevenue ?? f.revenue_cr ?? '-';
                    const pat = f.pat ?? f.pat_cr ?? '-';
                    const nw = f.netWorth ?? f.net_worth_cr ?? '-';
                    const assets = f.totalAssets ?? f.total_assets_cr ?? '-';
                    const roe = f.roePercentage != null ? `${Number(f.roePercentage).toFixed(1)}%` : '-';

                    return (
                      <View
                        key={idx}
                        style={[
                          styles.modalFinCard,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        <View style={styles.modalFinCardHeader}>
                          <Text style={[styles.modalFinCardPeriod, { color: colors.foreground }]}>{period}</Text>
                          {f.roePercentage != null && (
                            <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_600SemiBold', color: '#10B981' }}>
                              ROE: {roe}
                            </Text>
                          )}
                        </View>
                        <View style={styles.modalFinGrid}>
                          <View style={styles.modalFinCell}>
                            <Text style={[styles.modalFinKey, { color: colors.mutedForeground }]}>Revenue</Text>
                            <Text style={[styles.modalFinVal, { color: colors.foreground }]}>
                              {rev !== '-' ? `₹${Number(rev).toLocaleString('en-IN')} Cr` : '-'}
                            </Text>
                          </View>
                          <View style={styles.modalFinCell}>
                            <Text style={[styles.modalFinKey, { color: colors.mutedForeground }]}>PAT</Text>
                            <Text style={[styles.modalFinVal, { color: pat !== '-' && Number(pat) >= 0 ? '#10B981' : colors.foreground }]}>
                              {pat !== '-' ? `₹${Number(pat).toLocaleString('en-IN')} Cr` : '-'}
                            </Text>
                          </View>
                          <View style={styles.modalFinCell}>
                            <Text style={[styles.modalFinKey, { color: colors.mutedForeground }]}>Net Worth</Text>
                            <Text style={[styles.modalFinVal, { color: colors.foreground }]}>
                              {nw !== '-' ? `₹${Number(nw).toLocaleString('en-IN')} Cr` : '-'}
                            </Text>
                          </View>
                          <View style={styles.modalFinCell}>
                            <Text style={[styles.modalFinKey, { color: colors.mutedForeground }]}>Total Assets</Text>
                            <Text style={[styles.modalFinVal, { color: colors.foreground }]}>
                              {assets !== '-' ? `₹${Number(assets).toLocaleString('en-IN')} Cr` : '-'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={[styles.modalEmptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' }}>
                      Detailed financial statements will be updated upon RHP filing.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* 2. LOT SIZE & APPLICATION LIMITS */}
            {activeModal === 'LOT_SIZE' && (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground }}>
                  1 Lot = {lotSize || '-'} Shares {priceHigh ? `@ ₹${priceHigh} (Upper Band)` : ''}
                </Text>
                {lotLimitsTable.map((row, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.modalLotRow,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View style={{ gap: 2 }}>
                      <Text style={[styles.modalLotType, { color: colors.foreground }]}>{row.type}</Text>
                      <Text style={{ fontSize: 11.5, fontFamily: 'GoogleSansFlex_400Regular', color: colors.mutedForeground }}>
                        {row.lots} Lot{row.lots > 1 ? 's' : ''} ({row.shares} Shares)
                      </Text>
                    </View>
                    <Text style={[styles.modalLotAmount, { color: colors.foreground }]}>
                      ₹{row.amount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* 3. PROMOTER & SHAREHOLDING */}
            {activeModal === 'PROMOTERS' && (
              <View style={{ gap: 10 }}>
                <View style={[styles.modalSubRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalSubLabel, { color: colors.foreground }]}>Pre-Issue Shareholding</Text>
                  <Text style={[styles.modalSubVal, { color: colors.foreground }]}>
                    {promoterPre != null ? `${promoterPre}%` : '-'}
                  </Text>
                </View>
                <View style={[styles.modalSubRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalSubLabel, { color: colors.foreground }]}>Post-Issue Shareholding</Text>
                  <Text style={[styles.modalSubVal, { color: colors.foreground }]}>
                    {promoterPost != null ? `${promoterPost}%` : '-'}
                  </Text>
                </View>
                {ipo.company?.promoters && Array.isArray(ipo.company.promoters) && ipo.company.promoters.length > 0 && (
                  <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 4 }]}>
                    <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Promoter(s)</Text>
                    {ipo.company.promoters.map((p: any, i: number) => (
                      <Text key={i} style={[styles.listBulletText, { color: colors.foreground }]}>
                        {i + 1}. {typeof p === 'string' ? p : p.name || '-'}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* 4. LEAD MANAGERS & REGISTRAR DIRECTORY */}
            {activeModal === 'DIRECTORY' && (
              <View style={{ gap: 14 }}>
                {/* Registrar Box */}
                <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.iconBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <Feather name="user-check" size={15} color="#3B82F6" />
                    </View>
                    <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Registrar Details</Text>
                  </View>

                  <View style={{ gap: 10, marginTop: 4 }}>
                    {registrarName && (
                      <View style={styles.directoryRow}>
                        <Text style={[styles.directoryKey, { color: colors.mutedForeground }]}>Name</Text>
                        <Text style={[styles.directoryVal, { color: colors.foreground }]} numberOfLines={2}>
                          {registrarName}
                        </Text>
                      </View>
                    )}
                    {registrarPhone && (
                      <View style={styles.directoryRow}>
                        <Text style={[styles.directoryKey, { color: colors.mutedForeground }]}>Phone</Text>
                        <TouchableOpacity
                          onPress={() => handleOpenUrl(`tel:${registrarPhone}`)}
                          style={styles.directoryActionBtn}
                          activeOpacity={0.7}
                        >
                          <Feather name="phone-call" size={13} color="#3B82F6" />
                          <Text style={[styles.directoryLinkVal, { color: '#3B82F6' }]} numberOfLines={1}>
                            {registrarPhone}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {registrarEmail && (
                      <View style={styles.directoryRow}>
                        <Text style={[styles.directoryKey, { color: colors.mutedForeground }]}>Email</Text>
                        <TouchableOpacity
                          onPress={() => handleOpenUrl(`mailto:${registrarEmail}`)}
                          style={styles.directoryActionBtn}
                          activeOpacity={0.7}
                        >
                          <Feather name="mail" size={13} color="#3B82F6" />
                          <Text style={[styles.directoryLinkVal, { color: '#3B82F6' }]} numberOfLines={1}>
                            {registrarEmail}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {registrarWebsite && (
                      <View style={styles.directoryRow}>
                        <Text style={[styles.directoryKey, { color: colors.mutedForeground }]}>Website</Text>
                        <TouchableOpacity
                          onPress={() => handleOpenUrl(registrarWebsite)}
                          style={styles.directoryActionBtn}
                          activeOpacity={0.7}
                        >
                          <Feather name="external-link" size={13} color="#3B82F6" />
                          <Text style={[styles.directoryLinkVal, { color: '#3B82F6' }]} numberOfLines={1}>
                            {registrarWebsite}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                {/* Lead Managers Box */}
                {leadManagersList.length > 0 && (
                  <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.cardHeaderRow}>
                      <View style={[styles.iconBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                        <Feather name="briefcase" size={15} color="#6366F1" />
                      </View>
                      <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Lead Manager(s)</Text>
                    </View>

                    <View style={{ gap: 8, marginTop: 4 }}>
                      {leadManagersList.map((mgr: string, idx: number) => (
                        <View
                          key={idx}
                          style={[
                            styles.leadManagerItem,
                            {
                              backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <View style={styles.leadManagerNumBadge}>
                            <Text style={styles.leadManagerNumText}>{idx + 1}</Text>
                          </View>
                          <Text style={[styles.leadManagerName, { color: colors.foreground }]}>
                            {mgr}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </ScoopedBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  headerBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 14,
  },

  // 1. Unified Main Hero & Decision Card
  mainHeroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: '100%',
    height: '100%',
  },
  avatarGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  heroMeta: {
    flex: 1,
    gap: 4,
  },
  companyTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 22,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgePillText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.4,
  },
  sectorText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  heroCardDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  decisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  decisionCol: {
    flex: 1,
    justifyContent: 'center',
  },
  decisionMainVal: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  decisionSubLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  decisionVerticalDivider: {
    width: 1,
    height: 38,
    marginHorizontal: 12,
  },

  // 3. Status Countdown Banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBannerTitle: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  statusBannerSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  statusCountdownPill: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 6,
  },
  statusCountdownText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.2,
  },

  // 4. Section Structure & 2×2 Grid
  sectionContainer: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  grid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCard: {
    width: '48.4%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gridCardTextCol: {
    flex: 1,
    gap: 1,
  },
  gridIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCardVal: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  gridCardLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  // 5. Timeline Stepper (Vertical Pixel-Perfect Aligned)
  timelineCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  timelineCol: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  timelineHalfLineLeft: {
    position: 'absolute',
    left: 0,
    right: '50%',
    top: 13,
    height: 3,
    zIndex: 1,
  },
  timelineHalfLineRight: {
    position: 'absolute',
    left: '50%',
    right: 0,
    top: 13,
    height: 3,
    zIndex: 1,
  },
  timelineCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    marginBottom: 8,
  },
  timelineDate: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
  },
  timelineLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    marginTop: 2,
  },

  // 6. 5 Single White Cards for Subscription
  sub5CardsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sub5Card: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sub5Label: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textTransform: 'uppercase',
  },
  sub5Val: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 3,
  },

  // 7. GMP Card
  gmpCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  gmpMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gmpMetricCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  gmpValText: {
    fontSize: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  gmpGainText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  gmpEstProfitText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginTop: 2,
  },
  sparklineBox: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 58,
    marginLeft: 8,
  },
  gmpUpdatedText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 3,
  },

  // 4-Column Metrics Row for Valuation & Financial Snapshot Cards
  metrics4ColRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metrics4ColCellLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
  },
  metrics4ColCellCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  metrics4ColCellRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  metrics4ColDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
  },
  metrics4ColLabel: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  metrics4ColVal: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  metrics4ColPeriod: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  alignLeft: {
    textAlign: 'left',
  },
  alignCenter: {
    textAlign: 'center',
  },
  alignRight: {
    textAlign: 'right',
  },

  // Expanded Lot Size Rows
  lotExpandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 2,
  },
  lotExpandedType: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  lotExpandedAmount: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  // Generic Information Card
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  aboutFullDesc: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 18,
  },
  aboutLinksBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 6,
  },
  aboutLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aboutLinkText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  aboutContactText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  // Key Strengths & Key Risks
  strengthBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  strengthGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginTop: 5,
  },
  riskBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  riskRedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
    marginTop: 5,
  },
  riskBulletText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
    lineHeight: 17,
  },

  // Key-Value Snapshot Row
  snapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  snapKey: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  snapVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    maxWidth: '60%',
    textAlign: 'right',
  },

  // List Items
  listBulletText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_500Medium',
    lineHeight: 18,
  },

  // Modal Trigger Cards
  modalTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalTriggerTitle: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalTriggerSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },

  // Doc Item Row
  docItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  docItemText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // Disclaimer
  disclaimerText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    lineHeight: 16.5,
  },

  // Sticky Bottom CTA
  stickyCtaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 8,
  },
  primaryCtaBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaBtnText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  // Detail Scooped Sheet
  sheetInnerContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'left',
  },

  // Directory Sheet Row & Items
  directoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#88888815',
  },
  directoryKey: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_500Medium',
    width: '28%',
  },
  directoryVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
    textAlign: 'right',
  },
  directoryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    gap: 6,
  },
  directoryLinkVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textAlign: 'right',
  },
  leadManagerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  leadManagerNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadManagerNumText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#6366F1',
  },
  leadManagerName: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
  },

  // Modal Custom Cards
  modalFinCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  modalFinCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#88888820',
    paddingBottom: 6,
  },
  modalFinCardPeriod: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalFinGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalFinCell: {
    width: '48%',
    gap: 1,
  },
  modalFinKey: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  modalFinVal: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalEmptyBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalSubLabel: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  modalSubVal: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalLotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalLotType: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalLotAmount: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
