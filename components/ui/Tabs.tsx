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
  key: T;
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
  variant = 'segmented',
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

  const renderTabItem = (tab: TabItem<T>) => {
    const isActive = tab.key === activeTab;

    if (variant === 'underline') {
      return (
        <Pressable
          key={tab.key}
          onPress={() => handlePress(tab.key)}
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
          key={tab.key}
          onPress={() => handlePress(tab.key)}
          style={[
            styles.pillTabBtn,
            {
              backgroundColor: isActive
                ? (isDark ? '#F8FAFC' : '#0F172A')
                : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF'),
              borderColor: isActive ? 'transparent' : colors.border,
            },
            tabStyle,
          ]}
        >
          <View style={styles.contentRow}>
            {tab.dotColor ? (
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isActive ? (isDark ? '#0F172A' : '#FFFFFF') : tab.dotColor },
                ]}
              />
            ) : tab.icon ? (
              <Feather
                name={tab.icon}
                size={12}
                color={isActive ? (isDark ? '#0F172A' : '#FFFFFF') : colors.mutedForeground}
              />
            ) : null}
            <Text
              style={[
                styles.pillText,
                { color: isActive ? (isDark ? '#0F172A' : '#FFFFFF') : colors.foreground },
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
                      ? (isDark ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.25)')
                      : colors.muted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    { color: isActive ? (isDark ? '#0F172A' : '#FFFFFF') : colors.mutedForeground },
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

    // Default: 'segmented' or 'segmented-secondary'
    return (
      <Pressable
        key={tab.key}
        onPress={() => handlePress(tab.key)}
        style={[
          styles.segmentedTabBtn,
          isActive && [
            styles.segmentedActiveCard,
            {
              backgroundColor: isSecondarySegmented ? colors.primary : colors.card,
              borderColor: isSecondarySegmented ? colors.primary : colors.border,
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
                {
                  backgroundColor: isActive
                    ? isSecondarySegmented
                      ? '#FFFFFF'
                      : colors.primary
                    : tab.dotColor,
                },
              ]}
            />
          ) : tab.icon ? (
            <Feather
              name={tab.icon}
              size={13}
              color={
                isActive
                  ? isSecondarySegmented
                    ? '#FFFFFF'
                    : colors.primary
                  : colors.mutedForeground
              }
            />
          ) : null}
          <Text
            style={[
              styles.segmentedText,
              {
                color: isActive
                  ? isSecondarySegmented
                    ? '#FFFFFF'
                    : colors.foreground
                  : colors.mutedForeground,
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
                styles.countBadge,
                {
                  backgroundColor: isActive
                    ? isSecondarySegmented
                      ? '#FFFFFF30'
                      : colors.surface
                    : colors.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.countText,
                  {
                    color: isActive
                      ? isSecondarySegmented
                        ? '#FFFFFF'
                        : colors.foreground
                      : colors.mutedForeground,
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
    paddingHorizontal: 16,
  },

  // Segmented Variant
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: DesignSystem.tabs.radius.segmented,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  segmentedTabBtn: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DesignSystem.tabs.radius.segmented - 2,
    paddingHorizontal: 10,
  },
  segmentedActiveCard: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentedText: {
    fontSize: DesignSystem.tabs.fontSize.sm,
  },

  // Underline Variant
  underlineTabBtn: {
    flex: 1,
    height: DesignSystem.tabs.height.underline,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2.5,
    paddingHorizontal: 12,
  },
  underlineText: {
    fontSize: DesignSystem.tabs.fontSize.md,
  },

  // Pills Variant
  pillTabBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },

  // Common Typography & Elements
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  fontBold: {
    fontFamily: DesignSystem.typography.fontBold,
  },
  fontSemiBold: {
    fontFamily: DesignSystem.typography.fontSemiBold,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  countText: {
    fontSize: 10,
    fontFamily: DesignSystem.typography.fontBold,
  },
});
