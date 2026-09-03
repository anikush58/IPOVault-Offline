import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDialog } from '@/context/DialogContext';
import { useDB, type IPOListing } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { formatCurrency } from '@/utils/formatters';
import { Tabs } from '@/components/ui/Tabs';

type TabSegment = 'active' | 'favorites' | 'archived';

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

export default function IPOManagementScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { showSuccess, showError, showConfirm } = useDialog();

  const { ipos, applications, refresh } = useDB();

  // Segment State: active | favorites | archived
  const [activeSegment, setActiveSegment] = useState<TabSegment>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const toggleSearch = () => {
    if (showSearch) {
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  };

  // Counts
  const activeCount = useMemo(() => ipos.filter((i) => i.archived === 0).length, [ipos]);
  const favCount = useMemo(() => ipos.filter((i) => i.is_favorite === 1).length, [ipos]);
  const archivedCount = useMemo(() => ipos.filter((i) => i.archived === 1).length, [ipos]);

  const filteredIPOs = useMemo(() => {
    let list = ipos;
    if (activeSegment === 'active') {
      list = list.filter((i) => i.archived === 0);
    } else if (activeSegment === 'favorites') {
      list = list.filter((i) => i.is_favorite === 1);
    } else if (activeSegment === 'archived') {
      list = list.filter((i) => i.archived === 1);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) =>
        i.ipo_name.toLowerCase().includes(q) || (i.registrar && i.registrar.toLowerCase().includes(q))
      );
    }

    return list;
  }, [ipos, activeSegment, searchQuery]);

  // Navigate to Add IPO page
  const openAddPage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/add-ipo');
  };

  // Context-Aware Plus Button Listener from Bottom Tab Bar
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('OPEN_ADD_IPO', () => {
      openAddPage();
    });
    return () => sub.remove();
  }, []);

  // Navigate to Edit IPO page
  const openEditPage = (ipo: IPOListing) => {
    router.push({ pathname: '/add-ipo', params: { ipoId: ipo.id } });
  };

  // Toggle Favorite
  const handleToggleFavorite = async (ipo: IPOListing) => {
    Haptics.selectionAsync();
    const newFav = ipo.is_favorite === 1 ? 0 : 1;
    try {
      await db.runAsync('UPDATE ipo_listings SET is_favorite = ? WHERE id = ?', [newFav, ipo.id]);
      await refresh();
    } catch {
      showError('Error', 'Failed to update favorite status.');
    }
  };

  // Toggle Archive Status
  const handleToggleArchive = async (ipo: IPOListing) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newArchived = ipo.archived === 1 ? 0 : 1;
    try {
      await db.runAsync('UPDATE ipo_listings SET archived = ? WHERE id = ?', [newArchived, ipo.id]);
      await refresh();
    } catch {
      showError('Error', 'Failed to update archive status.');
    }
  };

  const handleDeleteIPO = (ipo: IPOListing) => {
    showConfirm({
      title: 'Delete IPO',
      message: `Permanently delete "${ipo.ipo_name}" from listings?`,
      confirmText: 'Delete',
      isDanger: true,
      onConfirm: async () => {
        try {
          await db.runAsync('UPDATE ipo_listings SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [ipo.id]);
          await refresh();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {
          showError('Error', 'Failed to delete IPO record.');
        }
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Custom Single Header ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.mutedForeground }]}>TRACK & MANAGE</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPOs</Text>
        </View>

        {/* header actions: search only */}
        <View style={styles.headerActions}>
          <IconButton
            name={showSearch ? 'x' : 'search'}
            variant={showSearch ? 'primary' : 'surface'}
            size="md"
            onPress={toggleSearch}
          />
        </View>
      </View>

      {/* ── Collapsible Search Bar ── */}
      {showSearch && (
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              ref={searchRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by IPO name or registrar..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground }]}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Feather name="x-circle" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Filter Segment Tabs (Active / Favorites / Archived) ── */}
      <View style={[styles.segmentBarWrap, { backgroundColor: colors.background }]}>
        <Tabs
          variant="pills"
          tabs={[
            { key: 'active', label: 'Active', count: activeCount > 0 ? activeCount : undefined },
            { key: 'favorites', label: 'Favorites', count: favCount > 0 ? favCount : undefined },
            { key: 'archived', label: 'Archived', count: archivedCount > 0 ? archivedCount : undefined },
          ]}
          activeTab={activeSegment}
          onChange={(key) => setActiveSegment(key as TabSegment)}
          style={{ paddingVertical: 10 }}
        />
      </View>

      {/* ── Content Body ── */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 110, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredIPOs.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + '14' }]}>
              <Feather
                name={activeSegment === 'favorites' ? 'star' : activeSegment === 'archived' ? 'archive' : 'layers'}
                size={28}
                color={colors.primary}
              />
            </View>

            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {searchQuery
                ? 'No Matching IPOs Found'
                : activeSegment === 'favorites'
                ? 'No Favorite IPOs Saved'
                : activeSegment === 'archived'
                ? 'No Archived IPO Listings'
                : 'No IPO Listings Yet'}
            </Text>

            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              {searchQuery
                ? `No IPO matches "${searchQuery}". Check your search term or clear filters.`
                : activeSegment === 'favorites'
                ? 'Bookmark IPOs by tapping the star icon on any IPO card for quick access.'
                : activeSegment === 'archived'
                ? 'Archived IPO listings will appear here to keep your active list clean.'
                : 'Create your first IPO listing to track buy price, quantity, dates, and bulk applications.'}
            </Text>

            {searchQuery ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={[styles.emptyActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <Feather name="x-circle" size={15} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.emptyActionBtnText, { color: colors.primary }]}>Clear Search Filter</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={openAddPage}
                style={[styles.emptyActionBtnPrimary, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Feather name="plus-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionBtnPrimaryText}>Add IPO Listing</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredIPOs.map((ipo) => {
            const isFav = ipo.is_favorite === 1;
            const isArchived = ipo.archived === 1;

            const ipoApps = applications.filter(
              (a) =>
                a.ipo_name.toLowerCase().trim() === ipo.ipo_name.toLowerCase().trim() ||
                (a.ipo_id && a.ipo_id === ipo.id)
            );
            const appliedApps = ipoApps.filter((a) => a.status === 'Applied' || a.status === 'Mandate Approved');
            const allottedApps = ipoApps.filter(
              (a) => a.status === 'Allotted' || a.status === 'Partially Allotted' || a.status === 'Holding' || a.status === 'Sold'
            );

            return (
              <View
                key={ipo.id}
                style={[
                  styles.ipoCardNoShadow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                {/* ── Card Header Row with Colorful Action Icons ── */}
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[styles.ipoTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {ipo.ipo_name}
                    </Text>

                    {!!ipo.registrar && (
                      <Text style={[styles.ipoRegistrar, { color: colors.mutedForeground }]} numberOfLines={1}>
                        Registrar: {ipo.registrar}
                      </Text>
                    )}
                  </View>

                  {/* Colorful Action Buttons */}
                  <View style={styles.cardHeaderActions}>
                    {/* 1. Favorite (Yellow) */}
                    <TouchableOpacity
                      onPress={() => handleToggleFavorite(ipo)}
                      hitSlop={6}
                      style={[
                        styles.iconCircleBtnBigger,
                        {
                          backgroundColor: isFav
                            ? (isDark ? 'rgba(234, 179, 8, 0.15)' : '#FEF9C3')
                            : colors.surface,
                          borderColor: isFav
                            ? (isDark ? 'rgba(234, 179, 8, 0.3)' : '#FEF08A')
                            : colors.border,
                        },
                      ]}
                    >
                      <Feather
                        name="star"
                        size={16}
                        color={isFav ? '#EAB308' : colors.mutedForeground}
                      />
                    </TouchableOpacity>

                    {/* 2. Edit (Blue) */}
                    <TouchableOpacity
                      onPress={() => openEditPage(ipo)}
                      hitSlop={6}
                      style={[
                        styles.iconCircleBtnBigger,
                        {
                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
                          borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
                        },
                      ]}
                    >
                      <Feather name="edit-2" size={16} color="#3B82F6" />
                    </TouchableOpacity>

                    {/* 3. Archive / Unarchive (Purple) */}
                    <TouchableOpacity
                      onPress={() => handleToggleArchive(ipo)}
                      hitSlop={6}
                      style={[
                        styles.iconCircleBtnBigger,
                        {
                          backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF',
                          borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : '#DDD6FE',
                        },
                      ]}
                    >
                      <Feather
                        name={isArchived ? "rotate-ccw" : "archive"}
                        size={16}
                        color="#8B5CF6"
                      />
                    </TouchableOpacity>

                    {/* 4. Delete (Red) */}
                    <TouchableOpacity
                      onPress={() => handleDeleteIPO(ipo)}
                      hitSlop={6}
                      style={[
                        styles.iconCircleBtnBigger,
                        {
                          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                          borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
                        },
                      ]}
                    >
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── Key Financial Stats (Compact, Clean) ── */}
                <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>BID / ISSUE PRICE</Text>
                    <Text style={[styles.statValue, { color: colors.foreground }]}>
                      {formatCurrency(ipo.buy_price)}
                    </Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>LOT QTY</Text>
                    <Text style={[styles.statValue, { color: colors.foreground }]}>
                      {ipo.quantity} shares
                    </Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>LOT VALUE</Text>
                    <Text style={[styles.statValue, { color: colors.primary, fontFamily: 'GoogleSansFlex_700Bold' }]}>
                      {formatCurrency(ipo.buy_price * ipo.quantity)}
                    </Text>
                  </View>
                </View>

                {/* ── Evenly Spaced Dates Row ── */}
                {(ipo.open_date || ipo.close_date || ipo.allotment_date || ipo.listing_date) && (
                  <View style={styles.datesRowEvenlySpaced}>
                    {ipo.open_date && (
                      <View style={styles.dateBadgeFlex}>
                        <Feather name="calendar" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                          Open: <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }}>{ipo.open_date}</Text>
                        </Text>
                      </View>
                    )}
                    {ipo.close_date && (
                      <View style={styles.dateBadgeFlex}>
                        <Feather name="clock" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                          Close: <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }}>{ipo.close_date}</Text>
                        </Text>
                      </View>
                    )}
                    {ipo.allotment_date && (
                      <View style={styles.dateBadgeFlex}>
                        <Feather name="check-circle" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                          Allotment: <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_600SemiBold' }}>{ipo.allotment_date}</Text>
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* ── Subtly Highlighted Applied & Allotted Footer ── */}
                <View style={styles.cardFooterCompact}>
                  <View style={styles.appsMetaRowSubtle}>
                    <Text style={[styles.appsMetaTextLabel, { color: colors.mutedForeground }]}>
                      Apps: <Text style={{ color: colors.foreground, fontFamily: 'GoogleSansFlex_700Bold' }}>{ipoApps.length}</Text> total
                    </Text>

                    {/* Subtly Highlighted Applied Pill */}
                    <View style={[styles.subtleHighlightPill, { backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF' }]}>
                      <Text style={[styles.subtleHighlightText, { color: '#2563EB' }]}>
                        {appliedApps.length} applied
                      </Text>
                    </View>

                    {/* Subtly Highlighted Allotted Pill */}
                    <View style={[styles.subtleHighlightPill, { backgroundColor: isDark ? 'rgba(22, 163, 74, 0.2)' : '#DCFCE7' }]}>
                      <Text style={[styles.subtleHighlightText, { color: '#16A34A' }]}>
                        {allottedApps.length} allotted
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
    overflow: 'hidden',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  segmentBarWrap: {
    paddingHorizontal: 10,
    borderBottomWidth: 0,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 16,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  emptyActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  emptyActionBtnPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  // Compact IPO Card (No Shadows, standard border)
  ipoCardNoShadow: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  ipoTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  ipoRegistrar: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconCircleBtnBigger: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  statCol: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontSize: 8.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  datesRowEvenlySpaced: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 8,
  },
  dateBadgeFlex: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dateText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  cardFooterCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  appsMetaRowSubtle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appsMetaTextLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  subtleHighlightPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  subtleHighlightText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
