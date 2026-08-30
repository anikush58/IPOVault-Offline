export interface OnboardingSlideData {
  id: string;
  imageDark: any;
  imageLight: any;
  title: string;
  subtitle: string;
}

export const ONBOARDING_STORAGE_KEY = '@ipovault_onboarded';

export const ONBOARDING_SLIDES: OnboardingSlideData[] = [
  {
    id: 'discover',
    imageDark: require('@/assets/onboarding/dark/discover.png'),
    imageLight: require('@/assets/onboarding/light/discover.png'),
    title: 'Discover Every IPO\nBefore the Market Moves',
    subtitle: 'Track upcoming, open and listed IPOs in one place with a clean, powerful dashboard.',
  },
  {
    id: 'create_application',
    imageDark: require('@/assets/onboarding/dark/create_application.png'),
    imageLight: require('@/assets/onboarding/light/create_application.png'),
    title: 'Create Applications\nin Seconds',
    subtitle: 'Save your details once and create IPO applications faster with a guided workflow.',
  },
  {
    id: 'track_applications',
    imageDark: require('@/assets/onboarding/dark/track_applications.png'),
    imageLight: require('@/assets/onboarding/light/track_applications.png'),
    title: 'Track Every Application\nLike a Pro',
    subtitle: 'Monitor allotments, listings, notifications and your complete IPO journey from one place.',
  },
];
