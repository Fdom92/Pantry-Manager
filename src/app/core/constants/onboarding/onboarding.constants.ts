import type { OnboardingSlide } from '@core/models';

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    key: 'problem',
    titleKey: 'onboarding.slides.problem.title',
    descriptionKey: 'onboarding.slides.problem.description',
    icon: 'alert-circle-outline',
  },
  {
    key: 'fresh',
    titleKey: 'onboarding.slides.fresh.title',
    descriptionKey: 'onboarding.slides.fresh.description',
    icon: 'leaf-outline',
  },
  {
    key: 'action',
    titleKey: 'onboarding.slides.action.title',
    descriptionKey: 'onboarding.slides.action.description',
    icon: 'add-outline',
  },
] as const;
