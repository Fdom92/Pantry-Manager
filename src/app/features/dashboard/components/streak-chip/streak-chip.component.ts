import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { StreakStateService } from '@core/services/retention/streak-state.service';

@Component({
  selector: 'app-streak-chip',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './streak-chip.component.html',
  styleUrl: './streak-chip.component.scss',
})
export class StreakChipComponent {
  private readonly streak = inject(StreakStateService);
  readonly currentStreak = this.streak.currentStreak;
  readonly visible = computed(() => this.currentStreak() > 0);
}
