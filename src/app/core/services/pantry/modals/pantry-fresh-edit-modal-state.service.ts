import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { type FreshState, freshStateToQty, qtyToFreshState } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import { normalizeTrim } from '@core/utils/normalization.util';
import { TranslateService } from '@ngx-translate/core';
import { AlertController, ToastController } from '@ionic/angular';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { PantryStateService } from '../pantry-state.service';
import { PantryStoreService } from '../pantry-store.service';

@Injectable()
export class PantryFreshEditModalStateService {
  private readonly fb = inject(FormBuilder);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly listState = inject(PantryStateService);
  private readonly translate = inject(TranslateService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);
  private readonly eventManager = inject(HistoryEventManagerService);

  readonly isOpen = signal(false);
  readonly isSaving = signal(false);
  readonly editingItem = signal<PantryItem | null>(null);
  readonly currentState = signal<FreshState>('none');
  readonly states: readonly FreshState[] = ['sufficient', 'low', 'none'];

  readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.maxLength(120)], nonNullable: true }),
    expirationDate: this.fb.control<string | null>(null),
    keepInStock: this.fb.control(false, { nonNullable: true }),
  });

  readonly canSave = computed(() => {
    const item = this.editingItem();
    return !!item && this.form.valid;
  });

  constructor() {
    effect(() => {
      const request = this.listState.editFreshItemModalRequest();
      if (!request) return;
      this.openEdit(request.item);
      this.listState.clearEditFreshItemModalRequest();
    });
  }

  openEdit(item: PantryItem): void {
    if (item.productType !== 'fresh') {
      console.warn('[PantryFreshEditModal] non-fresh item passed; ignoring');
      return;
    }
    this.editingItem.set(item);
    const batch = item.batches?.[0];
    this.currentState.set(qtyToFreshState(batch?.quantity ?? 0));
    this.form.reset({
      name: item.name ?? '',
      expirationDate: batch?.expirationDate ?? null,
      keepInStock: (item.minThreshold ?? 0) >= 1,
    });
    this.isSaving.set(false);
    this.isOpen.set(true);
  }

  close(): void {
    if (this.isOpen()) return;
    this.editingItem.set(null);
    this.isSaving.set(false);
  }

  dismiss(): void {
    this.isOpen.set(false);
  }

  setState(state: FreshState): void {
    this.currentState.set(state);
  }

  setExpirationDate(date: string | null): void {
    this.form.get('expirationDate')?.setValue(date);
  }

  async save(): Promise<void> {
    const existing = this.editingItem();
    if (!existing || this.form.invalid || this.isSaving()) return;

    this.isSaving.set(true);
    try {
      const { name, expirationDate, keepInStock } = this.form.value;
      const previousBatch = existing.batches?.[0];
      const updatedBatch = {
        batchId: previousBatch?.batchId ?? `batch-${Date.now()}`,
        quantity: freshStateToQty(this.currentState()),
        expirationDate: expirationDate ?? undefined,
        noExpiry: previousBatch?.noExpiry,
        opened: previousBatch?.opened,
        locationId: previousBatch?.locationId,
      };
      const updated: PantryItem = {
        ...existing,
        name: normalizeTrim(name ?? existing.name),
        batches: [updatedBatch],
        minThreshold: keepInStock ? 1 : undefined,
        updatedAt: new Date().toISOString(),
      };
      await this.pantryStore.updateItem(updated);
      await this.eventManager.logAdvancedEdit(existing, updated);
      this.dismiss();
    } catch (err) {
      console.error('[PantryFreshEditModalStateService] save error', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Convierte el fresco actual a producto de despensa y cierra el modal. */
  async convertToPantry(): Promise<void> {
    const existing = this.editingItem();
    if (!existing) return;
    this.isSaving.set(true);
    try {
      const updated: PantryItem = {
        ...existing,
        productType: 'pantry',
        updatedAt: new Date().toISOString(),
      };
      await this.pantryStore.updateItem(updated);
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('pantry.fresh.convertToPantry.toast'),
        duration: 1500,
        position: 'bottom',
      });
      await toast.present();
      this.dismiss();
    } catch (err) {
      console.error('[PantryFreshEditModalStateService] convertToPantry error', err);
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteItem(): Promise<void> {
    const existing = this.editingItem();
    if (!existing) return;

    const alert = await this.alertCtrl.create({
      header: this.translate.instant('pantry.fresh.editModal.deleteConfirm.title'),
      message: this.translate.instant('pantry.fresh.editModal.deleteConfirm.message', { name: existing.name }),
      buttons: [
        { text: this.translate.instant('common.actions.cancel'), role: 'cancel' },
        { text: this.translate.instant('common.actions.delete'), role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    if (result.role !== 'confirm') return;

    this.isSaving.set(true);
    try {
      await this.pantryStore.deleteItem(existing._id);
      this.dismiss();
    } catch (err) {
      console.error('[PantryFreshEditModalStateService] deleteItem error', err);
    } finally {
      this.isSaving.set(false);
    }
  }
}
