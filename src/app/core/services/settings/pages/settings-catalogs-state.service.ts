import { Injectable, computed, inject, signal } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { PantryService } from '@core/services/pantry/pantry.service';
import { normalizeKey, normalizeStringList, normalizeSupermarketValue } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { ToastService, withSignalFlag } from '../../shared';
import { AppPreferencesService } from '../app-preferences.service';

@Injectable()
export class SettingsCatalogsStateService {
  private readonly appPreferencesService = inject(AppPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly pantryService = inject(PantryService);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly locationOptionsDraft = signal<string[]>([]);
  readonly originalLocationOptions = signal<string[]>([]);
  readonly categoryOptionsDraft = signal<string[]>([]);
  readonly originalCategoryOptions = signal<string[]>([]);
  readonly supermarketOptionsDraft = signal<string[]>([]);
  readonly originalSupermarketOptions = signal<string[]>([]);
  readonly isSupermarketRemovePromptOpen = signal(false);
  private readonly supermarketRemoveTarget = signal<{
    index: number;
    value: string;
    count: number;
    items: PantryItem[];
  } | null>(null);

  readonly hasLocationChanges = computed(() => {
    const draft = this.normalizeLocationOptions(this.locationOptionsDraft());
    const original = this.originalLocationOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });

  readonly hasCategoryChanges = computed(() => {
    const draft = this.normalizeCategoryOptions(this.categoryOptionsDraft());
    const original = this.originalCategoryOptions();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  });

  readonly hasSupermarketChanges = computed(() => {
    const draft = this.normalizeSupermarketOptions(this.supermarketOptionsDraft());
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

  addSupermarketOption(): void {
    this.supermarketOptionsDraft.update(options => [...options, '']);
  }

  removeSupermarketOption(index: number): void {
    void this.requestSupermarketRemoval(index);
  }

  onSupermarketOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.supermarketOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  onSupermarketRemovePromptDismiss(): void {
    this.isSupermarketRemovePromptOpen.set(false);
    this.supermarketRemoveTarget.set(null);
  }

  getSupermarketRemovePromptMessage(): string {
    const target = this.supermarketRemoveTarget();
    const count = target?.count ?? 0;
    return this.translate.instant('settings.catalogs.supermarkets.removeInUseMessage', { count });
  }

  getSupermarketRemovePromptButtons(): Array<{
    text: string;
    role?: string;
    handler?: () => boolean | void | Promise<boolean | void>;
  }> {
    return [
      {
        text: this.translate.instant('common.actions.cancel'),
        role: 'cancel',
      },
      {
        text: this.translate.instant('settings.catalogs.supermarkets.removeAction'),
        handler: async () => {
          await this.confirmSupermarketRemoval();
        },
      },
    ];
  }

  async submitCatalogs(): Promise<void> {
    if (this.isSaving() || !this.hasAnyChanges()) {
      return;
    }

    const normalizedLocations = this.normalizeLocationOptions(this.locationOptionsDraft());
    const normalizedCategories = this.normalizeCategoryOptions(this.categoryOptionsDraft());
    const normalizedSupermarkets = this.normalizeSupermarketOptions(this.supermarketOptionsDraft());

    const locationPayload = normalizedLocations;
    const categoryPayload = normalizedCategories;
    const supermarketPayload = normalizedSupermarkets;

    await withSignalFlag(this.isSaving, async () => {
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
      console.error('[SettingsCatalogsStateService] submitCatalogs error', err);
      await this.toast.present(this.translate.instant('settings.catalogs.saveError'), { color: 'danger' });
    });
  }

  private async loadPreferences(): Promise<void> {
    await withSignalFlag(this.isLoading, async () => {
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

  private normalizeLocationOptions(values: readonly string[] | null | undefined): string[] {
    return normalizeStringList(values, {
      fallback: [],
    });
  }

  private normalizeCategoryOptions(values: readonly string[] | null | undefined): string[] {
    return normalizeStringList(values, {
      fallback: [],
    });
  }

  private normalizeSupermarketOptions(values: readonly string[] | null | undefined): string[] {
    return normalizeStringList(values, {
      fallback: [],
    });
  }

  private async requestSupermarketRemoval(index: number): Promise<void> {
    const value = (this.supermarketOptionsDraft()[index] ?? '').trim();
    if (!value) {
      this.removeSupermarketFromDraft(index);
      return;
    }

    const { count, items } = await this.getSupermarketUsage(value);
    if (!count) {
      this.removeSupermarketFromDraft(index);
      return;
    }

    this.supermarketRemoveTarget.set({ index, value, count, items });
    this.isSupermarketRemovePromptOpen.set(true);
  }

  private async confirmSupermarketRemoval(): Promise<void> {
    const target = this.supermarketRemoveTarget();
    if (!target) {
      return;
    }
    await this.clearSupermarketFromItems(target.items);
    this.removeSupermarketFromDraft(target.index);
    this.onSupermarketRemovePromptDismiss();
  }

  private removeSupermarketFromDraft(index: number): void {
    this.supermarketOptionsDraft.update(options => options.filter((_, i) => i !== index));
  }

  private async getSupermarketUsage(value: string): Promise<{
    count: number;
    items: PantryItem[];
  }> {
    const normalizedKey = normalizeKey(value);
    if (!normalizedKey) {
      return { count: 0, items: [] };
    }
    const items = await this.pantryService.getAll();
    const matches = items.filter(item => {
      const itemKey = normalizeKey(normalizeSupermarketValue(item.supermarket) ?? '');
      return itemKey === normalizedKey;
    });
    return {
      count: matches.length,
      items: matches,
    };
  }

  private async clearSupermarketFromItems(items: PantryItem[]): Promise<void> {
    if (!items.length) {
      return;
    }
    await Promise.all(
      items.map(async item => {
        await this.pantryService.saveItem({
          ...item,
          supermarket: undefined,
        });
      }),
    );
  }
}
