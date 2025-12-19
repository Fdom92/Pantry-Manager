import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-plan-card',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, TranslateModule],
  templateUrl: './plan-card.component.html',
  styleUrls: ['./plan-card.component.scss'],
})
export class PlanCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() price = '';
  @Input() period = '';
  @Input() badge?: string | null;
  @Input() savings?: string | null;
  @Input() trialLabel?: string | null;
  @Input() benefits: string[] = [];
  @Input() selected = false;
  @Input() highlight = false;
  @Input() ctaLabel = '';
  @Input() disabled = false;
  @Output() selectPlan = new EventEmitter<void>();

  onSelect(): void {
    if (this.disabled) {
      return;
    }
    this.selectPlan.emit();
  }
}
