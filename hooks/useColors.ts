import { useTheme } from '@/context/ThemeContext';
import colors from '@/constants/colors';

/**
 * Returns the design tokens for the active color scheme.
 *
 * Reads from ThemeContext so the user's in-app preference (light / dark /
 * system) overrides the OS system setting. Falls back to the light palette
 * when the dark key is not defined.
 */
export function useColors() {
  const { resolvedScheme } = useTheme();
  const palette =
    resolvedScheme === 'dark' && 'dark' in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
