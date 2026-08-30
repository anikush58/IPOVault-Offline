import { ThemeColors } from "../theme/colors";

export type ThemeMode = "system" | "light" | "dark";
export type ColorScheme = "light" | "dark";

export interface ThemeContextType {
  mode: ThemeMode;
  colorScheme: ColorScheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}
