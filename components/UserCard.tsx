import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { User } from '@/context/DBContext';
import { getCustomAvatarUrl } from '@/utils/avatarUtils';


type Props = {
  user: User;
  applied: number;
  allotted: number;
  decided?: number;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onArchive?: (user: User) => void;
  onUnarchive?: (user: User) => void;
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

export const UserCard = React.memo(function UserCard({
  user,
  applied,
  allotted,
  decided,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
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
  const [showPan, setShowPan] = useState(false);
  const [showTpin, setShowTpin] = useState(false);

  const customAvatarUrl = useMemo(
    () => getCustomAvatarUrl(user),
    [user.avatar_url, (user as any).avatarUrl]
  );

  useEffect(() => {
    setAvatarError(false);
  }, [customAvatarUrl]);

  const getMaskedPan = (pan: string) => {
    if (!pan || pan.length < 10) return pan;
    return `${pan.slice(0, 5)}••••${pan.slice(9)}`;
  };

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


  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {/* ── Top row: avatar · name/PAN · soft action buttons ── */}
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <LinearGradient
            colors={avatarGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          >
            <View style={styles.avatarInitialContainer}>
              <Text style={styles.avatarText}>
                {user.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          </LinearGradient>

          {customAvatarUrl && !avatarError ? (
            <Image
              source={{ uri: customAvatarUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={150}
              recyclingKey={user.id}
              onError={() => setAvatarError(true)}
            />
          ) : null}
        </View>

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
              {user.pan_number ? `PAN: ${showPan ? user.pan_number : getMaskedPan(user.pan_number)}` : 'No PAN'}
            </Text>
            {user.pan_number ? (
              <>
                <TouchableOpacity
                  onPress={() => setShowPan((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={showPan ? 'eye-off' : 'eye'}
                    size={12}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCopyPan}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
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
              </>
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
              { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF' },
            ]}
          >
            <Feather name="edit-2" size={14} color="#3B82F6" />
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
            <TouchableOpacity
              onPress={() => setShowTpin((v) => !v)}
              activeOpacity={0.7}
              style={[styles.chip, { backgroundColor: colors.badgeBg }]}
            >
              <Feather name={showTpin ? 'unlock' : 'lock'} size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.foreground, letterSpacing: showTpin ? 0.3 : 1 }]}>
                {showTpin ? `TPIN: ${user.tpin}` : 'TPIN: ••••'}
              </Text>
              <Feather
                name={showTpin ? 'eye-off' : 'eye'}
                size={10}
                color={colors.mutedForeground}
                style={{ marginLeft: 3 }}
              />
            </TouchableOpacity>
          ) : null}
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>



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
        </>
      )}
    </View>
  );
},
  (prev, next) => {
    return (
      prev.user.id === next.user.id &&
      prev.user.name === next.user.name &&
      prev.user.avatar_url === next.user.avatar_url &&
      (prev.user as any).avatarUrl === (next.user as any).avatarUrl &&
      prev.user.pan_number === next.user.pan_number &&
      prev.user.client_id === next.user.client_id &&
      prev.user.broker === next.user.broker &&
      prev.user.tpin === next.user.tpin &&
      prev.user.bank_name === next.user.bank_name &&
      prev.user.upi_app === next.user.upi_app &&
      prev.user.archived === next.user.archived &&
      prev.applied === next.applied &&
      prev.allotted === next.allotted &&
      prev.decided === next.decided &&
      prev.onEdit === next.onEdit &&
      prev.onDelete === next.onDelete &&
      prev.onArchive === next.onArchive &&
      prev.onUnarchive === next.onUnarchive
    );
  }
);

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
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  avatarInitialContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 50,
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
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
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
    borderRadius: 9999,
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
    fontFamily: 'GoogleSansFlex_700Bold',
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
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  invStatusBadgeText: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
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
    fontFamily: 'GoogleSansFlex_700Bold',
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
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});
