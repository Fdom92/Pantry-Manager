import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

export type InsightPillLevel = 'good' | 'normal' | 'bad';

/**
 * Small colored pill (verde/ámbar/rojo) used next to an Insights headline
 * number to answer "is this good or bad?" at a glance. Purely
 * presentational — callers resolve the level via a domain classifier
 * (e.g. classifyWasteLevel) and pass it in already decided.
 */
@Component({
  selector: 'app-insight-status-pill',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insight-status-pill.component.html',
  styleUrl: './insight-status-pill.component.scss',
})
export class InsightStatusPillComponent {
  readonly level = input.required<InsightPillLevel>();
  readonly labelKey = input.required<string>();
}
