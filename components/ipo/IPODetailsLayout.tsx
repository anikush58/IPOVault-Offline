import React, { useMemo, useState } from 'react';
import {
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
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconButton } from '@/components/ui/IconButton';
import { MergeOfficialBanner } from '@/components/ipo/MergeOfficialBanner';
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
        badgeColor: '#3B82F6',
        badgeBg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
        badgeTextColor: isDark ? '#60A5FA' : '#2563EB',
      };
    }

    if (isAllotmentPending) {
      return {
        title: 'Allotment Awaited',
        subtitle: allotmentDate ? `Expected on ${formatFullDate(allotmentDate)}` : 'Allotment status pending',
        badgeText: 'Allotment Awaited',
        badgeColor: '#F59E0B',
        badgeBg: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
        badgeTextColor: isDark ? '#FBBF24' : '#D97706',
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
        badgeColor: '#10B981',
        badgeBg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7',
        badgeTextColor: isDark ? '#34D399' : '#15803D',
      };
    }

    return {
      title: 'Upcoming IPO',
      subtitle: openDate ? `Opens on ${formatFullDate(openDate)}` : 'Dates to be announced',
      badgeText: 'Upcoming',
      badgeColor: '#F59E0B',
      badgeBg: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
      badgeTextColor: isDark ? '#FBBF24' : '#D97706',
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

  // Financial Snapshot & Full Table
  const financialsList = useMemo(() => {
    const finList = ipo.company?.financials || ipo.intelligence?.financials || [];
    if (!Array.isArray(finList) || finList.length === 0) return [];
    return [...finList].sort((a, b) => {
      const pA = String(a.fiscalPeriod || a.year || '');
      const pB = String(b.fiscalPeriod || b.year || '');
      return pA.localeCompare(pB);
    });
  }, [ipo.company?.financials, ipo.intelligence?.financials]);

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

    const latestPeriod = String(latest.fiscalPeriod || latest.year || 'Latest');

    return {
      revenueGrowth: revCagr ? `+${revCagr}%` : '-',
      profitGrowth: patCagr ? `+${patCagr}%` : '-',
      growthPeriodLabel: `${Math.min(count, 3)}Y CAGR`,
      roe: roeVal,
      roePeriodLabel: latestPeriod,
      debtEquity: '-',
      debtEquityPeriodLabel: latestPeriod,
      headerLabel: `Financial Snapshot (Consolidated, ${financialsList[0].fiscalPeriod || financialsList[0].year || 'FY24'}–${latestPeriod})`,
    };
  }, [financialsList, ipo.roe_percent]);

  // Valuation Data
  const valuationData = useMemo(() => {
    const ipoPe =
      ipo.postIpoPe ??
      ipo.preIpoPe ??
      ipo.post_ipo_pe ??
      ipo.pre_ipo_pe ??
      (priceHigh && ipo.eps && Number(ipo.eps) > 0 ? (Number(priceHigh) / Number(ipo.eps)).toFixed(2) : null);

    const industryPe = ipo.intelligence?.peer_comparison?.[0]?.pe_ratio ?? null;

    return {
      ipoPe: ipoPe ? `${Number(ipoPe).toFixed(2)}x` : '-',
      industryPe: industryPe ? `${Number(industryPe).toFixed(1)}x` : '-',
    };
  }, [ipo.postIpoPe, ipo.preIpoPe, ipo.post_ipo_pe, ipo.pre_ipo_pe, priceHigh, ipo.eps, ipo.intelligence]);

  // Company Overview
  const aboutDescription =
    ipo.company?.aboutDescription ||
    ipo.description ||
    '-';

  const companyWebsite = ipo.company?.website || ipo.website || null;
  const companyEmail = ipo.company?.email || ipo.company_email || null;
  const companyPhone = ipo.company?.phone || ipo.company_phone || null;

  // Key Risks
  const keyRisks = useMemo(() => {
    if (ipo.intelligence?.risks && Array.isArray(ipo.intelligence.risks) && ipo.intelligence.risks.length > 0) {
      return ipo.intelligence.risks.slice(0, 3);
    }
    return [];
  }, [ipo.intelligence?.risks]);

  // Promoter Holding
  const promoterPre =
    ipo.company?.promoterHoldingPre ??
    ipo.promoter_holding_pre ??
    ipo.promoterHoldingPreIssuePercentage ??
    null;
  const promoterPost =
    ipo.company?.promoterHoldingPost ??
    ipo.promoter_holding_post ??
    ipo.promoterHoldingPostIssuePercentage ??
    null;

  // Registrar Info
  const registrarName =
    ipo.company?.registrar?.name ||
    ipo.registrar?.name ||
    ipo.registrar_name ||
    ipo.registrar ||
    ipo.allotment?.registrarName ||
    null;
  const registrarPhone =
    ipo.company?.registrar?.phone ||
    ipo.registrar?.phone ||
    ipo.registrar_phone ||
    null;
  const registrarEmail =
    ipo.company?.registrar?.email ||
    ipo.registrar?.email ||
    ipo.registrar_email ||
    null;
  const registrarWebsite =
    ipo.company?.registrar?.websiteUrl ||
    ipo.registrar?.websiteUrl ||
    ipo.registrar_url ||
    null;

  // Lead Managers
  const leadManagersList = useMemo(() => {
    const raw =
      ipo.company?.leadManagers ||
      ipo.leadManagers ||
      ipo.lead_managers ||
      ipo.intelligence?.lead_managers ||
      [];
    if (Array.isArray(raw)) {
      return raw.map((item: any) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  }, [ipo.company?.leadManagers, ipo.leadManagers, ipo.lead_managers, ipo.intelligence?.lead_managers]);

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
    const drhpUrl = (ipo.drhp_url || ipo.intelligence?.drhp_url || '').trim();
    const rhpUrl = (ipo.rhp_url || ipo.intelligence?.rhp_url || '').trim();
    const prospectusUrl = (ipo.prospectus_url || '').trim();
    const anchorDocUrl = (ipo.anchor_list_url || ipo.intelligence?.anchor_investors_url || '').trim();

    return [
      { title: 'DRHP Prospectus', url: drhpUrl },
      { title: 'RHP Prospectus', url: rhpUrl },
      { title: 'Final Prospectus', url: prospectusUrl },
      { title: 'Anchor Investor Document', url: anchorDocUrl },
    ].filter((d) => Boolean(d.url));
  }, [ipo.drhp_url, ipo.rhp_url, ipo.prospectus_url, ipo.anchor_list_url, ipo.intelligence]);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── TOP APP BAR / NAVIGATION (Standardized System Header) ── */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: colors.background,
            paddingTop: topPad,
            height: topPad + 56,
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

      {/* ── MAIN SCROLLABLE BODY ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + 90,
          },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
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

        {/* ── 3. STATUS COUNTDOWN BANNER (Green Dot Parallel to Title Text) ── */}
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.statusBannerLeft}>
            <View style={{ gap: 2 }}>
              <View style={styles.statusTitleRow}>
                <View
                  style={[
                    styles.liveStatusDot,
                    { backgroundColor: statusBannerInfo.badgeColor },
                  ]}
                />
                <Text style={[styles.statusBannerTitle, { color: colors.foreground }]}>
                  {statusBannerInfo.title}
                </Text>
              </View>
              <Text style={[styles.statusBannerSub, { color: colors.mutedForeground, marginLeft: 14 }]}>
                {statusBannerInfo.subtitle}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.statusCountdownPill,
              {
                backgroundColor: statusBannerInfo.badgeBg,
              },
            ]}
          >
            <Text
              style={[
                styles.statusCountdownText,
                { color: statusBannerInfo.badgeTextColor },
              ]}
            >
              {statusBannerInfo.badgeText}
            </Text>
          </View>
        </View>

        {/* ── 4. KEY IPO DETAILS (2×2 Grid) ── */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Key IPO Details</Text>

          <View style={styles.grid2x2}>
            {/* Card 1: Issue Size */}
            <View style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.gridIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                <Feather name="shield" size={16} color="#3B82F6" />
              </View>
              <Text style={[styles.gridCardVal, { color: colors.foreground }]}>{issueSizeText}</Text>
              <Text style={[styles.gridCardLabel, { color: colors.mutedForeground }]}>Issue Size</Text>
            </View>

            {/* Card 2: Lot Size */}
            <View style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.gridIconBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
                <Feather name="grid" size={16} color="#10B981" />
              </View>
              <Text style={[styles.gridCardVal, { color: colors.foreground }]}>
                {lotSize != null ? `${lotSize} Shares` : '-'}
              </Text>
              <Text style={[styles.gridCardLabel, { color: colors.mutedForeground }]}>Lot Size</Text>
            </View>

            {/* Card 3: Fresh Issue */}
            <View style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.gridIconBox, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#FAF5FF' }]}>
                <Feather name="trending-up" size={16} color="#8B5CF6" />
              </View>
              <Text style={[styles.gridCardVal, { color: colors.foreground }]}>{freshIssueText}</Text>
              <Text style={[styles.gridCardLabel, { color: colors.mutedForeground }]}>Fresh Issue</Text>
            </View>

            {/* Card 4: Listing */}
            <View style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.gridIconBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB' }]}>
                <Feather name="globe" size={16} color="#F59E0B" />
              </View>
              <Text style={[styles.gridCardVal, { color: colors.foreground }]}>{exchangeText}</Text>
              <Text style={[styles.gridCardLabel, { color: colors.mutedForeground }]}>Listing</Text>
            </View>
          </View>
        </View>

        {/* ── 5. IPO TIMELINE (Vertical Pixel-Perfect Aligned Stepper) ── */}
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

        {/* ── 6. SUBSCRIPTION (5 Single White Cards) ── */}
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

        {/* ── 7. GREY MARKET PREMIUM (GMP - Clean Proportional Fill) ── */}
        {gmpData && (
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

                  {/* 3. Profit per application in 16px semibold */}
                  {gmpData.estProfitText && (
                    <Text style={[styles.gmpEstProfitText, { color: colors.foreground }]}>
                      {gmpData.estProfitText}
                    </Text>
                  )}
                </View>

                {/* Right Sparkline Graph */}
                <View style={styles.sparklineBox}>
                  <Svg width={136} height={58} viewBox="0 0 136 58">
                    <Defs>
                      <SvgLinearGradient id="gmpGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor="#10B981" stopOpacity="0.28" />
                        <Stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                      </SvgLinearGradient>
                    </Defs>
                    <Path
                      d="M 0 50 Q 35 46, 62 26 T 102 14 T 136 2 L 136 58 L 0 58 Z"
                      fill="url(#gmpGrad)"
                    />
                    <Path
                      d="M 0 50 Q 35 46, 62 26 T 102 14 T 136 2"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </Svg>
                </View>
              </View>

              {/* Updated Time footer */}
              {gmpData.updatedText !== '' && (
                <Text style={[styles.gmpUpdatedText, { color: colors.mutedForeground }]}>
                  {gmpData.updatedText}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── 8. FINANCIAL SNAPSHOT ── */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]} numberOfLines={1}>
            {financialSnapshot.headerLabel}
          </Text>

          <View style={[styles.finCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.fin4ColRow}>
              {/* Revenue */}
              <View style={styles.finCol}>
                <Text style={[styles.finColKey, { color: colors.mutedForeground }]}>Revenue</Text>
                <Text
                  style={[
                    styles.finColVal,
                    { color: financialSnapshot.revenueGrowth !== '-' ? '#10B981' : colors.mutedForeground },
                  ]}
                >
                  {financialSnapshot.revenueGrowth}
                </Text>
                <Text style={[styles.finColPeriod, { color: colors.mutedForeground }]}>
                  {financialSnapshot.growthPeriodLabel}
                </Text>
              </View>

              {/* Profit */}
              <View style={styles.finCol}>
                <Text style={[styles.finColKey, { color: colors.mutedForeground }]}>Profit</Text>
                <Text
                  style={[
                    styles.finColVal,
                    { color: financialSnapshot.profitGrowth !== '-' ? '#10B981' : colors.mutedForeground },
                  ]}
                >
                  {financialSnapshot.profitGrowth}
                </Text>
                <Text style={[styles.finColPeriod, { color: colors.mutedForeground }]}>
                  {financialSnapshot.growthPeriodLabel}
                </Text>
              </View>

              {/* ROE */}
              <View style={styles.finCol}>
                <Text style={[styles.finColKey, { color: colors.mutedForeground }]}>ROE</Text>
                <Text
                  style={[
                    styles.finColVal,
                    { color: financialSnapshot.roe !== '-' ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  {financialSnapshot.roe}
                </Text>
                <Text style={[styles.finColPeriod, { color: colors.mutedForeground }]}>
                  {financialSnapshot.roePeriodLabel}
                </Text>
              </View>

              {/* Debt/Equity */}
              <View style={styles.finCol}>
                <Text style={[styles.finColKey, { color: colors.mutedForeground }]}>Debt/Equity</Text>
                <Text style={[styles.finColVal, { color: colors.mutedForeground }]}>
                  {financialSnapshot.debtEquity}
                </Text>
                <Text style={[styles.finColPeriod, { color: colors.mutedForeground }]}>
                  {financialSnapshot.debtEquityPeriodLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 9. VALUATION ── */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Valuation</Text>

          <View style={styles.valuationRow}>
            {/* Left Card: IPO PE (White/Card Background) */}
            <View
              style={[
                styles.valuationCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.valCardNumber, { color: valuationData.ipoPe !== '-' ? colors.foreground : colors.mutedForeground }]}>
                {valuationData.ipoPe}
              </Text>
              <Text style={[styles.valCardLabel, { color: colors.mutedForeground }]}>IPO PE</Text>
            </View>

            {/* Right Card: Industry PE (White/Card Background) */}
            <View
              style={[
                styles.valuationCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.valCardNumber, { color: valuationData.industryPe !== '-' ? colors.foreground : colors.mutedForeground }]}>
                {valuationData.industryPe}
              </Text>
              <Text style={[styles.valCardLabel, { color: colors.mutedForeground }]}>Industry PE</Text>
            </View>
          </View>
        </View>

        {/* ── 10. ABOUT THE COMPANY (Complete Info Inside Card - No Arrow) ── */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Feather name="file-text" size={15} color="#3B82F6" />
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
                  <Feather name="globe" size={14} color="#3B82F6" />
                  <Text style={[styles.aboutLinkText, { color: '#3B82F6' }]} numberOfLines={1}>
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

        {/* ── 11. KEY RISKS (Only if available in data) ── */}
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

        {/* ── 12. DETAILED MODAL TRIGGER SECTIONS (With Arrows) ── */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Detailed Analysis</Text>

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
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Feather name="bar-chart-2" size={15} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTriggerTitle, { color: colors.foreground }]}>Company Financials</Text>
                <Text style={[styles.modalTriggerSub, { color: colors.mutedForeground }]}>
                  {financialsList.length > 0 ? `${financialsList.length} Years Detailed P&L, PAT, Assets` : 'View Detailed Financial Statements'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* 2. Subscription Breakdown Row */}
            <TouchableOpacity
              style={[styles.modalTriggerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveModal('SUBSCRIPTION');
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Feather name="activity" size={15} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTriggerTitle, { color: colors.foreground }]}>Subscription Details</Text>
                <Text style={[styles.modalTriggerSub, { color: colors.mutedForeground }]}>
                  Category-wise Bids, QIB, Retail, HNI breakdown
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* 3. Lot Size & Investment Limits */}
            <TouchableOpacity
              style={[styles.modalTriggerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveModal('LOT_SIZE');
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Feather name="grid" size={15} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTriggerTitle, { color: colors.foreground }]}>Lot Size & Application Limits</Text>
                <Text style={[styles.modalTriggerSub, { color: colors.mutedForeground }]}>
                  Retail & HNI min/max lots, shares and amounts
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* 4. Peer Comparison */}
            <TouchableOpacity
              style={[styles.modalTriggerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveModal('PEERS');
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                <Feather name="trending-up" size={15} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTriggerTitle, { color: colors.foreground }]}>Peer Comparison</Text>
                <Text style={[styles.modalTriggerSub, { color: colors.mutedForeground }]}>
                  Compare P/E, EPS, RoNW against industry peers
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* 5. Promoter & Shareholding */}
            <TouchableOpacity
              style={[styles.modalTriggerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveModal('PROMOTERS');
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                <Feather name="pie-chart" size={15} color="#EC4899" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTriggerTitle, { color: colors.foreground }]}>Promoter & Shareholding</Text>
                <Text style={[styles.modalTriggerSub, { color: colors.mutedForeground }]}>
                  Pre vs Post IPO holding and promoter background
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* 6. Lead Managers & Registrar Directory */}
            <TouchableOpacity
              style={[styles.modalTriggerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveModal('DIRECTORY');
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                <Feather name="users" size={15} color="#6366F1" />
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

        {/* ── 13. IPO DOCUMENTS (DRHP / RHP / Prospectus) ── */}
        {documentsList.length > 0 && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(225, 29, 72, 0.15)' }]}>
                <Feather name="file-text" size={15} color="#E11D48" />
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
                  <Feather name="file-text" size={15} color="#3B82F6" />
                  <Text style={[styles.docItemText, { color: '#3B82F6' }]}>{doc.title}</Text>
                  <Feather name="arrow-up-right" size={15} color="#3B82F6" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── 14. DISCLAIMER ── */}
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
      </ScrollView>

      {/* ── 15. STICKY BOTTOM CTA (Clean Black Background for Apply Now) ── */}
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
        {isOpen ? (
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
        ) : isClosed || isAllotmentOut ? (
          <TouchableOpacity
            onPress={handleAllotmentCta}
            style={[styles.primaryCtaBtn, { backgroundColor: '#2563EB' }]}
            activeOpacity={0.88}
          >
            <Text style={[styles.primaryCtaBtnText, { color: '#FFFFFF' }]}>Check Allotment</Text>
          </TouchableOpacity>
        ) : isListed ? (
          <TouchableOpacity
            onPress={handleAllotmentCta}
            style={[styles.primaryCtaBtn, { backgroundColor: '#2563EB' }]}
            activeOpacity={0.88}
          >
            <Text style={[styles.primaryCtaBtnText, { color: '#FFFFFF' }]}>Check Allotment</Text>
          </TouchableOpacity>
        ) : (
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
        )}
      </View>

      {/* ── 16. DETAIL BOTTOM SHEET MODAL ── */}
      <Modal
        visible={activeModal != null}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          onPress={() => setActiveModal(null)}
          activeOpacity={1}
        />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom + 16, 24),
            },
          ]}
        >
          {/* Drag handle */}
          <View style={[styles.modalDragHandle, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />

          {/* Modal Header */}
          <View style={styles.modalHeaderRow}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {activeModal === 'FINANCIALS' && 'Company Financials'}
              {activeModal === 'SUBSCRIPTION' && 'Subscription Breakdown'}
              {activeModal === 'LOT_SIZE' && 'Lot Size & Application Limits'}
              {activeModal === 'PEERS' && 'Peer Comparison'}
              {activeModal === 'PROMOTERS' && 'Promoter & Shareholding'}
              {activeModal === 'DIRECTORY' && 'Lead Managers & Registrar'}
            </Text>
            <TouchableOpacity
              onPress={() => setActiveModal(null)}
              style={[styles.modalCloseBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
              activeOpacity={0.7}
            >
              <Feather name="x" size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Modal Scrollable Content */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingTop: 4 }}>
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

            {/* 2. SUBSCRIPTION MODAL CONTENT */}
            {activeModal === 'SUBSCRIPTION' && (
              <View style={{ gap: 10 }}>
                <View style={[styles.modalSubRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalSubLabel, { color: colors.foreground }]}>Overall Total</Text>
                  <Text style={[styles.modalSubVal, { color: '#10B981' }]}>{subscriptionSummary.overall}</Text>
                </View>
                <View style={[styles.modalSubRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalSubLabel, { color: colors.foreground }]}>Retail Individual (RII)</Text>
                  <Text style={[styles.modalSubVal, { color: colors.foreground }]}>{subscriptionSummary.retail}</Text>
                </View>
                <View style={[styles.modalSubRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalSubLabel, { color: colors.foreground }]}>Small NII / SHNI (₹2L - ₹10L)</Text>
                  <Text style={[styles.modalSubVal, { color: colors.foreground }]}>{subscriptionSummary.shni}</Text>
                </View>
                <View style={[styles.modalSubRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalSubLabel, { color: colors.foreground }]}>Big NII / BHNI (Above ₹10L)</Text>
                  <Text style={[styles.modalSubVal, { color: colors.foreground }]}>{subscriptionSummary.bhni}</Text>
                </View>
                <View style={[styles.modalSubRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalSubLabel, { color: colors.foreground }]}>Qualified Institutional (QIB)</Text>
                  <Text style={[styles.modalSubVal, { color: colors.foreground }]}>{subscriptionSummary.qib}</Text>
                </View>
              </View>
            )}

            {/* 3. LOT SIZE & APPLICATION LIMITS */}
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

            {/* 4. PEER COMPARISON */}
            {activeModal === 'PEERS' && (
              <View style={{ gap: 10 }}>
                {peerList.length > 0 ? (
                  peerList.map((peer: any, idx: number) => (
                    <View
                      key={idx}
                      style={[
                        styles.modalFinCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.modalFinCardPeriod, { color: colors.foreground }]}>
                        {peer.company_name || peer.name || `Peer ${idx + 1}`}
                      </Text>
                      <View style={styles.modalFinGrid}>
                        <View style={styles.modalFinCell}>
                          <Text style={[styles.modalFinKey, { color: colors.mutedForeground }]}>P/E Ratio</Text>
                          <Text style={[styles.modalFinVal, { color: colors.foreground }]}>
                            {peer.pe_ratio != null ? `${Number(peer.pe_ratio).toFixed(1)}x` : '-'}
                          </Text>
                        </View>
                        <View style={styles.modalFinCell}>
                          <Text style={[styles.modalFinKey, { color: colors.mutedForeground }]}>EPS</Text>
                          <Text style={[styles.modalFinVal, { color: colors.foreground }]}>
                            {peer.eps != null ? `₹${Number(peer.eps).toFixed(2)}` : '-'}
                          </Text>
                        </View>
                        <View style={styles.modalFinCell}>
                          <Text style={[styles.modalFinKey, { color: colors.mutedForeground }]}>RoNW</Text>
                          <Text style={[styles.modalFinVal, { color: colors.foreground }]}>
                            {peer.ronw != null ? `${Number(peer.ronw).toFixed(1)}%` : '-'}
                          </Text>
                        </View>
                        <View style={styles.modalFinCell}>
                          <Text style={[styles.modalFinKey, { color: colors.mutedForeground }]}>CMP / Price</Text>
                          <Text style={[styles.modalFinVal, { color: colors.foreground }]}>
                            {peer.cmp != null ? `₹${peer.cmp}` : '-'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={[styles.modalEmptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' }}>
                      Industry peers: {sector || 'Mainboard Market'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* 5. PROMOTER & SHAREHOLDING */}
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

            {/* 6. LEAD MANAGERS & REGISTRAR */}
            {activeModal === 'DIRECTORY' && (
              <View style={{ gap: 12 }}>
                {/* Registrar Box */}
                <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Registrar Details</Text>
                  {registrarName && (
                    <View style={styles.snapRow}>
                      <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Name</Text>
                      <Text style={[styles.snapVal, { color: colors.foreground }]} numberOfLines={1}>{registrarName}</Text>
                    </View>
                  )}
                  {registrarPhone && (
                    <View style={styles.snapRow}>
                      <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Phone</Text>
                      <TouchableOpacity onPress={() => handleOpenUrl(`tel:${registrarPhone}`)}>
                        <Text style={[styles.snapVal, { color: '#3B82F6' }]}>{registrarPhone}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {registrarEmail && (
                    <View style={styles.snapRow}>
                      <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Email</Text>
                      <TouchableOpacity onPress={() => handleOpenUrl(`mailto:${registrarEmail}`)}>
                        <Text style={[styles.snapVal, { color: '#3B82F6' }]}>{registrarEmail}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {registrarWebsite && (
                    <View style={styles.snapRow}>
                      <Text style={[styles.snapKey, { color: colors.mutedForeground }]}>Website</Text>
                      <TouchableOpacity onPress={() => handleOpenUrl(registrarWebsite)}>
                        <Text style={[styles.snapVal, { color: '#3B82F6' }]} numberOfLines={1}>{registrarWebsite}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Lead Managers Box */}
                {leadManagersList.length > 0 && (
                  <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Lead Manager(s)</Text>
                    {leadManagersList.map((mgr: string, idx: number) => (
                      <Text key={idx} style={[styles.listBulletText, { color: colors.foreground }]}>
                        {idx + 1}. {mgr}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
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
    paddingTop: 8,
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
    padding: 12,
    gap: 4,
  },
  gridIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  gridCardVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  gridCardLabel: {
    fontSize: 11.5,
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
    fontSize: 16,
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
    textAlign: 'right',
    marginTop: 2,
  },

  // 8. Financial Snapshot Card
  finCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  fin4ColRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  finCol: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  finColKey: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  finColVal: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  finColPeriod: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  // 9. Valuation Row
  valuationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  valuationCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  valCardNumber: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  valCardLabel: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },

  // Generic Information Card (Used for About, Risks, Documents, Disclaimer)
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

  // Key Risks
  riskBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskRedDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#EF4444',
  },
  riskBulletText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
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

  // Modal Trigger Cards (With Chevron Arrow)
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

  // Bottom Sheet Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    maxHeight: '82%',
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
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
