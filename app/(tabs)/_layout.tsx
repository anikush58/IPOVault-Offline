import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { CustomFloatingTabBar } from '@/components/CustomFloatingTabBar';

const VISIBLE_TABS = [
  { name: 'index' },
  { name: 'applications' },
  { name: 'ipos' },
  { name: 'bids' },
  { name: 'settings' },
] as const;

const HIDDEN_TABS = ['forms', 'banks', 'users', 'hub'] as const;

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <CustomFloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        {VISIBLE_TABS.map(({ name }) => (
          <Tabs.Screen
            key={name}
            name={name}
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
