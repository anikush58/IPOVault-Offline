import React from 'react';
import { Tabs, TabItem } from './Tabs';

export type TabVariant = 'primary' | 'secondary';
export type { TabItem };

interface SegmentedTabControlProps<T extends string = string> {
  variant?: TabVariant;
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (key: T) => void;
  style?: any;
}

export function SegmentedTabControl<T extends string = string>({
  variant = 'primary',
  tabs,
  activeTab,
  onChange,
  style,
}: SegmentedTabControlProps<T>) {
  return (
    <Tabs
      variant={variant === 'secondary' ? 'pills' : 'segmented'}
      tabs={tabs}
      activeTab={activeTab}
      onChange={onChange}
      style={style}
    />
  );
}
