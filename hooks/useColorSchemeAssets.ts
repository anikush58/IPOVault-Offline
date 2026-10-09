import { useTheme } from '@/context/ThemeContext';

export function useColorSchemeAssets() {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  return {
    isDark,
    colorScheme: resolvedScheme,
  };
}

