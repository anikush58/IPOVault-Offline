export interface OnboardingSlideData {
  id: string;
  title: string;
  subtitle: string;
}

export const ONBOARDING_STORAGE_KEY = '@ipovault_onboarded';

export const ONBOARDING_SLIDES: OnboardingSlideData[] = [
  {
    id: 'discover',
    title: 'Discover Every IPO\nBefore the Market Moves',
    subtitle: 'Track upcoming, open and listed IPOs in one place with a clean, powerful dashboard.',
  },
  {
    id: 'create_application',
    title: 'Create Applications\nin Seconds',
    subtitle: 'Save your details once and create IPO applications faster with a guided workflow.',
  },
  {
    id: 'track_applications',
    title: 'Track Every Application\nLike a Pro',
    subtitle: 'Monitor allotments, listings, notifications and your complete IPO journey from one place.',
  },
];
