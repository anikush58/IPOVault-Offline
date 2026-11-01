/**
 * IPO Investment Tracker — Premium finance palette.
 *
 * Light: warm parchment (Boring AMC) — clean white cards, amber gold accent.
 * Dark:  warm charcoal (Omkara Capital) — deep warm black, bright amber.
 *
 * Accent: amber gold — intentional warmth, money without aggression.
 * Positive: deep forest green. Negative: deep crimson.
 */

const lightPalette = {
    // Base surfaces — crisp white cards (#FFFFFF) on soft light canvas (#F8F9FA)
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
    borderStrong: '#CBD5E1',
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
    pillActiveBg: '#000000',
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

    // Status badges (Consistent everywhere - full fill)
    statusApplied: '#FFFFFF',
    statusAppliedBg: '#2563EB',
    statusAllotted: '#FFFFFF',
    statusAllottedBg: '#10B981',
    statusHolding: '#FFFFFF',
    statusHoldingBg: '#8B5CF6',
    statusNotAllotted: '#FFFFFF',
    statusNotAllottedBg: '#EF4444',
    statusPending: '#FFFFFF',
    statusPendingBg: '#F59E0B',
    statusListed: '#FFFFFF',
    statusListedBg: '#8B5CF6',
    statusRefund: '#FFFFFF',
    statusRefundBg: '#64748B',
    statusSold: '#FFFFFF',
    statusSoldBg: '#0284C7',

    // Shadow helper
    shadowCard: '0 1px 3px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.03)',
    shadowModal: '0 8px 30px rgba(0,0,0,0.12)',

    radius: 16,
};

const darkPalette = {
    // Base surfaces — Rich obsidian void canvas with elevated dark-slate cards
    background: '#090A0F',
    surface: '#161B28',
    surfaceElevated: '#212738',
    card: '#161B28',
    cardAlt: '#212738',
    cardBorder: '#2D354B',

    // Text — High-contrast pure white and cool slate (maximum legibility)
    foreground: '#FFFFFF',
    secondaryForeground: '#E2E8F0',
    mutedForeground: '#94A3B8',

    // Borders & Dividers — Crisp outlines giving cards clear definition
    border: '#2D354B',
    borderStrong: '#434E6D',
    borderSubtle: '#1C2233',
    divider: '#2D354B',

    // Primary & Accent — Crisp high-contrast white action surfaces (matching "Schedule", "Save policy" in references)
    primary: '#FFFFFF',
    primaryLight: '#E2E8F0',
    primaryForeground: '#090A0F',

    accent: '#FFFFFF',
    accentForeground: '#090A0F',

    // Legacy tint alias
    tint: '#FFFFFF',

    // Destructive
    destructive: '#F43F5E',
    destructiveForeground: '#FFFFFF',
    destructiveBg: 'rgba(244, 63, 94, 0.16)',

    // Muted fill
    muted: '#212738',

    // Finance — profit (emerald/mint)
    positive: '#10B981',
    positiveBg: 'rgba(16, 185, 129, 0.16)',
    positiveDim: 'rgba(16, 185, 129, 0.28)',

    // Finance — loss (coral rose)
    negative: '#F43F5E',
    negativeBg: 'rgba(244, 63, 94, 0.16)',
    negativeDim: 'rgba(244, 63, 94, 0.28)',

    // Amber / Warning
    amber: '#F59E0B',
    amberBg: 'rgba(245, 158, 11, 0.16)',

    // Tables
    tableHeaderBg: '#212738',
    tableHeaderForeground: '#FFFFFF',
    tableBorder: '#2D354B',

    // Tabs & Filter Pills
    pillActiveBg: '#FFFFFF',
    pillActiveText: '#090A0F',
    pillInactiveBg: '#212738',
    pillInactiveBorder: '#2D354B',
    pillInactiveText: '#94A3B8',

    // Badges & Soft Buttons
    badgeBg: '#212738',
    softBtnBg: '#212738',

    // Inputs & Controls
    inputBg: '#1B2131',
    inputBorder: '#2D354B',
    inputPlaceholder: '#94A3B8',

    // Navigation & Modals
    navBackground: '#090A0F',
    navBorder: '#1C2233',
    modalBg: '#161B28',
    modalOverlay: 'rgba(0, 0, 0, 0.75)',

    // Status badges (Solid full-fill vibrant style)
    statusApplied: '#FFFFFF',
    statusAppliedBg: '#2563EB',
    statusAllotted: '#FFFFFF',
    statusAllottedBg: '#10B981',
    statusHolding: '#FFFFFF',
    statusHoldingBg: '#8B5CF6',
    statusNotAllotted: '#FFFFFF',
    statusNotAllottedBg: '#EF4444',
    statusPending: '#FFFFFF',
    statusPendingBg: '#F59E0B',
    statusListed: '#FFFFFF',
    statusListedBg: '#8B5CF6',
    statusRefund: '#FFFFFF',
    statusRefundBg: '#64748B',
    statusSold: '#FFFFFF',
    statusSoldBg: '#0284C7',

    // Shadow helper
    shadowCard: '0 2px 8px rgba(0,0,0,0.4)',
    shadowModal: '0 12px 40px rgba(0,0,0,0.6)',

    radius: 16,
};

const colors = {
  light: lightPalette,
  dark: darkPalette,
  radius: 16,
};

export default colors;

