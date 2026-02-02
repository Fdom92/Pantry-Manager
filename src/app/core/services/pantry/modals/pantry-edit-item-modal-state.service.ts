import { Injectable, effect, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_LOCATION_KEY } from '@core/constants';
import {
  buildUniqueSelectOptions,
  formatCategoryName as formatCategoryNameCatalog,
  formatSupermarketLabel,
  getPresetCategoryOptions,
  getPresetLocationOptions,
  getPresetSupermarketOptions,
} from '@core/domain/pantry/pantry-catalog';
import { normalizeEntityName } from '@core/utils/normalization.util';
import { toDateInputValue, toIsoDate } from '@core/domain/up-to-date';
import type { ItemBatch, ItemLocationStock, PantryItem } from '@core/models/pantry';
import { MeasurementUnit } from '@core/models/shared';
import { createDocumentId } from '@core/utils';
import { formatQuantity, roundQuantity } from '@core/utils/formatting.util';
import {
  normalizeCategoryId,
  normalizeKey,
  normalizeLocationId,
  normalizeSupermarketValue,
  normalizeUnitValue,
} from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { AppPreferencesService } from '../../settings/app-preferences.service';
import { PantryStoreService } from '../pantry-store.service';
import { PantryStateService } from '../pantry-state.service';
import { PantryService } from '../pantry.service';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';

@Injectable()
export class PantryEditItemModalStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly pantryService = inject(PantryService);
  private readonly fb = inject(FormBuilder);
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly listState = inject(PantryStateService);
  readonly isOpen = signal(false);
  readonly isSaving = signal(false);
  readonly editingItem = signal<PantryItem | null>(null);
  readonly selectingItem = signal(false);
  readonly selectorQuery = signal('');
  readonly selectorOptions = signal<AutocompleteItem<PantryItem>[]>([]);
  readonly showSelectorEmptyAction = signal(false);
  readonly selectorEmptyActionLabel = signal('');

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
    locations: this.fb.array([
      this.createLocationGroup({
        locationId: '',
        unit: MeasurementUnit.UNIT,
        batches: [],
      }),
    ]),
  });

  get locationsArray(): FormArray<FormGroup> {
    return this.form.get('locations') as FormArray<FormGroup>;
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

    effect(() => {
      const items = this.pantryService.loadedProducts();
      this.selectorOptions.set(this.buildSelectorOptions(items));
    });

    effect(() => {
      const query = this.selectorQuery().trim();
      this.showSelectorEmptyAction.set(query.length >= 1);
      this.selectorEmptyActionLabel.set(this.buildSelectorEmptyActionLabel(query));
    });
  }

  openCreate(): void {
    this.editingItem.set(null);
    this.resetFormForCreate();
    this.selectingItem.set(true);
    this.selectorQuery.set('');
    this.isSaving.set(false);
    this.isOpen.set(true);
  }

  openEdit(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.selectingItem.set(false);
    this.selectorQuery.set('');
    this.editingItem.set(item);
    this.form.reset({
      name: item.name ?? '',
      categoryId: item.categoryId ?? null,
      supermarket: item.supermarket ?? '',
      isBasic: Boolean(item.isBasic),
      minThreshold: item.minThreshold ?? null,
      notes: '',
    });
    const locations = item.locations.length
      ? item.locations
      : [
          {
            locationId: '',
            quantity: 0,
            unit: this.pantryStore.getItemPrimaryUnit(item),
            batches: [],
          },
        ];
    this.resetLocationControls(locations);
    this.isSaving.set(false);
    this.isOpen.set(true);
  }

  close(): void {
    if (this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.isSaving.set(false);
    this.editingItem.set(null);
    this.selectingItem.set(false);
    this.selectorQuery.set('');
  }

  dismiss(): void {
    this.isOpen.set(false);
    this.selectingItem.set(false);
    this.selectorQuery.set('');
  }

  addLocationEntry(): void {
    this.locationsArray.push(this.createLocationGroup());
  }

  removeLocationEntry(index: number): void {
    if (this.locationsArray.length <= 1) {
      return;
    }
    this.locationsArray.removeAt(index);
  }

  getBatchesArray(locationIndex: number): FormArray<FormGroup> {
    const control = this.locationsArray.at(locationIndex).get('batches');
    if (control instanceof FormArray) {
      return control as FormArray<FormGroup>;
    }

    const batches = this.fb.array<FormGroup>([]);
    this.locationsArray.at(locationIndex).setControl('batches', batches);
    return batches;
  }

  addBatchEntry(locationIndex: number): void {
    const batches = this.getBatchesArray(locationIndex);
    batches.push(this.createBatchGroup());
  }

  removeBatchEntry(locationIndex: number, batchIndex: number): void {
    const batches = this.getBatchesArray(locationIndex);
    if (batchIndex < 0 || batchIndex >= batches.length) {
      return;
    }
    batches.removeAt(batchIndex);
  }

  getLocationTotalForControl(index: number): number {
    const batchesArray = this.getBatchesArray(index);
    return batchesArray.controls.reduce((sum, control) => {
      const raw = control.get('quantity')?.value;
      const quantity = Number(raw ?? 0);
      return sum + (Number.isFinite(quantity) ? quantity : 0);
    }, 0);
  }

  getLocationUnitLabelForControl(index: number): string {
    const control = this.locationsArray.at(index).get('unit');
    const value = normalizeUnitValue(control?.value as MeasurementUnit | string | undefined);
    return this.getUnitLabel(value);
  }

  getCategorySelectOptions(): Array<{ value: string; label: string }> {
    const presetOptions = this.presetCategoryOptions();
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];

    const addOption = (value: string, label?: string): void => {
      const normalized = normalizeKey(value);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      const trimmed = value.trim();
      const display = label ?? this.formatCategoryName(trimmed);
      options.push({ value: trimmed, label: display });
    };

    for (const preset of presetOptions) {
      addOption(preset);
    }

    const control = this.form.get('categoryId');
    const currentValue = typeof control?.value === 'string' ? normalizeCategoryId(control.value) : '';
    if (currentValue && !seen.has(normalizeKey(currentValue))) {
      addOption(currentValue);
    }

    return options;
  }

  getLocationOptionsForControl(index: number): Array<{ value: string; label: string }> {
    const presetOptions = this.presetLocationOptions();
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];

    const addOption = (value: string, label?: string): void => {
      const normalized = normalizeKey(value);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      const display = label ?? normalizeLocationId(value, this.translate.instant('common.locations.none'));
      options.push({ value, label: display });
    };

    for (const preset of presetOptions) {
      addOption(preset);
    }

    const control = this.locationsArray.at(index);
    const currentValue = normalizeLocationId(control?.get('locationId')?.value);
    if (currentValue && !seen.has(normalizeKey(currentValue))) {
      addOption(currentValue);
    }

    return options;
  }

  getSupermarketSelectOptions(): Array<{ value: string; label: string }> {
    const presetOptions = this.presetSupermarketOptions();
    const control = this.form.get('supermarket');
    const currentValue = (control?.value ?? '').trim();
    const options = buildUniqueSelectOptions([...presetOptions, currentValue], {
      labelFor: value =>
        formatSupermarketLabel(value, this.translate.instant('settings.catalogs.supermarkets.other')),
    });
    return options;
  }

  getCategoryAutocompleteOptions(): AutocompleteItem<string>[] {
    return this.getCategorySelectOptions()
      .map(option => ({
        id: option.value,
        title: option.label,
        raw: option.value,
      }));
  }

  getSupermarketAutocompleteOptions(): AutocompleteItem<string>[] {
    return this.getSupermarketSelectOptions()
      .map(option => ({
        id: option.value,
        title: option.label,
        raw: option.value,
      }));
  }

  onCategoryAutocompleteSelect(option: AutocompleteItem<string>): void {
    const value = (option?.raw ?? '').toString().trim();
    if (!value) {
      return;
    }
    this.form.get('categoryId')?.setValue(value);
  }

  onSupermarketAutocompleteSelect(option: AutocompleteItem<string>): void {
    const value = (option?.raw ?? '').toString().trim();
    if (!value) {
      return;
    }
    this.form.get('supermarket')?.setValue(value);
  }

  addCategoryOptionFromText(value: string): void {
    const nextValue = (value ?? '').trim();
    if (!nextValue) {
      return;
    }
    const formatted = normalizeEntityName(nextValue, nextValue);
    void this.addCategoryOption(formatted);
  }

  addSupermarketOptionFromText(value: string): void {
    const nextValue = (value ?? '').trim();
    if (!nextValue) {
      return;
    }
    const formatted = normalizeEntityName(nextValue, nextValue);
    void this.addSupermarketOption(formatted);
  }

  onSelectorQueryChange(value: string): void {
    this.selectorQuery.set(value ?? '');
  }

  onSelectorSelect(option: AutocompleteItem<PantryItem>): void {
    const item = option?.raw;
    if (!item) {
      return;
    }
    this.openEdit(item);
  }

  onSelectorCreateNew(): void {
    this.selectingItem.set(false);
    this.selectorQuery.set('');
    this.resetFormForCreate();
  }

  private async addSupermarketOption(value: string): Promise<void> {
    const normalized = normalizeSupermarketValue(value);
    if (!normalized) {
      return;
    }
    const current = await this.appPreferences.getPreferences();
    const existing = current.supermarketOptions ?? [];
    const normalizedKey = normalizeKey(normalized);
    const existingMatch = existing.find(option => normalizeKey(option) === normalizedKey);
    if (existingMatch) {
      this.form.get('supermarket')?.setValue(existingMatch);
      return;
    }
    const next = [...existing, normalized];
    await this.appPreferences.savePreferences({ ...current, supermarketOptions: next });
    this.form.get('supermarket')?.setValue(normalized);
  }

  private async addCategoryOption(value: string): Promise<void> {
    const normalized = normalizeCategoryId(value);
    if (!normalized) {
      return;
    }
    const current = await this.appPreferences.getPreferences();
    const existing = current.categoryOptions ?? [];
    const normalizedKey = normalizeKey(normalized);
    const existingMatch = existing.find(option => normalizeKey(normalizeCategoryId(option)) === normalizedKey);
    if (existingMatch) {
      this.form.get('categoryId')?.setValue(existingMatch);
      return;
    }
    const next = [...existing, normalized];
    await this.appPreferences.savePreferences({ ...current, categoryOptions: next });
    this.form.get('categoryId')?.setValue(normalized);
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
        this.listState.cancelPendingStockSave(item._id);
        await this.pantryStore.updateItem(item);
      } else {
        await this.pantryStore.addItem(item);
      }

      this.dismiss();
    } catch (err) {
      this.isSaving.set(false);
      if (err instanceof Error && err.message === 'LOCATION_REQUIRED') {
        return;
      }
      console.error('[PantryEditItemModalStateService] submitItem error', err);
    }
  }

  private resetLocationControls(locations: Array<Partial<ItemLocationStock>>): void {
    while (this.locationsArray.length) {
      this.locationsArray.removeAt(0);
    }
    for (const location of locations) {
      this.locationsArray.push(this.createLocationGroup(location));
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
    this.resetLocationControls([
      {
        locationId: '',
        unit: MeasurementUnit.UNIT,
        batches: [],
      },
    ]);
  }

  private createLocationGroup(initial?: Partial<ItemLocationStock>): FormGroup {
    const batches = Array.isArray(initial?.batches) ? initial.batches : [];
    const rawLocation = normalizeLocationId(initial?.locationId);
    const locationId = rawLocation && rawLocation !== UNASSIGNED_LOCATION_KEY ? rawLocation : '';
    return this.fb.group({
      locationId: this.fb.control(locationId, {
        validators: [Validators.required],
        nonNullable: true,
      }),
      unit: this.fb.control<string>(normalizeUnitValue(initial?.unit), {
        nonNullable: true,
      }),
      batches: this.fb.array(batches.map(batch => this.createBatchGroup(batch))),
    });
  }

  private createBatchGroup(initial?: Partial<ItemBatch>): FormGroup {
    let normalizedQuantity: number | null = null;
    if (initial?.quantity != null) {
      const numericValue = Number(initial.quantity);
      normalizedQuantity = Number.isFinite(numericValue) ? numericValue : null;
    }
    return this.fb.group({
      batchId: this.fb.control((initial?.batchId ?? '').trim()),
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

    const locations: ItemLocationStock[] = this.locationsArray.controls
      .map(control => {
        const value = control.value as any;
        const rawLocationId = normalizeLocationId(value?.locationId);
        if (!rawLocationId) {
          return null;
        }
        const unit = normalizeUnitValue(value?.unit as MeasurementUnit | string | undefined);
        const batchesControl = control.get('batches');
        const batches =
          batchesControl instanceof FormArray
            ? (batchesControl.controls as FormGroup[]).map(group => {
                const batchValue = group.value as any;
                const expirationDate =
                  typeof batchValue?.expirationDate === 'string'
                    ? toIsoDate(batchValue.expirationDate) ?? undefined
                    : undefined;
                const batchQuantity = batchValue?.quantity != null ? Number(batchValue.quantity) : 0;
                const batchId = (batchValue?.batchId ?? '').trim() || undefined;
                const opened = batchValue?.opened ? true : undefined;
                return {
                  batchId,
                  quantity: Number.isFinite(batchQuantity) ? batchQuantity : 0,
                  expirationDate,
                  opened,
                  unit,
                } as ItemBatch;
              })
            : [];

        const normalizedBatches = batches.filter(batch => batch.quantity > 0 || Boolean(batch.expirationDate) || Boolean(batch.opened));

        return {
          locationId: rawLocationId,
          unit,
          batches: normalizedBatches,
        } as ItemLocationStock;
      })
      .filter((location): location is ItemLocationStock => location !== null);

    if (!locations.length) {
      throw new Error('LOCATION_REQUIRED');
    }

    const normalizedSupermarket = normalizeSupermarketValue(supermarket);
    const normalizedCategory = normalizeCategoryId(categoryId);

    return {
      _id: identifier,
      _rev: existing?._rev,
      type: 'item',
      householdId: existing?.householdId ?? DEFAULT_HOUSEHOLD_ID,
      name: (name ?? '').trim(),
      categoryId: normalizedCategory,
      locations,
      supermarket: normalizedSupermarket,
      isBasic: isBasic ? true : undefined,
      minThreshold: normalizedMinThreshold,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private getUnitLabel(unit: MeasurementUnit | string | undefined): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  private presetCategoryOptions(): string[] {
    return getPresetCategoryOptions(this.appPreferences.preferences());
  }

  private presetLocationOptions(): string[] {
    return getPresetLocationOptions(this.appPreferences.preferences());
  }

  private presetSupermarketOptions(): string[] {
    return getPresetSupermarketOptions(this.appPreferences.preferences());
  }

  private formatCategoryName(key: string): string {
    return formatCategoryNameCatalog(key, this.translate.instant('pantry.form.uncategorized'));
  }

  private buildSelectorOptions(items: PantryItem[]): AutocompleteItem<PantryItem>[] {
    const locale = this.translate.currentLang ?? 'es';
    return (items ?? []).map(item => {
      const total = this.pantryStore.getItemTotalQuantity(item);
      const unit = this.pantryStore.getUnitLabel(this.pantryStore.getItemPrimaryUnit(item));
      const formattedQty = formatQuantity(total, locale, { maximumFractionDigits: 1 });
      return {
        id: item._id,
        title: item.name,
        subtitle: `${formattedQty} ${unit}`.trim(),
        raw: item,
      };
    });
  }

  private buildSelectorEmptyActionLabel(query: string): string {
    if (!query) {
      return '';
    }
    const formatted = normalizeEntityName(query, query);
    return this.translate.instant('pantry.fastAdd.addNew', { name: formatted });
  }

}
