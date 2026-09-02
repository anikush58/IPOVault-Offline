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
import { DesignSystem } from '@/constants/DesignSystem';

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
  style,
  tabStyle,
  textStyle,
  testID,
}: TabsProps<T>) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
              backgroundColor: isActive
                ? (isDark ? '#F8FAFC' : '#0B132B')
                : (isDark ? '#1E293B' : '#FFFFFF'),
              borderColor: isActive
                ? (isDark ? '#F8FAFC' : '#0B132B')
                : (isDark ? '#334155' : '#E2E8F0'),
            },
            tabStyle,
          ]}
        >
          <View style={styles.contentRow}>
            {tab.dotColor ? (
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isActive ? (isDark ? '#0B132B' : '#FFFFFF') : tab.dotColor },
                ]}
              />
            ) : tab.icon ? (
              <Feather
                name={tab.icon}
                size={12}
                color={isActive ? (isDark ? '#0B132B' : '#FFFFFF') : colors.mutedForeground}
              />
            ) : null}
            <Text
              style={[
                styles.pillText,
                { color: isActive ? (isDark ? '#0B132B' : '#FFFFFF') : (isDark ? '#F8FAFC' : '#0B132B') },
                textStyle,
              ]}
            >
              {tab.label}
            </Text>
            {tab.count != null ? (
              <View
                style={[
                  styles.countBadgePill,
                  {
                    backgroundColor: isActive
                      ? (isDark ? 'rgba(11, 19, 43, 0.18)' : 'rgba(255, 255, 255, 0.22)')
                      : (isDark ? 'rgba(255, 255, 255, 0.1)' : '#F1F5F9'),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countTextPill,
                    {
                      color: isActive
                        ? (isDark ? '#0B132B' : '#FFFFFF')
                        : (isDark ? '#94A3B8' : '#64748B'),
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
    paddingHorizontal: 10,
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
    paddingHorizontal: 12,
  },
  underlineText: {
    fontSize: 13,
  },

  // Pills Variant (Height: 36px, Padding: 10px Left & Right)
  pillTabBtn: {
    height: 36,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.1,
  },

  // Common Typography & Elements
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
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
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    marginLeft: 3,
  },
  countTextPill: {
    fontSize: 10.5,
    fontFamily: 'GoogleSansFlex_700Bold',
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
