import { OnboardingSlide } from "@core/models";

  export const CORE_SLIDES: OnboardingSlide[] = [
    {
      key: 'organize',
      titleKey: 'onboarding.slides.organize.title',
      descriptionKey: 'onboarding.slides.organize.description',
      icon: 'sparkles-outline',
    },
    {
      key: 'batches',
      titleKey: 'onboarding.slides.batches.title',
      descriptionKey: 'onboarding.slides.batches.description',
      icon: 'layers-outline',
    },
    {
      key: 'suggestions',
      titleKey: 'onboarding.slides.suggestions.title',
      descriptionKey: 'onboarding.slides.suggestions.description',
      icon: 'bulb-outline',
    },
  ];
  export const AGENT_SLIDE_LOCKED: OnboardingSlide = {
    key: 'agent',
    titleKey: 'onboarding.slides.agent.title',
    descriptionKey: 'onboarding.slides.agent.description',
    icon: 'chatbubbles-outline',
    badgeKey: 'onboarding.slides.agent.badge',
    pro: true,
  };
  export const AGENT_SLIDE_UNLOCKED: OnboardingSlide = {
    key: 'agent',
    titleKey: 'onboarding.slides.agent.titlePro',
    descriptionKey: 'onboarding.slides.agent.descriptionPro',
    icon: 'chatbubbles-outline',
    badgeKey: 'onboarding.slides.agent.badgePro',
    pro: true,
  };
