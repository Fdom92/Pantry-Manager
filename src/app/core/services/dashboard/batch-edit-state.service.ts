import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { FoodType } from '@core/models/shared/enums.model';
import type { PantryItem } from '@core/models/pantry';
import type { BatchEditAction, BatchEditFilter, BatchEditFlowConfig } from '@core/models/pantry/batch-edit.model';
import { buildUniqueSelectOptions } from '@core/utils';
import { formatFriendlyName, normalizeStringList } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import type { AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { PantryStoreService } from '../pantry/pantry-store.service';

export type BatchEditStep = 'items' | 'action' | 'value' | 'confirm';

@Injectable({ providedIn: 'root' })
export class BatchEditStateService {
  private readonly pantryStore = inject(PantryStoreService);
  private readonly appPreferences = inject(SettingsPreferencesService);
  private readonly translate = inject(TranslateService);
  private readonly eventManager = inject(HistoryEventManagerService);
  private readonly toastCtrl = inject(ToastController);

  readonly isOpen = signal(false);
  readonly step = signal<BatchEditStep>('items');
  readonly config = signal<BatchEditFlowConfig | null>(null);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedAction = signal<BatchEditAction | null>(null);
  readonly selectedFoodType = signal<FoodType | null>(null);
  readonly selectedCategoryId = signal<string | null>(null);
  readonly isSaving = signal(false);

  readonly filteredItems = computed((): PantryItem[] => {
    const cfg = this.config();
    if (!cfg) return [];
    return this.filterItems(this.pantryStore.items(), cfg.filter);
  });

  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly canProceed = computed(() => this.selectedCount() > 0);

  readonly selectedFoodTypeLabel = computed(() => {
    const ft = this.selectedFoodType();
    if (!ft) return '';
    return this.translate.instant(`pantry.form.foodType.${ft}`);
  });

  readonly selectedCategoryLabel = computed(() => {
    const id = this.selectedCategoryId();
    if (!id) return '';
    return this.getCategoryOptions().find(o => o.raw === id)?.title ?? id;
  });

  readonly confirmValueLabel = computed(() => {
    const action = this.selectedAction() ?? this.config()?.action;
    if (!action) return '';
    if (action === 'setFoodType') return this.selectedFoodTypeLabel();
    if (action === 'setCategory') return this.selectedCategoryLabel();
    return '';
  });

  openFlow(config: BatchEditFlowConfig): void {
    this.config.set(config);
    this.selectedAction.set(config.action ?? null);
    this.selectedFoodType.set(null);
    this.selectedCategoryId.set(null);
    this.isSaving.set(false);
    const ids = new Set(this.filteredItems().map(i => i._id));
    if (ids.size === 0) {
      return;
    }
    this.selectedIds.set(ids);
    this.step.set('items');
    this.isOpen.set(true);
  }

  dismiss(): void {
    this.isOpen.set(false);
  }

  close(): void {
    this.reset();
  }

  toggleItem(id: string): void {
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  goToNextFromItems(): void {
    if (!this.canProceed()) return;
    this.step.set(this.config()?.action ? 'value' : 'action');
  }

  setAction(action: BatchEditAction): void {
    this.selectedAction.set(action);
    this.step.set('value');
  }

  setFoodType(type: FoodType | undefined): void {
    this.selectedFoodType.set(type ?? null);
  }

  clearFoodType(): void {
    this.selectedFoodType.set(null);
  }

  setCategoryId(id: string | undefined): void {
    this.selectedCategoryId.set(id ?? null);
  }

  clearCategory(): void {
    this.selectedCategoryId.set(null);
  }

  canConfirm(): boolean {
    const action = this.selectedAction() ?? this.config()?.action;
    if (!action) return false;
    if (action === 'setFoodType') return !!this.selectedFoodType();
    if (action === 'setCategory') return !!this.selectedCategoryId();
    return false;
  }

  goToConfirm(): void {
    if (!this.canConfirm()) return;
    this.step.set('confirm');
  }

  goBack(): void {
    const current = this.step();
    if (current === 'confirm') {
      this.step.set('value');
    } else if (current === 'value') {
      this.step.set(this.config()?.action ? 'items' : 'action');
    } else if (current === 'action') {
      this.step.set('items');
    }
  }

  confirmActionKey(): string {
    const action = this.selectedAction() ?? this.config()?.action;
    if (action === 'setFoodType') return 'batchEdit.actions.setFoodType';
    if (action === 'setCategory') return 'batchEdit.actions.setCategory';
    return '';
  }

  async apply(): Promise<void> {
    if (this.isSaving()) return;
    const ids = this.selectedIds();
    const action = this.selectedAction() ?? this.config()?.action;
    if (!action || !ids.size) return;
    this.isSaving.set(true);
    try {
      const items = this.filteredItems().filter(i => ids.has(i._id));
      const now = new Date().toISOString();
      await Promise.all(items.map(async item => {
        const updated = this.buildUpdatedItem(item, action, now);
        await this.pantryStore.updateItem(updated);
        await this.eventManager.logAdvancedEdit(item, updated);
      }));
      this.dismiss();
      await this.showSuccessToast(ids.size);
    } catch (err) {
      console.error('[BatchEditStateService] apply error', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  getFoodTypeOptions(): AutocompleteItem<FoodType>[] {
    return Object.values(FoodType).map(type => ({
      id: type,
      title: this.translate.instant(`pantry.form.foodType.${type}`),
      raw: type,
    }));
  }

  getFoodTypeDisplayValue(): string {
    const ft = this.selectedFoodType();
    if (!ft) return this.translate.instant('pantry.form.foodType.unassigned');
    return this.translate.instant(`pantry.form.foodType.${ft}`);
  }

  getCategoryOptions(): AutocompleteItem<string>[] {
    const presetOptions = normalizeStringList(this.appPreferences.preferences().categoryOptions, { fallback: [] });
    const uncategorizedLabel = this.translate.instant('pantry.form.uncategorized');
    return buildUniqueSelectOptions(presetOptions, { labelFor: v => formatFriendlyName(v, uncategorizedLabel) })
      .map(opt => ({ id: opt.value, title: opt.label, raw: opt.value }));
  }

  getCategoryDisplayValue(): string {
    const id = this.selectedCategoryId();
    if (!id) return this.translate.instant('pantry.form.uncategorized');
    return this.getCategoryOptions().find(o => o.raw === id)?.title ?? id;
  }

  private buildUpdatedItem(item: PantryItem, action: BatchEditAction, now: string): PantryItem {
    const base = { ...item, updatedAt: now };
    if (action === 'setFoodType') {
      return { ...base, foodType: this.selectedFoodType() ?? undefined };
    }
    if (action === 'setCategory') {
      return { ...base, categoryId: this.selectedCategoryId() ?? '' };
    }
    return base;
  }

  private filterItems(items: PantryItem[], filter: BatchEditFilter): PantryItem[] {
    switch (filter) {
      case 'noFoodType':
        return items.filter(i => !i.foodType);
      case 'noCategory':
        return items.filter(i => !i.categoryId);
    }
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
    this.selectedIds.set(new Set());
    this.selectedAction.set(null);
    this.selectedFoodType.set(null);
    this.selectedCategoryId.set(null);
    this.isSaving.set(false);
    this.step.set('items');
    this.isOpen.set(false);
  }
}
