import React, { useEffect, useState } from 'react';
import {
  Image,
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
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB, type User } from '@/context/DBContext';

const BROKERS = ['Dhan', 'Upstox', 'Groww', 'Angel One', 'Fyers', 'Zerodha', 'HDFC Securities', 'ICICI Direct', 'Paytm Money'];

function BrokerPicker({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.pickerRow, styles.input, { borderColor: colors.border, backgroundColor: colors.surface }]}
        activeOpacity={0.8}
      >
        <Text style={{ color: value ? colors.foreground : colors.mutedForeground, fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, flex: 1 }} numberOfLines={1}>
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

type Props = { visible: boolean; user?: User | null; onClose: () => void };

export function AddUserModal({ visible, user, onClose }: Props) {
  const colors = useColors();
  const { addUser, updateUser } = useDB();
  const isEditing = !!user;

  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [clientId, setClientId] = useState('');
  const [upiId, setUpiId] = useState('');
  const [tpin, setTpin] = useState('');
  const [broker, setBroker] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(user?.name ?? '');
      setPan(user?.pan_number ?? '');
      setClientId(user?.client_id ?? '');
      setUpiId(user?.upi_id ?? '');
      setTpin(user?.tpin ?? '');
      setBroker(user?.broker ?? '');
      setAvatarUrl(user?.avatar_url ?? '');
    }
  }, [user, visible]);

  const { showError } = useDialog();

  const pickAvatarImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAvatarUrl(result.assets[0].uri);
        Haptics.selectionAsync();
      }
    } catch (err) {
      if (__DEV__) console.warn('Failed to pick avatar image:', err);
    }
  };

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
        avatar_url: avatarUrl,
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

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.centerModalOverlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', alignItems: 'center' }}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {}}
          >
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {isEditing ? 'Edit User' : 'Add User'}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Single Column Form Container */}
            <View style={styles.formContainer}>
              {([
                { label: 'Full Name *', value: name, setter: setName, placeholder: 'e.g. Rahul Sharma', autoCapitalize: 'words' },
                { label: 'PAN Number', value: pan, setter: setPan, placeholder: 'AAAPD1234A', autoCapitalize: 'characters' },
                { label: 'Client ID / Demat Account', value: clientId, setter: setClientId, placeholder: '1208180111845464', autoCapitalize: 'none' },
                { label: 'UPI ID', value: upiId, setter: setUpiId, placeholder: 'name@okhdfcbank', autoCapitalize: 'none' },
                { label: 'TPIN', value: tpin, setter: setTpin, placeholder: '6-digit TPIN', keyboardType: 'numeric' },
              ] as any[]).map(({ label, value, setter, placeholder, autoCapitalize, secure, keyboardType }) => (
                <View key={label}>
                  <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border + '40', backgroundColor: colors.surface, color: colors.foreground }]}
                    value={value}
                    onChangeText={setter}
                    placeholder={placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize={autoCapitalize ?? 'sentences'}
                    keyboardType={keyboardType}
                    secureTextEntry={secure}
                  />
                </View>
              ))}

              <View>
                <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>BROKER</Text>
                <BrokerPicker value={broker} onSelect={setBroker} />
              </View>

              {/* USER AVATAR UPLOAD */}
              <View>
                <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>USER AVATAR</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="user" size={20} color={colors.mutedForeground} />
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={pickAvatarImage}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
                    activeOpacity={0.8}
                  >
                    <Feather name="upload" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold', color: colors.foreground }}>
                      {avatarUrl ? 'Change Avatar' : 'Upload Avatar'}
                    </Text>
                  </TouchableOpacity>

                  {avatarUrl ? (
                    <TouchableOpacity
                      onPress={() => setAvatarUrl('')}
                      style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.destructiveBg }}
                      activeOpacity={0.8}
                    >
                      <Feather name="trash-2" size={13} color={colors.destructive} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <TouchableOpacity onPress={handleSave} style={styles.goldBtn} activeOpacity={0.8} disabled={saving}>
                <Text style={styles.goldBtnText}>{saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add User')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.3 },
  closeBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  formContainer: { padding: 20, gap: 12 },
  stepLabel: { fontSize: 10, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    minHeight: 44,
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  pickerSheet: { width: '85%', maxHeight: 380, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  pickerTitleRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  pickerTitleText: { fontSize: 16, fontFamily: 'GoogleSansFlex_700Bold' },
  pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  pickerOptionText: { fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular', flex: 1 },
  goldBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  goldBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: 0.1 },
});
