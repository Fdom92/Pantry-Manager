import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';
import { StreakStateService } from '@core/services/retention/streak-state.service';

@Component({
  selector: 'app-streak-card',
  standalone: true,
  imports: [IonCard, IonCardHeader, IonCardTitle, IonCardContent, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './streak-card.component.html',
  styleUrl: './streak-card.component.scss',
})
export class StreakCardComponent {
  private readonly streak = inject(StreakStateService);
  readonly currentStreak = this.streak.currentStreak;
  readonly longestStreak = this.streak.longestStreak;
  readonly milestonesReached = this.streak.milestonesReached;
  readonly state = this.streak.state;

  readonly milestones = [3, 7, 30, 100] as const;
  readonly nextMilestone = computed<number | null>(() => {
    const current = this.currentStreak();
    return this.milestones.find(m => m > current) ?? null;
  });
  readonly daysToNextMilestone = computed<number | null>(() => {
    const next = this.nextMilestone();
    return next === null ? null : Math.max(0, next - this.currentStreak());
  });

  /** Translation key suffix — _one for singular, _other for plural. */
  readonly daysLabelKey = computed(() =>
    this.currentStreak() === 1
      ? 'settings.streak.daysLabel_one'
      : 'settings.streak.daysLabel_other'
  );
  readonly longestLabelKey = computed(() =>
    this.longestStreak() === 1
      ? 'settings.streak.longest_one'
      : 'settings.streak.longest_other'
  );
  readonly nextGoalKey = computed(() =>
    this.daysToNextMilestone() === 1
      ? 'settings.streak.nextGoal_one'
      : 'settings.streak.nextGoal_other'
  );

  readonly graceUsedRecently = computed<boolean>(() => {
    const graceUsed = this.state()?.graceUsedDate;
    if (!graceUsed) return false;
    const today = new Date();
    const used = new Date(graceUsed + 'T00:00:00');
    const diffDays = (today.getTime() - used.getTime()) / 86_400_000;
    return diffDays < 7;
  });
}
