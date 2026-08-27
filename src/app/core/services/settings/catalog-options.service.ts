import { Injectable, inject } from '@angular/core';
import { normalizeCatalogOptions } from '@core/domain/settings';
import { formatFriendlyName, normalizeCategoryId, normalizeLocationId, normalizeSupermarketValue } from '@core/utils/normalization.util';
import { SettingsPreferencesService } from './settings-preferences.service';
import type { CatalogKind } from './settings-catalogs-state.service';

/** How each catalog decides that two values are the same thing. */
const CATALOG_NORMALIZERS: Record<CatalogKind, (value: string) => string | undefined> = {
  category: normalizeCategoryId,
  location: normalizeLocationId,
  supermarket: normalizeSupermarketValue,
};

/**
 * Adds values to the user's catalogs (categories, locations, supermarkets)
 * from wherever a product form lets someone type a new one.
 */
@Injectable({
  providedIn: 'root'
})
export class CatalogOptionsService {
  private readonly appPreferences = inject(SettingsPreferencesService);

  /**
   * Add a value to a catalog unless an equivalent one is already there.
   * Returns what the caller should select: the existing match if there was
   * one, otherwise the newly added value.
   */
  async addOption(kind: CatalogKind, value: string): Promise<string> {
    const formatted = formatFriendlyName(value, value);
    const current = await this.appPreferences.getPreferences();
    const field = `${kind}Options` as const;

    const existingMatch = this.findExistingOption(formatted, current[field], CATALOG_NORMALIZERS[kind]);
    if (existingMatch) {
      return existingMatch;
    }

    const updated = normalizeCatalogOptions([...current[field], formatted]);
    await this.appPreferences.savePreferences({ ...current, [field]: updated });
    return formatted;
  }

  /**
   * Find an existing option that matches the given value (case-insensitive).
   */
  private findExistingOption(
    value: string,
    existing: string[] | null | undefined,
    normalize: (val: string) => string | undefined
  ): string | undefined {
    const normalizedValue = normalize(value);
    if (!normalizedValue) return undefined;

    const normalizedKey = normalizedValue.toLowerCase();
    return (existing ?? []).find(option => {
      const normalizedOption = normalize(option);
      return (normalizedOption ?? '').toLowerCase() === normalizedKey;
    });
  }
}
