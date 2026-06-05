import { Injectable, computed, signal } from '@angular/core';

export type ProCtaSurface =
  | 'upgrade_page'
  | 'settings_hero'
  | 'insights_tab'
  | 'waste_card'
  | 'reposition_card';

@Injectable({ providedIn: 'root' })
export class ProCtaUiStateService {
  private readonly dismissed = signal<ReadonlySet<ProCtaSurface>>(new Set());

  isDismissed(surface: ProCtaSurface): boolean {
    return this.dismissed().has(surface);
  }

  dismiss(surface: ProCtaSurface): void {
    const next = new Set(this.dismissed());
    next.add(surface);
    this.dismissed.set(next);
  }

  readonly dismissedSurfaces = computed(() => this.dismissed());
}
