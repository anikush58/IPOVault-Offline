import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { User } from '@/context/DBContext';

type Props = {
  user: User;
  applied: number;
  allotted: number;
  decided?: number;
  onEdit: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
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

export function UserCard({ user, applied, allotted, decided, onEdit, onDelete, onArchive, onUnarchive }: Props) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [expanded, setExpanded] = useState(false);

  const totalDecided = decided !== undefined ? decided : applied;
  const strikeRate = totalDecided > 0 ? Math.round((allotted / totalDecided) * 100) : null;

  const srColor =
    strikeRate == null
      ? colors.mutedForeground
      : strikeRate >= 60
      ? colors.positive
      : strikeRate >= 30
      ? colors.primary
      : colors.negative;

  const avatarGradient = getAvatarGradient(user.name || 'User');

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* ── Top row: avatar · name/PAN · soft action buttons ── */}
      <View style={styles.topRow}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={avatarGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}

        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={[styles.pan, { color: colors.mutedForeground }]} numberOfLines={1}>
            {user.pan_number ? `PAN: ${user.pan_number}` : 'No PAN'}
          </Text>
        </View>

        {/* Soft, non-harsh Action Buttons */}
        <View style={styles.actions}>
          {onArchive ? (
            <TouchableOpacity
              onPress={onArchive}
              activeOpacity={0.7}
              style={[styles.softActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
            >
              <Feather name="archive" size={14} color={isDark ? '#F8FAFC' : '#0F172A'} />
            </TouchableOpacity>
          ) : null}

          {onUnarchive ? (
            <TouchableOpacity
              onPress={onUnarchive}
              activeOpacity={0.7}
              style={[styles.softActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
            >
              <Feather name="rotate-ccw" size={14} color={isDark ? '#F8FAFC' : '#0F172A'} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={onEdit}
            activeOpacity={0.7}
            style={[styles.softActionBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF' }]}
          >
            <Feather name="edit-2" size={14} color="#3B82F6" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onDelete}
            activeOpacity={0.7}
            style={[styles.softActionBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' }]}
          >
            <Feather name="trash-2" size={14} color="#EF4444" />
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
            <View style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <Feather name="briefcase" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.foreground }]}>{user.broker}</Text>
            </View>
          ) : null}
          {user.client_id ? (
            <View style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <Feather name="folder" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.foreground }]}>ID: {user.client_id}</Text>
            </View>
          ) : null}
          {user.upi_id ? (
            <View style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <Feather name="credit-card" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.foreground }]}>{user.upi_id}</Text>
            </View>
          ) : null}
          {user.tpin ? (
            <View style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
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

      {/* ── Stats (collapsible) ── */}
      {expanded && (
        <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{applied}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Applied</Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.positive }]}>{allotted}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Allotted</Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: srColor }]}>
              {strikeRate != null ? `${strikeRate}%` : '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Strike Rate</Text>
          </View>
        </View>
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
  name: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  pan: { fontSize: 11.5, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2, letterSpacing: 0.2 },
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
  statValue: { fontSize: 14, fontFamily: 'SpaceMono_700Bold', letterSpacing: -0.3 },
  statLabel: { fontSize: 9.5, fontFamily: 'GoogleSansFlex_500Medium', letterSpacing: 0.4, textTransform: 'uppercase' },
});
