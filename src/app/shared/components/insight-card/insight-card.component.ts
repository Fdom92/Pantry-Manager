import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Insight, InsightCta } from '@core/models';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-insight-card',
  standalone: true,
  imports: [CommonModule, IonButton, IonCard, IonCardHeader, IonCardTitle, IonCardContent, TranslateModule],
  templateUrl: './insight-card.component.html',
  styleUrls: ['./insight-card.component.scss'],
})
export class InsightCardComponent {
  @Input() insight!: Insight;
  @Output() dismiss = new EventEmitter<void>();
  @Output() ctaSelect = new EventEmitter<InsightCta>();

  emitDismiss(): void {
    this.dismiss.emit();
  }

  emitCta(cta: InsightCta): void {
    this.ctaSelect.emit(cta);
  }
}
