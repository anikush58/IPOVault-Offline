import React, { useRef, useMemo, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB, type IPOListing } from '@/context/DBContext';
import { IconButton } from '@/components/ui/IconButton';
import { formatCurrency } from '@/utils/formatters';
import { SegmentedTabControl } from '@/components/ui/SegmentedTabControl';

type TabSegment = 'active' | 'favorites' | 'archived';

export default function IPOManagementScreen() {
  const colors = useColors();
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
    router.push('/add-ipo');
  };

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
      showSuccess(
        newArchived === 1 ? 'Archived' : 'Restored',
        `${ipo.ipo_name} has been ${newArchived === 1 ? 'archived' : 'restored to active listings'}.`
      );
    } catch {
      showError('Error', 'Failed to update archive status.');
    }
  };

  const handleDeleteIPO = async (ipo: IPOListing) => {
    try {
      await db.runAsync('UPDATE ipo_listings SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [ipo.id]);
      await refresh();
      showSuccess('Deleted', `${ipo.ipo_name} has been deleted.`);
    } catch {
      showError('Error', 'Failed to delete IPO record.');
    }
  };


  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Custom Single Header (No Double Navigation Bar) ── */}
      <View style={[styles.header, { paddingTop: topPad, height: topPad + 60, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.mutedForeground }]}>TRACK & MANAGE</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPOs</Text>
        </View>

        {/* header actions: search + add */}
        <View style={styles.headerActions}>
          <IconButton
            name={showSearch ? 'x' : 'search'}
            variant={showSearch ? 'primary' : 'surface'}
            size="md"
            onPress={toggleSearch}
          />
          <IconButton
            name="plus"
            variant="surface"
            size="md"
            onPress={openAddPage}
          />
        </View>
      </View>

      {/* ── Collapsible Search Bar ── */}
      {showSearch && (
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              ref={searchRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search IPOs by name or registrar…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground }]}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Sticky Segmented Tabs ── */}
      <View style={[styles.stickyTabs, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <SegmentedTabControl
          variant="primary"
          tabs={[
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'favorites', label: 'Favorites', icon: 'star', count: favCount },
            { key: 'archived', label: 'Archived', count: archivedCount },
          ]}
          activeTab={activeSegment}
          onChange={(newSeg) => setActiveSegment(newSeg as TabSegment)}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {/* ── Listings Count Eyebrow ── */}
        <Text style={[styles.listingsEyebrow, { color: colors.mutedForeground }]}>
          {filteredIPOs.length} LISTING{filteredIPOs.length !== 1 ? 'S' : ''}
        </Text>

        {filteredIPOs.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Multi-layered Icon Stack */}
            <View style={[styles.emptyIconCircleOuter, { backgroundColor: colors.primary + '14' }]}>
              <View style={[styles.emptyIconCircleInner, { backgroundColor: colors.primary + '28' }]}>
                <Feather
                  name={
                    searchQuery
                      ? 'search'
                      : activeSegment === 'favorites'
                      ? 'star'
                      : activeSegment === 'archived'
                      ? 'archive'
                      : 'layers'
                  }
                  size={32}
                  color={colors.primary}
                />
              </View>
            </View>

            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {searchQuery
                ? 'No Matching IPO Listings'
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

            {/* Action Buttons */}
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

            {/* Feature Highlights Card */}
            {!searchQuery && activeSegment === 'active' && (
              <View style={[styles.emptyTipsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.emptyTipRow}>
                  <View style={[styles.emptyTipBadge, { backgroundColor: colors.primary + '1C' }]}>
                    <Feather name="zap" size={14} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.emptyTipTitle, { color: colors.foreground }]}>Quick Auto-Fill</Text>
                    <Text style={[styles.emptyTipDesc, { color: colors.mutedForeground }]}>
                      Type any live company name to pre-fill price, lot size & registrar.
                    </Text>
                  </View>
                </View>

                <View style={[styles.emptyTipDivider, { backgroundColor: colors.border }]} />

                <View style={styles.emptyTipRow}>
                  <View style={[styles.emptyTipBadge, { backgroundColor: '#38A1691C' }]}>
                    <Feather name="users" size={14} color="#38A169" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.emptyTipTitle, { color: colors.foreground }]}>Bulk Applications</Text>
                    <Text style={[styles.emptyTipDesc, { color: colors.mutedForeground }]}>
                      Effortlessly apply for multiple user accounts from your created IPOs.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        ) : (
          filteredIPOs.map((ipo) => {
            const totalAmount = ipo.buy_price * ipo.quantity;
            const isArchivedRow = ipo.archived === 1;

            return (
              <View key={ipo.id} style={[styles.ipoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Header Row with Title & 3 Action Icons */}
                <View style={styles.cardHeaderRow}>
                  {/* Left Logo / Avatar */}
                  <View style={[styles.cardIconAvatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardAvatarText, { color: colors.foreground }]}>
                      {ipo.ipo_name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>

                  {/* Title & Subtitle */}
                  <View style={{ flex: 1, paddingRight: 4 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {ipo.ipo_name}
                    </Text>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {ipo.issue_type || 'Mainboard'}{ipo.registrar ? ` · ${ipo.registrar}` : ''}
                    </Text>
                  </View>

                  {/* 3 Header Action Icons: Edit, Archive/Unarchive, Favorite */}
                  <View style={styles.cardHeaderIconsRow}>
                    {!isArchivedRow ? (
                      <>
                        <TouchableOpacity
                          onPress={() => openEditPage(ipo)}
                          style={[styles.cardIconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          activeOpacity={0.7}
                          hitSlop={4}
                        >
                          <Feather name="edit-2" size={14} color={colors.foreground} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleToggleArchive(ipo)}
                          style={[styles.cardIconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          activeOpacity={0.7}
                          hitSlop={4}
                        >
                          <Feather name="archive" size={14} color={colors.foreground} />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          onPress={() => handleToggleArchive(ipo)}
                          style={[styles.cardIconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          activeOpacity={0.7}
                          hitSlop={4}
                        >
                          <Feather name="rotate-ccw" size={14} color={colors.foreground} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleDeleteIPO(ipo)}
                          style={[styles.cardIconButton, { backgroundColor: colors.destructiveBg, borderColor: colors.destructiveBg }]}
                          activeOpacity={0.7}
                          hitSlop={4}
                        >
                          <Feather name="trash-2" size={14} color={colors.destructive} />
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity
                      onPress={() => handleToggleFavorite(ipo)}
                      style={[
                        styles.cardIconButton,
                        {
                          backgroundColor: ipo.is_favorite === 1 ? colors.primary + '18' : colors.surface,
                          borderColor: ipo.is_favorite === 1 ? colors.primary : colors.border,
                        },
                      ]}
                      activeOpacity={0.7}
                      hitSlop={4}
                    >
                      <Feather
                        name="star"
                        size={14}
                        color={ipo.is_favorite === 1 ? colors.primary : colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Thin Horizontal Divider Line */}
                <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                {/* 3-Column Metrics Grid (Matching reference image bottom row) */}
                <View style={styles.cardMetricsGrid}>
                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Price / Lot</Text>
                    <Text style={[styles.metricVal, { color: colors.foreground }]}>
                      ₹{ipo.buy_price} × {ipo.quantity}
                    </Text>
                  </View>

                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Investment</Text>
                    <Text style={[styles.metricVal, { color: colors.foreground }]}>
                      {formatCurrency(totalAmount)}
                    </Text>
                  </View>

                  <View style={[styles.metricCol, { alignItems: 'flex-end' }]}>
                    <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Close Date</Text>
                    <Text style={[styles.metricVal, { color: colors.positive }]}>
                      {ipo.close_date || 'Active'}
                    </Text>
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
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1.2,
    color: '#D4A017',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: { fontSize: 28, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.6, lineHeight: 32 },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D4A017',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#D4A017',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  segmentBar: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  segmentPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  segmentPillActive: { backgroundColor: '#D4A017' },
  segmentText: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: '#718096' },
  segmentTextActive: { color: '#fff' },

  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  countBadgeText: { fontSize: 11, fontFamily: 'GoogleSansFlex_700Bold', color: '#4A5568' },

  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' },

  stickyTabs: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },

  listingsEyebrow: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  emptyContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIconCircleOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIconCircleInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptyActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#D4A017',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  emptyActionBtnPrimaryText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  emptyTipsBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 20,
    gap: 12,
  },
  emptyTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  emptyTipBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTipTitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  emptyTipDesc: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    lineHeight: 16,
  },
  emptyTipDivider: {
    height: 1,
    width: '100%',
  },

  // IPO Card (Matching reference design)
  ipoCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,

    // Soft drop shadow (reduced 50%)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIconAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarText: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    marginVertical: 14,
    width: '100%',
  },

  cardHeaderIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 3-Column Metrics Grid
  cardMetricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },

  // Modal Form Sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  formModalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', borderTopWidth: 1 },
  formModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  modalCloseCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4F5F7', alignItems: 'center', justifyContent: 'center' },
  formModalTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold' },
  formSavePill: { backgroundColor: '#D4A017', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  formSavePillText: { color: '#fff', fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },

  fieldLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.9, marginBottom: 4 },
  inputField: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' },
  autoFillBtn: { height: 46, borderWidth: 1, borderColor: '#D4A017', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  autoFillBtnText: { color: '#D4A017', fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold' },

  issueTypeGroup: { height: 46, flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, gap: 4, alignItems: 'center' },
  issueTypePill: { flex: 1, height: '100%', borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  issueTypePillActive: { backgroundColor: '#D4A017' },
  issueTypeText: { fontSize: 13, fontFamily: 'GoogleSansFlex_700Bold', color: '#718096' },
  issueTypeTextActive: { color: '#fff' },

  dateInputWrap: { height: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  dateInput: { flex: 1, height: '100%', fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' },
});
