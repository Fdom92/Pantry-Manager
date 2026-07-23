import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { WasteSummary } from '@core/domain/insights/waste.domain';

/**
 * Free, ambient summary of this month's waste (total count only). Tapping
 * links to Insights, where the full breakdown (category/top product/trend)
 * stays PRO-gated. Not a paywall — the count shown here is real data, not a
 * locked teaser — so it does not reuse `ProPaywallCardComponent`.
 */
@Component({
  selector: 'app-waste-teaser-card',
  standalone: true,
  imports: [IonCard, IonCardContent, IonIcon, RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './waste-teaser-card.component.html',
  styleUrl: './waste-teaser-card.component.scss',
})
export class WasteTeaserCardComponent {
  readonly summary = input.required<WasteSummary>();

  readonly isEmptyZeroWaste = computed(() => this.summary().totalCount === 0);
}
