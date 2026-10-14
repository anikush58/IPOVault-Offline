import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/context/DialogContext';
import { useDB, type User } from '@/context/DBContext';
import { ScoopedBottomSheet } from '@/components/ui/ScoopedBottomSheet';
import { uploadImageToCloudinary } from '@/services/media/cloudinaryService';

const BROKERS = [
  'Groww',
  'Zerodha',
  'Angel One',
  'Upstox',
  'ICICI Direct',
  'Dhan',
  'HDFC Sky',
  'Kotak Securities',
  'Motilal Oswal',
  'Paytm Money',
  '5paisa',
  'Fyers',
  'Sharekhan',
  'Axis Direct',
  'SBI Securities',
  'IIFL Securities',
  'Alice Blue',
  'Geojit',
  'Anand Rathi',
  'SMC Global',
  'Espresso',
  'Choice Broking',
  'Religare Broking',
  'Mastertrust',
  'Millions',
  'Sahi',
  'Other',
];

type Props = {
  visible: boolean;
  user?: User | null;
  onClose: () => void;
};

export function AddUserModal({ visible, user, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { addUser, updateUser } = useDB();
  const { showError } = useDialog();

  const isEditing = !!user;

  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [clientId, setClientId] = useState('');
  const [upiId, setUpiId] = useState('');
  const [tpin, setTpin] = useState('');
  const [broker, setBroker] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [brokerSearch, setBrokerSearch] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
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
      setShowBrokerModal(false);
      setBrokerSearch('');
      setIsUploadingAvatar(false);
    }
  }, [user, visible]);

  const filteredBrokers = React.useMemo(() => {
    if (!brokerSearch.trim()) return BROKERS;
    const q = brokerSearch.trim().toLowerCase();
    return BROKERS.filter((b) => b.toLowerCase().includes(q));
  }, [brokerSearch]);

  const pickAvatarImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setIsUploadingAvatar(true);
        try {
          let uriToUpload = asset.uri;
          if (Platform.OS === 'web' && asset.file) {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(asset.file as File);
            });
            uriToUpload = dataUrl;
          }
          const uploadRes = await uploadImageToCloudinary(uriToUpload);
          setAvatarUrl(uploadRes.secureUrl);
          try {
            Haptics.selectionAsync();
          } catch {}
        } catch (uploadErr: any) {
          if (__DEV__) console.warn('[AddUserModal] Cloudinary avatar upload error:', uploadErr);
          showError(
            'Upload Failed',
            uploadErr?.message || 'Failed to upload avatar to Cloudinary. Please try again.',
          );
        } finally {
          setIsUploadingAvatar(false);
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('Failed to pick avatar image:', err);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showError('Required', 'Please enter a full name.');
      return;
    }
    setSaving(true);
    try {
      const trimmedAvatarUrl = avatarUrl ? avatarUrl.trim() : '';

      const data = {
        name: name.trim(),
        pan_number: pan.trim().toUpperCase(),
        client_id: clientId.trim(),
        upi_id: upiId.trim().toLowerCase(),
        tpin: tpin.trim(),
        broker: broker.trim(),
        upi_app: user?.upi_app ?? '',
        bank_name: user?.bank_name ?? '',
        avatar_url: trimmedAvatarUrl,
        avatarUrl: trimmedAvatarUrl,
        default_amount_blocked: user?.default_amount_blocked ?? 0,
      };

      if (isEditing && user) {
        await updateUser(user.id, data);
      } else {
        await addUser(data);
      }
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      onClose();
    } catch (err: any) {
      if (__DEV__) console.error('[AddUserModal] Save user error:', err);
      showError('Error', 'Failed to save user. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <ScoopedBottomSheet visible={visible} onClose={onClose} maxHeight="92%">
        {/* Sheet Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleGroup}>
            <View style={[styles.headerIconWrap, { backgroundColor: colors.primary + '18' }]}>
              <Feather
                name={isEditing ? 'user-check' : 'user-plus'}
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {isEditing ? 'Edit User Profile' : 'Add New User'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {isEditing
                  ? 'Update Demat, PAN and payment credentials'
                  : 'Manage applications and multi-account allotments'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flex: 1, minHeight: 0 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* User Avatar Section */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrap}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={[styles.avatarImage, { borderColor: colors.border }]}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarPlaceholder,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Feather name="user" size={24} color={colors.mutedForeground} />
                  </View>
                )}
              </View>

              <View style={styles.avatarActions}>
                <TouchableOpacity
                  onPress={pickAvatarImage}
                  disabled={isUploadingAvatar}
                  style={[
                    styles.avatarBtn,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: isUploadingAvatar ? 0.7 : 1,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  {isUploadingAvatar ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Feather name="camera" size={14} color={colors.primary} />
                  )}
                  <Text style={[styles.avatarBtnText, { color: colors.foreground }]}>
                    {isUploadingAvatar
                      ? 'Uploading...'
                      : avatarUrl
                        ? 'Change Photo'
                        : 'Upload Photo'}
                  </Text>
                </TouchableOpacity>

                {avatarUrl && !isUploadingAvatar && (
                  <TouchableOpacity
                    onPress={() => setAvatarUrl('')}
                    style={[styles.avatarRemoveBtn, { backgroundColor: colors.destructiveBg }]}
                    activeOpacity={0.8}
                  >
                    <Feather name="trash-2" size={13} color={colors.destructive} />
                    <Text style={[styles.avatarRemoveText, { color: colors.destructive }]}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Form Fields */}
            <View style={styles.fieldsContainer}>
              {/* Full Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  Full Name <Text style={{ color: colors.destructive }}>*</Text>
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      color: colors.foreground,
                    },
                  ]}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Rahul Sharma"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                />
              </View>

              {/* PAN Number */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  PAN Number
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.monoInput,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      color: colors.foreground,
                    },
                  ]}
                  value={pan}
                  onChangeText={(v) => setPan(v.toUpperCase())}
                  placeholder="ABCDE1234F"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  maxLength={10}
                />
              </View>

              {/* Client ID / Demat */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  Client ID / Demat Account
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.monoInput,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      color: colors.foreground,
                    },
                  ]}
                  value={clientId}
                  onChangeText={setClientId}
                  placeholder="e.g. 1208180111845464"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                />
              </View>

              {/* UPI ID */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  UPI ID (For ASBA Mandate)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      color: colors.foreground,
                    },
                  ]}
                  value={upiId}
                  onChangeText={(v) => setUpiId(v.toLowerCase())}
                  placeholder="e.g. name@okhdfcbank"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              {/* TPIN */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  CDSL / NSDL TPIN
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.monoInput,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      color: colors.foreground,
                    },
                  ]}
                  value={tpin}
                  onChangeText={setTpin}
                  placeholder="6-digit CDSL TPIN"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              {/* Broker Picker Button */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  Primary Broker
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    try {
                      Haptics.selectionAsync();
                    } catch {}
                    setShowBrokerModal(true);
                  }}
                  style={[
                    styles.pickerButton,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.pickerButtonText,
                      { color: broker ? colors.foreground : colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
                    {broker || 'Select Broker...'}
                  </Text>
                  <Feather
                    name="chevron-down"
                    size={16}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Sticky Bottom Save Action Bar */}
        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 6,
            },
          ]}
        >
          <TouchableOpacity
            onPress={handleSave}
            style={[
              styles.saveBtn,
              {
                backgroundColor: colors.primary,
                opacity: saving || isUploadingAvatar ? 0.7 : 1,
              },
            ]}
            activeOpacity={0.85}
            disabled={saving || isUploadingAvatar}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
                {isEditing ? 'Save Changes' : 'Create User Profile'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScoopedBottomSheet>

      {/* Primary Broker Selection Modal Dialog */}
      <Modal
        visible={showBrokerModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowBrokerModal(false)}
      >
        <TouchableOpacity
          style={styles.brokerModalOverlay}
          activeOpacity={1}
          onPress={() => setShowBrokerModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.brokerModalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.brokerModalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.brokerModalTitleGroup}>
                <View style={[styles.brokerIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Feather name="briefcase" size={16} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.brokerModalTitle, { color: colors.foreground }]}>
                    Select Primary Broker
                  </Text>
                  <Text style={[styles.brokerModalSubtitle, { color: colors.mutedForeground }]}>
                    Choose from major Indian brokers
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowBrokerModal(false)}
                hitSlop={8}
                style={styles.closeBtn}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Broker Search Filter Box */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
              <View
                style={[
                  styles.searchBox,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <TextInput
                  placeholder="Search broker name..."
                  placeholderTextColor={colors.mutedForeground}
                  value={brokerSearch}
                  onChangeText={setBrokerSearch}
                  style={[styles.searchInput, { color: colors.foreground }]}
                  autoCapitalize="none"
                />
                {brokerSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setBrokerSearch('')} hitSlop={6}>
                    <Feather name="x" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView
              style={{ maxHeight: 340 }}
              contentContainerStyle={{ paddingVertical: 4 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {filteredBrokers.map((opt) => {
                const isSelected = opt === broker;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => {
                      try {
                        Haptics.selectionAsync();
                      } catch {}
                      setBroker(opt);
                      setShowBrokerModal(false);
                    }}
                    style={[
                      styles.brokerOptionRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected
                          ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF')
                          : 'transparent',
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.brokerOptionText,
                        {
                          color: isSelected ? colors.primary : colors.foreground,
                          fontFamily: isSelected
                            ? 'GoogleSansFlex_700Bold'
                            : 'GoogleSansFlex_400Regular',
                        },
                      ]}
                    >
                      {opt}
                    </Text>
                    {isSelected && (
                      <Feather name="check" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
              {filteredBrokers.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular' }}>
                    No matching brokers found
                  </Text>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
    lineHeight: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  avatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatarBtnText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  avatarRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
  },
  avatarRemoveText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  fieldsContainer: {
    gap: 14,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    minHeight: 46,
  },
  monoInput: {
    fontFamily: 'SpaceMono',
    letterSpacing: 0.5,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 46,
  },
  pickerButtonText: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    minHeight: 48,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.1,
  },
  brokerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  brokerModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  brokerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  brokerModalTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  brokerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brokerModalTitle: {
    fontSize: 16,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.2,
  },
  brokerModalSubtitle: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_400Regular',
    padding: 0,
  },
  brokerOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 0.5,
  },
  brokerOptionText: {
    fontSize: 14.5,
  },
});
