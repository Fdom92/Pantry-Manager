import { SetupOption, SetupStep } from '@core/models/setup';

export const SETUP_LOCATION_OPTIONS: SetupOption[] = [
  { id: 'pantry', labelKey: 'setup.locations.options.pantry' },
  { id: 'fridge', labelKey: 'setup.locations.options.fridge' },
  { id: 'kitchen', labelKey: 'setup.locations.options.kitchen' },
  { id: 'freezer', labelKey: 'setup.locations.options.freezer' },
];

export const SETUP_CATEGORY_OPTIONS: SetupOption[] = [
  { id: 'proteins', labelKey: 'setup.categories.options.proteins' },
  { id: 'dairy', labelKey: 'setup.categories.options.dairy' },
  { id: 'fruits', labelKey: 'setup.categories.options.fruits' },
  { id: 'drinks', labelKey: 'setup.categories.options.drinks' },
  { id: 'cereals', labelKey: 'setup.categories.options.cereals' },
  { id: 'condiments', labelKey: 'setup.categories.options.condiments' },
  { id: 'canned', labelKey: 'setup.categories.options.canned' },
  { id: 'sweets', labelKey: 'setup.categories.options.sweets' },
  { id: 'snacks', labelKey: 'setup.categories.options.snacks' },
  { id: 'vegetables', labelKey: 'setup.categories.options.vegetables' },
  { id: 'household', labelKey: 'setup.categories.options.household' },
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
