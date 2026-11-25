import type { OnboardingQuickSeedItem } from '@core/constants/onboarding/quick-seed.constants';
import type { PantryItem } from '@core/models/pantry';
import { normalizeProductKey } from '@core/utils/normalization.util';

export type AddOption =
  | { kind: 'own'; item: PantryItem }
  | { kind: 'basic'; seed: OnboardingQuickSeedItem; name: string };

/**
 * What the add sheet offers: the user's own products first, then the basics
 * they do not have yet. With no query and some products of their own, only
 * those are listed; basics are the starting point for an empty pantry.
 */
export function buildAddOptions(
  own: readonly PantryItem[],
  basics: readonly { seed: OnboardingQuickSeedItem; name: string }[],
  query: string,
): AddOption[] {
  const q = normalizeProductKey(query);
  const owned = new Set(own.map(item => normalizeProductKey(item.name)));
  const ownMatches = own.filter(item => normalizeProductKey(item.name).includes(q));
  if (!q && ownMatches.length) {
    return ownMatches.map(item => ({ kind: 'own', item }));
  }
  const basicMatches = basics.filter(b => {
    const key = normalizeProductKey(b.name);
    return !owned.has(key) && key.includes(q);
  });
  return [
    ...ownMatches.map((item): AddOption => ({ kind: 'own', item })),
    ...basicMatches.map((b): AddOption => ({ kind: 'basic', ...b })),
  ];
}
