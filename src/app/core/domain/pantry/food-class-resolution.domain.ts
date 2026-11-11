import type { FoodType } from '@core/models/shared/enums.model';
import { normalizeForClassification } from '@core/utils/normalization.util';
import { FOOD_CLASSES, FOOD_CLASS_BY_KEY, genericClassFor } from './food-classes.data';
import type { FoodClass } from './food-classes.model';

interface TermIndex {
  byTerm: ReadonlyMap<string, FoodClass>;
  maxWords: number;
}

function buildIndex(classes: readonly FoodClass[]): TermIndex {
  const byTerm = new Map<string, FoodClass>();
  let maxWords = 1;
  for (const foodClass of classes) {
    for (const terms of Object.values(foodClass.terms)) {
      for (const raw of terms) {
        const term = normalizeForClassification(raw);
        if (!term) continue;
        if (!byTerm.has(term)) byTerm.set(term, foodClass);
        maxWords = Math.max(maxWords, term.split(' ').length);
      }
    }
  }
  return { byTerm, maxWords };
}

const DEFAULT_INDEX = buildIndex(FOOD_CLASSES);

/** The word as typed, then without a plural ending ("yogures" -> "yogur"). Short words stay as typed: "sal", "gas". */
function wordVariants(word: string): string[] {
  const variants = [word];
  if (word.length < 4) return variants;
  if (word.endsWith('es')) variants.push(word.slice(0, -2));
  if (word.endsWith('s')) variants.push(word.slice(0, -1));
  return variants;
}

/** Every phrase spelling reachable by singularising any subset of its words. */
function phraseVariants(gram: string[]): string[] {
  return gram.reduce<string[]>(
    (acc, word) => acc.flatMap(prefix => wordVariants(word).map(v => (prefix ? `${prefix} ${v}` : v))),
    [''],
  );
}

/**
 * Class whose term best matches the name: whole words only, the longest term
 * wins, a preparation beats its ingredients at equal length, then leftmost.
 * An exact phrase beats a singularised one at the same size.
 * `classes` exists so tests can inject a small table.
 */
export function matchFoodClass(name: string, classes: readonly FoodClass[] = FOOD_CLASSES): FoodClass | null {
  const words = normalizeForClassification(name).split(' ').filter(Boolean);
  if (!words.length) return null;
  const { byTerm, maxWords } = classes === FOOD_CLASSES ? DEFAULT_INDEX : buildIndex(classes);

  const pick = (size: number, forms: (gram: string[]) => string[]): FoodClass | null => {
    let best: FoodClass | null = null;
    for (let start = 0; start + size <= words.length; start++) {
      for (const form of forms(words.slice(start, start + size))) {
        const found = byTerm.get(form);
        if (found && (!best || (found.preparation && !best.preparation))) best = found;
      }
    }
    return best;
  };

  for (let size = Math.min(maxWords, words.length); size >= 1; size--) {
    const best = pick(size, gram => [gram.join(' ')]) ?? pick(size, phraseVariants);
    if (best) return best;
  }
  return null;
}

/**
 * Class of a product. A stored foodKind is authoritative; a stored foodType
 * without a kind means the user (or an old record) fixed the type by hand, so
 * the name must not override it and the type's generic class applies.
 */
export function resolveFoodClass(
  name: string,
  foodType?: FoodType | null,
  foodKind?: string | null,
): FoodClass | null {
  const byKind = foodKind ? FOOD_CLASS_BY_KEY.get(foodKind) : undefined;
  if (byKind) return byKind;
  if (foodType) return genericClassFor(foodType);
  return matchFoodClass(name);
}
