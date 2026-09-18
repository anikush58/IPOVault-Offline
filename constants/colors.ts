/**
 * IPO Investment Tracker — Premium finance palette.
 *
 * Light: warm parchment (Boring AMC) — clean white cards, amber gold accent.
 * Dark:  warm charcoal (Omkara Capital) — deep warm black, bright amber.
 *
 * Accent: amber gold — intentional warmth, money without aggression.
 * Positive: deep forest green. Negative: deep crimson.
 */

const colors = {
  light: {
    // Base surfaces — crisp premium white and soft grey
    background: '#F8F9FA',
    surface: '#F1F3F5',
    surfaceElevated: '#FFFFFF',
    card: '#FFFFFF',
    cardAlt: '#F8F9FA',
    cardBorder: '#E5E7EB',

    // Text
    foreground: '#111827',
    secondaryForeground: '#374151',
    mutedForeground: '#6B7280',

    // Borders & Dividers
    border: '#E5E7EB',
    borderStrong: '#D1D5DB',
    borderSubtle: '#F1F5F9',
    divider: '#E5E7EB',

    // Primary & Accent — crisp dark charcoal / black
    primary: '#111827',
    primaryLight: '#374151',
    primaryForeground: '#FFFFFF',

    accent: '#111827',
    accentForeground: '#FFFFFF',

    // Legacy tint alias
    tint: '#111827',

    // Destructive
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',
    destructiveBg: '#FEF2F2',

    // Muted fill
    muted: '#F3F4F6',

    // Finance — profit
    positive: '#10B981',
    positiveBg: '#ECFDF5',
    positiveDim: '#D1FAE5',

    // Finance — loss
    negative: '#EF4444',
    negativeBg: '#FEF2F2',
    negativeDim: '#FEE2E2',

    // Amber / Warning
    amber: '#F59E0B',
    amberBg: '#FEF3C7',

    // Tables
    tableHeaderBg: '#FDF2E9',
    tableHeaderForeground: '#111827',
    tableBorder: '#E2E8F0',

    // Tabs & Filter Pills
    pillActiveBg: '#111827',
    pillActiveText: '#FFFFFF',
    pillInactiveBg: '#F1F5F9',
    pillInactiveBorder: '#E5E7EB',
    pillInactiveText: '#6B7280',

    // Badges & Soft Buttons
    badgeBg: '#F1F5F9',
    softBtnBg: '#F1F5F9',

    // Inputs & Controls
    inputBg: '#F1F3F5',
    inputBorder: '#E5E7EB',
    inputPlaceholder: '#9CA3AF',

    // Navigation & Modals
    navBackground: '#FFFFFF',
    navBorder: '#E5E7EB',
    modalBg: '#FFFFFF',
    modalOverlay: 'rgba(0, 0, 0, 0.55)',

    // Status badges (Consistent everywhere)
    statusApplied: '#2563EB',
    statusAppliedBg: '#EFF6FF',
    statusAllotted: '#10B981',
    statusAllottedBg: 'rgba(16, 185, 129, 0.15)',
    statusHolding: '#8B5CF6',
    statusHoldingBg: '#F5F3FF',
    statusNotAllotted: '#EF4444',
    statusNotAllottedBg: '#FEF2F2',
    statusPending: '#F59E0B',
    statusPendingBg: '#FFFBEB',
    statusListed: '#8B5CF6',
    statusListedBg: '#F5F3FF',
    statusRefund: '#6B7280',
    statusRefundBg: '#F3F4F6',
    statusSold: '#F59E0B',
    statusSoldBg: 'rgba(245, 158, 11, 0.15)',

    // Shadow helper
    shadowCard: '0 1px 3px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.03)',
    shadowModal: '0 8px 30px rgba(0,0,0,0.12)',

    radius: 16,
  },

  dark: {
    // Layered obsidian dark — smooth depth, zero eye strain, avoiding pure black
    background: '#0E1117',
    surface: '#161B22',
    surfaceElevated: '#252B37',
    card: '#1F242D',
    cardAlt: '#282E39',
    cardBorder: '#2E3545',

    foreground: '#F3F4F6',
    secondaryForeground: '#D1D5DB',
    mutedForeground: '#9CA3AF',

    border: '#2E3545',
    borderStrong: '#3E4659',
    borderSubtle: '#252B37',
    divider: '#2E3545',

    primary: '#FFFFFF',
    primaryLight: '#E5E7EB',
    primaryForeground: '#000000',

    accent: '#FFFFFF',
    accentForeground: '#000000',

    tint: '#FFFFFF',

    destructive: '#F87171',
    destructiveForeground: '#FFFFFF',
    destructiveBg: '#3F1718',

    muted: '#1F242D',

    positive: '#34D399',
    positiveBg: 'rgba(16, 185, 129, 0.15)',
    positiveDim: 'rgba(16, 185, 129, 0.30)',

    negative: '#F87171',
    negativeBg: 'rgba(239, 68, 68, 0.15)',
    negativeDim: 'rgba(239, 68, 68, 0.30)',

    amber: '#FBBF24',
    amberBg: 'rgba(245, 158, 11, 0.15)',

    tableHeaderBg: '#37271E',
    tableHeaderForeground: '#F3F4F6',
    tableBorder: '#2E3545',

    pillActiveBg: '#F3F4F6',
    pillActiveText: '#0E1117',
    pillInactiveBg: '#1F242D',
    pillInactiveBorder: '#2E3545',
    pillInactiveText: '#9CA3AF',

    badgeBg: '#282E39',
    softBtnBg: 'rgba(255, 255, 255, 0.08)',

    inputBg: '#161B22',
    inputBorder: '#2E3545',
    inputPlaceholder: '#6B7280',

    navBackground: '#161B22',
    navBorder: '#2E3545',
    modalBg: '#1F242D',
    modalOverlay: 'rgba(0, 0, 0, 0.75)',

    statusApplied: '#60A5FA',
    statusAppliedBg: 'rgba(37, 99, 235, 0.20)',
    statusAllotted: '#34D399',
    statusAllottedBg: 'rgba(16, 185, 129, 0.20)',
    statusHolding: '#A78BFA',
    statusHoldingBg: 'rgba(139, 92, 246, 0.20)',
    statusNotAllotted: '#F87171',
    statusNotAllottedBg: 'rgba(239, 68, 68, 0.20)',
    statusPending: '#FBBF24',
    statusPendingBg: 'rgba(245, 158, 11, 0.20)',
    statusListed: '#A78BFA',
    statusListedBg: 'rgba(139, 92, 246, 0.20)',
    statusRefund: '#9CA3AF',
    statusRefundBg: 'rgba(107, 114, 128, 0.20)',
    statusSold: '#F59E0B',
    statusSoldBg: 'rgba(245, 158, 11, 0.20)',

    shadowCard: '0 2px 8px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)',
    shadowModal: '0 12px 48px rgba(0,0,0,0.65)',

    radius: 16,
  },

  radius: 16,
};

export default colors;

