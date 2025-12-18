import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Insight, InsightCTA } from '@core/models';
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
  @Output() action = new EventEmitter<InsightCTA>();

  emitAction(cta: InsightCTA): void {
    this.action.emit(cta);
  }
}
