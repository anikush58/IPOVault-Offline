import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB, type User } from '@/context/DBContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

const BROKERS = ['Dhan', 'Upstox', 'Groww', 'Angel One', 'Fyers', 'Zerodha', 'HDFC Securities', 'ICICI Direct', 'Paytm Money'];

// ── Inline broker picker ──────────────────────────────────────────────────────

function BrokerPicker({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.pickerRow, styles.input, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        <Text style={{ color: value ? colors.foreground : colors.mutedForeground, fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, flex: 1 }}>
          {value || 'Select Broker'}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.pickerTitleRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitleText, { color: colors.foreground }]}>
                Select Broker
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: Math.max(Math.round(insets.bottom * 0.5), 8) }}>
              {BROKERS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                  style={[styles.pickerOption, { borderBottomColor: colors.border, backgroundColor: opt === value ? colors.surface : 'transparent' }]}
                >
                  <Text style={[styles.pickerOptionText, { color: opt === value ? colors.primary : colors.foreground }, opt === value && { fontFamily: 'GoogleSansFlex_600SemiBold' }]}>
                    {opt}
                  </Text>
                  {opt === value && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

type Props = { visible: boolean; user?: User | null; onClose: () => void };

export function AddUserModal({ visible, user, onClose }: Props) {
  const colors = useColors();
  const { addUser, updateUser } = useDB();
  const insets = useSafeAreaInsets();
  const isEditing = !!user;

  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [clientId, setClientId] = useState('');
  const [upiId, setUpiId] = useState('');
  const [tpin, setTpin] = useState('');
  const [broker, setBroker] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(user?.name ?? '');
      setPan(user?.pan_number ?? '');
      setClientId(user?.client_id ?? '');
      setUpiId(user?.upi_id ?? '');
      setTpin(user?.tpin ?? '');
      setBroker(user?.broker ?? '');
    }
  }, [user, visible]);

  const { showError } = useDialog();

  const handleSave = async () => {
    if (!name.trim()) { showError('Required', 'Please enter a name.'); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        pan_number: pan.trim().toUpperCase(),
        client_id: clientId.trim(),
        upi_id: upiId.trim().toLowerCase(),
        tpin,
        broker,
        upi_app: user?.upi_app ?? '',
        bank_name: user?.bank_name ?? '',
        default_amount_blocked: user?.default_amount_blocked ?? 0,
      };
      if (isEditing && user) await updateUser(user.id, data);
      else await addUser(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      showError('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior="height">
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 14, backgroundColor: colors.background }]}>
          <IconButton name="x" variant="surface" size="sm" onPress={onClose} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {isEditing ? 'Edit User' : 'Add User'}
          </Text>
          <Button
            variant="primary"
            size="sm"
            title="Save"
            loading={saving}
            disabled={saving}
            onPress={handleSave}
          />
        </View>

        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          {([
            { label: 'Full Name *', value: name, setter: setName, placeholder: 'e.g. Rahul Sharma', autoCapitalize: 'words' },
            { label: 'PAN Number', value: pan, setter: setPan, placeholder: 'AAAPD1234A', autoCapitalize: 'characters' },
            { label: 'Client ID / Demat Account', value: clientId, setter: setClientId, placeholder: '1208180111845464', autoCapitalize: 'none' },
            { label: 'UPI ID', value: upiId, setter: setUpiId, placeholder: 'name@okhdfcbank', autoCapitalize: 'none' },
            { label: 'TPIN', value: tpin, setter: setTpin, placeholder: '6-digit TPIN' },
          ] as any[]).map(({ label, value, setter, placeholder, autoCapitalize, secure }) => (
            <View key={label} style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                value={value}
                onChangeText={setter}
                placeholder={placeholder}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize={autoCapitalize ?? 'sentences'}
                secureTextEntry={secure}
              />
            </View>
          ))}

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Broker</Text>
            <BrokerPicker value={broker} onSelect={setBroker} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.2 },
  saveChip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  saveBtnText: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
  form: { paddingHorizontal: 20, paddingTop: 24 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_600SemiBold', marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  pickerSheet: { width: '85%', maxHeight: 380, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  pickerTitleRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  pickerTitleText: { fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold' },
  pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  pickerOptionText: { fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular', flex: 1 },
});
