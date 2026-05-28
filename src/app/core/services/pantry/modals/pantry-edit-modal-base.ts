import { signal } from '@angular/core';
import type { PantryItem } from '@core/models/pantry';

export abstract class PantryEditModalBase {
  readonly isOpen = signal(false);
  readonly isSaving = signal(false);
  readonly editingItem = signal<PantryItem | null>(null);

  dismiss(): void {
    this.isOpen.set(false);
  }
}
