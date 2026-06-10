import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { LanguageService } from '@core/services/shared/language.service';
import { IonChip, IonContent, IonIcon, IonLabel, IonModal } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { QuickDateChipsComponent } from '../quick-date-chips/quick-date-chips.component';

/**
 * Combined expiry picker: a single chip showing the current date/no-expiry state.
 * Tapping opens a bottom sheet with a date picker and a no-expiry toggle.
 * Changes fire immediately via outputs; the sheet is dismissed on swipe/tap-outside.
 *
 * @input  date           - ISO date string (YYYY-MM-DD) or undefined
 * @input  noExpiry       - whether no-expiry is set
 * @input  noDateKey      - i18n key for the empty chip label
 * @output dateChange     - emits YYYY-MM-DD when a date is selected, or undefined when cleared
 * @output noExpiryToggle - emits when the no-expiry option is toggled
 */
@Component({
  selector: 'app-expiry-picker',
  standalone: true,
  imports: [IonChip, IonLabel, IonIcon, IonModal, IonContent, TranslateModule, QuickDateChipsComponent],
  template: `
    <ion-chip
      class="expiry-chip"
      [class.expiry-chip--date]="date"
      [class.expiry-chip--no-expiry]="noExpiry"
      (click)="sheetOpen.set(true)">
      <ion-icon [name]="noExpiry ? 'infinite' : 'calendar-outline'"></ion-icon>
      <ion-label>
        @if (date) { {{ formattedDate }} }
        @else if (noExpiry) { {{ 'pantry.batches.noExpiryIntentional' | translate }} }
        @else { {{ noDateKey | translate }} }
      </ion-label>
      @if (date || noExpiry) {
        <ion-icon name="close-circle" (click)="onClear($event)"></ion-icon>
      }
    </ion-chip>

    <ion-modal
      [isOpen]="sheetOpen()"
      [breakpoints]="[0, sheetBreakpoint]"
      [initialBreakpoint]="sheetBreakpoint"
      [handle]="true"
      (didDismiss)="sheetOpen.set(false)">
      <ng-template>
        <ion-content>
          <div class="expiry-sheet">
            @if (mode !== 'picker-only') {
              <app-quick-date-chips
                [emphasizedKeys]="['today', 'twoDays']"
                [initialDate]="date"
                (dateSelected)="onQuickDate($event)">
              </app-quick-date-chips>
            }
            @if (mode === 'full') {
              <div class="expiry-sheet__separator"></div>
            }
            @if (mode !== 'chips-only') {
              <input
                #dateEl
                type="date"
                class="expiry-date-input"
                [value]="date ?? ''"
                (change)="onDateChange($event)">

              <div class="expiry-sheet__row" (click)="$any(dateEl).showPicker?.()">
                <ion-icon name="calendar-outline"></ion-icon>
                <span class="expiry-sheet__label">
                  @if (date) { {{ formattedDate }} }
                  @else { {{ noDateKey | translate }} }
                </span>
                @if (date) {
                  <ion-icon name="close-circle" class="expiry-sheet__clear" (click)="onDateClear($event)"></ion-icon>
                }
              </div>

              <div class="expiry-sheet__separator"></div>

              <div class="expiry-sheet__row" [class.expiry-sheet__row--active]="noExpiry" (click)="onNoExpiryClick()">
                <ion-icon [name]="noExpiry ? 'infinite' : 'infinite-outline'"></ion-icon>
                <span class="expiry-sheet__label">{{ 'pantry.batches.noExpiryIntentional' | translate }}</span>
                @if (noExpiry) {
                  <ion-icon name="checkmark-circle" color="warning"></ion-icon>
                }
              </div>
            }
          </div>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styleUrls: ['./expiry-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpiryPickerComponent {
  private readonly languageService = inject(LanguageService);

  @Input() mode: 'full' | 'chips-only' | 'picker-only' = 'full';
  @Input() date?: string;
  @Input() noExpiry = false;
  @Input() noDateKey = 'pantry.quantitySheet.noDate';
  @Output() dateChange = new EventEmitter<string | undefined>();
  @Output() noExpiryToggle = new EventEmitter<void>();

  get sheetBreakpoint(): number {
    if (this.mode === 'chips-only') return 0.32;
    if (this.mode === 'picker-only') return 0.35;
    return 0.42;
  }

  protected sheetOpen = signal(false);

  get formattedDate(): string {
    if (!this.date) return '';
    // Accept both YYYY-MM-DD (local interpretation) and full ISO strings
    // ("2026-07-11T00:00:00Z" or "2026/07/11"). The plain YYYY-MM-DD path
    // builds the Date in local time to avoid the UTC midnight-rollover that
    // would push the displayed day back by one in negative-UTC timezones.
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.date);
    let d: Date;
    if (plain) {
      d = new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
    } else {
      d = new Date(this.date);
    }
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(this.languageService.getCurrentLocale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  }

  onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dateChange.emit(value || undefined);
  }

  onDateClear(event: Event): void {
    event.stopPropagation();
    this.dateChange.emit(undefined);
  }

  onNoExpiryClick(): void {
    this.noExpiryToggle.emit();
  }

  onQuickDate(date: string | null): void {
    this.dateChange.emit(date ?? undefined);
    this.sheetOpen.set(false);
  }

  onClear(event: Event): void {
    event.stopPropagation();
    if (this.date) {
      this.dateChange.emit(undefined);
    } else if (this.noExpiry) {
      this.noExpiryToggle.emit();
    }
  }
}
