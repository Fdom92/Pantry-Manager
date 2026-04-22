import { Injectable, computed, inject, signal } from '@angular/core';
import { buildAddItemPayload } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import { PantryStoreService } from '@core/services/pantry/pantry-store.service';
import { createDocumentId } from '@core/utils';

@Injectable()
export class PantryFreshAddModalStateService {
  private readonly pantryStore = inject(PantryStoreService);

  readonly isOpen = signal(false);
  readonly isSubmitting = signal(false);
  readonly name = signal('');
  readonly expirationDate = signal<string | null>(null);
  readonly keepInStock = signal(false);

  readonly nameOptions = computed(() =>
    this.pantryStore.loadedProducts()
      .map(p => p.name)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .sort()
  );

  readonly canSubmit = computed(() => this.name().trim().length > 0);

  open(): void {
    this.name.set('');
    this.expirationDate.set(null);
    this.keepInStock.set(false);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  setName(value: string): void {
    this.name.set(value);
  }

  setNameIfEmpty(value: string): void {
    if (this.name().trim() === '') {
      this.name.set(value);
    }
  }

  setExpirationDate(date: string | null): void {
    this.expirationDate.set(date);
  }

  toggleKeepInStock(): void {
    this.keepInStock.update(v => !v);
  }

  async submit(): Promise<void> {
    if (!this.canSubmit() || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    try {
      const nowIso = new Date().toISOString();
      const base = buildAddItemPayload({
        id: createDocumentId('item'),
        nowIso,
        name: this.name().trim(),
        quantity: 1,
        expirationDate: this.expirationDate() ?? undefined,
        noExpiry: false,
      });
      const freshItem: PantryItem = {
        ...base,
        productType: 'fresh',
        minThreshold: this.keepInStock() ? 1 : 0,
        isBasic: false,
      };
      await this.pantryStore.addItem(freshItem);
      this.close();
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
