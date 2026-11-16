/**
 * What the grid offers. The class gives each one its type, its date and whether
 * it lives in the pantry or the fridge, so nothing here repeats those facts.
 * Keys are food-class keys (core/domain/pantry/food-classes.data.ts).
 */
export interface OnboardingQuickSeedItem {
  key: string;
  emoji: string;
  classKey: string;
}

export const ONBOARDING_QUICK_SEED_ITEMS: readonly OnboardingQuickSeedItem[] = [
  { key: 'milk', emoji: '🥛', classKey: 'uht-milk' },
  { key: 'eggs', emoji: '🥚', classKey: 'eggs' },
  { key: 'cheese', emoji: '🧀', classKey: 'fresh-cheese' },
  { key: 'butter', emoji: '🧈', classKey: 'butter' },
  { key: 'yogurt', emoji: '🥣', classKey: 'yogurt' },
  { key: 'cannedTuna', emoji: '🐟', classKey: 'canned' },

  { key: 'bread', emoji: '🍞', classKey: 'fresh-bread' },
  { key: 'pasta', emoji: '🍝', classKey: 'dry-pasta' },
  { key: 'rice', emoji: '🍚', classKey: 'rice-grains' },
  { key: 'flour', emoji: '🌾', classKey: 'flour' },
  { key: 'chickpeas', emoji: '🫘', classKey: 'dried-legumes' },
  { key: 'lentils', emoji: '🫛', classKey: 'dried-legumes' },

  { key: 'tomato', emoji: '🍅', classKey: 'fruiting-veg' },
  { key: 'onion', emoji: '🧅', classKey: 'bulbs-tubers' },
  { key: 'potato', emoji: '🥔', classKey: 'bulbs-tubers' },
  { key: 'lemon', emoji: '🍋', classKey: 'citrus' },
  { key: 'apple', emoji: '🍎', classKey: 'hardy-fruit' },
  { key: 'banana', emoji: '🍌', classKey: 'common-fruit' },

  { key: 'oliveOil', emoji: '🫒', classKey: 'oil' },
  { key: 'salt', emoji: '🧂', classKey: 'salt-spices' },
  { key: 'pepper', emoji: '🌶️', classKey: 'salt-spices' },
  { key: 'sugar', emoji: '🍯', classKey: 'salt-spices' },
  { key: 'coffee', emoji: '☕', classKey: 'coffee' },
  { key: 'vinegar', emoji: '🍷', classKey: 'salt-spices' },
] as const;
