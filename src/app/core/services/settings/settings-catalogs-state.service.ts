import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_CATEGORY_OPTIONS,
  DEFAULT_LOCATION_OPTIONS,
  DEFAULT_SUPERMARKET_OPTIONS,
} from '@core/constants';
import { normalizeStringList } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { ToastService, withSignalFlag } from '../shared';
import { AppPreferencesService } from './app-preferences.service';

@Injectable()
export class SettingsCatalogsStateService {
  private readonly appPreferencesService = inject(AppPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly savingCatalogs = signal(false);
  readonly locationOptionsDraft = signal<string[]>([]);
  readonly originalLocationOptions = signal<string[]>([]);
  readonly categoryOptionsDraft = signal<string[]>([]);
  readonly originalCategoryOptions = signal<string[]>([]);
  readonly supermarketOptionsDraft = signal<string[]>([]);
  readonly originalSupermarketOptions = signal<string[]>([]);

  readonly hasLocationChanges = computed(() => {
    const draft = this.normalizeLocationOptions(this.locationOptionsDraft(), false);
    const original = this.originalLocationOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });

  readonly hasCategoryChanges = computed(() => {
    const draft = this.normalizeCategoryOptions(this.categoryOptionsDraft(), false);
    const original = this.originalCategoryOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });

  readonly hasSupermarketChanges = computed(() => {
    const draft = this.normalizeSupermarketOptions(this.supermarketOptionsDraft(), false);
    const original = this.originalSupermarketOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });

  readonly hasAnyChanges = computed(
    () => this.hasLocationChanges() || this.hasCategoryChanges() || this.hasSupermarketChanges(),
  );

  async ionViewWillEnter(): Promise<void> {
    await this.loadPreferences();
  }

  addLocationOption(): void {
    this.locationOptionsDraft.update(options => [...options, '']);
  }

  removeLocationOption(index: number): void {
    this.locationOptionsDraft.update(options => options.filter((_, i) => i !== index));
  }

  onLocationOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.locationOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  restoreDefaultLocationOptions(): void {
    this.locationOptionsDraft.set([...DEFAULT_LOCATION_OPTIONS]);
  }

  addCategoryOption(): void {
    this.categoryOptionsDraft.update(options => [...options, '']);
  }

  removeCategoryOption(index: number): void {
    this.categoryOptionsDraft.update(options => options.filter((_, i) => i !== index));
  }

  onCategoryOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.categoryOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  restoreDefaultCategoryOptions(): void {
    this.categoryOptionsDraft.set([...DEFAULT_CATEGORY_OPTIONS]);
  }

  addSupermarketOption(): void {
    this.supermarketOptionsDraft.update(options => [...options, '']);
  }

  removeSupermarketOption(index: number): void {
    this.supermarketOptionsDraft.update(options => options.filter((_, i) => i !== index));
  }

  onSupermarketOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.supermarketOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  restoreDefaultSupermarketOptions(): void {
    this.supermarketOptionsDraft.set([...DEFAULT_SUPERMARKET_OPTIONS]);
  }

  async saveCatalogs(): Promise<void> {
    if (this.savingCatalogs() || !this.hasAnyChanges()) {
      return;
    }

    const normalizedLocations = this.normalizeLocationOptions(this.locationOptionsDraft(), false);
    const normalizedCategories = this.normalizeCategoryOptions(this.categoryOptionsDraft(), false);
    const normalizedSupermarkets = this.normalizeSupermarketOptions(this.supermarketOptionsDraft(), false);

    const locationPayload = normalizedLocations.length ? normalizedLocations : [...DEFAULT_LOCATION_OPTIONS];
    const categoryPayload = normalizedCategories.length ? normalizedCategories : [...DEFAULT_CATEGORY_OPTIONS];
    const supermarketPayload = normalizedSupermarkets.length ? normalizedSupermarkets : [...DEFAULT_SUPERMARKET_OPTIONS];

    await withSignalFlag(this.savingCatalogs, async () => {
      const current = await this.appPreferencesService.getPreferences();
      await this.appPreferencesService.savePreferences({
        ...current,
        locationOptions: locationPayload,
        categoryOptions: categoryPayload,
        supermarketOptions: supermarketPayload,
      });
      this.originalLocationOptions.set(locationPayload);
      this.originalCategoryOptions.set(categoryPayload);
      this.originalSupermarketOptions.set(supermarketPayload);
      this.locationOptionsDraft.set([...locationPayload]);
      this.categoryOptionsDraft.set([...categoryPayload]);
      this.supermarketOptionsDraft.set([...supermarketPayload]);
      await this.toast.present(this.translate.instant('settings.catalogs.saveSuccess'), { color: 'success' });
    }).catch(async err => {
      console.error('[SettingsCatalogsStateService] saveCatalogs error', err);
      await this.toast.present(this.translate.instant('settings.catalogs.saveError'), { color: 'danger' });
    });
  }

  private async loadPreferences(): Promise<void> {
    await withSignalFlag(this.loading, async () => {
      await this.appPreferencesService.getPreferences();
      this.syncLocationOptionsFromPreferences();
      this.syncCategoryOptionsFromPreferences();
      this.syncSupermarketOptionsFromPreferences();
    }).catch(async err => {
      console.error('[SettingsCatalogsStateService] loadPreferences error', err);
      await this.toast.present(this.translate.instant('settings.catalogs.loadError'), { color: 'danger' });
    });
  }

  private syncLocationOptionsFromPreferences(): void {
    const prefs = this.appPreferencesService.preferences();
    const current = this.normalizeLocationOptions(prefs.locationOptions);
    this.originalLocationOptions.set(current);
    this.locationOptionsDraft.set([...current]);
  }

  private syncCategoryOptionsFromPreferences(): void {
    const prefs = this.appPreferencesService.preferences();
    const current = this.normalizeCategoryOptions(prefs.categoryOptions);
    this.originalCategoryOptions.set(current);
    this.categoryOptionsDraft.set([...current]);
  }

  private syncSupermarketOptionsFromPreferences(): void {
    const prefs = this.appPreferencesService.preferences();
    const current = this.normalizeSupermarketOptions(prefs.supermarketOptions);
    this.originalSupermarketOptions.set(current);
    this.supermarketOptionsDraft.set([...current]);
  }

  private normalizeLocationOptions(values: readonly string[] | null | undefined, fallbackToDefault = true): string[] {
    return normalizeStringList(values, {
      fallback: fallbackToDefault ? DEFAULT_LOCATION_OPTIONS : [],
    });
  }

  private normalizeCategoryOptions(values: readonly string[] | null | undefined, fallbackToDefault = true): string[] {
    return normalizeStringList(values, {
      fallback: fallbackToDefault ? DEFAULT_CATEGORY_OPTIONS : [],
    });
  }

  private normalizeSupermarketOptions(values: readonly string[] | null | undefined, fallbackToDefault = true): string[] {
    return normalizeStringList(values, {
      fallback: fallbackToDefault ? DEFAULT_SUPERMARKET_OPTIONS : [],
    });
  }
}
