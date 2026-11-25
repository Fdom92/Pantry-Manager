import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { isActivated } from '@core/domain/analytics';
import { NotificationPermissionService } from '../notifications/notification-permission.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { ClockService } from '../shared/clock.service';
import { LocalStorageService } from '../shared/local-storage.service';
import { AnalyticsService } from './analytics.service';

export type FirstProductSource = 'onboarding' | 'suggestion' | 'typed' | 'receipt' | 'list';

/** Reports `activation_reached` the first time the 5.8 activation conditions hold. */
@Injectable({ providedIn: 'root' })
export class ActivationService {
  private readonly store = inject(PantryStoreService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly analytics = inject(AnalyticsService);
  private readonly clock = inject(ClockService);
  private readonly storage = inject(LocalStorageService).activation;

  private readonly onboardedAt = signal(this.storage.getOnboardedAt()?.getTime() ?? null);

  // `analytics.isReady` (consent + a live SDK) is the analytics condition: a user who opts in
  // from the re-consent sheet later flips it, and this effect then reports once.
  private readonly activated = computed(() =>
    isActivated({
      productCount: this.store.items().length,
      notificationsGranted: this.permission.permissionState() === 'granted',
      analyticsEnabled: this.analytics.isReady(),
      onboardedV58: this.onboardedAt() !== null,
    })
  );

  constructor() {
    effect(() => {
      if (this.activated() && !this.storage.isReported()) {
        untracked(() => this.report());
      }
    });
  }

  /** The 5.8 onboarding finished; `savedProducts` = it saved the user's first products. */
  markOnboarded(savedProducts: boolean): void {
    this.clock.tick(); // the clock only moves on foreground/midnight; this is an event timestamp
    const at = new Date(this.clock.now());
    this.storage.setOnboardedAt(at);
    if (savedProducts && !this.storage.getFirstSource()) {
      this.storage.setFirstSource('onboarding');
    }
    this.onboardedAt.set(at.getTime());
  }

  /**
   * Runs the save of a new product. Only the first one after onboarding counts: its source is
   * written BEFORE the save, because the store signal changes inside it and the activation
   * effect may flush before any code after the await. Undone if the save throws.
   */
  async saveAsFirstProduct(source: Exclude<FirstProductSource, 'onboarding'>, save: () => Promise<void>): Promise<void> {
    const writes = this.onboardedAt() !== null && !this.storage.getFirstSource();
    if (writes) {
      this.storage.setFirstSource(source);
    }
    try {
      await save();
    } catch (err) {
      if (writes) this.storage.clearFirstSource();
      throw err;
    }
  }

  private report(): void {
    this.clock.tick();
    const minutes = Math.round((this.clock.now() - (this.onboardedAt() ?? 0)) / 60_000);
    this.analytics.trackOnce(
      ANALYTICS_EVENTS.ACTIVATION_REACHED,
      { source: this.storage.getFirstSource() ?? 'unknown', minutes_since_onboarding: minutes },
      'activation'
    );
    this.storage.markReported();
  }
}
