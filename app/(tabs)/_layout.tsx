import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const VISIBLE_TABS = [
  { name: 'index',        title: 'Dashboard',    icon: 'bar-chart-2' },
  { name: 'applications', title: 'Applications', icon: 'file-text'   },
  { name: 'ipos',         title: 'IPOs',         icon: 'trending-up' },
  { name: 'bids',         title: 'Bids',         icon: 'layers'      },
  { name: 'settings',     title: 'Settings',     icon: 'settings'    },
] as const;

const HIDDEN_TABS = ['forms', 'banks', 'users', 'hub'] as const;

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarLabelStyle: {
            fontFamily: 'GoogleSansFlex_600SemiBold',
            fontSize: 11,
            marginTop: 2,
            letterSpacing: 0.1,
          },
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            paddingBottom: isWeb ? 8 : insets.bottom + 4,
            paddingTop: 8,
            height: isWeb ? 70 : insets.bottom + 62,
          },
          tabBarBackground: () => (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ),
        }}
      >
        {VISIBLE_TABS.map(({ name, title, icon }) => (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title,
              tabBarIcon: ({ color }) => (
                <Feather name={icon as any} size={22} color={color} />
              ),
            }}
          />
        ))}

        {HIDDEN_TABS.map((name) => (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              href: null,
            }}
          />
        ))}
      </Tabs>
    </View>
  );
}
