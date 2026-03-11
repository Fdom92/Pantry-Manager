import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_LOCATION_KEY } from '@core/constants';
import { FoodType } from '@core/models/shared/enums.model';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { buildPantryItemAutocomplete, buildUniqueSelectOptions, createDocumentId, formatSupermarketLabel, hasMeaningfulItemChanges } from '@core/utils';
import {
  formatFriendlyName,
  normalizeCategoryId,
  normalizeStringList,
  normalizeSupermarketValue,
  normalizeTrim
} from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { CatalogOptionsService, SettingsPreferencesService } from '../../settings';
import { PantryStateService } from '../pantry-state.service';
import { PantryStoreService } from '../pantry-store.service';
import { PantryService } from '../pantry.service';

@Injectable()
export class PantryEditItemModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly fb = inject(FormBuilder);
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly catalogOptions = inject(CatalogOptionsService);
  private readonly translate = inject(TranslateService);
  private readonly listState = inject(PantryStateService);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly isOpen = signal(false);
  readonly isSaving = signal(false);
  readonly editingItem = signal<PantryItem | null>(null);
  readonly selectingItem = signal(false);
  readonly selectorEnabled = signal(false);
  readonly selectorQuery = signal('');
  readonly selectedName = signal('');
  readonly selectorOptions = computed(() => this.buildSelectorOptions(this.pantryService.loadedProducts()));
  readonly selectorLocked = computed(() => this.selectorEnabled() && !!normalizeTrim(this.selectedName()));
  readonly selectorInputValue = computed(() =>
    this.selectorLocked() ? this.selectedName() : this.selectorQuery()
  );
  readonly showSelectorEmptyAction = computed(() => normalizeTrim(this.selectorQuery()).length >= 1);
  readonly selectorEmptyActionLabel = computed(() => {
    const query = normalizeTrim(this.selectorQuery());
    if (!query) {
      return '';
    }
    const formatted = formatFriendlyName(query, query);
    return this.translate.instant('pantry.fastAdd.addNew', { name: formatted });
  });

  readonly foodTypes = Object.values(FoodType);

  getFoodTypeOptions(): AutocompleteItem<FoodType>[] {
    return this.foodTypes.map(type => ({
      id: type,
      title: this.translate.instant(`pantry.form.foodType.${type}`),
      raw: type,
    }));
  }

  getFoodTypeDisplayValue(): string {
    const raw = this.getFormStringValue('foodType');
    if (!raw) {
      return '';
    }
    return this.translate.instant(`pantry.form.foodType.${raw}`);
  }

  onFoodTypeSelect(option: AutocompleteItem<FoodType>): void {
    if (option?.raw) {
      this.form.get('foodType')?.setValue(option.raw);
    }
  }

  readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.maxLength(120)], nonNullable: true }),
    categoryId: this.fb.control<string | null>(null),
    supermarket: this.fb.control('', {
      validators: [Validators.maxLength(80)],
      nonNullable: true,
    }),
    isBasic: this.fb.control(false),
    minThreshold: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    foodType: this.fb.control<FoodType | null>(null),
    notes: this.fb.control(''),
    initialQuantity: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
  });

  constructor() {
    effect(() => {
      const request = this.listState.editItemModalRequest();
      if (!request) {
        return;
      }
      if (request.mode === 'create') {
        this.openCreate();
      } else {
        this.openEdit(request.item);
      }
      this.listState.clearEditItemModalRequest();
    });

  }

  openCreate(): void {
    this.editingItem.set(null);
    this.selectorEnabled.set(true);
    this.selectedName.set('');
    this.resetFormForCreate();
    this.selectingItem.set(true);
    this.selectorQuery.set('');
    this.isSaving.set(false);
    this.isOpen.set(true);
  }

  openEdit(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.selectorEnabled.set(false);
    this.selectingItem.set(false);
    this.selectorQuery.set('');
    this.selectedName.set('');
    this.applyItemToForm(item);
    this.isSaving.set(false);
    this.isOpen.set(true);
  }

  private openEditFromSelector(item: PantryItem): void {
    this.selectingItem.set(false);
    this.selectorQuery.set('');
    this.selectedName.set(item.name ?? '');
    this.applyItemToForm(item);
  }

  close(): void {
    if (this.isOpen()) {
      return;
    }
    this.resetModalState();
  }

  dismiss(): void {
    this.isOpen.set(false);
  }

  getCategorySelectOptions(): Array<{ value: string; label: string }> {
    const presetOptions = normalizeStringList(this.appPreferences.preferences().categoryOptions, { fallback: [] });
    const uncategorizedLabel = this.translate.instant('pantry.form.uncategorized');
    const currentValue = this.getFormStringValue('categoryId', normalizeCategoryId);
    return this.buildSelectOptions(presetOptions, currentValue, value =>
      formatFriendlyName(value, uncategorizedLabel)
    );
  }


  getSupermarketSelectOptions(): Array<{ value: string; label: string }> {
    const presetOptions = normalizeStringList(this.appPreferences.preferences().supermarketOptions, { fallback: [] });
    const currentValue = this.getFormStringValue('supermarket');
    return this.buildSelectOptions(presetOptions, currentValue, value =>
      formatSupermarketLabel(value, this.translate.instant('settings.catalogs.supermarkets.other'))
    );
  }

  getCategoryAutocompleteOptions(): AutocompleteItem<string>[] {
    return this.mapSelectOptions(this.getCategorySelectOptions());
  }

  getSupermarketAutocompleteOptions(): AutocompleteItem<string>[] {
    return this.mapSelectOptions(this.getSupermarketSelectOptions());
  }

  getCategoryDisplayValue(): string {
    const raw = this.getFormStringValue('categoryId');
    return this.getCategoryAutocompleteOptions().find(o => o.raw === raw)?.title ?? raw;
  }

  getSupermarketDisplayValue(): string {
    const raw = this.getFormStringValue('supermarket');
    return this.getSupermarketAutocompleteOptions().find(o => o.raw === raw)?.title ?? raw;
  }

  onCategoryAutocompleteSelect(option: AutocompleteItem<string>): void {
    this.applyAutocompleteValue(option, value => this.form.get('categoryId')?.setValue(value));
  }

  onSupermarketAutocompleteSelect(option: AutocompleteItem<string>): void {
    this.applyAutocompleteValue(option, value => this.form.get('supermarket')?.setValue(value));
  }

  addCategoryOptionFromText(value: string): void {
    this.addOptionFromText(value, formatted => this.addCategoryOption(formatted));
  }

  addSupermarketOptionFromText(value: string): void {
    this.addOptionFromText(value, formatted => this.addSupermarketOption(formatted));
  }

  onSelectorQueryChange(value: string): void {
    this.selectorQuery.set(value ?? '');
  }

  onSelectorSelect(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) {
      return;
    }
    this.openEditFromSelector(item);
  }

  onSelectorCreateNew(value?: string): void {
    const raw = normalizeTrim(value ?? this.selectorQuery());
    const nextName = raw ? formatFriendlyName(raw, raw) : '';
    this.selectingItem.set(false);
    this.selectorQuery.set('');
    this.selectedName.set(nextName);
    this.resetFormForCreate();
    if (nextName) {
      this.form.get('name')?.setValue(nextName);
    }
  }

  onSelectorClear(): void {
    if (this.selectorLocked()) {
      this.openCreate();
      return;
    }
    this.selectorQuery.set('');
  }

  private async addSupermarketOption(value: string): Promise<void> {
    const selected = await this.catalogOptions.addSupermarketOption(value);
    this.form.get('supermarket')?.setValue(selected);
  }

  private async addCategoryOption(value: string): Promise<void> {
    const selected = await this.catalogOptions.addCategoryOption(value);
    this.form.get('categoryId')?.setValue(selected);
  }

  private addOptionFromText(value: string, addOption: (formatted: string) => Promise<void>): void {
    const nextValue = normalizeTrim(value);
    if (!nextValue) {
      return;
    }
    const formatted = formatFriendlyName(nextValue, nextValue);
    void addOption(formatted);
  }

  private applyAutocompleteValue(option: AutocompleteItem<string>, setter: (value: string) => void): void {
    const value = normalizeTrim((option?.raw ?? '').toString());
    if (!value) {
      return;
    }
    setter(value);
  }

  private buildSelectOptions(
    presetOptions: string[],
    currentValue: string,
    labelFor: (value: string) => string
  ): Array<{ value: string; label: string }> {
    return buildUniqueSelectOptions([...presetOptions, currentValue], { labelFor });
  }

  private getFormStringValue(
    controlName: string,
    normalizeValue: (value: string) => string = normalizeTrim
  ): string {
    const control = this.form.get(controlName);
    return typeof control?.value === 'string' ? normalizeValue(control.value) : '';
  }

  private mapSelectOptions(options: Array<{ value: string; label: string }>): AutocompleteItem<string>[] {
    return options.map(option => ({
      id: option.value,
      title: option.label,
      raw: option.value,
    }));
  }

  async submitItem(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    try {
      const existing = this.editingItem();
      const item = this.buildItemPayload(existing ?? undefined);

      if (existing) {
        if (hasMeaningfulItemChanges(existing, item)) {
          this.listState.cancelPendingStockSave(item._id);
          await this.pantryStore.updateItem(item);
          await this.eventManager.logAdvancedEdit(existing, item);
        }
      } else {
        // Create mode: item payload already includes initial batch
        await this.pantryStore.addItem(item);
        await this.eventManager.logAdvancedCreate(item);
      }

      this.dismiss();
    } catch (err) {
      this.isSaving.set(false);
      console.error('[PantryEditItemModalStateService] submitItem error', err);
    }
  }

  private resetFormForCreate(): void {
    this.form.reset({
      name: '',
      categoryId: null,
      supermarket: '',
      isBasic: false,
      minThreshold: null,
      foodType: null,
      notes: '',
      initialQuantity: null,
    });
  }

  private resetModalState(): void {
    this.isSaving.set(false);
    this.editingItem.set(null);
    this.selectingItem.set(false);
    this.selectorQuery.set('');
    this.selectorEnabled.set(false);
    this.selectedName.set('');
  }

  private applyItemToForm(item: PantryItem): void {
    this.editingItem.set(item);
    this.form.reset({
      name: item.name ?? '',
      categoryId: item.categoryId ?? null,
      supermarket: item.supermarket ?? '',
      isBasic: Boolean(item.isBasic),
      minThreshold: item.minThreshold ?? null,
      foodType: item.foodType ?? null,
      notes: '',
      initialQuantity: null,
    });
  }

  private buildItemPayload(existing?: PantryItem): PantryItem {
    const { name, categoryId, isBasic, supermarket, minThreshold, foodType, initialQuantity } = this.form.value as {
      name?: string;
      categoryId?: string;
      isBasic?: boolean;
      supermarket?: string;
      minThreshold?: number | string | null;
      foodType?: FoodType | null;
      initialQuantity?: number | null;
    };
    const identifier = existing?._id ?? createDocumentId('item');
    const now = new Date().toISOString();
    let normalizedMinThreshold: number | undefined;
    if (minThreshold !== null && minThreshold !== undefined && minThreshold !== '') {
      const numericValue = Number(minThreshold);
      normalizedMinThreshold = Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : undefined;
    }

    let batches: ItemBatch[];
    if (existing) {
      // Edit mode: keep existing batches (quantity changes applied via FIFO)
      batches = existing.batches ?? [];
    } else {
      // Create mode: create initial batch from initialQuantity field
      const quantity = initialQuantity != null ? Number(initialQuantity) : 0;
      if (quantity > 0) {
        batches = [{
          quantity,
          locationId: UNASSIGNED_LOCATION_KEY,
          expirationDate: undefined,
        }];
      } else {
        batches = [];
      }
    }

    const normalizedSupermarket = normalizeSupermarketValue(supermarket);
    const normalizedCategory = normalizeCategoryId(categoryId);

    return {
      _id: identifier,
      _rev: existing?._rev,
      type: 'item',
      householdId: existing?.householdId ?? DEFAULT_HOUSEHOLD_ID,
      name: normalizeTrim(name),
      categoryId: normalizedCategory,
      batches,
      supermarket: normalizedSupermarket,
      isBasic: isBasic ? true : undefined,
      minThreshold: normalizedMinThreshold,
      foodType: foodType ?? undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private buildSelectorOptions(items: PantryItem[]): AutocompleteItem<PantryItem>[] {
    const locale = this.translate.currentLang ?? 'es';
    return buildPantryItemAutocomplete(items, {
      locale,
      getQuantity: item => this.pantryStore.getItemTotalQuantity(item),
    });
  }

}
