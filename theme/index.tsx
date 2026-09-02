import React, { createContext, useContext, useState, useMemo } from "react";
import { useColorScheme } from "react-native";
import { themeColors, ThemeColors } from "./colors";
import { ThemeContextType, ThemeMode, ColorScheme } from "../types/theme";

const ThemeContext = createContext<ThemeContextType>({
  mode: "light",
  colorScheme: "light",
  colors: themeColors.light,
  setMode: () => {},
  isDark: false,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("light");

  const colorScheme: ColorScheme = useMemo(() => {
    if (mode === "system") {
      return systemColorScheme === "dark" ? "dark" : "light";
    }
    return mode;
  }, [mode, systemColorScheme]);

  const activeColors: ThemeColors = useMemo(() => {
    return themeColors[colorScheme];
  }, [colorScheme]);

  const isDark = colorScheme === "dark";

  const value = useMemo(
    () => ({
      mode,
      colorScheme,
      colors: activeColors,
      setMode,
      isDark,
    }),
    [mode, colorScheme, activeColors, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
