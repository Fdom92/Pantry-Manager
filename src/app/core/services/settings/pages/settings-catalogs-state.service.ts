import { Injectable, computed, inject, signal } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { PantryService } from '@core/services/pantry/pantry.service';
import { normalizeCategoryId, normalizeKey, normalizeLocationId, normalizeStringList, normalizeSupermarketValue } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { withSignalFlag } from '../../shared';
import { AppPreferencesService } from '../app-preferences.service';

type CatalogKind = 'category' | 'supermarket' | 'location';

@Injectable()
export class SettingsCatalogsStateService {
  private readonly appPreferencesService = inject(AppPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly pantryService = inject(PantryService);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly locationOptionsDraft = signal<string[]>([]);
  readonly originalLocationOptions = signal<string[]>([]);
  readonly categoryOptionsDraft = signal<string[]>([]);
  readonly originalCategoryOptions = signal<string[]>([]);
  readonly supermarketOptionsDraft = signal<string[]>([]);
  readonly originalSupermarketOptions = signal<string[]>([]);
  readonly isAddPromptOpen = signal(false);
  readonly isRemovalPromptOpen = signal(false);
  private readonly addTarget = signal<{ kind: CatalogKind } | null>(null);
  private readonly removalTarget = signal<{
    kind: CatalogKind;
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
  readonly hasDuplicateOptions = computed(() => {
    return (
      this.hasDuplicates('location', this.locationOptionsDraft()) ||
      this.hasDuplicates('category', this.categoryOptionsDraft()) ||
      this.hasDuplicates('supermarket', this.supermarketOptionsDraft())
    );
  });

  async ionViewWillEnter(): Promise<void> {
    await this.loadPreferences();
  }

  addLocationOption(): void {
    this.requestCatalogAdd('location');
  }

  removeLocationOption(index: number): void {
    void this.requestCatalogRemoval('location', index);
  }

  addCategoryOption(): void {
    this.requestCatalogAdd('category');
  }

  removeCategoryOption(index: number): void {
    void this.requestCatalogRemoval('category', index);
  }

  addSupermarketOption(): void {
    this.requestCatalogAdd('supermarket');
  }

  removeSupermarketOption(index: number): void {
    void this.requestCatalogRemoval('supermarket', index);
  }

  onAddPromptDismiss(): void {
    this.isAddPromptOpen.set(false);
    this.addTarget.set(null);
  }

  getAddPromptHeaderKey(): string {
    const target = this.addTarget();
    return this.getCatalogConfig(target?.kind).addTitleKey;
  }

  getAddPromptInputs(): Array<{
    type: string;
    name: string;
    placeholder: string;
    value?: string;
  }> {
    const target = this.addTarget();
    if (!target) {
      return [];
    }
    const placeholderKey = this.getCatalogConfig(target.kind).addPlaceholderKey;
    return [
      {
        type: 'text',
        name: 'value',
        placeholder: this.translate.instant(placeholderKey),
      },
    ];
  }

  getAddPromptButtons(): Array<{
    text: string;
    role?: string;
    handler?: (data: { value?: string }) => boolean | void | Promise<boolean | void>;
  }> {
    const target = this.addTarget();
    if (!target) {
      return [];
    }
    return [
      {
        text: this.translate.instant('common.actions.cancel'),
        role: 'cancel',
      },
      {
        text: this.translate.instant('common.actions.add'),
        handler: data => {
          const value = (data?.value ?? '').trim();
          if (!value) {
            return false;
          }
          const config = this.getCatalogConfig(target.kind);
          if (this.isDuplicateCatalogValue(target.kind, value, config.getDraft())) {
            return false;
          }
          config.addToDraft(value);
          this.onAddPromptDismiss();
          return true;
        },
      },
    ];
  }

  onRemovalPromptDismiss(): void {
    this.isRemovalPromptOpen.set(false);
    this.removalTarget.set(null);
  }

  getRemovalPromptHeaderKey(): string {
    const target = this.removalTarget();
    return this.getCatalogConfig(target?.kind).removalTitleKey;
  }

  getRemovalPromptMessage(): string {
    const target = this.removalTarget();
    const count = target?.count ?? 0;
    const messageKey = this.getCatalogConfig(target?.kind).removalMessageKey;
    return this.translate.instant(messageKey, { count });
  }

  getRemovalPromptButtons(): Array<{
    text: string;
    role?: string;
    handler?: () => boolean | void | Promise<boolean | void>;
  }> {
    const actionKey = this.getCatalogConfig(this.removalTarget()?.kind).removalActionKey;
    return [
      {
        text: this.translate.instant('common.actions.cancel'),
        role: 'cancel',
      },
      {
        text: this.translate.instant(actionKey),
        handler: async () => {
          await this.confirmCatalogRemoval();
        },
      },
    ];
  }

  async submitCatalogs(): Promise<void> {
    if (this.isSaving() || !this.hasAnyChanges()) {
      return;
    }
    if (this.hasDuplicateOptions()) {
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
    }).catch(async err => {
      console.error('[SettingsCatalogsStateService] submitCatalogs error', err);
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

  private normalizeCatalogValue(kind: CatalogKind, rawValue: string | null | undefined): string {
    if (kind === 'category') {
      return normalizeKey(normalizeCategoryId(rawValue));
    }
    if (kind === 'location') {
      return normalizeKey(normalizeLocationId(rawValue));
    }
    return normalizeKey(normalizeSupermarketValue(rawValue) ?? '');
  }
  private hasDuplicates(kind: CatalogKind, draft: string[]): boolean {
    const seen = new Set<string>();
    for (const value of draft) {
      const normalized = this.normalizeCatalogValue(kind, value);
      if (!normalized) {
        continue;
      }
      if (seen.has(normalized)) {
        return true;
      }
      seen.add(normalized);
    }
    return false;
  }

  private async requestCatalogRemoval(kind: CatalogKind, index: number): Promise<void> {
    const config = this.getCatalogConfig(kind);
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

    this.removalTarget.set({ kind, index, value, count: usage.count, items: usage.items });
    this.isRemovalPromptOpen.set(true);
  }

  private async confirmCatalogRemoval(): Promise<void> {
    const target = this.removalTarget();
    if (!target) {
      return;
    }
    const config = this.getCatalogConfig(target.kind);
    await config.clearFromItems(target.items);
    config.removeFromDraft(target.index);
    await this.submitCatalogs();
    this.onRemovalPromptDismiss();
  }

  private async getSupermarketUsage(value: string): Promise<{
    count: number;
    items: PantryItem[];
  }> {
    const normalizedKey = normalizeKey(value);
    if (!normalizedKey) {
      return { count: 0, items: [] };
    }
    const items = await this.pantryService.getAllActive();
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
    const items = await this.pantryService.getAllActive();
    const matches = items.filter(item => normalizeKey(normalizeCategoryId(item.categoryId)) === normalizedKey);
    return {
      count: matches.length,
      items: matches,
    };
  }

  private async getLocationUsage(value: string): Promise<{
    count: number;
    items: PantryItem[];
  }> {
    const normalizedValue = normalizeLocationId(value);
    const normalizedKey = normalizeKey(normalizedValue);
    if (!normalizedKey) {
      return { count: 0, items: [] };
    }
    const items = await this.pantryService.getAllActive();
    const matches = items.filter(item =>
      (item.batches ?? []).some(batch => normalizeKey(normalizeLocationId(batch.locationId)) === normalizedKey),
    );
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

  private async clearLocationFromItems(items: PantryItem[], value: string): Promise<void> {
    const fromKey = normalizeKey(normalizeLocationId(value));
    if (!fromKey) {
      return;
    }
    await Promise.all(
      items.map(async item => {
        const batches = (item.batches ?? []).map(batch => {
          const originalId = normalizeLocationId(batch.locationId);
          if (normalizeKey(originalId) !== fromKey) {
            return batch;
          }
          return {
            ...batch,
            locationId: undefined,
          };
        });
        await this.pantryService.saveItem({
          ...item,
          batches,
        });
      }),
    );
  }

  private getCatalogConfig(kind?: CatalogKind): {
    removalTitleKey: string;
    removalMessageKey: string;
    removalActionKey: string;
    addTitleKey: string;
    addPlaceholderKey: string;
    getDraft: () => string[];
    addToDraft: (value: string) => void;
    removeFromDraft: (index: number) => void;
    getUsage: (value: string) => Promise<{ count: number; items: PantryItem[] }>;
    clearFromItems: (items: PantryItem[]) => Promise<void>;
  } {
    const resolved = kind ?? 'supermarket';
    const drafts = {
      category: this.categoryOptionsDraft,
      location: this.locationOptionsDraft,
      supermarket: this.supermarketOptionsDraft,
    };
    const usage = {
      category: this.getCategoryUsage.bind(this),
      location: this.getLocationUsage.bind(this),
      supermarket: this.getSupermarketUsage.bind(this),
    };
    const clear = {
      category: this.clearCategoryFromItems.bind(this),
      location: (items: PantryItem[]) => this.clearLocationFromItems(items, this.removalTarget()?.value ?? ''),
      supermarket: this.clearSupermarketFromItems.bind(this),
    };
    const strings = {
      category: {
        removalTitleKey: 'settings.catalogs.categories.removeInUseTitle',
        removalMessageKey: 'settings.catalogs.categories.removeInUseMessage',
        removalActionKey: 'settings.catalogs.categories.removeAction',
        addTitleKey: 'settings.catalogs.categories.addPromptTitle',
        addPlaceholderKey: 'settings.catalogs.categories.addPromptPlaceholder',
      },
      location: {
        removalTitleKey: 'settings.catalogs.locations.removeInUseTitle',
        removalMessageKey: 'settings.catalogs.locations.removeInUseMessage',
        removalActionKey: 'settings.catalogs.locations.removeAction',
        addTitleKey: 'settings.catalogs.locations.addPromptTitle',
        addPlaceholderKey: 'settings.catalogs.locations.addPromptPlaceholder',
      },
      supermarket: {
        removalTitleKey: 'settings.catalogs.supermarkets.removeInUseTitle',
        removalMessageKey: 'settings.catalogs.supermarkets.removeInUseMessage',
        removalActionKey: 'settings.catalogs.supermarkets.removeAction',
        addTitleKey: 'settings.catalogs.supermarkets.addPromptTitle',
        addPlaceholderKey: 'settings.catalogs.supermarkets.addPromptPlaceholder',
      },
    };
    const addToDraft = (value: string) => drafts[resolved].update(options => [...options, value]);
    const removeFromDraft = (index: number) =>
      drafts[resolved].update(options => options.filter((_, i) => i !== index));

    return {
      ...strings[resolved],
      getDraft: () => drafts[resolved](),
      addToDraft,
      removeFromDraft,
      getUsage: usage[resolved],
      clearFromItems: clear[resolved],
    };
  }

  private requestCatalogAdd(kind: CatalogKind): void {
    this.addTarget.set({ kind });
    this.isAddPromptOpen.set(true);
  }

  private isDuplicateCatalogValue(kind: CatalogKind, rawValue: string, draft: string[]): boolean {
    const normalized = this.normalizeCatalogValue(kind, rawValue);
    if (!normalized) {
      return false;
    }
    return draft.some(value => this.normalizeCatalogValue(kind, value) === normalized);
  }
}
