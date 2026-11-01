import React from 'react';
import { ViewStyle } from 'react-native';
import Svg, { Path, Circle, Rect, Line, Polyline, Polygon } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { LUCIDE_NODES } from './lucideIconNodes';

const TAG_MAP: Record<string, React.ComponentType<any>> = {
  path: Path,
  circle: Circle,
  rect: Rect,
  line: Line,
  polyline: Polyline,
  polygon: Polygon,
};

export type IconSizePreset = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const ICON_SIZE_MAP: Record<IconSizePreset, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
};

export const LUCIDE_ICON_REGISTRY = {
  // Navigation & Core Tabs
  layers: 'layers',
  'layers-outline': 'layers',
  grid: 'layout-grid',
  'grid-outline': 'layout-grid',
  hub: 'layout-grid',
  'document-text': 'file-text',
  'document-text-outline': 'file-text',
  'file-text': 'file-text',
  settings: 'settings',
  'settings-outline': 'settings',
  ticket: 'ticket-rupee',
  'ticket-outline': 'ticket-rupee',
  lottery: 'ticket-rupee',
  'lottery-outline': 'ticket-rupee',
  'ticket-percent': 'ticket-rupee',
  'ticket-percent-outline': 'ticket-rupee',
  'ticket-rupee': 'ticket-rupee',
  'ticket-rupee-outline': 'ticket-rupee',
  user: 'user',
  'user-outline': 'user-round',
  'user-round': 'user-round',
  person: 'user-round',
  'person-outline': 'user-round',
  'person-circle': 'user-round',
  'person-circle-outline': 'user-round',
  users: 'users',
  'users-outline': 'users-round',
  'users-round': 'users-round',
  people: 'users',
  'people-outline': 'users-round',
  home: 'house',
  house: 'house',

  // Actions & Controls
  plus: 'plus',
  'plus-circle': 'circle-plus',
  'circle-plus': 'circle-plus',
  minus: 'minus',
  x: 'x',
  close: 'x',
  trash: 'trash',
  'trash-2': 'trash',
  edit: 'pencil',
  'edit-2': 'pencil',
  'edit-3': 'pen-line',
  pencil: 'pencil',
  'pen-line': 'pen-line',
  search: 'search',
  filter: 'list-filter',
  sliders: 'sliders-horizontal',
  'sliders-horizontal': 'sliders-horizontal',
  refresh: 'refresh-cw',
  'refresh-cw': 'refresh-cw',
  'rotate-ccw': 'rotate-ccw',
  'rotate-cw': 'rotate-cw',
  share: 'share-2',
  'share-2': 'share-2',
  download: 'download',
  upload: 'upload',
  'upload-cloud': 'cloud-upload',
  send: 'send',
  'external-link': 'external-link',
  'x-circle': 'circle-x',
  'close-circle': 'circle-x',
  'circle-x': 'circle-x',
  layout: 'layout-dashboard',
  'layout-dashboard': 'layout-dashboard',
  'volume-2': 'volume-2',
  'volume-x': 'volume-x',
  copy: 'copy',
  camera: 'camera',
  inbox: 'inbox',
  server: 'server',
  terminal: 'terminal',
  'link-2': 'link-2',
  'toggle-left': 'toggle-left',
  'swap-horizontal': 'arrow-left-right',
  'arrow-left-right': 'arrow-left-right',

  // Chevrons & Arrows
  'chevron-left': 'chevron-left',
  'chevron-right': 'chevron-right',
  'chevron-down': 'chevron-down',
  'chevron-up': 'chevron-up',
  'arrow-left': 'arrow-left',
  'arrow-right': 'arrow-right',
  'arrow-up-right': 'arrow-up-right',
  'arrow-down-right': 'arrow-down-right',

  // Status & Membership
  diamond: 'diamond',
  gem: 'gem',
  award: 'award',
  trophy: 'trophy',
  'trophy-outline': 'trophy',
  crown: 'crown',
  check: 'check',
  'check-circle': 'circle-check',
  'checkmark-circle': 'circle-check',
  'circle-check': 'circle-check',
  'check-square': 'square-check',
  'square-check': 'square-check',
  info: 'info',
  alert: 'circle-alert',
  'alert-circle': 'circle-alert',
  'circle-alert': 'circle-alert',
  'alert-triangle': 'triangle-alert',
  'triangle-alert': 'triangle-alert',
  'alert-octagon': 'octagon-alert',
  'octagon-alert': 'octagon-alert',
  shield: 'shield',
  'shield-check': 'shield-check',
  'shield-checkmark-outline': 'shield-check',

  // Finance & Analytics
  landmark: 'landmark',
  bank: 'landmark',
  'bank-outline': 'landmark',
  briefcase: 'briefcase',
  business: 'briefcase',
  'credit-card': 'credit-card',
  'dollar-sign': 'dollar-sign',
  dollar: 'dollar-sign',
  rupee: 'indian-rupee',
  'indian-rupee': 'indian-rupee',
  smartphone: 'smartphone',
  phone: 'smartphone',
  'phone-call': 'phone-call',
  'trending-up': 'trending-up',
  'trending-down': 'trending-down',
  'bar-chart': 'chart-column',
  'bar-chart-2': 'chart-column',
  'chart-column': 'chart-column',
  'chart-box-outline': 'chart-column',
  'pie-chart': 'chart-pie',
  'chart-pie': 'chart-pie',
  activity: 'activity',
  percent: 'percent',
  calculator: 'calculator',
  'calculator-variant-outline': 'calculator',

  // Notifications & Alerts
  bell: 'bell',
  'bell-off': 'bell-off',
  play: 'play',
  'play-circle': 'circle-play',
  'circle-play': 'circle-play',

  // System, Settings & Help
  compass: 'compass',
  'message-circle': 'message-circle',
  'message-square': 'message-square',
  bookmark: 'bookmark',
  star: 'star',
  moon: 'moon',
  sun: 'sun',
  cloud: 'cloud',
  lock: 'lock',
  key: 'key',
  support: 'life-buoy',
  'life-buoy': 'life-buoy',
  'help-circle': 'circle-question-mark',
  'circle-question-mark': 'circle-question-mark',
  sparkles: 'sparkles',
  zap: 'zap',
  'flash-outline': 'zap',
  code: 'code',
  'log-out': 'log-out',
  logout: 'log-out',
  slash: 'ban',
  ban: 'ban',
  eye: 'eye',
  'eye-off': 'eye-off',
  calendar: 'calendar',
  clock: 'clock',
  globe: 'globe',
  mail: 'mail',
  wifi: 'wifi',
  'wifi-off': 'wifi-off',
  list: 'list',
  'hard-drive': 'hard-drive',
  archive: 'archive',
  'archive-restore': 'archive-restore',
  'archive-arrow-down-outline': 'archive-restore',
  folder: 'folder',
  'user-check': 'user-check',
  'git-merge': 'git-merge',
  columns: 'columns-2',
  'columns-2': 'columns-2',
  'align-left': 'text-align-start',
  'text-align-start': 'text-align-start',
  'file-document-outline': 'file-text',
  'book-open': 'book-open',
  link: 'link',
  tool: 'wrench',
  wrench: 'wrench',
  question: 'circle-question-mark',
  loader: 'loader-circle',
  'loader-circle': 'loader-circle',
} as const;

export type IconName = keyof typeof LUCIDE_ICON_REGISTRY;

export interface IconProps {
  name?: IconName | (string & {});
  icon?: React.ComponentType<any>;
  size?: number | IconSizePreset;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  style?: ViewStyle;
  testID?: string;
}

export function Icon({
  name,
  icon: CustomIcon,
  size = 20,
  color,
  fill = 'none',
  strokeWidth = 2,
  style,
  testID,
}: IconProps) {
  const colors = useColors();

  // Resolve numerical size
  const resolvedSize = typeof size === 'number' ? size : ICON_SIZE_MAP[size] || 20;

  // Resolve theme-aware color
  let resolvedColor = color || colors.foreground;
  if (color === 'foreground') resolvedColor = colors.foreground;
  else if (color === 'muted' || color === 'mutedForeground') resolvedColor = colors.mutedForeground;
  else if (color === 'primary') resolvedColor = colors.primary;
  else if (color === 'destructive') resolvedColor = colors.destructive;

  if (CustomIcon) {
    return (
      <CustomIcon
        size={resolvedSize}
        color={resolvedColor}
        fill={fill}
        strokeWidth={strokeWidth}
        style={style}
        testID={testID}
      />
    );
  }

  const iconKey = name ? (LUCIDE_ICON_REGISTRY[name as IconName] || name) : undefined;
  const nodes = iconKey ? LUCIDE_NODES[iconKey] : undefined;
  if (!nodes) {
    return null;
  }

  return (
    <Svg
      width={resolvedSize}
      height={resolvedSize}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={resolvedColor}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      testID={testID}
    >
      {nodes.map(([tag, attrs], idx) => {
        const TagComponent = TAG_MAP[tag];
        if (!TagComponent) return null;
        const { key, ...cleanAttrs } = attrs;
        return <TagComponent key={key || idx} {...cleanAttrs} />;
      })}
    </Svg>
  );
}
