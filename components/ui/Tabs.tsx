import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type TabStyleVariant = 'segmented' | 'segmented-secondary' | 'underline' | 'pills';

export interface TabItem<T extends string = string> {
  key?: T;
  id?: T;
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  count?: number;
  dotColor?: string;
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (key: T) => void;
  variant?: TabStyleVariant;
  scrollable?: boolean;
  height?: number;
  style?: ViewStyle;
  tabStyle?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
}

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  variant = 'pills',
  scrollable = false,
  height,
  style,
  tabStyle,
  textStyle,
  testID,
}: TabsProps<T>) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const pillTrackHeight = height || 30;
  const pillBtnHeight = pillTrackHeight - 6;
  const pillRadius = pillTrackHeight / 2;
  const pillBtnRadius = pillBtnHeight / 2;
  const pillFontSize = pillTrackHeight >= 36 ? 11.5 : 10.5;
  const pillBadgeSize = pillTrackHeight >= 36 ? 18 : 16;
  const pillBadgeRadius = pillBadgeSize / 2;
  const pillBadgeFontSize = pillTrackHeight >= 36 ? 10 : 9.5;

  const handlePress = (key: T) => {
    if (key !== activeTab) {
      Haptics.selectionAsync().catch(() => {});
      onChange(key);
    }
  };

  const isSegmented = variant === 'segmented' || variant === 'segmented-secondary';
  const isSecondarySegmented = variant === 'segmented-secondary';

  const renderTabItem = (tab: TabItem<T>, idx: number) => {
    const itemKey = (tab.key ?? tab.id ?? String(idx)) as T;
    const isActive = itemKey === activeTab;

    if (variant === 'underline') {
      return (
        <Pressable
          key={itemKey}
          onPress={() => handlePress(itemKey)}
          style={[
            styles.underlineTabBtn,
            { borderBottomColor: isActive ? colors.primary : 'transparent' },
            tabStyle,
          ]}
        >
          <View style={styles.contentRow}>
            {tab.icon ? (
              <Feather
                name={tab.icon}
                size={14}
                color={isActive ? colors.primary : colors.mutedForeground}
              />
            ) : null}
            <Text
              style={[
                styles.underlineText,
                { color: isActive ? colors.primary : colors.mutedForeground },
                isActive ? styles.fontBold : styles.fontSemiBold,
                textStyle,
              ]}
            >
              {tab.label}
            </Text>
            {tab.count != null ? (
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: isActive ? colors.primary + '20' : colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    { color: isActive ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {tab.count}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    }

    if (variant === 'pills') {
      return (
        <Pressable
          key={itemKey}
          onPress={() => handlePress(itemKey)}
          style={[
            styles.pillTabBtn,
            {
              height: pillBtnHeight,
              minHeight: pillBtnHeight,
              maxHeight: pillBtnHeight,
              borderRadius: pillBtnRadius,
            },
            !scrollable && styles.pillTabBtnFlex,
            isActive && [
              styles.pillTabBtnActive,
              {
                backgroundColor: isDark ? '#2B3548' : '#FFFFFF',
              },
            ],
            tabStyle,
          ]}
        >
          <View style={styles.contentRow}>
            {tab.dotColor ? (
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isActive ? (isDark ? '#FFFFFF' : '#0B132B') : tab.dotColor },
                ]}
              />
            ) : tab.icon ? (
              <Feather
                name={tab.icon}
                size={pillTrackHeight >= 36 ? 12 : 11}
                color={isActive ? (isDark ? '#FFFFFF' : '#0B132B') : (isDark ? '#8A97A8' : '#6B7280')}
              />
            ) : null}
            <Text
              style={[
                styles.pillText,
                {
                  fontSize: pillFontSize,
                  color: isActive
                    ? (isDark ? '#FFFFFF' : '#0B132B')
                    : (isDark ? '#8A97A8' : '#6B7280'),
                },
                isActive ? styles.fontBold : styles.fontSemiBold,
                textStyle,
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
            {tab.count != null ? (
              <View
                style={[
                  styles.countBadgePill,
                  {
                    minWidth: pillBadgeSize,
                    height: pillBadgeSize,
                    borderRadius: pillBadgeRadius,
                    backgroundColor: isActive
                      ? '#EF4444'
                      : (isDark ? 'rgba(255, 255, 255, 0.12)' : '#DDE1E6'),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countTextPill,
                    {
                      fontSize: pillBadgeFontSize,
                      lineHeight: pillBadgeSize - 3,
                      color: isActive
                        ? '#FFFFFF'
                        : (isDark ? '#8A97A8' : '#6B7280'),
                    },
                  ]}
                >
                  {tab.count}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    }

    if (isSegmented) {
      const activeBg = isSecondarySegmented
        ? isDark
          ? colors.surface
          : colors.background
        : colors.primary;
      const activeTextColor = isSecondarySegmented
        ? colors.foreground
        : colors.primaryForeground;
      const activeBorderColor = isSecondarySegmented ? colors.border : colors.primary;

      return (
        <Pressable
          key={itemKey}
          onPress={() => handlePress(itemKey)}
          style={[
            styles.segmentedTabBtn,
            isActive && [
              styles.segmentedActiveCard,
              {
                backgroundColor: activeBg,
                borderColor: activeBorderColor,
              },
            ],
            tabStyle,
          ]}
        >
          <View style={styles.contentRow}>
            {tab.icon ? (
              <Feather
                name={tab.icon}
                size={14}
                color={isActive ? activeTextColor : colors.mutedForeground}
              />
            ) : null}
            <Text
              style={[
                styles.segmentedText,
                { color: isActive ? activeTextColor : colors.mutedForeground },
                isActive ? styles.fontBold : styles.fontSemiBold,
                textStyle,
              ]}
            >
              {tab.label}
            </Text>
            {tab.count != null ? (
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: isActive
                      ? activeTextColor + '20'
                      : colors.muted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    { color: isActive ? activeTextColor : colors.mutedForeground },
                  ]}
                >
                  {tab.count}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    }

    return null;
  };

  if (variant === 'pills') {
    if (scrollable) {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContentWrap}
          style={style}
          testID={testID}
        >
          <View
            style={[
              styles.pillTrackScrollContainer,
              {
                height: pillTrackHeight,
                minHeight: pillTrackHeight,
                maxHeight: pillTrackHeight,
                borderRadius: pillRadius,
                backgroundColor: isDark ? '#181F2C' : '#ECEEF1',
                borderColor: isDark ? '#2D3748' : '#DFE2E6',
              },
            ]}
          >
            {tabs.map(renderTabItem)}
          </View>
        </ScrollView>
      );
    }

    return (
      <View
        style={[
          styles.pillTrackContainer,
          {
            height: pillTrackHeight,
            minHeight: pillTrackHeight,
            maxHeight: pillTrackHeight,
            borderRadius: pillRadius,
            backgroundColor: isDark ? '#181F2C' : '#ECEEF1',
            borderColor: isDark ? '#2D3748' : '#DFE2E6',
          },
          style,
        ]}
        testID={testID}
      >
        {tabs.map(renderTabItem)}
      </View>
    );
  }

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          isSegmented ? styles.segmentedContainer : styles.scrollContainer,
          isSegmented && { backgroundColor: colors.surface, borderColor: colors.border },
          style,
        ]}
        testID={testID}
      >
        {tabs.map(renderTabItem)}
      </ScrollView>
    );
  }

  return (
    <View
      style={[
        isSegmented ? styles.segmentedContainer : styles.flexRowContainer,
        isSegmented && { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
      testID={testID}
    >
      {tabs.map(renderTabItem)}
    </View>
  );
}

const styles = StyleSheet.create({
  flexRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  scrollContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  scrollContentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Segmented Variant
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  segmentedTabBtn: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 15,
  },
  segmentedActiveCard: {
    borderWidth: 1,
  },
  segmentedText: {
    fontSize: 12,
  },

  // Underline Variant
  underlineTabBtn: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2.5,
    paddingHorizontal: 15,
  },
  underlineText: {
    fontSize: 13,
  },

  // Pill Track Container (Total Height: 30px, Fully Rounded Pill: 15px, Full Width)
  pillTrackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 30,
    minHeight: 30,
    maxHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    padding: 2.5,
    gap: 3,
  },
  pillTrackScrollContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 30,
    minHeight: 30,
    maxHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    padding: 2.5,
    gap: 3,
  },
  pillTabBtn: {
    height: 24,
    minHeight: 24,
    maxHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  pillTabBtnFlex: {
    flex: 1,
  },
  pillTabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  pillText: {
    fontSize: 10.5,
    letterSpacing: 0.15,
  },

  // Common Typography & Elements
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4.5,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  countText: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  countBadgePill: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countTextPill: {
    fontSize: 9.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    lineHeight: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  fontBold: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  fontSemiBold: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
