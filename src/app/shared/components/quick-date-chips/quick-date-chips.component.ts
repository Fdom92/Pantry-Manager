import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { IonChip } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { daysUntilExpiry, toLocalYmd } from '@core/utils/date.util';
import { ExpiryPipe } from '@shared/pipes/date-display.pipes';

interface DateChip {
  key: string;
  labelKey: string;
  offsetDays: number | null;
}

const CHIPS: DateChip[] = [
  { key: 'today',    labelKey: 'pantry.fresh.quickDate.today',    offsetDays: 0  },
  { key: 'twoDays',  labelKey: 'pantry.fresh.quickDate.twoDays',  offsetDays: 2  },
  { key: 'fiveDays', labelKey: 'pantry.fresh.quickDate.fiveDays', offsetDays: 5  },
  { key: 'oneWeek',  labelKey: 'pantry.fresh.quickDate.oneWeek',  offsetDays: 7  },
  { key: 'twoWeeks', labelKey: 'pantry.fresh.quickDate.twoWeeks', offsetDays: 14 },
  { key: 'noDate',   labelKey: 'pantry.fresh.quickDate.noDate',   offsetDays: null },
];

@Component({
  selector: 'app-quick-date-chips',
  standalone: true,
  imports: [IonChip, TranslateModule, ExpiryPipe],
  template: `
    @if (currentDate(); as date) {
      <p class="quick-date-chips__current">{{ date | appExpiry }}</p>
    }
    <div class="quick-date-chips">
      @for (chip of chips; track chip.key) {
        <ion-chip
          [class.active]="selectedKey() === chip.key"
          [class.chip--emphasized]="emphasizedKeys.includes(chip.key)"
          (click)="select(chip)">
          {{ chip.labelKey | translate }}
        </ion-chip>
      }
    </div>
  `,
  styleUrls: ['./quick-date-chips.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickDateChipsComponent implements OnChanges {
  @Input() emphasizedKeys: string[] = [];
  @Input() initialDate?: string | null;
  @Output() readonly dateSelected = new EventEmitter<string | null>();

  readonly chips = CHIPS;
  readonly selectedKey = signal<string | null>(null);
  /** The stored date, shown above the chips as "Caduca dentro de 5 días". */
  readonly currentDate = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['initialDate']) return;
    const value = this.initialDate;
    if (!value) {
      this.selectedKey.set(null);
      this.currentDate.set(null);
      return;
    }

    const dayOffset = daysUntilExpiry(value);
    if (Number.isNaN(dayOffset)) {
      this.selectedKey.set(null);
      this.currentDate.set(null);
      return;
    }

    // Smart-match the closest preset by absolute day distance so the chip
    // the user originally tapped (or its nearest neighbour) stays highlighted
    // after time passes. Only consider preset chips, never noDate.
    let best: DateChip | undefined;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const chip of CHIPS) {
      if (chip.offsetDays === null) continue;
      const diff = Math.abs(chip.offsetDays - dayOffset);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = chip;
      }
    }
    this.selectedKey.set(best?.key ?? null);

    // Header label so the user can see the actual remaining days in the
    // sheet — without this they only ever saw the chip selection and
    // chips-only mode hides the date input.
    this.currentDate.set(value);
  }

  select(chip: DateChip): void {
    if (this.selectedKey() === chip.key) {
      this.selectedKey.set(null);
      this.dateSelected.emit(null);
      return;
    }
    this.selectedKey.set(chip.key);
    const date = chip.offsetDays !== null
      ? toLocalYmd(new Date(Date.now() + chip.offsetDays * 86_400_000))
      : null;
    this.dateSelected.emit(date);
  }

  reset(): void {
    this.selectedKey.set(null);
    this.currentDate.set(null);
  }
}
