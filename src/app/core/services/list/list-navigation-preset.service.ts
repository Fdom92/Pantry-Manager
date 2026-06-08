import { Injectable, signal } from '@angular/core';

/**
 * Holds a one-shot manual item name to be added when the list page next enters.
 *
 * Mirrors `PantryNavigationPresetService` — a lightweight root-scoped bridge so
 * external surfaces (e.g. the dashboard reposition card) can queue an "add to list"
 * action without needing to inject the page-scoped `ListStateService`.
 */
@Injectable({ providedIn: 'root' })
export class ListNavigationPresetService {
  private readonly _pendingItem = signal<string | null>(null);

  /** Queue a manual item name to be added on next list-page entry. Replaces any prior queued item. */
  setPendingItem(name: string): void {
    this._pendingItem.set(name);
  }

  /**
   * Read and clear the pending item atomically.
   * Returns null if nothing was queued.
   */
  consume(): string | null {
    const item = this._pendingItem();
    if (item !== null) this._pendingItem.set(null);
    return item;
  }
}
