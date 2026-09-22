import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { User } from '@/context/DBContext';
import { getEffectiveAvatarUrl } from '@/utils/avatarUtils';
import {
  BrokerAccountItem,
  DerivedInvestmentSummary,
  getCanonicalBroker,
} from '@/services/broker/BrokerApiService';

type Props = {
  user: User;
  applied: number;
  allotted: number;
  decided?: number;
  brokerAccount?: BrokerAccountItem | null;
  investments?: DerivedInvestmentSummary[];
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onArchive?: (user: User) => void;
  onUnarchive?: (user: User) => void;
  onConnectBroker?: (user: User) => void;
  onDisconnectBroker?: (user: User, accountId: string) => void;
  onSyncBroker?: (user: User, accountId: string) => void;
  isBrokerActionLoading?: boolean;
};

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

export function UserCard({
  user,
  applied,
  allotted,
  decided,
  brokerAccount,
  investments,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  onConnectBroker,
  onDisconnectBroker,
  onSyncBroker,
  isBrokerActionLoading,
}: Props) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [expanded, setExpanded] = useState(false);

  const totalDecided = decided !== undefined ? decided : applied;
  const strikeRate =
    totalDecided > 0 ? Math.round((allotted / totalDecided) * 100) : null;

  const srColor =
    strikeRate == null
      ? colors.mutedForeground
      : strikeRate >= 60
      ? colors.positive
      : strikeRate >= 30
      ? colors.primary
      : colors.negative;

  const [avatarError, setAvatarError] = useState(false);
  const [copiedPan, setCopiedPan] = useState(false);

  const effectiveAvatarUrl = getEffectiveAvatarUrl(user);

  useEffect(() => {
    setAvatarError(false);
  }, [effectiveAvatarUrl]);

  const handleCopyPan = async () => {
    if (!user.pan_number) return;
    try {
      Clipboard.setString(user.pan_number);
      try {
        Haptics.selectionAsync();
      } catch {}
      setCopiedPan(true);
      setTimeout(() => setCopiedPan(false), 2000);
    } catch {}
  };

  const avatarGradient = getAvatarGradient(user.name || 'User');
  const canonicalBroker = getCanonicalBroker(user.broker);

  const connectionStatus =
    brokerAccount?.connection?.status === 'CONNECTED'
      ? 'CONNECTED'
      : brokerAccount?.connection?.status === 'EXPIRED'
      ? 'EXPIRED'
      : 'NOT_CONNECTED';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {/* ── Top row: avatar · name/PAN · soft action buttons ── */}
      <View style={styles.topRow}>
        {effectiveAvatarUrl && !avatarError ? (
          <Image
            source={{ uri: effectiveAvatarUrl }}
            style={styles.avatar}
            resizeMode="cover"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <LinearGradient
            colors={avatarGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>
              {user.name.charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
        )}

        <View style={styles.info}>
          <Text
            style={[styles.name, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {user.name}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 2,
            }}
          >
            <Text
              style={[
                styles.pan,
                { color: colors.mutedForeground, marginTop: 0 },
              ]}
              numberOfLines={1}
            >
              {user.pan_number ? `PAN: ${user.pan_number}` : 'No PAN'}
            </Text>
            {user.pan_number ? (
              <TouchableOpacity
                onPress={handleCopyPan}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Feather
                  name={copiedPan ? 'check' : 'copy'}
                  size={12}
                  color={
                    copiedPan
                      ? isDark
                        ? '#34D399'
                        : '#059669'
                      : colors.mutedForeground
                  }
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Soft, non-harsh Action Buttons */}
        <View style={styles.actions}>
          {onArchive ? (
            <TouchableOpacity
              onPress={() => onArchive(user)}
              activeOpacity={0.7}
              style={[styles.softActionBtn, { backgroundColor: colors.softBtnBg }]}
            >
              <Feather name="archive" size={14} color={colors.foreground} />
            </TouchableOpacity>
          ) : null}

          {onUnarchive ? (
            <TouchableOpacity
              onPress={() => onUnarchive(user)}
              activeOpacity={0.7}
              style={[styles.softActionBtn, { backgroundColor: colors.softBtnBg }]}
            >
              <Feather name="rotate-ccw" size={14} color={colors.foreground} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={() => onEdit(user)}
            activeOpacity={0.7}
            style={[
              styles.softActionBtn,
              { backgroundColor: colors.statusAppliedBg },
            ]}
          >
            <Feather name="edit-2" size={14} color={colors.statusApplied} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onDelete(user)}
            activeOpacity={0.7}
            style={[styles.softActionBtn, { backgroundColor: colors.negativeBg }]}
          >
            <Feather name="trash-2" size={14} color={colors.negative} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Bottom row: broker chip (left) · chevron (right) ── tap to expand ── */}
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        style={styles.metaExpandRow}
      >
        <View style={styles.chips}>
          {user.broker ? (
            <View style={[styles.chip, { backgroundColor: colors.badgeBg }]}>
              <Feather
                name="briefcase"
                size={11}
                color={colors.mutedForeground}
              />
              <Text style={[styles.chipText, { color: colors.foreground }]}>
                {user.broker}
              </Text>
            </View>
          ) : null}
          {user.client_id ? (
            <View style={[styles.chip, { backgroundColor: colors.badgeBg }]}>
              <Feather name="folder" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.foreground }]}>
                Demat: {user.client_id}
              </Text>
            </View>
          ) : null}
          {user.upi_id ? (
            <View style={[styles.chip, { backgroundColor: colors.badgeBg }]}>
              <Feather
                name="credit-card"
                size={11}
                color={colors.mutedForeground}
              />
              <Text style={[styles.chipText, { color: colors.foreground }]}>
                {user.upi_id}
              </Text>
            </View>
          ) : null}
          {user.tpin ? (
            <View style={[styles.chip, { backgroundColor: colors.badgeBg }]}>
              <Feather name="lock" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.foreground }]}>
                {user.tpin}
              </Text>
            </View>
          ) : null}
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>

      {/* ── Broker Connection & Sync Bar (When supported broker is assigned) ── */}
      {canonicalBroker && (
        <View
          style={[
            styles.brokerSection,
            {
              borderTopColor: colors.border,
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.02)'
                : 'rgba(0, 0, 0, 0.015)',
            },
          ]}
        >
          <View style={styles.brokerStatusLeft}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    connectionStatus === 'CONNECTED'
                      ? colors.positive
                      : connectionStatus === 'EXPIRED'
                      ? '#F59E0B'
                      : colors.mutedForeground,
                },
              ]}
            />
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    connectionStatus === 'CONNECTED'
                      ? isDark
                        ? 'rgba(52, 211, 153, 0.15)'
                        : 'rgba(5, 150, 105, 0.1)'
                      : connectionStatus === 'EXPIRED'
                      ? isDark
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(217, 119, 6, 0.1)'
                      : colors.badgeBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color:
                      connectionStatus === 'CONNECTED'
                        ? colors.positive
                        : connectionStatus === 'EXPIRED'
                        ? '#F59E0B'
                        : colors.mutedForeground,
                  },
                ]}
              >
                {connectionStatus === 'CONNECTED'
                  ? 'Connected'
                  : connectionStatus === 'EXPIRED'
                  ? 'Expired'
                  : 'Not Connected'}
              </Text>
            </View>
          </View>

          <View style={styles.brokerActionsRight}>
            {isBrokerActionLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : connectionStatus === 'CONNECTED' ? (
              <>
                <TouchableOpacity
                  onPress={() =>
                    onSyncBroker &&
                    brokerAccount &&
                    onSyncBroker(user, brokerAccount.id)
                  }
                  style={[
                    styles.brokerActionBtn,
                    { backgroundColor: colors.softBtnBg },
                  ]}
                  activeOpacity={0.7}
                >
                  <Feather name="refresh-cw" size={11} color={colors.primary} />
                  <Text
                    style={[
                      styles.brokerActionBtnText,
                      { color: colors.primary },
                    ]}
                  >
                    Sync Now
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    onDisconnectBroker &&
                    brokerAccount &&
                    onDisconnectBroker(user, brokerAccount.id)
                  }
                  style={[
                    styles.brokerActionBtn,
                    { backgroundColor: colors.negativeBg },
                  ]}
                  activeOpacity={0.7}
                >
                  <Feather name="power" size={11} color={colors.negative} />
                  <Text
                    style={[
                      styles.brokerActionBtnText,
                      { color: colors.negative },
                    ]}
                  >
                    Disconnect
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => onConnectBroker && onConnectBroker(user)}
                style={[
                  styles.brokerActionBtn,
                  { backgroundColor: colors.primary },
                ]}
                activeOpacity={0.8}
              >
                <Feather
                  name="link-2"
                  size={11}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.brokerActionBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Connect
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Stats (collapsible) ── */}
      {expanded && (
        <>
          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {applied}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Applied
              </Text>
            </View>
            <View style={[styles.statSep, { backgroundColor: colors.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: colors.positive }]}>
                {allotted}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Allotted
              </Text>
            </View>
            <View style={[styles.statSep, { backgroundColor: colors.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: srColor }]}>
                {strikeRate != null ? `${strikeRate}%` : '—'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Strike Rate
              </Text>
            </View>
          </View>

          {/* ── IPO Investment Status (Broker Synced) ── */}
          {investments && investments.length > 0 && (
            <View
              style={[
                styles.investmentsSection,
                {
                  borderTopColor: colors.border,
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.015)'
                    : 'rgba(0, 0, 0, 0.01)',
                },
              ]}
            >
              <View style={styles.investmentsHeaderRow}>
                <Feather
                  name="trending-up"
                  size={12}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.investmentsTitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  IPO INVESTMENTS ({investments.length})
                </Text>
              </View>

              {investments.map((inv, idx) => {
                const isHolding = inv.status === 'HOLDING';
                const isPartiallySold = inv.status === 'PARTIALLY_SOLD';
                const statusLabel = isHolding
                  ? 'Holding'
                  : isPartiallySold
                  ? 'Partially Sold'
                  : 'Fully Sold';
                const statusColor = isHolding
                  ? colors.positive
                  : isPartiallySold
                  ? '#F59E0B'
                  : colors.mutedForeground;

                return (
                  <View
                    key={`${inv.ipoId}-${idx}`}
                    style={[
                      styles.investmentCard,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.03)'
                          : 'rgba(0, 0, 0, 0.02)',
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* Header: IPO Name & Status Badge */}
                    <View style={styles.invCardHeader}>
                      <Text
                        style={[
                          styles.invCardName,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {inv.ipoName || inv.symbol || 'IPO Investment'}
                      </Text>
                      <View
                        style={[
                          styles.invStatusBadge,
                          {
                            backgroundColor: isHolding
                              ? isDark
                                ? 'rgba(52, 211, 153, 0.15)'
                                : 'rgba(5, 150, 105, 0.1)'
                              : isPartiallySold
                              ? isDark
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(217, 119, 6, 0.1)'
                              : colors.badgeBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.invStatusBadgeText,
                            { color: statusColor },
                          ]}
                        >
                          {statusLabel}
                        </Text>
                      </View>
                    </View>

                    {/* Quantities Row: Allotted | Sold | Remaining */}
                    <View style={styles.invQuantitiesRow}>
                      <View style={styles.invQtyItem}>
                        <Text
                          style={[
                            styles.invQtyLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Allotted
                        </Text>
                        <Text
                          style={[
                            styles.invQtyVal,
                            { color: colors.foreground },
                          ]}
                        >
                          {inv.allottedQuantity}
                        </Text>
                      </View>
                      <View style={styles.invQtyItem}>
                        <Text
                          style={[
                            styles.invQtyLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Sold
                        </Text>
                        <Text
                          style={[
                            styles.invQtyVal,
                            { color: colors.foreground },
                          ]}
                        >
                          {inv.totalSoldQuantity}
                        </Text>
                      </View>
                      <View style={styles.invQtyItem}>
                        <Text
                          style={[
                            styles.invQtyLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Remaining
                        </Text>
                        <Text
                          style={[
                            styles.invQtyVal,
                            {
                              color:
                                inv.remainingQuantity > 0
                                  ? colors.positive
                                  : colors.mutedForeground,
                            },
                          ]}
                        >
                          {inv.remainingQuantity}
                        </Text>
                      </View>
                    </View>

                    {/* Live Holding Price & Value (when still held) */}
                    {inv.remainingQuantity > 0 && inv.holding && (
                      <View
                        style={[
                          styles.invHoldingRow,
                          {
                            borderTopColor: colors.border,
                            backgroundColor: isDark
                              ? 'rgba(255, 255, 255, 0.02)'
                              : 'rgba(0, 0, 0, 0.015)',
                          },
                        ]}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Text
                            style={[
                              styles.invPriceLabel,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            Price:
                          </Text>
                          <Text
                            style={[
                              styles.invPriceVal,
                              { color: colors.foreground },
                            ]}
                          >
                            {inv.holding.lastPrice != null
                              ? `₹${inv.holding.lastPrice.toFixed(2)}`
                              : '—'}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Text
                            style={[
                              styles.invPriceLabel,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            Value:
                          </Text>
                          <Text
                            style={[
                              styles.invPriceVal,
                              { color: colors.foreground },
                            ]}
                          >
                            {inv.holding.currentValue != null
                              ? `₹${Math.round(
                                  inv.holding.currentValue,
                                ).toLocaleString('en-IN')}`
                              : '—'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
  info: { flex: 1 },
  name: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  pan: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  actions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  softActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipText: { fontSize: 11.5, fontFamily: 'GoogleSansFlex_500Medium' },
  brokerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  brokerStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.1,
  },
  brokerActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brokerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  brokerActionBtnText: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  statSep: { width: 1, alignSelf: 'stretch' },
  statValue: {
    fontSize: 14,
    fontFamily: 'SpaceMono_700Bold',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_500Medium',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  investmentsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  investmentsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  investmentsTitle: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  investmentCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  invCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  invCardName: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    flex: 1,
    marginRight: 8,
  },
  invStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  invStatusBadgeText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  invQuantitiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  invQtyItem: {
    alignItems: 'flex-start',
    gap: 1,
  },
  invQtyLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  invQtyVal: {
    fontSize: 12.5,
    fontFamily: 'SpaceMono_700Bold',
  },
  invHoldingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  invPriceLabel: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  invPriceVal: {
    fontSize: 11.5,
    fontFamily: 'SpaceMono_700Bold',
  },
});
