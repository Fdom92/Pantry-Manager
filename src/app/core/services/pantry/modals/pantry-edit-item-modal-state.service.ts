import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_LOCATION_KEY } from '@core/constants';
import { buildUniqueSelectOptions, formatSupermarketLabel } from '@core/utils/pantry-selectors.util';
import { toDateInputValue, toIsoDate } from '@core/utils/date.util';
import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { createDocumentId, hasMeaningfulItemChanges } from '@core/utils';
import { formatQuantity } from '@core/utils/formatting.util';
import {
  formatFriendlyName,
  normalizeCategoryId,
  normalizeLowercase,
  normalizeLocationId,
  normalizeStringList,
  normalizeSupermarketValue,
  normalizeTrim,
} from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { SettingsPreferencesService } from '../../settings/settings-preferences.service';
import { PantryStateService } from '../pantry-state.service';
import { PantryStoreService } from '../pantry-store.service';
import { PantryService } from '../pantry.service';

@Injectable()
export class PantryEditItemModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly fb = inject(FormBuilder);
  private readonly appPreferences = inject(SettingsPreferencesService);
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

  readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.maxLength(120)], nonNullable: true }),
    categoryId: this.fb.control<string | null>(null),
    supermarket: this.fb.control('', {
      validators: [Validators.maxLength(80)],
      nonNullable: true,
    }),
    isBasic: this.fb.control(false),
    minThreshold: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    notes: this.fb.control(''),
    batches: this.fb.array([this.createBatchGroup()]),
  });

  get batchesArray(): FormArray<FormGroup> {
    return this.form.get('batches') as FormArray<FormGroup>;
  }

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

  addBatchEntry(): void {
    this.batchesArray.push(this.createBatchGroup());
  }

  removeBatchEntry(index: number): void {
    if (this.batchesArray.length <= 1) {
      return;
    }
    this.batchesArray.removeAt(index);
  }

  getCategorySelectOptions(): Array<{ value: string; label: string }> {
    const presetOptions = normalizeStringList(this.appPreferences.preferences().categoryOptions, { fallback: [] });
    const uncategorizedLabel = this.translate.instant('pantry.form.uncategorized');
    const currentValue = this.getFormStringValue('categoryId', normalizeCategoryId);
    return this.buildSelectOptions(presetOptions, currentValue, value =>
      formatFriendlyName(value, uncategorizedLabel)
    );
  }

  getLocationOptionsForBatch(index: number): Array<{ value: string; label: string }> {
    const presetOptions = normalizeStringList(this.appPreferences.preferences().locationOptions, { fallback: [] });
    const noneLabel = this.translate.instant('common.locations.none');
    const batchGroup = this.batchesArray.at(index);
    const currentValue = normalizeLocationId(batchGroup?.get('locationId')?.value);
    return this.buildSelectOptions(presetOptions, currentValue, value => normalizeLocationId(value, noneLabel));
  }

  getLocationAutocompleteOptionsForBatch(index: number): AutocompleteItem<string>[] {
    return this.mapSelectOptions(this.getLocationOptionsForBatch(index));
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

  onCategoryAutocompleteSelect(option: AutocompleteItem<string>): void {
    this.applyAutocompleteValue(option, value => this.form.get('categoryId')?.setValue(value));
  }

  onSupermarketAutocompleteSelect(option: AutocompleteItem<string>): void {
    this.applyAutocompleteValue(option, value => this.form.get('supermarket')?.setValue(value));
  }

  onLocationAutocompleteSelect(index: number, option: AutocompleteItem<string>): void {
    this.applyAutocompleteValue(option, value => {
      const control = this.batchesArray.at(index);
      control?.get('locationId')?.setValue(value);
    });
  }

  addCategoryOptionFromText(value: string): void {
    this.addOptionFromText(value, formatted => this.addCategoryOption(formatted));
  }

  addSupermarketOptionFromText(value: string): void {
    this.addOptionFromText(value, formatted => this.addSupermarketOption(formatted));
  }

  addLocationOptionFromText(index: number, value: string): void {
    this.addOptionFromText(value, formatted => this.addLocationOption(index, formatted));
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
    const current = await this.appPreferences.getPreferences();
    await this.addPreferenceOption({
      value,
      existing: current.supermarketOptions,
      normalizeValue: normalizeSupermarketValue,
      onSelected: selected => this.form.get('supermarket')?.setValue(selected),
      onSave: next => this.appPreferences.savePreferences({ ...current, supermarketOptions: next }),
    });
  }

  private async addCategoryOption(value: string): Promise<void> {
    const current = await this.appPreferences.getPreferences();
    await this.addPreferenceOption({
      value,
      existing: current.categoryOptions,
      normalizeValue: normalizeCategoryId,
      onSelected: selected => this.form.get('categoryId')?.setValue(selected),
      onSave: next => this.appPreferences.savePreferences({ ...current, categoryOptions: next }),
    });
  }

  private async addLocationOption(index: number, value: string): Promise<void> {
    const current = await this.appPreferences.getPreferences();
    await this.addPreferenceOption({
      value,
      existing: current.locationOptions,
      normalizeValue: normalizeLocationId,
      onSelected: selected => {
        const control = this.batchesArray.at(index);
        control?.get('locationId')?.setValue(selected);
      },
      onSave: next => this.appPreferences.savePreferences({ ...current, locationOptions: next }),
    });
  }

  private async addPreferenceOption(params: {
    value: string;
    existing: string[] | null | undefined;
    normalizeValue: (value: string) => string | undefined;
    onSelected: (value: string) => void;
    onSave: (next: string[]) => Promise<void>;
  }): Promise<void> {
    const normalized = params.normalizeValue(params.value);
    if (!normalized) {
      return;
    }
    const existing = params.existing ?? [];
    const normalizedKey = normalizeLowercase(normalized);
    const existingMatch = existing.find(option => {
      const normalizedOption = params.normalizeValue(option);
      return normalizeLowercase(normalizedOption ?? '') === normalizedKey;
    });
    const nextValue = existingMatch ?? normalized;
    if (!existingMatch) {
      await params.onSave([...existing, normalized]);
    }
    params.onSelected(nextValue);
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
        if (!hasMeaningfulItemChanges(existing, item)) {
          this.dismiss();
          return;
        }
        this.listState.cancelPendingStockSave(item._id);
        await this.pantryStore.updateItem(item);
        await this.eventManager.logAdvancedEdit(existing, item);
      } else {
        await this.pantryStore.addItem(item);
        await this.eventManager.logAdvancedCreate(item);
      }

      this.dismiss();
    } catch (err) {
      this.isSaving.set(false);
      console.error('[PantryEditItemModalStateService] submitItem error', err);
    }
  }

  private resetBatchControls(batches: Array<Partial<ItemBatch>>): void {
    while (this.batchesArray.length) {
      this.batchesArray.removeAt(0);
    }
    for (const batch of batches) {
      this.batchesArray.push(this.createBatchGroup(batch));
    }
  }

  private resetFormForCreate(): void {
    this.form.reset({
      name: '',
      categoryId: null,
      supermarket: '',
      isBasic: false,
      minThreshold: null,
      notes: '',
    });
    this.resetBatchControls([{}]);
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
      notes: '',
    });
    const batches = this.buildBatchEntries(item);
    this.resetBatchControls(batches);
  }

  private buildBatchEntries(item: PantryItem): Array<Partial<ItemBatch>> {
    if (Array.isArray(item.batches) && item.batches.length) {
      return item.batches;
    }

    return [{}];
  }

  private createBatchGroup(initial?: Partial<ItemBatch>): FormGroup {
    let normalizedQuantity: number | null = null;
    if (initial?.quantity != null) {
      const numericValue = Number(initial.quantity);
      normalizedQuantity = Number.isFinite(numericValue) ? numericValue : null;
    }
    const rawLocation = normalizeLocationId(initial?.locationId);
    const locationId = rawLocation && rawLocation !== UNASSIGNED_LOCATION_KEY ? rawLocation : '';
    return this.fb.group({
      batchId: this.fb.control(normalizeTrim(initial?.batchId)),
      locationId: this.fb.control(locationId, {
        nonNullable: true,
      }),
      quantity: this.fb.control<number | null>(normalizedQuantity, {
        validators: [Validators.required, Validators.min(0)],
      }),
      expirationDate: this.fb.control(initial?.expirationDate ? toDateInputValue(initial.expirationDate) : ''),
      opened: this.fb.control(initial?.opened ?? false),
    });
  }

  private buildItemPayload(existing?: PantryItem): PantryItem {
    const { name, categoryId, isBasic, supermarket, minThreshold } = this.form.value as {
      name?: string;
      categoryId?: string;
      isBasic?: boolean;
      supermarket?: string;
      minThreshold?: number | string | null;
    };
    const identifier = existing?._id ?? createDocumentId('item');
    const now = new Date().toISOString();
    let normalizedMinThreshold: number | undefined;
    if (minThreshold !== null && minThreshold !== undefined && minThreshold !== '') {
      const numericValue = Number(minThreshold);
      normalizedMinThreshold = Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : undefined;
    }

    const batches: ItemBatch[] = this.batchesArray.controls
      .map(group => {
        const batchValue = group.value as any;
        const expirationDate =
          typeof batchValue?.expirationDate === 'string'
            ? toIsoDate(batchValue.expirationDate) ?? undefined
            : undefined;
        const batchQuantity = batchValue?.quantity != null ? Number(batchValue.quantity) : 0;
        const batchId = normalizeTrim(batchValue?.batchId) || undefined;
        const opened = batchValue?.opened ? true : undefined;
        const locationId = normalizeLocationId(batchValue?.locationId) || undefined;
        return {
          batchId,
          quantity: Number.isFinite(batchQuantity) ? batchQuantity : 0,
          expirationDate,
          opened,
          locationId,
        } as ItemBatch;
      })
      .filter(batch => batch.quantity > 0 || Boolean(batch.expirationDate) || Boolean(batch.opened));

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
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private buildSelectorOptions(items: PantryItem[]): AutocompleteItem<PantryItem>[] {
    const locale = this.translate.currentLang ?? 'es';
    return (items ?? []).map(item => {
      const total = this.pantryStore.getItemTotalQuantity(item);
      const formattedQty = formatQuantity(total, locale);
      return {
        id: item._id,
        title: item.name,
        subtitle: formattedQty,
        raw: item,
      };
    });
  }

}
