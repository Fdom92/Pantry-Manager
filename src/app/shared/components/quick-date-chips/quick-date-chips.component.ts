import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { IonChip } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

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
  imports: [IonChip, TranslateModule],
  template: `
    @if (currentLabel(); as label) {
      <p class="quick-date-chips__current">{{ label | translate: currentLabelParams() }}</p>
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
  readonly currentLabel = signal<string | null>(null);
  readonly currentLabelParams = signal<Record<string, unknown>>({});

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['initialDate']) return;
    const value = this.initialDate;
    if (!value) {
      this.selectedKey.set(null);
      this.currentLabel.set(null);
      this.currentLabelParams.set({});
      return;
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      this.selectedKey.set(null);
      this.currentLabel.set(null);
      this.currentLabelParams.set({});
      return;
    }

    const dayOffset = Math.round((parsed - Date.now()) / 86_400_000);

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
    if (dayOffset > 0) {
      this.currentLabel.set('pantry.fresh.quickDate.remaining');
      this.currentLabelParams.set({ days: dayOffset });
    } else if (dayOffset === 0) {
      this.currentLabel.set('pantry.fresh.quickDate.expiresToday');
      this.currentLabelParams.set({});
    } else {
      this.currentLabel.set('pantry.fresh.quickDate.expiredAgo');
      this.currentLabelParams.set({ days: Math.abs(dayOffset) });
    }
  }

  select(chip: DateChip): void {
    if (this.selectedKey() === chip.key) {
      this.selectedKey.set(null);
      this.dateSelected.emit(null);
      return;
    }
    this.selectedKey.set(chip.key);
    const date = chip.offsetDays !== null
      ? new Date(Date.now() + chip.offsetDays * 86_400_000).toISOString().split('T')[0]
      : null;
    this.dateSelected.emit(date);
  }

  reset(): void {
    this.selectedKey.set(null);
    this.currentLabel.set(null);
    this.currentLabelParams.set({});
  }
}
