import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';
import { StreakStateService } from '@core/services/retention/streak-state.service';
import { STREAK_MILESTONES } from '@core/domain/retention/streak.domain';

@Component({
  selector: 'app-streak-card',
  standalone: true,
  imports: [IonCard, IonCardContent, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './streak-card.component.html',
  styleUrl: './streak-card.component.scss',
})
export class StreakCardComponent {
  private readonly streak = inject(StreakStateService);
  readonly currentStreak = this.streak.currentStreak;
  readonly graceTokens = this.streak.graceTokens;

  readonly nextMilestone = computed<number | null>(() => {
    const current = this.currentStreak();
    return STREAK_MILESTONES.find(m => m > current) ?? null;
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
  readonly nextGoalKey = computed(() =>
    this.daysToNextMilestone() === 1
      ? 'settings.streak.nextGoal_one'
      : 'settings.streak.nextGoal_other'
  );
}
