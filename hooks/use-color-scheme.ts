import { useTheme } from '@/context/ThemeContext';

export function useColorScheme() {
  const { resolvedScheme } = useTheme();
  return resolvedScheme;
}
