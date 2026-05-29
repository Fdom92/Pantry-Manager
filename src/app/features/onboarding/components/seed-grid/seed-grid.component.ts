import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { TranslateModule } from '@ngx-translate/core';
import type { OnboardingQuickSeedItem } from '@core/constants';
import { OnboardingStateService } from '@core/services/onboarding/onboarding-state.service';

@Component({
  selector: 'app-onboarding-seed-grid',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seed-grid.component.html',
  styleUrls: ['./seed-grid.component.scss'],
})
export class OnboardingSeedGridComponent {
  private readonly facade = inject(OnboardingStateService);

  readonly items = input<OnboardingQuickSeedItem[]>([]);

  isSelected(key: string): boolean {
    return this.facade.isSeedItemSelected(key);
  }

  async onToggle(key: string): Promise<void> {
    this.facade.toggleSeedItem(key);
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Haptics are best-effort: never block the toggle on a missing haptic engine.
    }
  }
}
