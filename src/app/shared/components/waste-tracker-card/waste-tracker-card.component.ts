import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsService } from '@core/services/analytics/analytics.service';
import { ANALYTICS_EVENTS } from '@core/constants';
import { classifyWasteLevel, type WasteSummary } from '@core/domain/insights/waste.domain';
import { formatFriendlyName } from '@core/utils/normalization.util';
import { InsightStatusPillComponent } from '@shared/components/insight-status-pill/insight-status-pill.component';

/**
 * Waste summary card. The total count (or zero-waste state) is shown to
 * everyone — it's free data. The category/top-product/trend breakdown is
 * PRO-only: free users see a single locked hint linking to /upgrade instead.
 */
@Component({
  selector: 'app-waste-tracker-card',
  standalone: true,
  imports: [
    TranslateModule,
    RouterLink,
    IonIcon,
    InsightStatusPillComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './waste-tracker-card.component.html',
  styleUrl: './waste-tracker-card.component.scss',
})
export class WasteTrackerCardComponent {
  private readonly analytics = inject(AnalyticsService);

  readonly summary = input.required<WasteSummary>();
  readonly isPro = input.required<boolean>();

  readonly isEmptyZeroWaste = computed(() => this.summary().totalCount === 0);
  readonly level = computed(() => classifyWasteLevel(this.summary().totalCount));
  readonly levelLabelKey = computed(() => `insights.waste.level.${this.level()}`);

  readonly topCategoryLabel = computed<string | null>(() => {
    const top = this.summary().byCategory[0];
    if (!top) return null;
    return formatFriendlyName(top.categoryId, top.categoryId);
  });

  onUnlockClick(): void {
    this.analytics.track(ANALYTICS_EVENTS.PAYWALL_CARD_CLICKED, { surface: 'waste_card' });
  }
}
