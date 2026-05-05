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
  styles: [`
    .quick-date-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;

      ion-chip {
        --background: color-mix(in srgb, var(--ion-color-primary) 6%, transparent);
        --color: var(--app-theme-text-color);
        border: 1px solid color-mix(in srgb, var(--ion-color-primary) 18%, transparent);
        margin: 0;
        font-size: 0.85rem;
        opacity: 0.85;

        &.active {
          --background: var(--ion-color-primary);
          --color: var(--ion-color-primary-contrast);
          border-color: var(--ion-color-primary);
          opacity: 1;
        }

        &.chip--emphasized:not(.active) {
          --background: color-mix(in srgb, var(--ion-color-primary) 18%, transparent);
          --color: var(--ion-color-primary);
          font-weight: 600;
          opacity: 1;
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickDateChipsComponent implements OnChanges {
  @Input() emphasizedKeys: string[] = [];
  @Input() initialDate?: string | null;
  @Output() readonly dateSelected = new EventEmitter<string | null>();

  readonly chips = CHIPS;
  readonly selectedKey = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['initialDate']) return;
    const value = this.initialDate;
    if (!value) { this.selectedKey.set(null); return; }
    const dayOffset = Math.round((Date.parse(value) - Date.now()) / 86_400_000);
    const match = CHIPS.find(c => c.offsetDays !== null && c.offsetDays === dayOffset);
    this.selectedKey.set(match?.key ?? null);
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
  }
}
