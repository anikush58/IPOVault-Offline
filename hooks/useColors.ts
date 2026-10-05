import { useTheme } from '@/context/ThemeContext';
import colors from '@/constants/colors';

/**
 * Returns the design tokens for the active color scheme and selected accent color.
 *
 * Reads from ThemeContext so the user's in-app preference (light / dark /
 * system) overrides the OS system setting, and dynamically injects the chosen accent color.
 */
export function useColors() {
  const { resolvedScheme, accentColor } = useTheme();
  const palette =
    resolvedScheme === 'dark' && 'dark' in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  return {
    ...palette,
    accent: accentColor || palette.accent,
    accentColor: accentColor || '#3B82F6',
    radius: colors.radius,
  };
}
