import { Injectable, inject } from '@angular/core';
import { LocalStorageService } from '@core/services/shared';

export type CoachMarkKey = 'add_first_item';

@Injectable({ providedIn: 'root' })
export class CoachMarkService {
  private readonly localStorage = inject(LocalStorageService);

  isShown(key: CoachMarkKey): boolean {
    return this.localStorage.coachMark.isShown(key);
  }

  markShown(key: CoachMarkKey): void {
    this.localStorage.coachMark.markShown(key);
  }

  reset(key: CoachMarkKey): void {
    this.localStorage.coachMark.reset(key);
  }
}
