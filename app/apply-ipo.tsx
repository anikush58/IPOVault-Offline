import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB, User } from '@/context/DBContext';
import { useAppExperience } from '@/context/AppExperienceContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { IPORepository } from '@/services/ipo/ipoRepository';
import { IPOMasterRecord } from '@/services/ipo/types';
import { formatCurrency, formatDate, maskPAN, getResolvedLogoUrl } from '@/utils/formatters';
import { backendIpoApiService } from '@/services/ipo/BackendIpoApiService';
import { BackendIpo } from '@/types/backend-ipo';
import { backendSyncEmitter } from '@/services/ipo/BackendSyncEmitter';
import { getCustomAvatarUrl } from '@/utils/avatarUtils';
import { safeRunAsync } from '@/utils/sqliteDebug';
import {
  IpoCategory,
  CATEGORY_OPTIONS,
  validateCategoryBid,
  getIpoOfferCategories,
  resolveIpoLotSize,
} from '@/utils/ipoCategoryUtils';

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

const DEFAULT_UPI_APPS = ['HDFC UPI', 'GPay', 'PhonePe', 'BHIM', 'Paytm', 'ICICI iMobile', 'BoB ASBA', 'IDFC ASBA', 'Other'];

interface ApplicantRowItemProps {
  user: User;
  isApplied: boolean;
  isSelected: boolean;
  currentLots: number;
  lotSize: number;
  unitPrice: number;
  selectedBank: string;
  selectedUPI: string;
  selectedCategory: IpoCategory;
  isFailedAvatar: boolean;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
  onToggle: (userId: string) => void;
  onBankPress: (userId: string) => void;
  onUpiPress: (userId: string) => void;
  onLotPress: (userId: string) => void;
  onAvatarError: (userId: string) => void;
  onCategorySelect: (userId: string, category: IpoCategory) => void;
}

const ApplicantRowItem = React.memo(function ApplicantRowItem({
  user,
  isApplied,
  isSelected,
  currentLots,
  lotSize,
  unitPrice,
  selectedBank,
  selectedUPI,
  selectedCategory,
  isFailedAvatar,
  isDark,
  colors,
  onToggle,
  onBankPress,
  onUpiPress,
  onLotPress,
  onAvatarError,
  onCategorySelect,
}: ApplicantRowItemProps) {
  const totalShares = currentLots * lotSize;
  const totalAmt = totalShares * unitPrice;
  const dematVal = user.client_id || (user as any).demat || (user as any).dp_id || (user as any).client_number || '';
  const customAvatar = getCustomAvatarUrl(user);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onToggle(user.id)}
      disabled={isApplied}
      style={[
        styles.applicantCard,
        {
          backgroundColor: isSelected ? (isDark ? colors.card : '#FFFFFF') : colors.card,
          borderColor: isSelected ? '#10B981' : colors.border,
          borderWidth: isSelected ? 1.5 : 1,
          opacity: isApplied ? 0.65 : 1,
        },
      ]}
    >
      {/* Applicant Header */}
      <View style={styles.applicantHeader}>
        <View style={styles.applicantAvatarRow}>
          {customAvatar && !isFailedAvatar ? (
            <Image
              source={{ uri: customAvatar }}
              style={[styles.avatarImage, { backgroundColor: colors.surface }]}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              onError={() => onAvatarError(user.id)}
            />
          ) : (
            <LinearGradient
              colors={getAvatarGradient(user.name || 'User')}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarCircle}
            >
              <Text style={[styles.avatarText, { color: '#FFFFFF' }]}>
                {user.name ? user.name.slice(0, 1).toUpperCase() : 'U'}
              </Text>
            </LinearGradient>
          )}
          <View>
            <Text style={[styles.applicantName, { color: colors.foreground }]}>{user.name}</Text>
            <Text style={[styles.applicantMeta, { color: colors.mutedForeground }]}>
              PAN: {user.pan_number ? maskPAN(user.pan_number) : '-'}{dematVal ? ` · Demat: ${dematVal}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.applicantHeaderRight}>
          {isSelected && (
            <View style={[styles.selectedCheckBadge, { backgroundColor: '#10B981' }]}>
              <Feather name="check" size={11} color="#FFFFFF" />
            </View>
          )}
          <View style={[styles.brokerBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.brokerText, { color: colors.mutedForeground }]}>
              {user.broker ? user.broker.toUpperCase() : 'CDSL'}
            </Text>
          </View>
        </View>
      </View>

      {/* Category Selection Pills */}
      <View style={styles.categoryPillRow}>
        {(['RETAIL', 'SHAREHOLDER', 'HNI'] as IpoCategory[]).map((catKey) => {
          const isCatActive = selectedCategory === catKey;
          const info = CATEGORY_OPTIONS[catKey];
          return (
            <TouchableOpacity
              key={catKey}
              onPress={(e) => {
                e.stopPropagation();
                onCategorySelect(user.id, catKey);
              }}
              activeOpacity={0.7}
              style={[
                styles.categoryPill,
                {
                  backgroundColor: isCatActive ? info.badgeBorder : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                  borderColor: isCatActive ? info.badgeBorder : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  {
                    color: isCatActive ? '#FFFFFF' : colors.mutedForeground,
                    fontWeight: isCatActive ? '700' : '500',
                  },
                ]}
              >
                {info.shortLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedCategory === 'SHAREHOLDER' && (
        <View style={[styles.categoryNoticeBox, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.08)', borderColor: 'rgba(139, 92, 246, 0.25)' }]}>
          <Feather name="info" size={11} color="#8B5CF6" />
          <Text style={[styles.categoryNoticeText, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
            Shareholder quota: Requires parent equity held on record date. Max ₹2L.
          </Text>
        </View>
      )}

      {/* Account & Mandate Config Row */}
      <View style={[styles.configRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => onBankPress(user.id)}
          style={styles.configItem}
          activeOpacity={0.7}
        >
          <Feather name="credit-card" size={12} color={colors.mutedForeground} />
          <Text style={[styles.configText, { color: colors.foreground }]} numberOfLines={1}>
            {selectedBank}
          </Text>
          <Feather name="chevron-down" size={12} color={colors.mutedForeground} />
        </TouchableOpacity>

        <View style={[styles.configDivider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          onPress={() => onUpiPress(user.id)}
          style={styles.configItem}
          activeOpacity={0.7}
        >
          <Feather name="smartphone" size={12} color={colors.mutedForeground} />
          <Text style={[styles.configText, { color: colors.foreground }]} numberOfLines={1}>
            {selectedUPI}
          </Text>
          <Feather name="chevron-down" size={12} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Lot Selection Row */}
      {isApplied ? (
        <View style={[styles.appliedNoticeRow, { borderTopColor: colors.border }]}>
          <Feather name="check-circle" size={14} color={isDark ? '#34D399' : '#059669'} />
          <Text style={[styles.appliedNoticeText, { color: isDark ? '#34D399' : '#059669' }]}>
            Application already submitted ({CATEGORY_OPTIONS[selectedCategory].shortLabel})
          </Text>
        </View>
      ) : (
        <View style={[styles.lotSelectionRow, { borderTopColor: colors.border }]}>
          <View style={styles.lotSelectLeftCol}>
            <Text style={[styles.lotSelectKey, { color: colors.mutedForeground }]}>
              BID QUANTITY
            </Text>
            {currentLots > 0 ? (
              <Text style={[styles.lotSelectSub, { color: colors.foreground }]}>
                {totalShares} Shares · {formatCurrency(totalAmt)}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={() => onLotPress(user.id)}
            activeOpacity={0.8}
            style={[
              styles.lotSelectTrigger,
              {
                borderColor: currentLots > 0 ? 'rgba(0, 0, 0, 0.75)' : colors.border,
                backgroundColor: currentLots > 0 ? 'rgba(0, 0, 0, 0.05)' : colors.surface,
              },
            ]}
          >
            <Text
              style={[
                styles.lotSelectVal,
                { color: currentLots > 0 ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {currentLots > 0 ? `${currentLots} Lot${currentLots > 1 ? 's' : ''}` : 'Select Lots'}
            </Text>
            <Feather
              name="chevron-right"
              size={14}
              color={currentLots > 0 ? colors.foreground : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
});

function ApplyIPOScreenContent() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const db = useSQLiteContext();
  const params = useLocalSearchParams<{
    ipoId?: string;
    id?: string;
    name?: string;
    ipo_name?: string;
    company_name?: string;
    symbol?: string;
    item?: string;
    priceBandLow?: string;
    priceBandHigh?: string;
    buy_price?: string;
    lotSize?: string;
    closeDate?: string;
    openDate?: string;
    logoUrl?: string;
    issueType?: string;
  }>();
  const { showSuccess, showError } = useDialog();
  const { users, ipos, applications, bankAccounts, addBulkApplications } = useDB();

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const targetParamId = params.ipoId || params.id || params.name || params.ipo_name || params.company_name || null;
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(targetParamId);
  const [masterRecord, setMasterRecord] = useState<IPOMasterRecord | null>(null);

  const parsedItem: BackendIpo | null = useMemo(() => {
    if (params.item) {
      try {
        return typeof params.item === 'string' ? JSON.parse(params.item) : (params.item as any);
      } catch (e) {
        if (__DEV__) console.warn('[ApplyIPO] Failed to parse params.item', e);
      }
    }
    return null;
  }, [params.item]);

  const [backendIpoRecord, setBackendIpoRecord] = useState<BackendIpo | null>(parsedItem);
  const [userLotQuantities, setUserLotQuantities] = useState<Record<string, number>>({});
  const [userSelectedBank, setUserSelectedBank] = useState<Record<string, string>>({});
  const [userSelectedUPI, setUserSelectedUPI] = useState<Record<string, string>>({});
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userSelectedCategory, setUserSelectedCategory] = useState<Record<string, IpoCategory>>({});
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const isSubmittingRef = React.useRef(false);

  useEffect(() => {
    if (parsedItem) {
      setBackendIpoRecord(parsedItem);
    }
  }, [parsedItem]);

  // Pickers State
  const [showIPOPicker, setShowIPOPicker] = useState(false);
  const [activeLotPickerUserId, setActiveLotPickerUserId] = useState<string | null>(null);
  const [activeBankPickerUserId, setActiveBankPickerUserId] = useState<string | null>(null);
  const [activeUpiPickerUserId, setActiveUpiPickerUserId] = useState<string | null>(null);

  // Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [submittedIpoName, setSubmittedIpoName] = useState('');
  const [submittedLots, setSubmittedLots] = useState(0);
  const [submittedAmount, setSubmittedAmount] = useState(0);

  const repo = useMemo(() => new IPORepository(db), [db]);
  const activeUsers = useMemo(() => users.filter((u) => u.archived !== 1), [users]);
  const activeIPOs = useMemo(() => {
    return ipos.filter((ipo) => {
      if (ipo.archived !== 0) return false;
      const name = (ipo.ipo_name || ipo.company_name || '').trim();
      if (!name || name.toUpperCase() === 'IPO' || name.toLowerCase().includes('test')) return false;
      const st = ((ipo as any).status || (ipo as any).lifecycle_status || '').toUpperCase();
      return !st.includes('CLOSED') && !st.includes('ALLOT') && !st.includes('LIST');
    });
  }, [ipos]);

  // Fetch record from ipo_master or backend API if selectedIpoId is passed
  useEffect(() => {
    async function resolveMaster() {
      if (!selectedIpoId || backendIpoRecord || parsedItem) return;
      try {
        const found = await repo.getById(selectedIpoId);
        if (found) {
          setMasterRecord(found);
        } else {
          const searchResults = await repo.search(selectedIpoId);
          if (searchResults && searchResults.length > 0) {
            setMasterRecord(searchResults[0]);
          } else {
            const bIpo = await backendIpoApiService.getBackendIpoDetail(selectedIpoId);
            if (bIpo) {
              setBackendIpoRecord(bIpo);
            }
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('[ApplyIPO] Could not fetch master/backend IPO record', err);
      }
    }
    resolveMaster();
  }, [selectedIpoId, repo, backendIpoRecord, parsedItem]);

  // Match selected IPO by id, company_name, or ipo_name from master or local listings
  const selectedIPO = useMemo(() => {
    if (!selectedIpoId) return undefined;
    const target = selectedIpoId.toLowerCase().trim();

    // 1. Check backend IPO record (from passed params or API fetch)
    const bIpo = backendIpoRecord || parsedItem;
    if (
      bIpo &&
      (bIpo.id?.toLowerCase() === target ||
        bIpo.symbol?.toLowerCase() === target ||
        (bIpo.company?.displayName || bIpo.companyName)?.toLowerCase().trim() === target ||
        target === params.ipoId?.toLowerCase() ||
        target === params.id?.toLowerCase())
    ) {
      const priceHigh =
        bIpo.priceBandHigh != null
          ? Number(bIpo.priceBandHigh)
          : (bIpo as any).price_band_max != null
          ? Number((bIpo as any).price_band_max)
          : null;
      const priceLow =
        bIpo.priceBandLow != null
          ? Number(bIpo.priceBandLow)
          : (bIpo as any).price_band_min != null
          ? Number((bIpo as any).price_band_min)
          : null;
      const price =
        priceHigh ||
        priceLow ||
        (bIpo.issuePriceInr != null
          ? Number(bIpo.issuePriceInr)
          : (bIpo as any).buy_price != null
          ? Number((bIpo as any).buy_price)
          : (params.buy_price ? parseFloat(params.buy_price) : 0));
      const compName =
        bIpo.company?.displayName || bIpo.companyName || bIpo.symbol || params.name || params.company_name || 'IPO';
      return {
        id: bIpo.id || selectedIpoId,
        company_name: compName,
        ipo_name: compName,
        buy_price: typeof price === 'string' ? parseFloat(price) : (price || 0),
        quantity: resolveIpoLotSize(bIpo) || (params.lotSize ? parseInt(params.lotSize, 10) : 1),
        issue_type: (bIpo.marketSegment === 'SME' || (bIpo as any).issue_type === 'SME' || (bIpo as any).issueType === 'SME' || params.issueType === 'SME') ? 'SME' : 'Mainboard',
        exchange: bIpo.exchange || 'NSE, BSE',
        close_date: bIpo.closeDate || params.closeDate || '',
        open_date: bIpo.openDate || params.openDate || '',
      };
    }

    // 2. Check master record fetched from ipo_master
    if (masterRecord) {
      const price = masterRecord.price_band_max || masterRecord.price_band_min || 0;
      return {
        id: masterRecord.id,
        company_name: masterRecord.company_name || masterRecord.ipo_name,
        ipo_name: masterRecord.company_name || masterRecord.ipo_name,
        buy_price: price,
        quantity: masterRecord.lot_size || 1,
        issue_type: masterRecord.issue_type || 'Mainboard',
        exchange: masterRecord.exchange || 'NSE, BSE',
        close_date: masterRecord.close_date || '',
        open_date: masterRecord.open_date || '',
      };
    }

    // 3. Fallback to passed params
    if (params.name || params.company_name || params.ipo_name) {
      const compName = params.company_name || params.ipo_name || params.name || 'IPO';
      const p = params.buy_price
        ? parseFloat(params.buy_price)
        : params.priceBandHigh
        ? parseFloat(params.priceBandHigh)
        : params.priceBandLow
        ? parseFloat(params.priceBandLow)
        : 0;
      return {
        id: selectedIpoId,
        company_name: compName,
        ipo_name: compName,
        buy_price: p,
        quantity: params.lotSize ? parseInt(params.lotSize, 10) : 1,
        issue_type: params.issueType || 'Mainboard',
        exchange: 'NSE, BSE',
        close_date: params.closeDate || '',
        open_date: params.openDate || '',
      };
    }

    // 4. Check local ipo_listings from useDB()
    const fromListings = ipos.find(
      (i) =>
        i.id?.toLowerCase() === target ||
        (i as any).company_name?.toLowerCase().trim() === target ||
        i.ipo_name?.toLowerCase().trim() === target
    );
    if (fromListings) {
      return {
        id: fromListings.id,
        company_name: fromListings.ipo_name,
        ipo_name: fromListings.ipo_name,
        buy_price: fromListings.buy_price,
        quantity: fromListings.quantity,
        issue_type: fromListings.issue_type,
        exchange: fromListings.exchange,
        close_date: fromListings.close_date,
        open_date: fromListings.open_date,
      };
    }

    return undefined;
  }, [ipos, selectedIpoId, masterRecord, backendIpoRecord, parsedItem, params]);

  const isSme = useMemo(() => {
    const bIpo = backendIpoRecord || parsedItem;
    const it = (
      selectedIPO?.issue_type ||
      bIpo?.marketSegment ||
      (bIpo as any)?.issue_type ||
      (bIpo as any)?.issueType ||
      masterRecord?.issue_type ||
      params.issueType ||
      ''
    ).toUpperCase();
    return it === 'SME';
  }, [selectedIPO?.issue_type, backendIpoRecord, parsedItem, masterRecord?.issue_type, params.issueType]);

  React.useEffect(() => {
    if (params.ipoId) {
      setSelectedIpoId(params.ipoId);
    } else if (!selectedIpoId && activeIPOs.length > 0) {
      setSelectedIpoId(activeIPOs[0].id);
    }
  }, [params.ipoId, activeIPOs]);

  // Reset selections when target IPO changes
  React.useEffect(() => {
    setSelectedUserIds(new Set());
    setUserLotQuantities({});
  }, [selectedIpoId]);

  // If market segment resolves to SME after async details load, ensure already-selected users meet the 2-lot minimum
  React.useEffect(() => {
    if (isSme) {
      setUserLotQuantities((prev) => {
        let changed = false;
        const next = { ...prev };
        selectedUserIds.forEach((uid) => {
          if (next[uid] === 1) {
            next[uid] = 2;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [isSme, selectedUserIds]);

  // Aggregate Order Summary Calculation
  const orderSummary = useMemo(() => {
    let totalLots = 0;
    let totalShares = 0;
    let totalAmount = 0;
    const lotSize = resolveIpoLotSize(selectedIPO) || selectedIPO?.quantity || 1;
    const unitPrice = selectedIPO?.buy_price || 0;
    const defaultLotCount = isSme ? 2 : 1;

    selectedUserIds.forEach((uid) => {
      const lots = userLotQuantities[uid] || defaultLotCount;
      totalLots += lots;
      totalShares += lots * lotSize;
      totalAmount += lots * lotSize * unitPrice;
    });

    return {
      applicantCount: selectedUserIds.size,
      totalLots,
      totalShares,
      totalAmount,
    };
  }, [selectedUserIds, userLotQuantities, selectedIPO, isSme]);

  // Precompute set of already applied user ID + category combinations for selected IPO
  const appliedUserCategorySet = useMemo(() => {
    if (!selectedIpoId) return new Set<string>();
    const set = new Set<string>();
    for (const a of applications) {
      if (a.ipo_id === selectedIpoId && a.status !== 'Cancelled') {
        const cat = (a.category || 'RETAIL').toUpperCase().trim();
        set.add(`${a.user_id}_${cat}`);
      }
    }
    return set;
  }, [applications, selectedIpoId]);

  const toggleApplicantSelection = useCallback((userId: string) => {
    const cat = userSelectedCategory[userId] || 'RETAIL';
    if (appliedUserCategorySet.has(`${userId}_${cat}`)) return;

    const defaultLotCount = isSme ? 2 : 1;
    const isSelected = selectedUserIds.has(userId);

    if (isSelected) {
      setUserLotQuantities((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } else {
      setUserLotQuantities((prev) => ({
        ...prev,
        [userId]: prev[userId] && prev[userId] >= defaultLotCount ? prev[userId] : defaultLotCount,
      }));
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    }
    Haptics.selectionAsync();
  }, [appliedUserCategorySet, isSme, selectedUserIds, userSelectedCategory]);

  const handleCategorySelect = useCallback((userId: string, category: IpoCategory) => {
    setUserSelectedCategory((prev) => ({ ...prev, [userId]: category }));
    const isAlreadyApplied = appliedUserCategorySet.has(`${userId}_${category}`);
    if (isAlreadyApplied) {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
    Haptics.selectionAsync();
  }, [appliedUserCategorySet]);

  const handleSelectAllApplicants = useCallback(() => {
    const eligibleUsers = activeUsers.filter((u) => {
      const cat = userSelectedCategory[u.id] || 'RETAIL';
      return !appliedUserCategorySet.has(`${u.id}_${cat}`);
    });
    const allSelected = eligibleUsers.length > 0 && eligibleUsers.every((u) => selectedUserIds.has(u.id));
    const defaultLotCount = isSme ? 2 : 1;

    if (allSelected) {
      // Deselect all
      setSelectedUserIds(new Set());
      setUserLotQuantities({});
    } else {
      // Select all eligible
      const next = new Set(selectedUserIds);
      const nextLots = { ...userLotQuantities };
      eligibleUsers.forEach((u) => {
        next.add(u.id);
        if (!nextLots[u.id] || nextLots[u.id] < defaultLotCount) {
          nextLots[u.id] = defaultLotCount;
        }
      });
      setSelectedUserIds(next);
      setUserLotQuantities(nextLots);
    }
    Haptics.selectionAsync();
  }, [activeUsers, appliedUserCategorySet, isSme, selectedUserIds, userLotQuantities, userSelectedCategory]);

  const handleBankPress = useCallback((userId: string) => {
    setActiveBankPickerUserId(userId);
  }, []);

  const handleUpiPress = useCallback((userId: string) => {
    setActiveUpiPickerUserId(userId);
  }, []);

  const handleLotPress = useCallback((userId: string) => {
    setActiveLotPickerUserId(userId);
  }, []);

  const handleAvatarError = useCallback((userId: string) => {
    setFailedAvatars((prev) => ({ ...prev, [userId]: true }));
  }, []);

  const handleBulkSubmit = async () => {
    if (loading || isSubmittingRef.current) return;
    if (!selectedIpoId) {
      showError('IPO Required', 'Please select an IPO first.');
      return;
    }
    if (selectedUserIds.size === 0) {
      showError('Applicants Required', 'Please select at least one applicant.');
      return;
    }

    const bIpo = backendIpoRecord || parsedItem;
    const unitPrice =
      selectedIPO?.buy_price ||
      (bIpo?.priceBandHigh ? Number(bIpo.priceBandHigh) : (bIpo?.priceBandLow ? Number(bIpo.priceBandLow) : 100));
    const lotQty = resolveIpoLotSize(selectedIPO || bIpo) || selectedIPO?.quantity || 1;
    const offerCats = getIpoOfferCategories(bIpo || selectedIPO);

    // Bid validation before execution against selected category rules
    for (const uid of Array.from(selectedUserIds)) {
      const cat = userSelectedCategory[uid] || 'RETAIL';
      const lots = userLotQuantities[uid] ?? (isSme ? 2 : 1);
      const catConfig = offerCats.find(
        (c) => (c.category || '').toUpperCase().trim() === cat
      );
      const val = validateCategoryBid({
        category: cat,
        lots,
        unitPrice,
        lotSize: lotQty,
        isSme,
        categoryConfig: catConfig,
      });
      if (!val.valid) {
        showError('Invalid Application', val.error || `Invalid bid for ${CATEGORY_OPTIONS[cat].shortLabel} category.`);
        return;
      }
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const bankNameMap: Record<string, string> = {};
      const upiAppMap: Record<string, string> = {};
      Array.from(selectedUserIds).forEach((uid) => {
        const u = users.find((usr) => usr.id === uid);
        const selectedBank = userSelectedBank[uid] || u?.bank_name || (bankAccounts[0]?.bank_name ?? '');
        const selectedUPI = userSelectedUPI[uid] || u?.upi_id || u?.upi_app || 'HDFC UPI';
        if (selectedBank) bankNameMap[uid] = selectedBank;
        if (selectedUPI) upiAppMap[uid] = selectedUPI;
      });

      const count = selectedUserIds.size;
      const targetIpoName =
        selectedIPO?.company_name ||
        selectedIPO?.ipo_name ||
        masterRecord?.company_name ||
        backendIpoRecord?.company?.displayName ||
        backendIpoRecord?.companyName ||
        params.name ||
        params.company_name ||
        'IPO';
      const lotsCount = orderSummary.totalLots;
      const amountVal = orderSummary.totalAmount;

      // Ensure local SQLite listing has the complete enriched record before adding applications
      const now = new Date().toISOString();
      const cDate = selectedIPO?.close_date || bIpo?.closeDate || params.closeDate || '';
      const oDate = selectedIPO?.open_date || bIpo?.openDate || params.openDate || '';
      const sym = bIpo?.symbol || params.symbol || '';
      const logo = bIpo?.company?.logoUrl || bIpo?.logoUrl || params.logoUrl || '';

      await safeRunAsync(
        db,
        `INSERT INTO ipo_listings (
          id, ipo_name, company_name, symbol, buy_price, quantity, open_date, close_date, listing_date, allotment_date,
          registrar, exchange, issue_type, archived, is_favorite, logo_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', 'NSE, BSE', 'Mainboard', 0, 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          ipo_name = COALESCE(NULLIF(excluded.ipo_name, ''), ipo_listings.ipo_name),
          company_name = COALESCE(NULLIF(excluded.company_name, ''), ipo_listings.company_name),
          symbol = COALESCE(NULLIF(excluded.symbol, ''), ipo_listings.symbol),
          buy_price = CASE WHEN excluded.buy_price > 0 THEN excluded.buy_price ELSE ipo_listings.buy_price END,
          quantity = CASE WHEN excluded.quantity > 0 THEN excluded.quantity ELSE ipo_listings.quantity END,
          open_date = COALESCE(NULLIF(excluded.open_date, ''), ipo_listings.open_date),
          close_date = COALESCE(NULLIF(excluded.close_date, ''), ipo_listings.close_date),
          logo_url = COALESCE(NULLIF(excluded.logo_url, ''), ipo_listings.logo_url),
          updated_at = excluded.updated_at`,
        [selectedIpoId, targetIpoName, targetIpoName, sym, unitPrice, lotQty, oDate, cDate, logo, now, now],
        'applyIpo.upsertListing'
      );

      await addBulkApplications(
        selectedIpoId,
        Array.from(selectedUserIds),
        bankNameMap,
        upiAppMap,
        userLotQuantities,
        undefined,
        userSelectedCategory
      );
      backendSyncEmitter.notifyChange('applications');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setSubmittedCount(count);
      setSubmittedIpoName(targetIpoName);
      setSubmittedLots(lotsCount);
      setSubmittedAmount(amountVal);
      setShowSuccessModal(true);
    } catch (err: any) {
      if (__DEV__) console.error('[ApplyIPO] Bulk application submission error:', err);
      showError('Submission Error', 'Failed to submit IPO applications. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleSuccessDone = () => {
    setShowSuccessModal(false);
    if (router.canGoBack()) {
      router.back();
    } else {
      if (typeof (router as any).navigate === 'function') {
        (router as any).navigate('/(tabs)/ipos');
      } else {
        router.replace('/(tabs)/ipos');
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── App Bar Header ── */}
      <ScreenHeader
        eyebrow="RECORD APPLICATION"
        title="Apply IPO"
        centerTitle
        showBack
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topPad + 60 + 12,
            paddingBottom: insets.bottom + 120,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Step Progress Indicator ── */}
        <View style={[styles.stepBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.stepItem}>
            <View style={[styles.stepNumActive, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumTextActive}>1</Text>
            </View>
            <Text style={[styles.stepLabel, { color: colors.foreground }]}>Select IPO</Text>
          </View>

          <View style={[styles.stepConnector, { backgroundColor: selectedIPO ? colors.primary : colors.border }]} />

          <View style={styles.stepItem}>
            <View style={[styles.stepNum, { backgroundColor: selectedUserIds.size > 0 ? colors.primary : colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.stepNumText, { color: selectedUserIds.size > 0 ? '#FFFFFF' : colors.mutedForeground }]}>2</Text>
            </View>
            <Text style={[styles.stepLabel, { color: selectedUserIds.size > 0 ? colors.foreground : colors.mutedForeground }]}>Configure Bids</Text>
          </View>

          <View style={[styles.stepConnector, { backgroundColor: selectedUserIds.size > 0 ? colors.primary : colors.border }]} />

          <View style={styles.stepItem}>
            <View style={[styles.stepNum, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.stepNumText, { color: colors.mutedForeground }]}>3</Text>
            </View>
            <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>Mandate</Text>
          </View>
        </View>

        {/* ── Selected IPO Showcase Card ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TARGET IPO</Text>
        </View>

        <View
          style={[styles.ipoShowcaseCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.ipoShowcaseTop}>
            {/* Logo / Avatar */}
            {(() => {
              const bIpo = backendIpoRecord || parsedItem;
              const logoUrl =
                bIpo?.company?.logoUrl ||
                bIpo?.logoUrl ||
                (bIpo as any)?.logo_url ||
                masterRecord?.logo_url ||
                params.logoUrl;
              const ipoName =
                selectedIPO?.company_name ||
                selectedIPO?.ipo_name ||
                bIpo?.company?.displayName ||
                bIpo?.companyName ||
                bIpo?.symbol ||
                masterRecord?.company_name ||
                params.name ||
                params.company_name ||
                '';
              const initials = ipoName
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .split(' ')
                .slice(0, 2)
                .map((w: string) => w[0])
                .join('')
                .toUpperCase();
              return logoUrl ? (
                <View style={[styles.showcaseLogoWrap, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: '#FFFFFF' }]}>
                  <Image source={{ uri: getResolvedLogoUrl(logoUrl) || logoUrl }} style={styles.showcaseLogo} resizeMode="contain" />
                </View>
              ) : ipoName ? (
                <View style={[styles.showcaseLogoWrap, { borderColor: isDark ? '#334155' : '#E5E7EB', backgroundColor: '#FFFFFF' }]}>
                  <LinearGradient
                    colors={getAvatarGradient(ipoName)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.showcaseAvatar}
                  >
                    <Text style={styles.showcaseAvatarText}>{initials || '?'}</Text>
                  </LinearGradient>
                </View>
              ) : null;
            })()}

            <View style={{ flex: 1, paddingLeft: 10, paddingRight: 8 }}>
              <Text style={[styles.ipoShowcaseTitle, { color: colors.foreground }]} numberOfLines={1}>
                {selectedIPO?.company_name ||
                  selectedIPO?.ipo_name ||
                  backendIpoRecord?.company?.displayName ||
                  backendIpoRecord?.companyName ||
                  masterRecord?.company_name ||
                  params.name ||
                  params.company_name ||
                  'No IPO Selected'}
              </Text>
              <Text style={[styles.ipoShowcaseSub, { color: colors.mutedForeground }]}>
                {selectedIPO?.issue_type ||
                  (backendIpoRecord?.marketSegment === 'SME' ? 'SME' : 'Mainboard') ||
                  'Mainboard'}{' '}
                · {selectedIPO?.exchange || backendIpoRecord?.exchange || 'NSE, BSE'}
              </Text>
            </View>

            <View style={[styles.statusBadgeLive, { backgroundColor: '#10B981', borderWidth: 0 }]}>
              <Text style={[styles.liveBadgeText, { color: '#FFFFFF' }]}>LIVE BID</Text>
            </View>
          </View>

          <View style={[styles.metricsBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.metricCell}>
              <Text style={[styles.metricKey, { color: colors.mutedForeground }]}>PRICE BAND</Text>
              <Text style={[styles.metricVal, { color: colors.foreground }]}>
                {(() => {
                  const bIpo = backendIpoRecord || parsedItem;
                  const high =
                    bIpo?.priceBandHigh != null
                      ? Number(bIpo.priceBandHigh)
                      : (bIpo as any)?.price_band_max != null
                      ? Number((bIpo as any).price_band_max)
                      : masterRecord?.price_band_max != null
                      ? Number(masterRecord.price_band_max)
                      : params.priceBandHigh
                      ? Number(params.priceBandHigh)
                      : null;
                  const low =
                    bIpo?.priceBandLow != null
                      ? Number(bIpo.priceBandLow)
                      : (bIpo as any)?.price_band_min != null
                      ? Number((bIpo as any).price_band_min)
                      : masterRecord?.price_band_min != null
                      ? Number(masterRecord.price_band_min)
                      : params.priceBandLow
                      ? Number(params.priceBandLow)
                      : null;

                  if (low && high) {
                    return low === high ? `₹${high}` : `₹${low} - ₹${high}`;
                  }
                  if (high) return `₹${high}`;
                  if (low) return `₹${low}`;
                  if (selectedIPO?.buy_price) return `₹${selectedIPO.buy_price}`;
                  return 'TBA';
                })()}
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

            <View style={styles.metricCell}>
              <Text style={[styles.metricKey, { color: colors.mutedForeground }]}>LOT SIZE</Text>
              <Text style={[styles.metricVal, { color: colors.foreground }]}>
                {(() => {
                  const bIpo = backendIpoRecord || parsedItem;
                  const lot =
                    selectedIPO?.quantity ||
                    bIpo?.lotSize ||
                    masterRecord?.lot_size ||
                    (params.lotSize ? parseInt(params.lotSize, 10) : null);
                  return lot ? `${lot} Shares` : '1 Lot';
                })()}
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

            <View style={styles.metricCell}>
              <Text style={[styles.metricKey, { color: colors.mutedForeground }]}>CLOSING DATE</Text>
              <Text style={[styles.metricVal, { color: isDark ? '#F87171' : '#DC2626' }]}>
                {(() => {
                  const bIpo = backendIpoRecord || parsedItem;
                  const cDate =
                    selectedIPO?.close_date ||
                    bIpo?.closeDate ||
                    masterRecord?.close_date ||
                    params.closeDate;
                  if (cDate && cDate.trim() && cDate.toLowerCase() !== 'open') {
                    const formatted = formatDate(cDate);
                    return formatted !== 'N/A' ? formatted : cDate;
                  }
                  return 'Closing Soon';
                })()}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Applicants List ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            APPLICANTS ({selectedUserIds.size} SELECTED)
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {activeUsers.length > 0 && (
              <TouchableOpacity onPress={handleSelectAllApplicants}>
                <Text style={[styles.changeIpoText, { color: colors.primary }]}>
                  {activeUsers
                    .filter((u) => !applications.some((a) => a.ipo_id === selectedIpoId && a.user_id === u.id && a.status !== 'Cancelled'))
                    .every((u) => selectedUserIds.has(u.id)) && selectedUserIds.size > 0
                    ? 'Deselect All'
                    : 'Select All'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {activeUsers.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="users" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No investor profiles found. Create user profiles to apply.
            </Text>
          </View>
        ) : (
          activeUsers.map((u) => {
            const userCategory = userSelectedCategory[u.id] || 'RETAIL';
            const isApplied = appliedUserCategorySet.has(`${u.id}_${userCategory}`);
            const isSelected = selectedUserIds.has(u.id) && !isApplied;
            const currentLots = isSelected ? (userLotQuantities[u.id] || (isSme ? 2 : 1)) : 0;
            const selectedBank = userSelectedBank[u.id] || u.bank_name || (bankAccounts[0]?.bank_name ?? 'Default Bank');
            const selectedUPI = userSelectedUPI[u.id] || u.upi_id || u.upi_app || 'HDFC UPI';

            return (
              <ApplicantRowItem
                key={u.id}
                user={u}
                isApplied={isApplied}
                isSelected={isSelected}
                currentLots={currentLots}
                lotSize={selectedIPO?.quantity || 1}
                unitPrice={selectedIPO?.buy_price || 0}
                selectedBank={selectedBank}
                selectedUPI={selectedUPI}
                selectedCategory={userCategory}
                isFailedAvatar={Boolean(failedAvatars[u.id])}
                isDark={isDark}
                colors={colors}
                onToggle={toggleApplicantSelection}
                onBankPress={handleBankPress}
                onUpiPress={handleUpiPress}
                onLotPress={handleLotPress}
                onAvatarError={handleAvatarError}
                onCategorySelect={handleCategorySelect}
              />
            );
          })
        )}

      </ScrollView>

      {/* ── Sticky Order Summary Footer ── */}
      <View
        style={[
          styles.stickyFooter,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.footerSummaryRow}>
          <View>
            <Text style={[styles.footerSummaryKey, { color: colors.mutedForeground }]}>TOTAL INVESTMENT</Text>
            <Text style={[styles.footerSummaryVal, { color: colors.foreground }]}>
              {formatCurrency(orderSummary.totalAmount)}
            </Text>
            <Text style={[styles.footerSummarySub, { color: colors.mutedForeground }]}>
              {orderSummary.applicantCount} Applicant{orderSummary.applicantCount !== 1 ? 's' : ''} · {orderSummary.totalLots} Lots ({orderSummary.totalShares} Shares)
            </Text>
          </View>

          <Button
            variant="primary"
            size="md"
            title="Submit Bids"
            loading={loading}
            disabled={loading || !selectedIpoId || selectedUserIds.size === 0}
            onPress={handleBulkSubmit}
          />
        </View>
      </View>

      {/* ── Active IPO Selector Modal ── */}
      <Modal visible={showIPOPicker} transparent animationType="fade" onRequestClose={() => setShowIPOPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowIPOPicker(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Target IPO</Text>
              <TouchableOpacity onPress={() => setShowIPOPicker(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {activeIPOs.length === 0 ? (
                <Text style={[styles.modalEmptyText, { color: colors.mutedForeground }]}>No active IPOs available.</Text>
              ) : (
                activeIPOs.map((ipo) => (
                  <TouchableOpacity
                    key={ipo.id}
                    onPress={() => {
                      setSelectedIpoId(ipo.id);
                      setShowIPOPicker(false);
                    }}
                    style={[
                      styles.modalOptionRow,
                      { borderBottomColor: colors.border, backgroundColor: selectedIpoId === ipo.id ? colors.surface : 'transparent' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalOptionName, { color: colors.foreground }]}>{ipo.ipo_name}</Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                        Price: ₹{ipo.buy_price || '-'} · Lot Size: {ipo.quantity || '-'}
                      </Text>
                    </View>
                    {selectedIpoId === ipo.id && <Feather name="check" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Lot Selector Modal ── */}
      <Modal visible={Boolean(activeLotPickerUserId)} transparent animationType="fade" onRequestClose={() => setActiveLotPickerUserId(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActiveLotPickerUserId(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: 420, padding: 0 }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {(isSme
                ? [0, ...Array.from({ length: 19 }, (_, i) => i + 2)]
                : Array.from({ length: 20 }, (_, i) => i)
              ).map((lotCount) => {
                const lotSize = selectedIPO?.quantity || 1;
                const unitPrice = selectedIPO?.buy_price || 0;
                const totalShares = lotCount * lotSize;
                const totalCost = totalShares * unitPrice;
                const userId = activeLotPickerUserId;
                const isSelected = userId ? (userLotQuantities[userId] || 0) === lotCount : false;

                return (
                  <TouchableOpacity
                    key={lotCount}
                    onPress={() => {
                      if (userId) {
                        setUserLotQuantities((prev) => ({ ...prev, [userId]: lotCount }));
                        setSelectedUserIds((prev) => {
                          const n = new Set(prev);
                          if (lotCount > 0) n.add(userId);
                          else n.delete(userId);
                          return n;
                        });
                      }
                      setActiveLotPickerUserId(null);
                    }}
                    style={[
                      styles.modalOptionRow,
                      { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.surface : 'transparent' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.lotOptionText,
                        { color: isSelected ? colors.primary : colors.foreground },
                        isSelected && { fontFamily: 'GoogleSansFlex_700Bold' },
                      ]}
                    >
                      {lotCount === 0 ? '0 Lots (Remove)' : `${lotCount} Lot${lotCount > 1 ? 's' : ''} (${totalShares} Shares) · ${formatCurrency(totalCost)}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Bank Selector Modal ── */}
      <Modal visible={Boolean(activeBankPickerUserId)} transparent animationType="fade" onRequestClose={() => setActiveBankPickerUserId(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActiveBankPickerUserId(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select ASBA Bank Account</Text>
              <TouchableOpacity onPress={() => setActiveBankPickerUserId(null)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {bankAccounts.length === 0 ? (
                <Text style={[styles.modalEmptyText, { color: colors.mutedForeground }]}>No bank accounts added yet.</Text>
              ) : (
                bankAccounts.map((b) => {
                  const currentBank = activeBankPickerUserId
                    ? (userSelectedBank[activeBankPickerUserId] ||
                       users.find((u) => u.id === activeBankPickerUserId)?.bank_name ||
                       (bankAccounts[0]?.bank_name ?? ''))
                    : '';
                  const isSelected = currentBank === b.bank_name;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => {
                        if (activeBankPickerUserId) {
                          setUserSelectedBank((prev) => ({ ...prev, [activeBankPickerUserId]: b.bank_name }));
                          Haptics.selectionAsync();
                        }
                        setActiveBankPickerUserId(null);
                      }}
                      style={[
                        styles.modalOptionRow,
                        {
                          borderBottomColor: colors.border,
                          backgroundColor: isSelected ? colors.surface : 'transparent',
                          justifyContent: 'space-between',
                        },
                      ]}
                    >
                      <Text style={[styles.modalOptionName, { color: isSelected ? colors.primary : colors.foreground }]}>
                        {b.bank_name}
                      </Text>
                      {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── UPI App Selector Modal ── */}
      <Modal visible={Boolean(activeUpiPickerUserId)} transparent animationType="fade" onRequestClose={() => setActiveUpiPickerUserId(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActiveUpiPickerUserId(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select UPI App</Text>
              <TouchableOpacity onPress={() => setActiveUpiPickerUserId(null)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {DEFAULT_UPI_APPS.map((app) => {
                const currentUpi = activeUpiPickerUserId
                  ? (userSelectedUPI[activeUpiPickerUserId] ||
                     users.find((u) => u.id === activeUpiPickerUserId)?.upi_id ||
                     users.find((u) => u.id === activeUpiPickerUserId)?.upi_app ||
                     'HDFC UPI')
                  : '';
                const isSelected = currentUpi === app;
                return (
                  <TouchableOpacity
                    key={app}
                    onPress={() => {
                      if (activeUpiPickerUserId) {
                        setUserSelectedUPI((prev) => ({ ...prev, [activeUpiPickerUserId]: app }));
                        Haptics.selectionAsync();
                      }
                      setActiveUpiPickerUserId(null);
                    }}
                    style={[
                      styles.modalOptionRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected ? colors.surface : 'transparent',
                        justifyContent: 'space-between',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalOptionName,
                        { color: isSelected ? colors.primary : colors.foreground },
                      ]}
                    >
                      {app}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Submission Success Modal ── */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleSuccessDone}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Success Icon Halo */}
            <View style={[styles.successIconHalo, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#DCFCE7' }]}>
              <View style={styles.successIconCircle}>
                <Feather name="check" size={28} color="#FFFFFF" />
              </View>
            </View>

            {/* Title & Subtitle */}
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              Applications Recorded
            </Text>
            <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
              Successfully recorded <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_700Bold' }}>{submittedCount}</Text> {submittedCount === 1 ? 'application' : 'applications'} locally for
            </Text>
            <Text style={[styles.successIpoName, { color: colors.primary }]} numberOfLines={2}>
              {submittedIpoName}
            </Text>

            {/* Quick Stat Summary Badge */}
            <View style={[styles.successStatsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.successStatItem}>
                <Text style={[styles.successStatVal, { color: colors.foreground }]}>{submittedCount}</Text>
                <Text style={[styles.successStatLabel, { color: colors.mutedForeground }]}>Applicants</Text>
              </View>
              <View style={[styles.successStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.successStatItem}>
                <Text style={[styles.successStatVal, { color: colors.foreground }]}>{submittedLots}</Text>
                <Text style={[styles.successStatLabel, { color: colors.mutedForeground }]}>Total Lots</Text>
              </View>
              <View style={[styles.successStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.successStatItem}>
                <Text style={[styles.successStatVal, { color: colors.foreground }]}>{formatCurrency(submittedAmount)}</Text>
                <Text style={[styles.successStatLabel, { color: colors.mutedForeground }]}>Total Value</Text>
              </View>
            </View>

            {/* Prominent Local Application Notice */}
            <View
              style={[
                styles.prominentNoticeBox,
                {
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
                  borderColor: isDark ? 'rgba(245, 158, 11, 0.32)' : '#FDE68A',
                },
              ]}
            >
              <View style={styles.prominentNoticeHeader}>
                <Feather name="alert-circle" size={15} color={isDark ? '#FBBF24' : '#D97706'} />
                <Text
                  style={[
                    styles.prominentNoticeTitle,
                    { color: isDark ? '#FCD34D' : '#B45309' },
                  ]}
                >
                  Local Application Only
                </Text>
              </View>
              <Text
                style={[
                  styles.prominentNoticeBody,
                  { color: isDark ? '#FDE68A' : '#92400E' },
                ]}
              >
                This application is recorded locally on your device for tracking. It does not place an official bid on the stock exchange. Please apply through your broker or bank ASBA and approve the UPI mandate.
              </Text>
            </View>

            {/* Done CTA */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleSuccessDone}
              style={[styles.successDoneBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.successDoneBtnText, { color: colors.primaryForeground }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  headerLinkText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },

  // Step bar
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepNumActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumTextActive: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  stepConnector: {
    flex: 1,
    height: 1.5,
    marginHorizontal: 8,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  changeIpoText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // IPO Showcase Card
  ipoShowcaseCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  ipoShowcaseTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ipoShowcaseTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  ipoShowcaseSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  showcaseLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 0,
    margin: 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  showcaseLogo: {
    ...StyleSheet.absoluteFillObject,
    width: 44,
    height: 44,
    resizeMode: 'contain',
  },
  showcaseAvatar: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  showcaseAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  statusBadgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.6,
  },

  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricKey: {
    fontSize: 8,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  metricDivider: {
    width: 1,
    height: 24,
  },

  emptyBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
  },

  // Applicant Card
  applicantCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  applicantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  applicantAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  applicantName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  applicantMeta: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  applicantHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedCheckBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brokerBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  brokerText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  categoryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryPill: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPillText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  categoryNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryNoticeText: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
  },

  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  configItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  configText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
  },
  configDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 8,
  },

  appliedNoticeRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedNoticeText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  lotSelectionRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lotSelectLeftCol: {
    flex: 1,
    gap: 2,
  },
  lotSelectKey: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  lotSelectSub: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  lotSelectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  lotSelectVal: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  bottomShortcuts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 4,
  },
  shortcutText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textDecorationLine: 'underline',
  },

  // Sticky Summary Footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerSummaryKey: {
    fontSize: 9,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.8,
  },
  footerSummaryVal: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    marginTop: 1,
  },
  footerSummarySub: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },

  submitGoldBtn: {
    height: 48,
    borderRadius: 9999,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitGoldBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalEmptyText: {
    padding: 20,
    textAlign: 'center',
    fontStyle: 'italic',
    fontSize: 13,
  },
  modalOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalOptionName: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  lotOptionText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  // Success Modal
  successCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  successIconHalo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  successIpoName: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 18,
  },
  successStatsBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  successStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  successStatVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  successStatLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_500Medium',
    marginTop: 2,
  },
  successStatDivider: {
    width: 1,
    height: 24,
  },
  prominentNoticeBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  prominentNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  prominentNoticeTitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  prominentNoticeBody: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_500Medium',
    lineHeight: 17,
  },
  successDoneBtn: {
    width: '100%',
    height: 48,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  successDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});

export default function ApplyIPOScreen() {
  const { isNonPro, isLoading: isExperienceLoading } = useAppExperience();
  const router = useRouter();

  useEffect(() => {
    if (!isExperienceLoading && isNonPro) {
      if (typeof (router as any).navigate === 'function') {
        (router as any).navigate('/(tabs)/ipos');
      } else {
        router.replace('/(tabs)/ipos');
      }
    }
  }, [isNonPro, isExperienceLoading, router]);

  if (isNonPro) {
    return null;
  }

  return <ApplyIPOScreenContent />;
}


