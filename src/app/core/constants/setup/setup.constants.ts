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

export const SETUP_LOCATION_OPTIONS: SetupOption[] = [
  { id: 'pantry', labelKey: 'setup.locations.options.pantry' },
  { id: 'fridge', labelKey: 'setup.locations.options.fridge' },
  { id: 'kitchen', labelKey: 'setup.locations.options.kitchen' },
  { id: 'freezer', labelKey: 'setup.locations.options.freezer' },
];

export const SETUP_CATEGORY_OPTIONS: SetupOption[] = [
  { id: 'dairy', labelKey: 'setup.categories.options.dairy' },
  { id: 'cereals', labelKey: 'setup.categories.options.cereals' },
  { id: 'pasta', labelKey: 'setup.categories.options.pasta' },
  { id: 'fresh', labelKey: 'setup.categories.options.fresh' },
  { id: 'canned', labelKey: 'setup.categories.options.canned' },
  { id: 'coldCuts', labelKey: 'setup.categories.options.coldCuts' },
  { id: 'sweets', labelKey: 'setup.categories.options.sweets' },
  { id: 'snacks', labelKey: 'setup.categories.options.snacks' },
  { id: 'drinks', labelKey: 'setup.categories.options.drinks' },
  { id: 'sauces', labelKey: 'setup.categories.options.sauces' },
  { id: 'spices', labelKey: 'setup.categories.options.spices' },
];

export const SETUP_STEPS: SetupStep[] = [
  {
    key: 'locations',
    titleKey: 'setup.locations.title',
    descriptionKey: 'setup.locations.description',
    icon: 'home-outline',
    options: SETUP_LOCATION_OPTIONS,
  },
  {
    key: 'categories',
    titleKey: 'setup.categories.title',
    descriptionKey: 'setup.categories.description',
    icon: 'pricetag-outline',
    options: SETUP_CATEGORY_OPTIONS,
  },
];
