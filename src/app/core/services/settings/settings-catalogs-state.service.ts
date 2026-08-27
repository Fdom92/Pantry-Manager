import { Injectable, computed, inject, signal, type WritableSignal } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';
import { getCatalogUsage, normalizeCatalogOptions } from '@core/domain/settings';
import { PantryQueryService } from '@core/services/pantry/pantry-query.service';
import { normalizeCategoryId, normalizeLowercase, normalizeLocationId, normalizeSupermarketValue, normalizeTrim } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { withSignalFlag } from '@core/utils';
import { SettingsPreferencesService } from './settings-preferences.service';
import { AlertController } from '@ionic/angular/standalone';
import { LoggerService } from '../shared/logger.service';

export type CatalogKind = 'location' | 'category' | 'supermarket';

/**
 * The only things that actually differ between the three catalogs: which i18n
 * namespace names them and which icon the empty state shows. Everything else —
 * drafting, duplicate detection, usage lookup, saving — is the same work with a
 * different key, so it is written once and parameterised by kind.
 *
 * The preferences field is `${kind}Options` and every i18n key hangs off
 * `settings.catalogs.${ns}`, so neither needs its own table.
 */
const CATALOG_VIEWS = [
  { kind: 'location', ns: 'locations', icon: 'navigate-outline' },
  { kind: 'category', ns: 'categories', icon: 'pricetag-outline' },
  { kind: 'supermarket', ns: 'supermarkets', icon: 'storefront-outline' },
] as const satisfies readonly { kind: CatalogKind; ns: string; icon: string }[];

const CATALOG_KINDS = CATALOG_VIEWS.map(v => v.kind);

@Injectable()
export class SettingsCatalogsStateService {
  private readonly appPreferencesService = inject(SettingsPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly pantryService = inject(PantryQueryService);
  private readonly alertController = inject(AlertController);
  private readonly logger = inject(LoggerService);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);

  /** One entry per catalog — what the page loops over to render its cards. */
  readonly views = CATALOG_VIEWS;

  private readonly drafts: Record<CatalogKind, WritableSignal<string[]>> = {
    location: signal<string[]>([]),
    category: signal<string[]>([]),
    supermarket: signal<string[]>([]),
  };

  private readonly originals: Record<CatalogKind, WritableSignal<string[]>> = {
    location: signal<string[]>([]),
    category: signal<string[]>([]),
    supermarket: signal<string[]>([]),
  };

  readonly hasAnyChanges = computed(() => CATALOG_KINDS.some(kind => this.hasChanges(kind)));

  readonly hasDuplicateOptions = computed(() =>
    CATALOG_KINDS.some(kind => this.hasDuplicates(kind, this.drafts[kind]()))
  );

  /** Current draft for a catalog. Reading it inside a template keeps it reactive. */
  draft(kind: CatalogKind): string[] {
    return this.drafts[kind]();
  }

  /** i18n key for one of the catalog's strings, e.g. `title` or `addPromptTitle`. */
  key(kind: CatalogKind, name: string): string {
    return `settings.catalogs.${CATALOG_VIEWS.find(v => v.kind === kind)!.ns}.${name}`;
  }

  constructor() {
    // Not ionViewWillEnter: that hook does not fire reliably for this page, and
    // when it does not, the screen shows empty catalogs over stored values —
    // the user's own locations, categories and supermarkets, saved and
    // invisible. Loading on construction cannot miss, and the service is
    // page-scoped so it is constructed on every entry anyway.
    void this.loadPreferences();
  }

  addOption(kind: CatalogKind): void {
    void this.showAddCatalogAlert(kind);
  }

  removeOption(kind: CatalogKind, index: number): void {
    void this.requestCatalogRemoval(kind, index);
  }

  async submitCatalogs(): Promise<void> {
    if (this.isSaving() || !this.hasAnyChanges()) {
      return;
    }
    if (this.hasDuplicateOptions()) {
      return;
    }

    const payloads = Object.fromEntries(
      CATALOG_KINDS.map(kind => [kind, this.normalizeOptions(this.drafts[kind]())])
    ) as Record<CatalogKind, string[]>;

    await withSignalFlag(this.isSaving, async () => {
      const current = await this.appPreferencesService.getPreferences();
      await this.appPreferencesService.savePreferences({
        ...current,
        locationOptions: payloads.location,
        categoryOptions: payloads.category,
        supermarketOptions: payloads.supermarket,
      });
      for (const kind of CATALOG_KINDS) {
        this.originals[kind].set(payloads[kind]);
        this.drafts[kind].set([...payloads[kind]]);
      }
    }).catch(async (err: unknown) => {
      this.logger.error('SettingsCatalogsStateService', 'submitCatalogs error', err);
    });
  }

  // ─── Alerts ────────────────────────────────────────────────────────────────

  private async showAddCatalogAlert(kind: CatalogKind): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant(this.key(kind, 'addPromptTitle')),
      inputs: [
        {
          type: 'text',
          name: 'value',
          placeholder: this.translate.instant(this.key(kind, 'addPromptPlaceholder')),
        },
      ],
      buttons: [
        {
          text: this.translate.instant('common.actions.cancel'),
          role: 'cancel',
        },
        {
          text: this.translate.instant('common.actions.add'),
          handler: (data: { value?: string }) => {
            const value = normalizeTrim(data?.value);
            if (!value) {
              return false;
            }
            if (this.isDuplicateCatalogValue(kind, value, this.drafts[kind]())) {
              return false;
            }
            this.drafts[kind].update(options => [...options, value]);
            void this.submitCatalogs();
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async requestCatalogRemoval(kind: CatalogKind, index: number): Promise<void> {
    const removeAndSave = () => {
      this.drafts[kind].update(options => options.filter((_, i) => i !== index));
    };

    const value = normalizeTrim(this.drafts[kind]()[index]);
    if (!value) {
      removeAndSave();
      void this.submitCatalogs();
      return;
    }

    const usage = await this.getUsage(kind, value);
    if (!usage.count) {
      removeAndSave();
      void this.submitCatalogs();
      return;
    }

    const messageKey = this.key(kind, 'removeInUseMessage') + (usage.count === 1 ? '_one' : '_other');
    const alert = await this.alertController.create({
      header: this.translate.instant(this.key(kind, 'removeInUseTitle')),
      message: this.translate.instant(messageKey, { count: usage.count }),
      buttons: [
        {
          text: this.translate.instant('common.actions.cancel'),
          role: 'cancel',
        },
        {
          text: this.translate.instant(this.key(kind, 'removeAction')),
          handler: async () => {
            await this.clearFromItems(kind, usage.items, value);
            removeAndSave();
            await this.submitCatalogs();
          },
        },
      ],
    });
    await alert.present();
  }

  // ─── Preferences ───────────────────────────────────────────────────────────

  private async loadPreferences(): Promise<void> {
    await withSignalFlag(this.isLoading, async () => {
      const prefs = await this.appPreferencesService.getPreferences();
      for (const kind of CATALOG_KINDS) {
        const current = this.normalizeOptions(prefs[`${kind}Options`]);
        this.originals[kind].set(current);
        this.drafts[kind].set([...current]);
      }
    }).catch(async (err: unknown) => {
      this.logger.error('SettingsCatalogsStateService', 'loadPreferences error', err);
    });
  }

  private normalizeOptions(values: readonly string[] | null | undefined): string[] {
    return normalizeCatalogOptions(values as string[] ?? []);
  }

  private hasChanges(kind: CatalogKind): boolean {
    const draft = this.normalizeOptions(this.drafts[kind]());
    const original = this.originals[kind]();
    if (draft.length !== original.length) {
      return true;
    }
    return draft.some((value, index) => value !== original[index]);
  }

  // ─── Duplicates ────────────────────────────────────────────────────────────

  private normalizeCatalogValue(kind: CatalogKind, rawValue: string | null | undefined): string {
    if (kind === 'category') {
      return normalizeLowercase(normalizeCategoryId(rawValue));
    }
    if (kind === 'location') {
      return normalizeLowercase(normalizeLocationId(rawValue));
    }
    return normalizeLowercase(normalizeSupermarketValue(rawValue) ?? '');
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

  private isDuplicateCatalogValue(kind: CatalogKind, rawValue: string, draft: string[]): boolean {
    const normalized = this.normalizeCatalogValue(kind, rawValue);
    if (!normalized) {
      return false;
    }
    return draft.some(value => this.normalizeCatalogValue(kind, value) === normalized);
  }

  // ─── Usage in the pantry ───────────────────────────────────────────────────
  // These three genuinely differ: a supermarket sits on the item, a category is
  // a normalised id on the item, and a location lives on each batch.

  private async getUsage(kind: CatalogKind, value: string): Promise<{ count: number; items: PantryItem[] }> {
    const allItems = await this.pantryService.getAllActive();

    if (kind === 'supermarket') {
      return getCatalogUsage(
        allItems,
        value,
        (item, normalizedValue) =>
          normalizeLowercase(normalizeSupermarketValue(item.supermarket) ?? '')
            === normalizeLowercase(normalizedValue),
        val => val
      );
    }

    if (kind === 'category') {
      return getCatalogUsage(
        allItems,
        value,
        (item, normalizedValue) =>
          normalizeLowercase(normalizeCategoryId(item.categoryId)) === normalizeLowercase(normalizedValue),
        normalizeCategoryId
      );
    }

    return getCatalogUsage(
      allItems,
      value,
      (item, normalizedValue) =>
        (item.batches ?? []).some(batch =>
          normalizeLowercase(normalizeLocationId(batch.locationId)) === normalizeLowercase(normalizedValue)
        ),
      normalizeLocationId
    );
  }

  private async clearFromItems(kind: CatalogKind, items: PantryItem[], value: string): Promise<void> {
    if (kind === 'supermarket') {
      await this.updateItems(items, item => ({ ...item, supermarket: undefined }));
      return;
    }

    if (kind === 'category') {
      await this.updateItems(items, item => ({ ...item, categoryId: '' }));
      return;
    }

    const fromKey = normalizeLowercase(normalizeLocationId(value));
    if (!fromKey) {
      return;
    }
    await this.updateItems(items, item => ({
      ...item,
      batches: (item.batches ?? []).map(batch =>
        normalizeLowercase(normalizeLocationId(batch.locationId)) === fromKey
          ? { ...batch, locationId: undefined }
          : batch
      ),
    }));
  }

  private async updateItems(
    items: PantryItem[],
    updater: (item: PantryItem) => PantryItem,
  ): Promise<void> {
    if (!items.length) {
      return;
    }
    await Promise.all(items.map(item => this.pantryService.saveItem(updater(item))));
  }
}
