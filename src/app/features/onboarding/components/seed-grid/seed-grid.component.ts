import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { TranslateModule } from '@ngx-translate/core';
import type { OnboardingQuickSeedItem } from '@core/constants';
import { OnboardingStateService } from '@core/services/onboarding/onboarding-state.service';

@Component({
  selector: 'app-onboarding-seed-grid',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seed-grid.component.html',
  styleUrls: ['./seed-grid.component.scss'],
})
export class OnboardingSeedGridComponent {
  private readonly facade = inject(OnboardingStateService);

  readonly items = input<OnboardingQuickSeedItem[]>([]);

  readonly selectedCount = computed(() => this.facade.selectedCount());

  isSelected(key: string): boolean {
    return this.facade.isSeedItemSelected(key);
  }

  async onToggle(key: string): Promise<void> {
    this.facade.toggleSeedItem(key);
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {
        // haptic optional
      }
    }
  }
}
