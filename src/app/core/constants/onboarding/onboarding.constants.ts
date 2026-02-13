import type { OnboardingSlide } from '@core/models';

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    key: 'problem',
    titleKey: 'onboarding.slides.problem.title',
    descriptionKey: 'onboarding.slides.problem.description',
    icon: 'alert-circle-outline',
  },
  {
    key: 'simple',
    titleKey: 'onboarding.slides.simple.title',
    descriptionKey: 'onboarding.slides.simple.description',
    icon: 'basket-outline',
  },
  {
    key: 'benefit',
    titleKey: 'onboarding.slides.benefit.title',
    descriptionKey: 'onboarding.slides.benefit.description',
    icon: 'pricetag-outline',
  },
  {
    key: 'action',
    titleKey: 'onboarding.slides.action.title',
    descriptionKey: 'onboarding.slides.action.description',
    icon: 'add-outline',
  },
] as const;
