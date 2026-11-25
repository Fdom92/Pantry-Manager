import type { OnboardingSlide } from '@core/models';

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    key: 'add',
    titleKey: 'onboarding.slides.add.title',
    descriptionKey: 'onboarding.slides.add.description',
    icon: 'basket-outline',
  },
  {
    key: 'notifications',
    titleKey: 'onboarding.slides.notifications.title',
    descriptionKey: 'onboarding.slides.notifications.description',
    icon: 'notifications-outline',
  },
  {
    key: 'analytics',
    titleKey: 'onboarding.slides.analytics.title',
    descriptionKey: 'onboarding.slides.analytics.description',
    icon: 'analytics-outline',
  },
] as const;
