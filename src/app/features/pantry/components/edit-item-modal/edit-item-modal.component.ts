import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DEFAULT_HOUSEHOLD_ID } from '@core/constants';
import {
  buildUniqueSelectOptions,
  formatCategoryName as formatCategoryNameCatalog,
  formatFriendlyName as formatFriendlyNameCatalog,
  formatSupermarketLabel,
  getPresetCategoryOptions,
  getPresetLocationOptions,
  getPresetSupermarketOptions,
} from '@core/domain/pantry-catalog';
import { ItemBatch, ItemLocationStock, PantryItem } from '@core/models/inventory';
import { MeasurementUnit } from '@core/models/shared';
import { AppPreferencesService, LanguageService, PantryStoreService } from '@core/services';
import { createDocumentId } from '@core/utils';
import { formatQuantity, formatShortDate, roundQuantity } from '@core/utils/formatting.util';
import {
  normalizeCategoryId,
  normalizeKey,
  normalizeLocationId,
  normalizeSupermarketValue,
  normalizeUnitValue,
} from '@core/utils/normalization.util';
import { ToastController } from '@ionic/angular';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EmptyStateGenericComponent } from '@shared/components/empty-states/empty-state-generic.component';
import { PantryListStateService } from '../pantry-list.state.service';

@Component({
  selector: 'app-pantry-edit-item-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    EmptyStateGenericComponent,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonCheckbox,
    IonToggle,
    IonFooter,
    IonSpinner,
  ],
  templateUrl: './edit-item-modal.component.html',
  styleUrls: ['./edit-item-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export class PantryEditItemModalComponent {
  // DI
  private readonly pantryStore = inject(PantryStoreService);
  private readonly fb = inject(FormBuilder);
  private readonly toastCtrl = inject(ToastController);
  private readonly appPreferences = inject(AppPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly listState = inject(PantryListStateService);

  readonly isOpen = signal(false);
  editingItem: PantryItem | null = null;
  isSaving = false;

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
      })
    ])
  });

  get locationsArray(): FormArray<FormGroup> {
    return this.form.get('locations') as FormArray<FormGroup>;
  }

  openCreate(): void {
    this.editingItem = null;
    this.form.reset({
      name: '',
      categoryId: null,
      supermarket: '',
      isBasic: false,
      minThreshold: null,
      notes: ''
    });
    this.resetLocationControls([
      {
        locationId: '',
        unit: MeasurementUnit.UNIT,
        batches: [],
      }
    ]);
    this.isSaving = false;
    this.isOpen.set(true);
  }

  openEdit(item: PantryItem, event?: Event): void {
    event?.stopPropagation();
    this.editingItem = item;
    this.form.reset({
      name: item.name ?? '',
      categoryId: item.categoryId ?? null,
      supermarket: item.supermarket ?? '',
      isBasic: Boolean(item.isBasic),
      minThreshold: item.minThreshold ?? null,
      notes: ''
    });
    const locations = item.locations.length
      ? item.locations
      : [{
          locationId: '',
          quantity: 0,
          unit: this.pantryStore.getItemPrimaryUnit(item),
          batches: [],
        }];
    this.resetLocationControls(locations);
    this.isSaving = false;
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.isSaving = false;
    this.editingItem = null;
  }

  /** Append a new empty location group so the user can split stock. */
  addLocationEntry(): void {
    this.locationsArray.push(this.createLocationGroup());
  }

  /** Remove the requested location, keeping at least one so the form stays valid. */
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
    return buildUniqueSelectOptions([...presetOptions, currentValue], {
      labelFor: value => formatSupermarketLabel(value, this.translate.instant('settings.catalogs.supermarkets.other')),
    });
  }

  async submitItem(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    try {
      const item = this.buildItemPayload(this.editingItem ?? undefined);
      const previous = this.editingItem;
      let successMessage: string;
      if (previous) {
        this.listState.cancelPendingStockSave(item._id);
        await this.pantryStore.updateItem(item);
        successMessage = this.buildUpdateSuccessMessage(previous, item);
      } else {
        await this.pantryStore.addItem(item);
        successMessage = this.buildCreateSuccessMessage(item);
      }
      this.close();
      await this.presentToast(successMessage, 'success');
    } catch (err) {
      this.isSaving = false;
      if (err instanceof Error && err.message === 'LOCATION_REQUIRED') {
        await this.presentToast(this.translate.instant('pantry.toasts.locationRequired'), 'danger');
        return;
      }
      console.error('[PantryEditItemModalComponent] submitItem error', err);
      await this.presentToast(this.translate.instant('pantry.toasts.saveError'), 'danger');
    }
  }

  // ---- internals ----
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
    const locationId = rawLocation && rawLocation !== 'unassigned' ? rawLocation : '';
    return this.fb.group({
      locationId: this.fb.control(locationId, {
        validators: [Validators.required],
        nonNullable: true,
      }),
      unit: this.fb.control<string>(normalizeUnitValue(initial?.unit), {
        nonNullable: true,
      }),
      batches: this.fb.array(
        batches.map(batch => this.createBatchGroup(batch))
      ),
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
      quantity: this.fb.control<number | null>(
        normalizedQuantity,
        {
          validators: [Validators.required, Validators.min(0)],
        }
      ),
      expirationDate: this.fb.control(initial?.expirationDate ? this.toDateInputValue(initial.expirationDate) : ''),
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
        const batches = batchesControl instanceof FormArray
          ? (batchesControl.controls as FormGroup[]).map(group => {
              const batchValue = group.value as any;
              const expirationDate = batchValue?.expirationDate
                ? new Date(batchValue.expirationDate).toISOString()
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

        const normalizedBatches = batches.filter(batch =>
          batch.quantity > 0 ||
          Boolean(batch.expirationDate) ||
          Boolean(batch.opened)
        );

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

    const base: PantryItem = {
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

    return base;
  }

  private buildCreateSuccessMessage(item: PantryItem): string {
    const name = item.name?.trim() || 'Producto';
    const quantityText = this.formatQuantityForMessage(
      this.getTotalQuantity(item),
      this.getPrimaryUnit(item)
    );
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
        const label = normalizeLocationId(
          location.locationId,
          this.translate.instant('common.locations.none')
        );
        const batches = Array.isArray(location.batches) ? location.batches : [];
        const extras: string[] = [];
        if (batches.length) {
          const batchesLabel = this.translate.instant(
            batches.length === 1 ? 'pantry.detail.batches.single' : 'pantry.detail.batches.plural',
            { count: batches.length }
          );
          extras.push(batchesLabel);
          const earliest = this.getLocationEarliestExpiry(location);
          if (earliest) {
            extras.push(
              this.translate.instant('pantry.detail.batches.withExpiry', {
                date: formatShortDate(earliest, this.languageService.getCurrentLocale(), { fallback: earliest }),
              })
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

  private getLocationEarliestExpiry(location: ItemLocationStock): string | undefined {
    const batches = Array.isArray(location.batches) ? location.batches : [];
    const dates = batches
      .map(batch => batch.expirationDate)
      .filter((date): date is string => Boolean(date));
    if (!dates.length) {
      return undefined;
    }
    return dates.reduce((earliest, current) => {
      if (!earliest) {
        return current;
      }
      return new Date(current) < new Date(earliest) ? current : earliest;
    });
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

  private formatFriendlyName(value: string, fallback: string): string {
    return formatFriendlyNameCatalog(value, fallback);
  }

  private toDateInputValue(dateIso: string): string {
    try {
      return new Date(dateIso).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }

  private async presentToast(message: string, color: string = 'medium'): Promise<void> {
    if (!message) {
      return;
    }
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: 1600,
      position: 'bottom',
    });
    await toast.present();
  }
}
