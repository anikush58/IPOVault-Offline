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
    card: '#FFFFFF',
    cardAlt: '#F8F9FA',

    // Text
    foreground: '#111827',
    secondaryForeground: '#374151',
    mutedForeground: '#6B7280',

    // Borders
    border: '#E5E7EB',
    borderStrong: '#D1D5DB',

    // Primary — refined amber gold accent
    primary: '#D4A017',
    primaryLight: '#E5C158',
    primaryForeground: '#FFFFFF',

    // Accent
    accent: '#D4A017',
    accentForeground: '#FFFFFF',

    // Legacy tint alias
    tint: '#D4A017',

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

    // Status badges (Consistent everywhere)
    statusApplied: '#2563EB',
    statusAppliedBg: '#EFF6FF',
    statusAllotted: '#10B981',
    statusAllottedBg: '#ECFDF5',
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
    statusSold: '#65A30D',
    statusSoldBg: '#F7FEE7',

    // Shadow helper
    shadowCard: '0 1px 3px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.03)',
    shadowModal: '0 8px 30px rgba(0,0,0,0.12)',

    radius: 16,
  },

  dark: {
    // Layered obsidian dark — smooth depth, zero eye strain, avoiding pure black
    background: '#0E1117',
    surface: '#161B22',
    card: '#1F242D',
    cardAlt: '#282E39',

    foreground: '#F3F4F6',
    secondaryForeground: '#D1D5DB',
    mutedForeground: '#9CA3AF',

    border: '#2E3545',
    borderStrong: '#3E4659',

    primary: '#D4A017',
    primaryLight: '#E5C158',
    primaryForeground: '#0E1117',

    accent: '#D4A017',
    accentForeground: '#0E1117',

    tint: '#D4A017',

    destructive: '#F87171',
    destructiveForeground: '#FFFFFF',
    destructiveBg: '#3F1718',

    muted: '#1F242D',

    positive: '#34D399',
    positiveBg: '#064E3B22',
    positiveDim: '#064E3B44',

    negative: '#F87171',
    negativeBg: '#7F1D1D22',
    negativeDim: '#7F1D1D44',

    statusApplied: '#60A5FA',
    statusAppliedBg: '#1E3A8A33',
    statusAllotted: '#34D399',
    statusAllottedBg: '#064E3B33',
    statusHolding: '#A78BFA',
    statusHoldingBg: '#4C1D9533',
    statusNotAllotted: '#F87171',
    statusNotAllottedBg: '#7F1D1D33',
    statusPending: '#FBBF24',
    statusPendingBg: '#78350F33',
    statusListed: '#A78BFA',
    statusListedBg: '#4C1D9533',
    statusRefund: '#9CA3AF',
    statusRefundBg: '#37415133',
    statusSold: '#A3E635',
    statusSoldBg: '#36531433',

    shadowCard: '0 2px 8px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)',
    shadowModal: '0 12px 48px rgba(0,0,0,0.65)',

    radius: 16,
  },

  radius: 16,
};

export default colors;
