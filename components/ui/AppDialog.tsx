import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Button } from './Button';

export type DialogType = 'confirm' | 'success' | 'error' | 'info';

export interface AppDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;
}

export function AppDialog({
  visible,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
  onClose,
}: AppDialogProps) {
  const colors = useColors();
  const animFade = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(animFade, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(animScale, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(animFade, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(animScale, {
          toValue: 0.94,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, animFade, animScale]);

  if (!visible) return null;

  const handleDismiss = () => {
    onCancel ? onCancel() : onClose ? onClose() : null;
  };

  const handleConfirmAction = async () => {
    if (onConfirm) {
      await onConfirm();
    }
    if (onClose) {
      onClose();
    }
  };

  const getIconConfig = () => {
    switch (type) {
      case 'success':
        return { name: 'check-circle', color: '#22C55E', bg: '#22C55E1A' };
      case 'error':
        return { name: 'alert-circle', color: colors.destructive, bg: colors.destructiveBg };
      case 'info':
        return { name: 'info', color: colors.primary, bg: colors.primary + '1A' };
      case 'confirm':
      default:
        return isDanger
          ? { name: 'alert-triangle', color: colors.destructive, bg: colors.destructiveBg }
          : { name: 'help-circle', color: colors.primary, bg: colors.primary + '1A' };
    }
  };

  const iconConfig = getIconConfig();

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={type === 'confirm' ? handleDismiss : handleConfirmAction}>
          <Animated.View style={[styles.backdrop, { opacity: animFade }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.dialogCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: animFade,
              transform: [{ scale: animScale }],
            },
          ]}
        >
          {/* Icon Badge */}
          <View style={[styles.iconWrap, { backgroundColor: iconConfig.bg }]}>
            <Feather name={iconConfig.name as any} size={26} color={iconConfig.color} />
          </View>

          {/* Title & Body */}
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
          ) : null}

          {/* Buttons */}
          <View style={styles.buttonRow}>
            {type === 'confirm' && (
              <Button
                variant="secondary"
                size="md"
                title={cancelText}
                onPress={handleDismiss}
                style={{ flex: 1 }}
              />
            )}

            <Button
              variant={isDanger ? 'destructive' : 'primary'}
              size="md"
              title={confirmText || (type === 'confirm' ? 'Confirm' : 'OK')}
              onPress={handleConfirmAction}
              style={{ flex: type === 'confirm' ? 1 : undefined, width: type !== 'confirm' ? '100%' : undefined }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontFamily: 'GoogleSansFlex_700Bold',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
    marginTop: 4,
  },
  btn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  confirmBtn: {
    flex: 1,
  },
  confirmBtnText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    color: '#FFFFFF',
  },
});
