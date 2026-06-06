import { ChangeDetectionStrategy, Component, Input, computed } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { WasteSummary } from '@core/domain/insights/waste.domain';
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
export class WasteTrackerCardComponent {
  @Input({ required: true }) summary!: WasteSummary;
  @Input({ required: true }) isPro!: boolean;

  readonly isEmptyZeroWaste = computed(() => this.isPro && this.summary.totalCount === 0);
}
