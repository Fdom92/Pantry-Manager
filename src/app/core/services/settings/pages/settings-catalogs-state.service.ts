import { Injectable, computed, inject, signal } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { PantryService } from '@core/services/pantry/pantry.service';
import { normalizeCategoryId, normalizeKey, normalizeStringList, normalizeSupermarketValue } from '@core/utils/normalization.util';
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
  readonly isRemovePromptOpen = signal(false);
  private readonly removePromptTarget = signal<{
    kind: 'category' | 'supermarket';
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
    void this.requestRemoval('category', index);
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
    void this.requestRemoval('supermarket', index);
  }

  onSupermarketOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.supermarketOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  onRemovePromptDismiss(): void {
    this.isRemovePromptOpen.set(false);
    this.removePromptTarget.set(null);
  }

  getRemovePromptHeaderKey(): string {
    const target = this.removePromptTarget();
    return target?.kind === 'category'
      ? 'settings.catalogs.categories.removeInUseTitle'
      : 'settings.catalogs.supermarkets.removeInUseTitle';
  }

  getRemovePromptMessage(): string {
    const target = this.removePromptTarget();
    const count = target?.count ?? 0;
    const messageKey =
      target?.kind === 'category'
        ? 'settings.catalogs.categories.removeInUseMessage'
        : 'settings.catalogs.supermarkets.removeInUseMessage';
    return this.translate.instant(messageKey, { count });
  }

  getRemovePromptButtons(): Array<{
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
        text: this.translate.instant(this.getRemovePromptActionKey()),
        handler: async () => {
          await this.confirmRemoval();
        },
      },
    ];
  }

  private getRemovePromptActionKey(): string {
    const target = this.removePromptTarget();
    return this.getRemoveConfig(target?.kind).removeActionKey;
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

  private async requestRemoval(kind: 'category' | 'supermarket', index: number): Promise<void> {
    const config = this.getRemoveConfig(kind);
    const draft = config.getDraft();
    const value = (draft[index] ?? '').trim();
    if (!value) {
      config.removeFromDraft(index);
      return;
    }

    const usage = await config.getUsage(value);
    if (!usage.count) {
      config.removeFromDraft(index);
      return;
    }

    this.removePromptTarget.set({ kind, index, value, count: usage.count, items: usage.items });
    this.isRemovePromptOpen.set(true);
  }

  private async confirmRemoval(): Promise<void> {
    const target = this.removePromptTarget();
    if (!target) {
      return;
    }
    const config = this.getRemoveConfig(target.kind);
    await config.clearFromItems(target.items);
    config.removeFromDraft(target.index);
    this.onRemovePromptDismiss();
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

  private async getCategoryUsage(value: string): Promise<{
    count: number;
    items: PantryItem[];
  }> {
    const normalizedValue = normalizeCategoryId(value);
    if (!normalizedValue) {
      return { count: 0, items: [] };
    }
    const normalizedKey = normalizeKey(normalizedValue);
    if (!normalizedKey) {
      return { count: 0, items: [] };
    }
    const items = await this.pantryService.getAll();
    const matches = items.filter(item => normalizeKey(normalizeCategoryId(item.categoryId)) === normalizedKey);
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

  private async clearCategoryFromItems(items: PantryItem[]): Promise<void> {
    if (!items.length) {
      return;
    }
    await Promise.all(
      items.map(async item => {
        await this.pantryService.saveItem({
          ...item,
          categoryId: '',
        });
      }),
    );
  }

  private getRemoveConfig(kind?: 'category' | 'supermarket'): {
    removeActionKey: string;
    getDraft: () => string[];
    removeFromDraft: (index: number) => void;
    getUsage: (value: string) => Promise<{ count: number; items: PantryItem[] }>;
    clearFromItems: (items: PantryItem[]) => Promise<void>;
  } {
    if (kind === 'category') {
      return {
        removeActionKey: 'settings.catalogs.categories.removeAction',
        getDraft: () => this.categoryOptionsDraft(),
        removeFromDraft: index =>
          this.categoryOptionsDraft.update(options => options.filter((_, i) => i !== index)),
        getUsage: value => this.getCategoryUsage(value),
        clearFromItems: items => this.clearCategoryFromItems(items),
      };
    }
    return {
      removeActionKey: 'settings.catalogs.supermarkets.removeAction',
      getDraft: () => this.supermarketOptionsDraft(),
      removeFromDraft: index =>
        this.supermarketOptionsDraft.update(options => options.filter((_, i) => i !== index)),
      getUsage: value => this.getSupermarketUsage(value),
      clearFromItems: items => this.clearSupermarketFromItems(items),
    };
  }
}
