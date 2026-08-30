import { TextStyle } from "react-native";

export const fontFamily = {
  sans: "GoogleSansFlex",
  sansBold: "GoogleSansFlex",
  serif: "PlayfairDisplay_600SemiBold",
  mono: "System",
} as const;

export const typography: Record<string, TextStyle> = {
  Display: {
    fontFamily: fontFamily.sans,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
  },
  Headline: {
    fontFamily: fontFamily.sans,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
  },
  Title: {
    fontFamily: fontFamily.sans,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
  },
  Body: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
  },
  Caption: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  Label: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
} as const;
