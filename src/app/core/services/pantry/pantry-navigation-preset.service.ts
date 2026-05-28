import { computed, Injectable, signal } from '@angular/core';
import type { PantryFilterState } from '@core/models/pantry';

/**
 * Holds a one-shot filter preset to be applied when the pantry page next enters.
 *
 * Separate from PantryQueryService so that lightweight callers (dashboard, notifications)
 * don't have to inject the full reactive state layer.
 */
@Injectable({ providedIn: 'root' })
export class PantryNavigationPresetService {
  private readonly _pending = signal<Partial<PantryFilterState> | null>(null);

  /** True while a preset is queued and waiting to be applied. */
  readonly hasPending = computed(() => this._pending() !== null);

  /** Store a preset — replaces any previously queued preset. */
  setPending(preset: Partial<PantryFilterState>): void {
    this._pending.set(preset);
  }

  /**
   * Read and clear the pending preset atomically.
   * Returns null if no preset was queued.
   */
  consume(): Partial<PantryFilterState> | null {
    const preset = this._pending();
    if (preset !== null) this._pending.set(null);
    return preset;
  }

  /** Read the pending preset without clearing it. */
  peek(): Partial<PantryFilterState> | null {
    return this._pending();
  }
}
