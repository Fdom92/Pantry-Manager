import { Injectable, signal } from '@angular/core';

/**
 * Holds pending manual item names to be added when the list page next enters.
 *
 * Mirrors `PantryNavigationPresetService` — a lightweight root-scoped bridge so
 * external surfaces (e.g. the dashboard reposition card) can queue "add to list"
 * actions without needing to inject the page-scoped `ListStateService`.
 *
 * Queue (not single slot) so rapid taps on multiple predictions before navigation
 * settles do not silently drop items.
 */
@Injectable({ providedIn: 'root' })
export class ListNavigationPresetService {
  private readonly _queue = signal<string[]>([]);

  /** Queue a manual item name to be added on next list-page entry. */
  setPendingItem(name: string): void {
    this._queue.update(q => [...q, name]);
  }

  /**
   * Read and clear the pending queue atomically.
   * Returns an empty array if nothing was queued.
   */
  consume(): string[] {
    const q = this._queue();
    if (q.length) this._queue.set([]);
    return q;
  }
}
