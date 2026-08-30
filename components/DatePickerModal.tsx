import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  visible: boolean;
  value: string;          // ISO yyyy-MM-dd or ''
  label?: string;
  onConfirm: (iso: string) => void;
  onClose: () => void;
}

function isoToDate(iso: string): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

function dateToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function DatePickerModal({ visible, value, label, onConfirm, onClose }: Props) {
  const colors = useColors();
  const today = new Date();

  const initial = isoToDate(value || '');
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState<Date>(initial);

  // Reset view when modal opens with a new value
  React.useEffect(() => {
    if (visible) {
      const d = isoToDate(value || '');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setSelected(d);
    }
  }, [visible, value]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete final row
  while (cells.length % 7 !== 0) cells.push(null);

  const handleDay = (day: number) => {
    setSelected(new Date(viewYear, viewMonth, day));
  };

  const handleConfirm = () => {
    onConfirm(dateToISO(selected));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => {}}
        >
          {/* ── Header label ── */}
          {label ? (
            <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>{label}</Text>
          ) : null}

          {/* ── Month navigation ── */}
          <View style={[styles.monthRow, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={prevMonth} style={[styles.navBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7}>
              <Feather name="chevron-left" size={18} color={colors.foreground} />
            </TouchableOpacity>

            <Text style={[styles.monthTitle, { color: colors.foreground }]}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>

            <TouchableOpacity onPress={nextMonth} style={[styles.navBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7}>
              <Feather name="chevron-right" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* ── Day-of-week header ── */}
          <View style={styles.weekRow}>
            {DAYS_OF_WEEK.map((d) => (
              <Text key={d} style={[styles.weekLabel, { color: colors.mutedForeground }]}>
                {d}
              </Text>
            ))}
          </View>

          {/* ── Calendar grid ── */}
          <View style={styles.grid}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={styles.cell} />;
              }
              const cellDate = new Date(viewYear, viewMonth, day);
              const isSelected = sameDay(cellDate, selected);
              const isToday = sameDay(cellDate, today);

              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => handleDay(day)}
                  activeOpacity={0.75}
                  style={[
                    styles.cell,
                    isSelected && { backgroundColor: colors.primary, borderRadius: 12 },
                    !isSelected && isToday && { backgroundColor: colors.primary + '20', borderRadius: 12 },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: isSelected ? '#fff' : isToday ? colors.primary : colors.foreground },
                      isSelected && { fontFamily: 'GoogleSansFlex_700Bold' },
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Selected date display ── */}
          <View style={[styles.selectedBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="calendar" size={14} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.selectedText, { color: colors.foreground }]}>
              {selected.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>

          {/* ── Action buttons ── */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Feather name="check" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL_SIZE = 38;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  pickerLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 14,
  },

  // Month nav row
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },

  // Day of week header
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.5,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  cell: {
    width: `${100 / 7}%`,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  // Selected date bar
  selectedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  selectedText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_500Medium',
  },

  // Action buttons
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  confirmBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#fff',
  },
});
