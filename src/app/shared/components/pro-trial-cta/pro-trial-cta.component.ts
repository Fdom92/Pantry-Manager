import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { UpgradeRevenuecatService } from '@core/services/upgrade/upgrade-revenuecat.service';
import { AnalyticsService } from '@core/services/analytics/analytics.service';
import {
  ProCtaUiStateService,
  type ProCtaSurface,
} from '@core/services/upgrade/pro-cta-ui-state.service';
import { LocalStorageService } from '@core/services/shared/local-storage.service';
import { ANALYTICS_EVENTS } from '@core/constants';

@Component({
  selector: 'app-pro-trial-cta',
  standalone: true,
  imports: [CommonModule, IonicModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-trial-cta.component.html',
  styleUrl: './pro-trial-cta.component.scss',
})
export class ProTrialCtaComponent {
  private readonly revenueCat = inject(UpgradeRevenuecatService);
  private readonly analytics = inject(AnalyticsService);
  private readonly router = inject(Router);
  private readonly ctaUi = inject(ProCtaUiStateService);
  private readonly storage = inject(LocalStorageService);

  @Input({ required: true }) surface!: ProCtaSurface;
  /** When true, render a smaller variant suitable for inline placement. */
  @Input() compact = false;
  /** When true, allow the user to dismiss the CTA for this session. */
  @Input() dismissible = false;

  readonly hasUnusedTrial = signal<boolean>(false);
  readonly busy = signal<boolean>(false);

  readonly hidden = computed(() => this.ctaUi.isDismissed(this.surface));

  constructor() {
    this.revenueCat.hasUnusedTrial$.subscribe(v => this.hasUnusedTrial.set(v));
  }

  async onPrimary(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.analytics.track(ANALYTICS_EVENTS.PRO_TRIAL_CTA_CLICKED, { surface: this.surface });
    try {
      if (this.hasUnusedTrial()) {
        const ok = await this.revenueCat.purchasePro();
        if (ok) {
          this.storage.pro.setTrialStartedAt(new Date());
          this.analytics.track(ANALYTICS_EVENTS.PRO_TRIAL_STARTED);
        }
      } else {
        this.router.navigate(['/upgrade']);
      }
    } finally {
      this.busy.set(false);
    }
  }

  onDismiss(): void {
    this.ctaUi.dismiss(this.surface);
  }
}
