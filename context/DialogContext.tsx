import React, { createContext, useContext, useState, useRef } from 'react';
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
import { Button } from '@/components/ui/Button';

export type DialogType = 'confirm' | 'success' | 'error' | 'info';

export interface DialogOptions {
  title: string;
  message?: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface DialogContextType {
  showDialog: (options: DialogOptions) => void;
  showConfirm: (options: Omit<DialogOptions, 'type'>) => void;
  showSuccess: (title: string, message?: string, onConfirm?: () => void) => void;
  showError: (title: string, message?: string, onConfirm?: () => void) => void;
  showInfo: (title: string, message?: string, onConfirm?: () => void) => void;
  hideDialog: () => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<DialogOptions | null>(null);

  const animFade = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.92)).current;

  const animateIn = () => {
    setVisible(true);
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
  };

  const animateOut = (callback?: () => void) => {
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
    ]).start(() => {
      setVisible(false);
      setOptions(null);
      callback?.();
    });
  };

  const showDialog = (opts: DialogOptions) => {
    setOptions(opts);
    animateIn();
  };

  const showConfirm = (opts: Omit<DialogOptions, 'type'>) => {
    showDialog({ ...opts, type: 'confirm' });
  };

  const showSuccess = (title: string, message?: string, onConfirm?: () => void) => {
    showDialog({ title, message, type: 'success', confirmText: 'OK', onConfirm });
  };

  const showError = (title: string, message?: string, onConfirm?: () => void) => {
    showDialog({ title, message, type: 'error', confirmText: 'OK', isDanger: true, onConfirm });
  };

  const showInfo = (title: string, message?: string, onConfirm?: () => void) => {
    showDialog({ title, message, type: 'info', confirmText: 'OK', onConfirm });
  };

  const hideDialog = () => {
    animateOut();
  };

  const handleConfirm = async () => {
    const action = options?.onConfirm;
    animateOut(async () => {
      if (action) {
        await action();
      }
    });
  };

  const handleCancel = () => {
    const action = options?.onCancel;
    animateOut(() => {
      if (action) {
        action();
      }
    });
  };

  const type = options?.type || 'confirm';
  const isDanger = options?.isDanger;

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
    <DialogContext.Provider
      value={{ showDialog, showConfirm, showSuccess, showError, showInfo, hideDialog }}
    >
      {children}

      {visible && options && (
        <Modal
          transparent
          visible={visible}
          animationType="none"
          onRequestClose={handleCancel}
        >
          <View style={styles.overlay}>
            <TouchableWithoutFeedback onPress={type === 'confirm' ? handleCancel : handleConfirm}>
              <Animated.View
                style={[
                  styles.backdrop,
                  { opacity: animFade },
                ]}
              />
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
              {/* Icon Wrap */}
              <View style={[styles.iconWrap, { backgroundColor: iconConfig.bg }]}>
                <Feather name={iconConfig.name as any} size={26} color={iconConfig.color} />
              </View>

              {/* Title & Message */}
              <Text style={[styles.title, { color: colors.foreground }]}>{options.title}</Text>
              {options.message ? (
                <Text style={[styles.message, { color: colors.mutedForeground }]}>
                  {options.message}
                </Text>
              ) : null}

              {/* Actions */}
              <View style={styles.buttonRow}>
                {type === 'confirm' && (
                  <Button
                    variant="secondary"
                    size="md"
                    title={options.cancelText || 'Cancel'}
                    onPress={handleCancel}
                    style={{ flex: 1 }}
                  />
                )}

                <Button
                  variant={isDanger ? 'destructive' : 'primary'}
                  size="md"
                  title={options.confirmText || (type === 'confirm' ? 'Confirm' : 'OK')}
                  onPress={handleConfirm}
                  style={{ flex: type === 'confirm' ? 1 : undefined, width: type !== 'confirm' ? '100%' : undefined }}
                />
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextType {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
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
