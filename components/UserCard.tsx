import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { IconButton } from '@/components/ui/IconButton';
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

export function UserCard({ user, applied, allotted, decided, onEdit, onDelete, onArchive, onUnarchive }: Props) {
  const colors = useColors();
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

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* ── Top row: avatar · name/PAN · edit/delete ── */}
      <View style={styles.topRow}>
        <LinearGradient
          colors={['#C49346', '#A67C3A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
        </LinearGradient>

        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.foreground }]}>{user.name}</Text>
          <Text style={[styles.pan, { color: colors.mutedForeground }]}>
            {user.pan_number || 'No PAN'}
          </Text>
        </View>

        <View style={styles.actions}>
          {onArchive ? (
            <IconButton name="archive" variant="primary" size="sm" onPress={onArchive} />
          ) : null}
          {onUnarchive ? (
            <IconButton name="rotate-ccw" variant="primary" size="sm" onPress={onUnarchive} />
          ) : null}
          <IconButton name="edit-2" variant="primary" size="sm" onPress={onEdit} />
          <IconButton name="trash-2" variant="destructive" size="sm" onPress={onDelete} />
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
            <View style={[styles.chip, { backgroundColor: colors.surface }]}>
              <Feather name="briefcase" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.secondaryForeground }]}>{user.broker}</Text>
            </View>
          ) : null}
          {user.client_id ? (
            <View style={[styles.chip, { backgroundColor: colors.surface }]}>
              <Feather name="folder" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.secondaryForeground }]}>ID: {user.client_id}</Text>
            </View>
          ) : null}
          {user.upi_id ? (
            <View style={[styles.chip, { backgroundColor: colors.surface }]}>
              <Feather name="credit-card" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.secondaryForeground }]}>{user.upi_id}</Text>
            </View>
          ) : null}
          {user.tpin ? (
            <View style={[styles.chip, { backgroundColor: colors.surface }]}>
              <Feather name="lock" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.secondaryForeground }]}>
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
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', color: '#fff' },
  info: { flex: 1 },
  name: { fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  pan: { fontSize: 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 2, letterSpacing: 0.3 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metaExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', flex: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  chipText: { fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium' },

  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    gap: 3,
  },
  statSep: { width: 1, alignSelf: 'stretch' },
  statValue: { fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  statLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_500Medium', letterSpacing: 0.4, textTransform: 'uppercase' },
});
