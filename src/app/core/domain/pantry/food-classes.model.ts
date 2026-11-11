import type { SupportedLanguage } from '@core/constants';
import { FoodType } from '@core/models/shared/enums.model';

/** A group of products that last the same sealed and opened. Not a product. */
export interface FoodClass {
  /** Stable identifier, kebab-case. Not shown to users. */
  readonly key: string;
  /** Parent type. */
  readonly foodType: FoodType;
  readonly storage: 'pantry' | 'fresh';
  /** null = does not expire. */
  readonly sealedDays: number | null;
  /** null = opening does not shorten it. */
  readonly openedDays: number | null;
  /** null = not applicable, falls back to THAW_MAX_DAYS. */
  readonly thawDays: number | null;
  /** Where the number comes from. */
  readonly source: string;
  /** Sauce, soup, shake…: wins over its ingredients. */
  readonly preparation?: true;
  readonly terms: Record<SupportedLanguage, readonly string[]>;
}
