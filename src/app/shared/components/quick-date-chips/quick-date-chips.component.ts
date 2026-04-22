import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
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
        --background: var(--app-theme-card-border-color);
        --color: var(--app-theme-text-muted);
        margin: 0;
        font-size: 0.85rem;

        &.active {
          --background: var(--ion-color-primary);
          --color: var(--ion-color-primary-contrast);
        }

        &.chip--emphasized:not(.active) {
          --background: color-mix(in srgb, var(--ion-color-primary) 15%, transparent);
          --color: var(--ion-color-primary);
          font-weight: 600;
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickDateChipsComponent {
  @Input() emphasizedKeys: string[] = [];
  @Output() readonly dateSelected = new EventEmitter<string | null>();

  readonly chips = CHIPS;
  readonly selectedKey = signal<string | null>(null);

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
