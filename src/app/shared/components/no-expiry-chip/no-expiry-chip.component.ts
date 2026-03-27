import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Reusable no-expiry chip: shows a ban icon + "No expiry" label.
 * Responsive: label collapses to icon-only when space is constrained.
 *
 * @input  active   - whether the chip is in active (no-expiry set) state
 * @output clicked  - emits when the chip is clicked
 */
@Component({
  selector: 'app-no-expiry-chip',
  standalone: true,
  imports: [IonChip, IonIcon, IonLabel, TranslateModule],
  template: `
    <ion-chip
      class="no-expiry-chip"
      [class.no-expiry-chip--active]="active"
      (click)="clicked.emit()">
      <ion-icon [name]="active ? 'ban' : 'ban-outline'"></ion-icon>
      @if (!iconOnly) {
        <ion-label>{{ 'pantry.batches.noExpiryIntentional' | translate }}</ion-label>
      }
    </ion-chip>
  `,
  styles: [`
    :host { display: inline-flex; }
    .no-expiry-chip {
      --background: color-mix(in srgb, var(--ion-text-color) 10%, transparent);
      --color: color-mix(in srgb, var(--ion-text-color) 65%, transparent);
      font-size: 0.82rem;
      height: 28px;
      margin: 0;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .no-expiry-chip.no-expiry-chip--active {
      --background: color-mix(in srgb, var(--ion-color-warning) 20%, transparent);
      --color: var(--ion-color-warning-shade);
    }
    .no-expiry-chip ion-icon { font-size: 15px; }
    .no-expiry-chip ion-label { margin-inline-start: 4px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoExpiryChipComponent {
  @Input() active = false;
  @Input() iconOnly = false;
  @Output() clicked = new EventEmitter<void>();
}
