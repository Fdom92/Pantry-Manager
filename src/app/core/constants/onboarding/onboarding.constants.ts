import type { OnboardingSlide } from '@core/models';

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    key: 'dashboard',
    titleKey: 'onboarding.slides.dashboard.title',
    descriptionKey: 'onboarding.slides.dashboard.description',
    icon: 'home-outline',
  },
  {
    key: 'pantry',
    titleKey: 'onboarding.slides.pantry.title',
    descriptionKey: 'onboarding.slides.pantry.description',
    icon: 'basket-outline',
  },
  {
    key: 'planner',
    titleKey: 'onboarding.slides.planner.title',
    descriptionKey: 'onboarding.slides.planner.description',
    icon: 'restaurant-outline',
  },
  {
    key: 'shopping',
    titleKey: 'onboarding.slides.shopping.title',
    descriptionKey: 'onboarding.slides.shopping.description',
    icon: 'cart-outline',
  },
  {
    key: 'settings',
    titleKey: 'onboarding.slides.settings.title',
    descriptionKey: 'onboarding.slides.settings.description',
    icon: 'settings-outline',
  },
];
