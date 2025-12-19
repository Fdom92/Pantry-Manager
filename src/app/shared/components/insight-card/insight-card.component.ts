import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Insight, InsightActionEvent } from '@core/models';
import { IonButton, IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-insight-card',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon],
  templateUrl: './insight-card.component.html',
  styleUrls: ['./insight-card.component.scss'],
})
export class InsightCardComponent {
  @Input() insight!: Insight;
  @Output() action = new EventEmitter<InsightActionEvent>();

  emitAction(): void {
    if (!this.insight) {
      return;
    }
    this.action.emit({
      action: this.insight.action,
      insight: this.insight,
    });
  }
}
