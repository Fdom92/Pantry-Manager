import { Injectable, computed, inject, signal } from '@angular/core';
import type { ItemLocationStock, PantryItem } from '@core/models/pantry';
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
  readonly isRemovalPromptOpen = signal(false);
  readonly isReplacementPromptOpen = signal(false);
  private readonly removalTarget = signal<{
    kind: CatalogKind;
    index: number;
    value: string;
    count: number;
    items: PantryItem[];
  } | null>(null);
  private readonly replacementTarget = signal<{
    kind: CatalogKind;
    index: number;
    value: string;
    count: number;
    items: PantryItem[];
    replacements: string[];
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
    this.locationOptionsDraft.update(options => [...options, '']);
  }

  removeLocationOption(index: number): void {
    void this.requestCatalogRemoval('location', index);
  }

  onLocationOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.locationOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
  }

  onReplacementPromptDismiss(): void {
    this.isReplacementPromptOpen.set(false);
    this.replacementTarget.set(null);
  }

  getReplacementPromptMessage(): string {
    const target = this.replacementTarget();
    if (!target) {
      return '';
    }
    const count = target?.count ?? 0;
    const messageKey = this.getCatalogConfig(target?.kind).replacementMessageKey;
    return this.translate.instant(messageKey, { count });
  }

  getReplacementPromptInputs(): Array<{
    type: string;
    label: string;
    value: string;
    checked?: boolean;
  }> {
    const target = this.replacementTarget();
    if (!target) {
      return [];
    }
    const replacements = target?.replacements ?? [];
    return replacements.map((option, index) => ({
      type: 'radio',
      label: option,
      value: option,
      checked: index === 0,
    }));
  }

  getReplacementPromptButtons(): Array<{
    text: string;
    role?: string;
    handler?: (data: string) => boolean | void | Promise<boolean | void>;
  }> {
    const target = this.replacementTarget();
    if (!target) {
      return [];
    }
    const actionKey = this.getCatalogConfig(target.kind).replacementActionKey;
    return [
      {
        text: this.translate.instant('common.actions.cancel'),
        role: 'cancel',
      },
      {
        text: this.translate.instant(actionKey),
        handler: async data => {
          const replacement = (data ?? '').trim();
          if (!replacement) {
            return false;
          }
          await this.confirmReplacement(replacement);
          return true;
        },
      },
    ];
  }

  addCategoryOption(): void {
    this.categoryOptionsDraft.update(options => [...options, '']);
  }

  removeCategoryOption(index: number): void {
    void this.requestCatalogRemoval('category', index);
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
    void this.requestCatalogRemoval('supermarket', index);
  }

  onSupermarketOptionInput(index: number, event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.supermarketOptionsDraft.update(options => {
      const next = [...options];
      next[index] = value ?? '';
      return next;
    });
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
    if (kind === 'location' && draft.length <= 1) {
      return;
    }
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

    if (config.requiresReplacement) {
      const replacements = draft
        .map(option => option.trim())
        .filter(option => option && normalizeKey(option) !== normalizeKey(value));

      if (!replacements.length) {
        return;
      }

      this.replacementTarget.set({ kind, index, value, count: usage.count, items: usage.items, replacements });
      this.isReplacementPromptOpen.set(true);
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

  private async confirmReplacement(replacement: string): Promise<void> {
    const target = this.replacementTarget();
    if (!target) {
      return;
    }
    const config = this.getCatalogConfig(target.kind);
    await config.replaceInItems?.(target.items, target.value, replacement);
    config.removeFromDraft(target.index);
    await this.submitCatalogs();
    this.onReplacementPromptDismiss();
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

  private async getLocationUsage(value: string): Promise<{
    count: number;
    items: PantryItem[];
  }> {
    const normalizedValue = normalizeLocationId(value);
    const normalizedKey = normalizeKey(normalizedValue);
    if (!normalizedKey) {
      return { count: 0, items: [] };
    }
    const items = await this.pantryService.getAll();
    const matches = items.filter(item =>
      (item.locations ?? []).some(location => normalizeKey(normalizeLocationId(location.locationId)) === normalizedKey),
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

  private async replaceLocationInItems(items: PantryItem[], fromValue: string, toValue: string): Promise<void> {
    const fromKey = normalizeKey(normalizeLocationId(fromValue));
    const replacement = normalizeLocationId(toValue);
    if (!fromKey || !replacement) {
      return;
    }
    await Promise.all(
      items.map(async item => {
        const merged = new Map<string, ItemLocationStock>();
        for (const location of item.locations ?? []) {
          const originalId = normalizeLocationId(location.locationId);
          const nextId = normalizeKey(originalId) === fromKey ? replacement : originalId;
          const nextKey = normalizeKey(nextId);
          if (!nextKey) {
            continue;
          }
          const existing = merged.get(nextKey);
          if (!existing) {
            merged.set(nextKey, {
              ...location,
              locationId: nextId,
              batches: Array.isArray(location.batches) ? [...location.batches] : [],
            });
            continue;
          }
          const batches = [
            ...(Array.isArray(existing.batches) ? existing.batches : []),
            ...(Array.isArray(location.batches) ? location.batches : []),
          ];
          merged.set(nextKey, {
            ...existing,
            batches,
          });
        }
        await this.pantryService.saveItem({
          ...item,
          locations: Array.from(merged.values()),
        });
      }),
    );
  }

  private getCatalogConfig(kind?: CatalogKind): {
    removalTitleKey: string;
    removalMessageKey: string;
    removalActionKey: string;
    replacementMessageKey: string;
    replacementActionKey: string;
    requiresReplacement: boolean;
    getDraft: () => string[];
    removeFromDraft: (index: number) => void;
    getUsage: (value: string) => Promise<{ count: number; items: PantryItem[] }>;
    clearFromItems: (items: PantryItem[]) => Promise<void>;
    replaceInItems?: (items: PantryItem[], fromValue: string, toValue: string) => Promise<void>;
  } {
    if (kind === 'category') {
      return {
        removalTitleKey: 'settings.catalogs.categories.removeInUseTitle',
        removalMessageKey: 'settings.catalogs.categories.removeInUseMessage',
        removalActionKey: 'settings.catalogs.categories.removeAction',
        replacementMessageKey: '',
        replacementActionKey: '',
        requiresReplacement: false,
        getDraft: () => this.categoryOptionsDraft(),
        removeFromDraft: index =>
          this.categoryOptionsDraft.update(options => options.filter((_, i) => i !== index)),
        getUsage: value => this.getCategoryUsage(value),
        clearFromItems: items => this.clearCategoryFromItems(items),
      };
    }
    if (kind === 'location') {
      return {
        removalTitleKey: 'settings.catalogs.locations.replaceTitle',
        removalMessageKey: 'settings.catalogs.locations.replaceMessage',
        removalActionKey: 'settings.catalogs.locations.replaceAction',
        replacementMessageKey: 'settings.catalogs.locations.replaceMessage',
        replacementActionKey: 'settings.catalogs.locations.replaceAction',
        requiresReplacement: true,
        getDraft: () => this.locationOptionsDraft(),
        removeFromDraft: index =>
          this.locationOptionsDraft.update(options => options.filter((_, i) => i !== index)),
        getUsage: value => this.getLocationUsage(value),
        clearFromItems: async () => undefined,
        replaceInItems: (items, fromValue, toValue) => this.replaceLocationInItems(items, fromValue, toValue),
      };
    }
    return {
      removalTitleKey: 'settings.catalogs.supermarkets.removeInUseTitle',
      removalMessageKey: 'settings.catalogs.supermarkets.removeInUseMessage',
      removalActionKey: 'settings.catalogs.supermarkets.removeAction',
      replacementMessageKey: '',
      replacementActionKey: '',
      requiresReplacement: false,
      getDraft: () => this.supermarketOptionsDraft(),
      removeFromDraft: index =>
        this.supermarketOptionsDraft.update(options => options.filter((_, i) => i !== index)),
      getUsage: value => this.getSupermarketUsage(value),
      clearFromItems: items => this.clearSupermarketFromItems(items),
    };
  }
}
