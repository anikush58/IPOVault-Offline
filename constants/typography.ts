export const typography = {
  // Serif fonts for premium wealth titles (matching reference images)
  serifRegular: 'PlayfairDisplay_400Regular',
  serifSemiBold: 'PlayfairDisplay_600SemiBold',
  serifBold: 'PlayfairDisplay_700Bold',

  // Sans fonts for numerical data, buttons, badges, labels
  sansRegular: 'GoogleSansFlex_400Regular',
  sansMedium: 'GoogleSansFlex_500Medium',
  sansSemiBold: 'GoogleSansFlex_600SemiBold',
  sansBold: 'GoogleSansFlex_700Bold',

  // Preset styles
  heroValue: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 34,
    letterSpacing: -1,
    lineHeight: 40,
  },
  sectionTitle: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  cardTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  microEyebrow: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
};
