import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { WasteSummary } from '@core/domain/insights/waste.domain';
import { formatFriendlyName } from '@core/utils/normalization.util';
import { ProTrialCtaComponent } from '@shared/components/pro-trial-cta/pro-trial-cta.component';
import type { ProCtaSurface } from '@core/services/upgrade/pro-cta-ui-state.service';

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
export class WasteTrackerCardComponent {
  readonly summary = input.required<WasteSummary>();
  readonly isPro = input.required<boolean>();
  readonly ctaSurface = input<ProCtaSurface>('waste_card');
  /** Suppress the inline trial CTA in the free state — used on surfaces that already
   * host a primary paywall (e.g. the Insights tab's bottom PRO teaser). */
  readonly hideCta = input(false, { transform: booleanAttribute });

  readonly isEmptyZeroWaste = computed(() => this.isPro() && this.summary().totalCount === 0);

  readonly topCategoryLabel = computed<string | null>(() => {
    const top = this.summary().byCategory[0];
    if (!top) return null;
    return formatFriendlyName(top.categoryId, top.categoryId);
  });
}
