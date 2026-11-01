import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from '@/components/ui/Icon';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignSystem } from '@/constants/DesignSystem';

import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB, type BankAccount } from '@/context/DBContext';
import { ScoopedBottomSheet } from '@/components/ui/ScoopedBottomSheet';

const IPO_LOT_COST = 15000;
const UPI_APPS = ['GPay', 'BHIM', 'PayTM', 'PhonePe', 'IDFC ASBA', 'BoB ASBA'];

export interface BankSheetProps {
  visible: boolean;
  bank: BankAccount | null; // null = add mode
  onClose: () => void;
  onSave: (name: string, balance: number, upiApp?: string) => void;
}

export const BankSheet = React.memo(function BankSheet({
  visible,
  bank,
  onClose,
  onSave,
}: BankSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isAdd = bank === null;
  const { bankAccounts } = useDB();

  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [upiApp, setUpiApp] = useState('');
  const isSavingRef = React.useRef(false);

  useEffect(() => {
    if (visible) {
      setName(bank?.bank_name ?? '');
      setBalance(bank ? String(bank.balance) : '');
      setUpiApp(bank?.upi_app ?? '');
      isSavingRef.current = false;
    }
  }, [visible, bank]);

  const { showError } = useDialog();

  const handleSave = () => {
    if (isSavingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showError('Required', 'Enter a bank name.');
      return;
    }
    const num = parseFloat(balance.replace(/,/g, ''));
    if (isNaN(num) || num < 0) {
      showError('Invalid', 'Enter a valid balance amount (₹0 or more).');
      return;
    }
    const isDup = bankAccounts.some(
      (b) => b.id !== bank?.id && b.bank_name.toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (isDup) {
      showError('Duplicate Bank', 'A bank account with that name already exists.');
      return;
    }
    isSavingRef.current = true;
    try {
      onSave(trimmed, num, upiApp);
    } finally {
      setTimeout(() => {
        isSavingRef.current = false;
      }, 600);
    }
  };

  if (!visible) return null;

  return (
    <ScoopedBottomSheet visible={visible} onClose={onClose} maxHeight="90%">
      {/* Sheet Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerTitleGroup}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {isAdd ? 'Add Bank Account' : 'Update Bank Account'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {isAdd
                ? 'Link capital & default UPI app for bidding'
                : 'Update balance & linked payment app'}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexShrink: 1, flexGrow: 0, minHeight: 0 }}>
        <ScrollView
          style={{ flexShrink: 1, flexGrow: 0 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>BANK NAME</Text>
            </View>
            <View style={[styles.inputWithIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TextInput
                style={[styles.inputInside, { color: colors.foreground }]}
                placeholder="e.g. HDFC Bank"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>CURRENT BALANCE (₹)</Text>
            </View>
            <View style={[styles.inputWithIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TextInput
                style={[styles.inputInside, { color: colors.foreground }]}
                placeholder="e.g. 75000"
                placeholderTextColor={colors.mutedForeground}
                value={balance}
                onChangeText={setBalance}
                keyboardType="decimal-pad"
                autoFocus={!isAdd}
              />
            </View>
          </View>

          {/* BIND DEFAULT UPI APP */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>
                BIND DEFAULT UPI APP (AUTO-SELECT IN BULK APPLY)
              </Text>
            </View>
            <View style={styles.chipsContainer}>
              {UPI_APPS.map((app) => {
                const isSelected = upiApp === app;
                return (
                  <TouchableOpacity
                    key={app}
                    onPress={() => {
                      try {
                        Haptics.selectionAsync();
                      } catch {}
                      setUpiApp(isSelected ? '' : app);
                    }}
                    style={[
                      styles.chip,
                      {
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary : colors.surface,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    {isSelected && (
                      <Icon
                        name="check"
                        size={12}
                        color={colors.primaryForeground}
                      />
                    )}
                    <Text
                      style={[
                        styles.chipText,
                        {
                          fontFamily: isSelected ? 'GoogleSansFlex_700Bold' : 'GoogleSansFlex_400Regular',
                          color: isSelected ? colors.primaryForeground : colors.foreground,
                        },
                      ]}
                    >
                      {app}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {balance.length > 0 && !isNaN(parseFloat(balance)) && (
            <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="trending-up" size={14} color={colors.primary} />
              <Text style={[styles.previewText, { color: colors.mutedForeground }]}>
                IPO capacity:{' '}
                <Text style={[styles.previewBold, { color: colors.primary }]}>
                  {Math.floor(parseFloat(balance) / IPO_LOT_COST)} lots
                </Text>{' '}
                at ₹{IPO_LOT_COST.toLocaleString()} each
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Footer CTA */}
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
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
            {isAdd ? 'Add Bank Account' : 'Save Details'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScoopedBottomSheet>
  );
});

// Alias export for backward compatibility
export const BankModal = BankSheet;

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
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepLabel: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  inputInside: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    paddingVertical: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  previewText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    flex: 1,
  },
  previewBold: {
    fontFamily: 'GoogleSansFlex_700Bold',
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
});
