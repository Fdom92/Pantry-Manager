import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-empty-state-generic',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  templateUrl: './empty-state-generic.component.html',
  styleUrls: ['./empty-state.component.scss'],
})
export class EmptyStateGenericComponent {
  @Input() icon = 'sparkles-outline';
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() titleKey = 'emptyStates.generic.title';
  @Input() subtitleKey = 'emptyStates.generic.subtitle';
  @Input() showAction = false;
  @Input() actionLabel?: string;
  @Input() compact = false;
  @Output() action = new EventEmitter<void>();

  handleAction(): void {
    this.action.emit();
  }
}
