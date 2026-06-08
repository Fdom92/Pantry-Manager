import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonList, IonButton } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { RepositionPrediction } from '@core/domain/insights/reposition.domain';
import { ProTrialCtaComponent } from '@shared/components/pro-trial-cta/pro-trial-cta.component';
import type { ProCtaSurface } from '@core/services/upgrade/pro-cta-ui-state.service';

@Component({
  selector: 'app-reposition-card',
  standalone: true,
  imports: [
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonButton,
    TranslateModule, ProTrialCtaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reposition-card.component.html',
  styleUrl: './reposition-card.component.scss',
})
export class RepositionCardComponent {
  readonly predictions = input.required<RepositionPrediction[]>();
  readonly isPro = input.required<boolean>();
  readonly ctaSurface = input<ProCtaSurface>('reposition_card');
  readonly hideCta = input(false, { transform: booleanAttribute });
  /** Cap the rendered list (top-N by daysToOut). Pass 0 for "no limit". */
  readonly limit = input<number>(3);

  readonly addToList = output<RepositionPrediction>();

  readonly visiblePredictions = computed<RepositionPrediction[]>(() => {
    const all = this.predictions();
    const cap = this.limit();
    return cap > 0 ? all.slice(0, cap) : all;
  });

  readonly isEmpty = computed(() => this.predictions().length === 0);

  onAddToList(p: RepositionPrediction): void {
    this.addToList.emit(p);
  }
}
