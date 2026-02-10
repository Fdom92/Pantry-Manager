export type SetupStepKey = 'locations' | 'categories';

export interface SetupOption {
  id: string;
  labelKey: string;
}

export interface SetupStep {
  key: SetupStepKey;
  titleKey: string;
  descriptionKey: string;
  icon: string;
  options: SetupOption[];
}
