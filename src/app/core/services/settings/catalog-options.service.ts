import { Injectable, inject } from '@angular/core';
import { isDuplicateCatalogValue, normalizeCatalogOptions } from '@core/domain/settings';
import { formatFriendlyName, normalizeCategoryId, normalizeLocationId, normalizeSupermarketValue } from '@core/utils/normalization.util';
import { SettingsPreferencesService } from './settings-preferences.service';

/**
 * Centralized service for managing catalog options (categories, locations, supermarkets).
 * Prevents duplication of catalog management logic across multiple services.
 */
@Injectable({
  providedIn: 'root'
})
export class CatalogOptionsService {
  private readonly appPreferences = inject(SettingsPreferencesService);

  /**
   * Add a new category option if it doesn't already exist.
   * Returns the final value (either newly added or existing match).
   */
  async addCategoryOption(value: string): Promise<string> {
    const formatted = formatFriendlyName(value, value);
    const normalized = normalizeCategoryId(formatted);
    const current = await this.appPreferences.getPreferences();

    // Find existing match
    const existingMatch = this.findExistingOption(formatted, current.categoryOptions, normalizeCategoryId);
    if (existingMatch) {
      return existingMatch;
    }

    // Add new option
    const updated = normalizeCatalogOptions([...current.categoryOptions, formatted]);
    await this.appPreferences.savePreferences({ ...current, categoryOptions: updated });
    return formatted;
  }

  /**
   * Add a new location option if it doesn't already exist.
   * Returns the final value (either newly added or existing match).
   */
  async addLocationOption(value: string): Promise<string> {
    const formatted = formatFriendlyName(value, value);
    const normalized = normalizeLocationId(formatted);
    const current = await this.appPreferences.getPreferences();

    // Find existing match
    const existingMatch = this.findExistingOption(formatted, current.locationOptions, normalizeLocationId);
    if (existingMatch) {
      return existingMatch;
    }

    // Add new option
    const updated = normalizeCatalogOptions([...current.locationOptions, formatted]);
    await this.appPreferences.savePreferences({ ...current, locationOptions: updated });
    return formatted;
  }

  /**
   * Add a new supermarket option if it doesn't already exist.
   * Returns the final value (either newly added or existing match).
   */
  async addSupermarketOption(value: string): Promise<string> {
    const formatted = formatFriendlyName(value, value);
    const normalized = normalizeSupermarketValue(formatted);
    const current = await this.appPreferences.getPreferences();

    // Find existing match
    const existingMatch = this.findExistingOption(formatted, current.supermarketOptions, normalizeSupermarketValue);
    if (existingMatch) {
      return existingMatch;
    }

    // Add new option
    const updated = normalizeCatalogOptions([...current.supermarketOptions, formatted]);
    await this.appPreferences.savePreferences({ ...current, supermarketOptions: updated });
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

    const normalizedKey = (normalizedValue ?? '').toLowerCase();
    return (existing ?? []).find(option => {
      const normalizedOption = normalize(option);
      return (normalizedOption ?? '').toLowerCase() === normalizedKey;
    });
  }
}
