import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonButton } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { RepositionPrediction } from '@core/domain/insights/reposition.domain';

/** PRO-only prediction list. Free surfaces render `app-pro-paywall-card` instead. */
@Component({
  selector: 'app-reposition-card',
  standalone: true,
  imports: [
    IonCard, IonCardContent,
    IonButton,
    TranslateModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reposition-card.component.html',
  styleUrl: './reposition-card.component.scss',
})
export class RepositionCardComponent {
  readonly predictions = input.required<RepositionPrediction[]>();
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
