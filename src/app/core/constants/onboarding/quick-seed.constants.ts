import { FoodType } from '@core/models/shared';

export interface OnboardingQuickSeedItem {
  key: string;
  emoji: string;
  foodType: FoodType;
  productType: 'fresh' | 'pantry';
  alwaysNoExpiry?: boolean;
}

export const ONBOARDING_QUICK_SEED_ITEMS: readonly OnboardingQuickSeedItem[] = [
  { key: 'milk', emoji: '🥛', foodType: FoodType.DAIRY, productType: 'pantry' },
  { key: 'eggs', emoji: '🥚', foodType: FoodType.PROTEIN, productType: 'fresh' },
  { key: 'cheese', emoji: '🧀', foodType: FoodType.DAIRY, productType: 'fresh' },
  { key: 'butter', emoji: '🧈', foodType: FoodType.DAIRY, productType: 'fresh' },
  { key: 'yogurt', emoji: '🥣', foodType: FoodType.DAIRY, productType: 'fresh' },
  { key: 'cannedTuna', emoji: '🐟', foodType: FoodType.PROTEIN, productType: 'pantry' },

  { key: 'bread', emoji: '🍞', foodType: FoodType.CARB, productType: 'fresh' },
  { key: 'pasta', emoji: '🍝', foodType: FoodType.CARB, productType: 'pantry' },
  { key: 'rice', emoji: '🍚', foodType: FoodType.CARB, productType: 'pantry' },
  { key: 'flour', emoji: '🌾', foodType: FoodType.CARB, productType: 'pantry' },
  { key: 'chickpeas', emoji: '🫘', foodType: FoodType.CARB, productType: 'pantry' },
  { key: 'lentils', emoji: '🫛', foodType: FoodType.CARB, productType: 'pantry' },

  { key: 'tomato', emoji: '🍅', foodType: FoodType.VEGETABLE, productType: 'fresh' },
  { key: 'onion', emoji: '🧅', foodType: FoodType.VEGETABLE, productType: 'fresh' },
  { key: 'potato', emoji: '🥔', foodType: FoodType.VEGETABLE, productType: 'fresh' },
  { key: 'lemon', emoji: '🍋', foodType: FoodType.FRUIT, productType: 'fresh' },
  { key: 'apple', emoji: '🍎', foodType: FoodType.FRUIT, productType: 'fresh' },
  { key: 'banana', emoji: '🍌', foodType: FoodType.FRUIT, productType: 'fresh' },

  { key: 'oliveOil', emoji: '🫒', foodType: FoodType.OTHER, productType: 'pantry' },
  { key: 'salt', emoji: '🧂', foodType: FoodType.OTHER, productType: 'pantry', alwaysNoExpiry: true },
  { key: 'pepper', emoji: '🌶️', foodType: FoodType.OTHER, productType: 'pantry', alwaysNoExpiry: true },
  { key: 'sugar', emoji: '🍯', foodType: FoodType.OTHER, productType: 'pantry', alwaysNoExpiry: true },
  { key: 'coffee', emoji: '☕', foodType: FoodType.OTHER, productType: 'pantry' },
  { key: 'vinegar', emoji: '🍷', foodType: FoodType.OTHER, productType: 'pantry', alwaysNoExpiry: true },
] as const;
