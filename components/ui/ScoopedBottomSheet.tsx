import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';

interface ScoopedBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string | number;
  style?: ViewStyle;
  showCloseButton?: boolean;
  overlay?: React.ReactNode;
}

export function ScoopedBottomSheet({
  visible,
  onClose,
  children,
  maxHeight = '90%',
  style,
  showCloseButton = true,
  overlay,
}: ScoopedBottomSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Initialize with synchronous window dimensions so sheet is NEVER 0x0 / transparent on frame 0 or during lag
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  if (!visible) return null;

  const effectiveWidth = measuredWidth > 0 ? measuredWidth : windowWidth;
  const effectiveHeight = measuredHeight > 0 ? measuredHeight : Math.round(windowHeight * 0.9);

  const R = 32; // Top corner radius
  const SCOOP_W = 60; // Scoop half-width
  const SCOOP_D = 28; // Scoop depth

  const getScoopedPath = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return '';
    const cx = w / 2;

    return `M 0 ${h}
      L 0 ${R}
      A ${R} ${R} 0 0 1 ${R} 0
      L ${cx - SCOOP_W} 0
      C ${cx - 38} 0, ${cx - 32} ${SCOOP_D}, ${cx} ${SCOOP_D}
      C ${cx + 32} ${SCOOP_D}, ${cx + 38} 0, ${cx + SCOOP_W} 0
      L ${w - R} 0
      A ${R} ${R} 0 0 1 ${w} ${R}
      L ${w} ${h}
      Z`;
  };

  const bottomPad = Platform.OS === 'web' ? 20 : Math.max(insets.bottom, 24);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Blurred Background Backdrop */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 35 : 24}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        {/* Deep Backdrop Dimming (guarantees contrast even if native blur is unavailable) */}
        <Pressable
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.70)' : 'rgba(0, 0, 0, 0.50)' },
          ]}
          onPress={handleClose}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <Pressable
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) {
                setMeasuredWidth(width);
                setMeasuredHeight(height);
              }
            }}
            style={[
              styles.sheetContainer,
              {
                maxHeight: maxHeight as any,
                paddingBottom: bottomPad,
              },
              style,
            ]}
            onPress={() => {}}
          >
            {/* Solid Opaque Base Background (guarantees sheet body is NEVER transparent even if SVG lags or during UI thread congestion) */}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: colors.background,
                  borderTopLeftRadius: R,
                  borderTopRightRadius: R,
                  top: SCOOP_D,
                },
              ]}
              pointerEvents="none"
            />

            {/* Scooped SVG Background with top cutout */}
            <Svg
              width={effectiveWidth}
              height={effectiveHeight}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              <Path
                d={getScoopedPath(effectiveWidth, effectiveHeight)}
                fill={colors.background}
                stroke={colors.border}
                strokeWidth={1}
              />
            </Svg>

            {/* Floating Scooped Close Cross Button */}
            {showCloseButton && (
              <View style={styles.closeBtnWrapper} pointerEvents="box-none">
                <TouchableOpacity
                  onPress={handleClose}
                  activeOpacity={0.8}
                  hitSlop={8}
                  style={[
                    styles.closeCircleBtn,
                    {
                      backgroundColor: isDark ? colors.card : '#FFFFFF',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Feather name="x" size={21} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            )}

            {/* Sheet Content (Flex-bounded to never overflow the bottom sheet or push CTAs off-screen) */}
            <View style={styles.contentContainer}>
              {children}
            </View>
          </Pressable>
        </KeyboardAvoidingView>

        {overlay}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    width: '100%',
    justifyContent: 'flex-end',
    maxHeight: '100%',
  },
  sheetContainer: {
    width: '100%',
    position: 'relative',
    overflow: 'visible',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    display: 'flex',
    flexDirection: 'column',
  },
  closeBtnWrapper: {
    position: 'absolute',
    top: -35,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  closeCircleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  contentContainer: {
    paddingTop: 38,
    width: '100%',
    flexShrink: 1,
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
});
