import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DEFAULT_HOUSEHOLD_ID, UNASSIGNED_LOCATION_KEY, UNASSIGNED_PRODUCT_NAME } from '@core/constants';
import { getLocationEarliestExpiry } from '@core/domain/pantry';
import {
  buildUniqueSelectOptions,
  formatCategoryName as formatCategoryNameCatalog,
  formatSupermarketLabel,
  getPresetCategoryOptions,
  getPresetLocationOptions,
  getPresetSupermarketOptions,
} from '@core/domain/pantry/pantry-catalog';
import { toDateInputValue, toIsoDate } from '@core/domain/up-to-date';
import type { ItemBatch, ItemLocationStock, PantryItem } from '@core/models/pantry';
import { MeasurementUnit } from '@core/models/shared';
import { createDocumentId } from '@core/utils';
import { formatQuantity, formatShortDate, roundQuantity } from '@core/utils/formatting.util';
import {
  normalizeCategoryId,
  normalizeKey,
  normalizeLocationId,
  normalizeSupermarketValue,
  normalizeUnitValue,
} from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { AppPreferencesService } from '../../settings/app-preferences.service';
import { LanguageService } from '../../shared/language.service';
import { ToastService } from '../../shared/toast.service';
import { PantryStoreService } from '../pantry-store.service';
import { PantryStateService } from '../pantry-state.service';

@Injectable()
export class PantryEditItemModalStateService {
  private static readonly ADD_SUPERMARKET_VALUE = '__add_supermarket__';
  private static readonly ADD_CATEGORY_VALUE = '__add_category__';
  private readonly pantryStore = inject(PantryStoreService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly listState = inject(PantryStateService);
  private readonly destroyRef = inject(DestroyRef);
  private lastSupermarketValue = '';
  private lastCategoryValue = '';

  readonly isOpen = signal(false);
  readonly isSaving = signal(false);
  readonly editingItem = signal<PantryItem | null>(null);
  readonly isSupermarketPromptOpen = signal(false);
  readonly isCategoryPromptOpen = signal(false);

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

    const supermarketControl = this.form.get('supermarket');
    supermarketControl?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        const nextValue = (value ?? '').toString();
        if (nextValue === PantryEditItemModalStateService.ADD_SUPERMARKET_VALUE) {
          return;
        }
        this.lastSupermarketValue = nextValue;
      });

    const categoryControl = this.form.get('categoryId');
    categoryControl?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        const nextValue = (value ?? '').toString();
        if (nextValue === PantryEditItemModalStateService.ADD_CATEGORY_VALUE) {
          return;
        }
        this.lastCategoryValue = nextValue;
      });
  }

  openCreate(): void {
    this.editingItem.set(null);
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
    this.isSaving.set(false);
    this.isOpen.set(true);
  }

  openEdit(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
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
  }

  dismiss(): void {
    this.isOpen.set(false);
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

    options.push({
      value: PantryEditItemModalStateService.ADD_CATEGORY_VALUE,
      label: this.translate.instant('pantry.form.categoryAdd.option'),
    });
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
    options.push({
      value: PantryEditItemModalStateService.ADD_SUPERMARKET_VALUE,
      label: this.translate.instant('pantry.form.supermarketAdd.option'),
    });
    return options;
  }

  onCategoryChange(event: CustomEvent): void {
    const value = (event.detail as { value?: string })?.value ?? '';
    if (value !== PantryEditItemModalStateService.ADD_CATEGORY_VALUE) {
      return;
    }
    const control = this.form.get('categoryId');
    control?.setValue(this.lastCategoryValue || null);
    this.isCategoryPromptOpen.set(true);
  }

  onSupermarketChange(event: CustomEvent): void {
    const value = (event.detail as { value?: string })?.value ?? '';
    if (value !== PantryEditItemModalStateService.ADD_SUPERMARKET_VALUE) {
      return;
    }
    const control = this.form.get('supermarket');
    control?.setValue(this.lastSupermarketValue);
    this.isSupermarketPromptOpen.set(true);
  }

  onCategoryPromptDismiss(): void {
    this.isCategoryPromptOpen.set(false);
  }

  onSupermarketPromptDismiss(): void {
    this.isSupermarketPromptOpen.set(false);
  }

  getCategoryPromptInputs(): Array<{
    name: string;
    type: string;
    placeholder: string;
    attributes?: { [key: string]: string | number };
  }> {
    return [
      {
        name: 'name',
        type: 'text',
        placeholder: this.translate.instant('pantry.form.categoryAdd.placeholder'),
        attributes: { maxlength: 80 },
      },
    ];
  }

  getCategoryPromptButtons(): Array<{
    text: string;
    role?: string;
    handler?: (data: { [key: string]: string }) => boolean | void | Promise<boolean | void>;
  }> {
    return [
      {
        text: this.translate.instant('common.actions.cancel'),
        role: 'cancel',
      },
      {
        text: this.translate.instant('common.actions.add'),
        handler: async data => {
          const rawValue = (data?.['name'] ?? '').trim();
          if (!rawValue) {
            return false;
          }
          await this.addCategoryOption(rawValue);
          this.isCategoryPromptOpen.set(false);
          return true;
        },
      },
    ];
  }

  getSupermarketPromptInputs(): Array<{
    name: string;
    type: string;
    placeholder: string;
    attributes?: { [key: string]: string | number };
  }> {
    return [
      {
        name: 'name',
        type: 'text',
        placeholder: this.translate.instant('pantry.form.supermarketAdd.placeholder'),
        attributes: { maxlength: 80 },
      },
    ];
  }

  getSupermarketPromptButtons(): Array<{
    text: string;
    role?: string;
    handler?: (data: { [key: string]: string }) => boolean | void | Promise<boolean | void>;
  }> {
    return [
      {
        text: this.translate.instant('common.actions.cancel'),
        role: 'cancel',
      },
      {
        text: this.translate.instant('common.actions.add'),
        handler: async data => {
          const rawValue = (data?.['name'] ?? '').trim();
          if (!rawValue) {
            return false;
          }
          await this.addSupermarketOption(rawValue);
          this.isSupermarketPromptOpen.set(false);
          return true;
        },
      },
    ];
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
      let successMessage: string;

      if (existing) {
        this.listState.cancelPendingStockSave(item._id);
        await this.pantryStore.updateItem(item);
        successMessage = this.buildUpdateSuccessMessage(existing, item);
      } else {
        await this.pantryStore.addItem(item);
        successMessage = this.buildCreateSuccessMessage(item);
      }

      this.dismiss();
      await this.presentToast(successMessage, 'success');
    } catch (err) {
      this.isSaving.set(false);
      if (err instanceof Error && err.message === 'LOCATION_REQUIRED') {
        await this.presentToast(this.translate.instant('pantry.toasts.locationRequired'), 'danger');
        return;
      }
      console.error('[PantryEditItemModalStateService] submitItem error', err);
      await this.presentToast(this.translate.instant('pantry.toasts.saveError'), 'danger');
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

  private buildCreateSuccessMessage(item: PantryItem): string {
    const name = item.name?.trim() || UNASSIGNED_PRODUCT_NAME;
    const quantityText = this.formatQuantityForMessage(this.getTotalQuantity(item), this.getPrimaryUnit(item));
    const breakdown = this.formatLocationBreakdown(item.locations);
    const quantitySegment = quantityText ? ` (${quantityText})` : '';
    const breakdownSegment = breakdown ? ` · ${breakdown}` : '';
    return this.translate.instant('pantry.toasts.createSuccess', {
      name,
      quantity: quantitySegment,
      breakdown: breakdownSegment,
    });
  }

  private buildUpdateSuccessMessage(previous: PantryItem, updated: PantryItem): string {
    const previousBreakdown = this.formatLocationBreakdown(previous.locations);
    const nextBreakdown = this.formatLocationBreakdown(updated.locations);
    if (previousBreakdown !== nextBreakdown) {
      return this.translate.instant('pantry.toasts.locationsUpdated', {
        breakdown: nextBreakdown || this.translate.instant('common.locations.none'),
      });
    }

    const previousQuantity = this.getTotalQuantity(previous);
    const nextQuantity = this.getTotalQuantity(updated);
    if (previousQuantity !== nextQuantity) {
      const quantityText = this.formatQuantityForMessage(nextQuantity, this.getPrimaryUnit(updated));
      if (quantityText) {
        return this.translate.instant('pantry.toasts.stockUpdated', {
          name: updated.name,
          quantity: quantityText,
        });
      }
      return this.translate.instant('pantry.toasts.stockUpdatedSimple');
    }

    return this.translate.instant('pantry.toasts.saved');
  }

  private getPrimaryUnit(item: PantryItem): string {
    return normalizeUnitValue(this.pantryStore.getItemPrimaryUnit(item));
  }

  private getTotalQuantity(item: PantryItem): number {
    return this.pantryStore.getItemTotalQuantity(item);
  }

  private getUnitLabel(unit: MeasurementUnit | string | undefined): string {
    return this.pantryStore.getUnitLabel(unit);
  }

  private formatQuantityForMessage(quantity?: number | null, unit?: MeasurementUnit | string | null): string | null {
    if (quantity == null || Number.isNaN(Number(quantity))) {
      return null;
    }
    const formattedNumber = formatQuantity(quantity, this.languageService.getCurrentLocale(), {
      maximumFractionDigits: 2,
    });
    const unitLabel = this.getUnitLabel(normalizeUnitValue(unit ?? undefined));
    return `${formattedNumber} ${unitLabel}`.trim();
  }

  private formatLocationBreakdown(locations: ItemLocationStock[]): string {
    if (!locations.length) {
      return '';
    }
    return locations
      .map(location => {
        const quantityLabel = formatQuantity(this.getLocationTotal(location), this.languageService.getCurrentLocale(), {
          maximumFractionDigits: 2,
        });
        const unitLabel = this.getUnitLabel(normalizeUnitValue(location.unit));
        const label = normalizeLocationId(location.locationId, this.translate.instant('common.locations.none'));
        const batches = Array.isArray(location.batches) ? location.batches : [];
        const extras: string[] = [];
        if (batches.length) {
          const batchesLabel = this.translate.instant(
            batches.length === 1 ? 'pantry.detail.batches.single' : 'pantry.detail.batches.plural',
            { count: batches.length },
          );
          extras.push(batchesLabel);
          const earliest = getLocationEarliestExpiry(location);
          if (earliest) {
            extras.push(
              this.translate.instant('pantry.detail.batches.withExpiry', {
                date: formatShortDate(earliest, this.languageService.getCurrentLocale(), { fallback: earliest }),
              }),
            );
          }
        }
        const meta = extras.length ? ` (${extras.join(' · ')})` : '';
        return `${quantityLabel} ${unitLabel} · ${label}${meta}`;
      })
      .join(', ');
  }

  private getLocationTotal(location: ItemLocationStock): number {
    if (!Array.isArray(location.batches) || !location.batches.length) {
      return 0;
    }
    const total = location.batches.reduce((sum, batch) => sum + roundQuantity(Number(batch.quantity ?? 0)), 0);
    return roundQuantity(total);
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

  private async presentToast(message: string, color: string = 'medium'): Promise<void> {
    await this.toast.present(message, { color });
  }
}
