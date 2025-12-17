import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { Insight, InsightCTA } from '@core/insights/insight.types';

@Component({
  selector: 'app-insight-card',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon],
  templateUrl: './insight-card.component.html',
  styleUrls: ['./insight-card.component.scss'],
})
export class InsightCardComponent {
  @Input() insight!: Insight;
  @Output() action = new EventEmitter<InsightCTA>();

  emitAction(cta: InsightCTA): void {
    this.action.emit(cta);
  }
}
