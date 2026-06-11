import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { WasteSummary } from '@core/domain/insights/waste.domain';
import { formatFriendlyName } from '@core/utils/normalization.util';

/** PRO-only waste summary. Free surfaces render `app-pro-paywall-card` instead. */
@Component({
  selector: 'app-waste-tracker-card',
  standalone: true,
  imports: [
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    TranslateModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './waste-tracker-card.component.html',
  styleUrl: './waste-tracker-card.component.scss',
})
export class WasteTrackerCardComponent {
  readonly summary = input.required<WasteSummary>();

  readonly isEmptyZeroWaste = computed(() => this.summary().totalCount === 0);

  readonly topCategoryLabel = computed<string | null>(() => {
    const top = this.summary().byCategory[0];
    if (!top) return null;
    return formatFriendlyName(top.categoryId, top.categoryId);
  });
}
