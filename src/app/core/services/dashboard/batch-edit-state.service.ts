import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import { applyBatchEditFilter } from '@core/models/pantry/batch-edit.model';
import type { BatchEditAction, BatchEditFilter, BatchEditFlowConfig } from '@core/models/pantry/batch-edit.model';
import { buildUniqueSelectOptions } from '@core/utils';
import { formatFriendlyName, normalizeStringList } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { PantryStoreService } from '../pantry/pantry-store.service';

@Injectable({ providedIn: 'root' })
export class BatchEditStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly toastCtrl = inject(ToastController);

  readonly isOpen = signal(false);
  readonly config = signal<BatchEditFlowConfig | null>(null);
  readonly itemValues = signal<Map<string, string>>(new Map());
  readonly isSaving = signal(false);

  readonly filteredItems = computed((): PantryItem[] => {
    const cfg = this.config();
    if (!cfg) return [];
    return this.filterItems(this.pantryStore.items(), cfg.filter);
  });

  readonly action = computed(() => this.config()?.action ?? null);

  readonly canSave = computed(() => this.itemValues().size > 0);

  readonly titleKey = computed(() => {
    const action = this.config()?.action;
    if (action === 'setFoodType') return 'batchEdit.actions.setFoodType';
    if (action === 'setCategory') return 'batchEdit.actions.setCategory';
    if (action === 'setExpiryDate') return 'batchEdit.actions.setExpiryDate';
    return 'batchEdit.actions.setCategory';
  });

  readonly foodTypeOptions = computed((): AutocompleteItem<FoodType>[] =>
    Object.values(FoodType).map(type => ({
      id: type,
      title: this.translate.instant(`pantry.form.foodType.${type}`),
      raw: type,
    }))
  );

  readonly categoryOptions = computed((): AutocompleteItem<string>[] => {
    const presetOptions = normalizeStringList(this.appPreferences.preferences().categoryOptions, { fallback: [] });
    const uncategorizedLabel = this.translate.instant('pantry.form.uncategorized');
    return buildUniqueSelectOptions(presetOptions, { labelFor: v => formatFriendlyName(v, uncategorizedLabel) })
      .map(opt => ({ id: opt.value, title: opt.label, raw: opt.value }));
  });

  openFlow(config: BatchEditFlowConfig): void {
    this.config.set(config);
    this.itemValues.set(new Map());
    this.isSaving.set(false);
    if (this.filteredItems().length === 0) return;
    this.isOpen.set(true);
  }

  dismiss(): void {
    this.isOpen.set(false);
  }

  close(): void {
    this.reset();
  }

  setItemValue(id: string, value: string | null): void {
    this.itemValues.update(map => {
      const next = new Map(map);
      if (value == null) {
        next.delete(id);
      } else {
        next.set(id, value);
      }
      return next;
    });
  }

  getItemExpiryDate(id: string): string | undefined {
    return this.itemValues().get(id) ?? undefined;
  }

  getItemDisplayValue(id: string): string {
    const value = this.itemValues().get(id);
    if (this.action() === 'setFoodType') {
      if (!value) return this.translate.instant('pantry.form.foodType.unassigned');
      return this.translate.instant(`pantry.form.foodType.${value}`);
    }
    if (this.action() === 'setCategory') {
      if (!value) return this.translate.instant('pantry.form.uncategorized');
      return this.categoryOptions().find(o => o.raw === value)?.title ?? value;
    }
    return '';
  }

  async apply(): Promise<void> {
    if (this.isSaving()) return;
    const values = this.itemValues();
    const action = this.config()?.action;
    if (!action || !values.size) return;
    this.isSaving.set(true);
    try {
      const items = this.filteredItems().filter(i => values.has(i._id));
      const now = new Date().toISOString();
      await Promise.all(items.map(async item => {
        const value = values.get(item._id)!;
        const updated = this.buildUpdatedItem(item, action, value, now);
        await this.pantryStore.updateItem(updated);
        await this.eventManager.logAdvancedEdit(item, updated, 'dashboard');
      }));
      this.dismiss();
      await this.showSuccessToast(items.length);
    } catch (err) {
      console.error('[BatchEditStateService] apply error', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  private buildUpdatedItem(item: PantryItem, action: BatchEditAction, value: string, now: string): PantryItem {
    const base = { ...item, updatedAt: now };
    if (action === 'setFoodType') return { ...base, foodType: value as FoodType };
    if (action === 'setCategory') return { ...base, categoryId: value };
    if (action === 'setExpiryDate') return { ...base, batches: [{ ...base.batches[0], expirationDate: value }] };
    return base;
  }

  private filterItems(items: PantryItem[], filter: BatchEditFilter): PantryItem[] {
    return applyBatchEditFilter(items, filter);
  }

  private async showSuccessToast(count: number): Promise<void> {
    const messageKey = count === 1 ? 'batchEdit.toast.updated_one' : 'batchEdit.toast.updated_other';
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(messageKey, { count }),
      duration: 2500,
      position: 'bottom',
    });
    await toast.present();
  }

  private reset(): void {
    this.config.set(null);
    this.itemValues.set(new Map());
    this.isSaving.set(false);
    this.isOpen.set(false);
  }
}
