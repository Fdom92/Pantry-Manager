import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { AnalyticsService } from '../analytics/analytics.service';
import { ANALYTICS_EVENTS } from '@core/constants';
import { StreakStateService } from './streak-state.service';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import type { StreakTransition } from '@core/domain/retention/streak.domain';

@Injectable({ providedIn: 'root' })
export class StreakMilestoneService {
  private readonly streak = inject(StreakStateService);
  private readonly toast = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly analytics = inject(AnalyticsService);
  private readonly scheduler = inject(NotificationSchedulerService);
  private readonly destroyRef = inject(DestroyRef);

  bootstrap(): void {
    this.streak.transition$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => void this.handleTransition(t));
  }

  private async handleTransition(t: StreakTransition): Promise<void> {
    if (t.kind === 'incremented') {
      this.analytics.track(ANALYTICS_EVENTS.STREAK_REACHED, { streak: t.to });
    } else if (t.kind === 'reset') {
      this.analytics.track(ANALYTICS_EVENTS.STREAK_BROKEN, { previousStreak: t.previousStreak });
    } else if (t.kind === 'milestone_reached') {
      const eventName = this.milestoneEventName(t.milestone);
      if (eventName) this.analytics.track(eventName);
      const message = this.translate.instant('streak.milestoneToast', { streak: t.streak });
      const toastEl = await this.toast.create({ message, duration: 4000, position: 'top' });
      void toastEl.present();
      await this.scheduler.scheduleStreakMilestone(t.streak);
    }
  }

  private milestoneEventName(m: number): string | null {
    switch (m) {
      case 3: return ANALYTICS_EVENTS.STREAK_MILESTONE_3;
      case 7: return ANALYTICS_EVENTS.STREAK_MILESTONE_7;
      case 14: return ANALYTICS_EVENTS.STREAK_MILESTONE_14;
      case 30: return ANALYTICS_EVENTS.STREAK_MILESTONE_30;
      default: return null;
    }
  }
}
