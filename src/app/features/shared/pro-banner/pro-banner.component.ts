import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-pro-banner',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, TranslateModule],
  templateUrl: './pro-banner.component.html',
  styleUrls: ['./pro-banner.component.scss'],
})
export class ProBannerComponent {
  @Input() message = '';
  @Input() ctaLabel = '';
  @Input() icon: string = 'star';
  @Input() subtle = false;
  @Input() showAction = true;
  @Output() action = new EventEmitter<void>();

  onClick(): void {
    this.action.emit();
  }
}
