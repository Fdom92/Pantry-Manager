import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-empty-state-generic',
  standalone: true,
  imports: [IonButton, IonIcon, CommonModule, TranslateModule],
  templateUrl: './empty-state-generic.component.html',
  styleUrls: ['./empty-state.component.scss'],
})
export class EmptyStateGenericComponent {
  @Input() icon = 'star-outline';
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() titleKey = 'emptyStates.generic.title';
  @Input() subtitleKey = 'emptyStates.generic.subtitle';
  @Input() showAction = false;
  @Input() actionLabel?: string;
  @Input() compact = false;
  @Input() iconColor?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'danger' | 'medium';
  @Output() action = new EventEmitter<void>();

  handleAction(): void {
    this.action.emit();
  }
}
