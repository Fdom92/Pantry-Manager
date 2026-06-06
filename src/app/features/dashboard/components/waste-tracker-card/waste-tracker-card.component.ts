import { ChangeDetectionStrategy, Component, Input, OnInit, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { inject } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { WasteSummary } from '@core/domain/insights/waste.domain';
import { UpgradeRevenuecatService } from '@core/services/upgrade/upgrade-revenuecat.service';
import { AnalyticsService } from '@core/services/analytics/analytics.service';
import { ANALYTICS_EVENTS } from '@core/constants';
import { ProTrialCtaComponent } from '@shared/components/pro-trial-cta/pro-trial-cta.component';

@Component({
  selector: 'app-waste-tracker-card',
  standalone: true,
  imports: [
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    TranslateModule,
    ProTrialCtaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './waste-tracker-card.component.html',
  styleUrl: './waste-tracker-card.component.scss',
})
export class WasteTrackerCardComponent implements OnInit {
  private readonly revenueCat = inject(UpgradeRevenuecatService);
  private readonly analytics = inject(AnalyticsService);

  @Input({ required: true }) summary!: WasteSummary;

  readonly isPro = toSignal(this.revenueCat.isPro$, { initialValue: this.revenueCat.isPro() });

  private hasFiredView = false;

  ngOnInit(): void {
    if (this.hasFiredView) return;
    this.hasFiredView = true;
    this.analytics.track(ANALYTICS_EVENTS.WASTE_TRACKER_VIEWED, {
      surface: 'dashboard',
      is_pro: this.isPro(),
      count: this.summary.totalCount,
    });
  }

  readonly isEmptyZeroWaste = computed(() => this.isPro() && this.summary.totalCount === 0);
}
