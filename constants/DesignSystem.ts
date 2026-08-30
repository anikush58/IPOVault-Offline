/**
 * IPOVault Unified Design System Specs
 * Single source of truth for Spacing, Radius, Typography, Shadows, Touch Targets, Gradients & Motion.
 */

export const DesignSystem = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    section: 32,
  },

  radius: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    pill: 9999,
  },

  touchTarget: {
    minHeight: 44,
    minWidth: 44,
  },

  typography: {
    fontRegular: 'GoogleSansFlex_400Regular',
    fontMedium: 'GoogleSansFlex_500Medium',
    fontSemiBold: 'GoogleSansFlex_600SemiBold',
    fontBold: 'GoogleSansFlex_700Bold',

    size: {
      eyebrow: 10,
      caption: 11,
      bodySm: 12,
      body: 13,
      bodyLg: 14,
      subhead: 15,
      title: 17,
      headline: 20,
      display: 28,
      hero: 34,
    },
  },

  gradients: {
    gold: ['#D4A017', '#E5C158'] as const,
    goldDark: ['#B8860B', '#D4A017'] as const,
  },

  motion: {
    duration: {
      fast: 150,
      normal: 250,
      slow: 350,
    },
    activeOpacity: 0.78,
  },

  tabs: {
    height: {
      segmented: 42,
      underline: 44,
      pills: 36,
    },
    radius: {
      segmented: 12,
      pills: 20,
    },
    fontSize: {
      sm: 12,
      md: 13,
      lg: 14,
    },
    fontActive: 'GoogleSansFlex_700Bold',
    fontInactive: 'GoogleSansFlex_600SemiBold',
    activeColor: '#D4A017',
  },
} as const;
