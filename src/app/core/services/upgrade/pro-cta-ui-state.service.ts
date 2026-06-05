import { Injectable, signal } from '@angular/core';

export type ProCtaSurface =
  | 'upgrade_page'
  | 'settings_hero'
  | 'insights_tab'
  | 'waste_card'
  | 'reposition_card';

@Injectable({ providedIn: 'root' })
export class ProCtaUiStateService {
  private readonly dismissedSignal = signal<ReadonlySet<ProCtaSurface>>(new Set());
  readonly dismissed = this.dismissedSignal.asReadonly();

  isDismissed(surface: ProCtaSurface): boolean {
    return this.dismissedSignal().has(surface);
  }

  dismiss(surface: ProCtaSurface): void {
    const next = new Set(this.dismissedSignal());
    next.add(surface);
    this.dismissedSignal.set(next);
  }
}
