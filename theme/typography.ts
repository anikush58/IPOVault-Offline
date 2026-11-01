import { TextStyle } from "react-native";

export const fontFamily = {
  sans: "GoogleSansFlex_400Regular",
  sansMedium: "GoogleSansFlex_500Medium",
  sansSemiBold: "GoogleSansFlex_600SemiBold",
  sansBold: "GoogleSansFlex_700Bold",
  spaceGrotesk: "SpaceGrotesk_700Bold",
  spaceMono: "SpaceMono_400Regular",
  spaceMonoBold: "SpaceMono_700Bold",
  serif: "PlayfairDisplay_600SemiBold",
  mono: "GoogleSansFlex_500Medium",
} as const;

export const typography: Record<string, TextStyle> = {
  Display: {
    fontFamily: fontFamily.sansBold,
    fontSize: 34,
    lineHeight: 40,
  },
  Headline: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 24,
    lineHeight: 30,
  },
  Title: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  Body: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  Caption: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  Label: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
} as const;
