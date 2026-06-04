import type { OnboardingSlide } from '@core/models';

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
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
  {
    key: 'seed',
    titleKey: 'onboarding.slides.seed.title',
    descriptionKey: 'onboarding.slides.seed.description',
    icon: 'basket-outline',
  },
  {
    key: 'confirm',
    titleKey: 'onboarding.slides.confirm.title',
    descriptionKey: 'onboarding.slides.confirm.description',
    icon: 'checkmark-circle-outline',
  },
] as const;
