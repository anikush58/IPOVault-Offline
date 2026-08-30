import { useTheme } from '@/context/ThemeContext';
import { OnboardingSlideData } from '@/constants/onboarding';

export function useColorSchemeAssets() {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const getSlideImage = (slide: OnboardingSlideData) => {
    return isDark ? slide.imageDark : slide.imageLight;
  };

  return {
    isDark,
    colorScheme: resolvedScheme,
    getSlideImage,
  };
}
