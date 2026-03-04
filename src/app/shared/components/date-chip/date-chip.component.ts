import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { LanguageService } from '@core/services/shared/language.service';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Reusable date chip: shows a formatted date or "No date" placeholder.
 * Clicking opens the native date picker. An X icon clears the date.
 *
 * @input  date       - ISO date string (YYYY-MM-DD) or undefined
 * @input  noDateKey  - i18n key for the empty label (default: 'pantry.quantitySheet.noDate')
 * @output dateChange - emits YYYY-MM-DD string when set, or undefined when cleared
 */
@Component({
  selector: 'app-date-chip',
  standalone: true,
  imports: [IonChip, IonLabel, IonIcon, TranslateModule],
  template: `
    <div class="date-chip-wrap">
      <input
        #dateEl
        type="date"
        class="date-chip-input"
        [value]="date ?? ''"
        (change)="onDateChange($event)">
      <ion-chip
        class="date-chip"
        [class.date-chip--set]="date"
        (click)="$any(dateEl).showPicker?.()">
        <ion-label>{{ date ? formattedDate : (noDateKey | translate) }}</ion-label>
        @if (date) {
          <ion-icon name="close-circle" (click)="onClear($event)"></ion-icon>
        }
      </ion-chip>
    </div>
  `,
  styles: [`
    :host { display: inline-flex; }
    .date-chip-wrap { display: inline-flex; align-items: center; }
    .date-chip-input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
    .date-chip {
      --background: color-mix(in srgb, var(--ion-text-color) 10%, transparent);
      --color: color-mix(in srgb, var(--ion-text-color) 65%, transparent);
      font-size: 0.82rem;
      height: 28px;
      margin: 0;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .date-chip.date-chip--set {
      --background: var(--ion-color-primary);
      --color: var(--ion-color-primary-contrast);
    }
    .date-chip ion-icon { font-size: 15px; margin-inline-start: 4px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateChipComponent {
  private readonly languageService = inject(LanguageService);

  /** YYYY-MM-DD or undefined */
  @Input() date?: string;
  /** i18n key for the placeholder text when no date is set */
  @Input() noDateKey = 'pantry.quantitySheet.noDate';
  /** Emits YYYY-MM-DD when a date is selected, or undefined when cleared */
  @Output() dateChange = new EventEmitter<string | undefined>();

  get formattedDate(): string {
    if (!this.date) return '';
    const [year, month, day] = this.date.split('-').map(Number);
    return new Intl.DateTimeFormat(this.languageService.getCurrentLocale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(year, month - 1, day));
  }

  onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dateChange.emit(value || undefined);
  }

  onClear(event: Event): void {
    event.stopPropagation();
    this.dateChange.emit(undefined);
  }
}
