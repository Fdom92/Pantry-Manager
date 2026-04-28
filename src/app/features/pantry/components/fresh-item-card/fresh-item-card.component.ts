import {
  ChangeDetectionStrategy, Component, EventEmitter,
  Input, OnChanges, Output, computed, signal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import type { PantryItem } from '@core/models/pantry';
import { type FreshState, qtyToFreshState } from '@core/domain/pantry';

@Component({
  selector: 'app-fresh-item-card',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './fresh-item-card.component.html',
  styleUrls: ['./fresh-item-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshItemCardComponent implements OnChanges {
  @Input({ required: true }) item!: PantryItem;
  @Output() readonly stateChange = new EventEmitter<{ item: PantryItem; state: FreshState }>();
  @Output() readonly editRequested = new EventEmitter<PantryItem>();

  readonly currentState = signal<FreshState>('none');
  readonly daysToExpiry = signal<number | null>(null);
  readonly expiryUrgency = computed((): 'critical' | 'warning' | 'neutral' => {
    if (this.currentState() === 'none') return 'neutral';
    const d = this.daysToExpiry();
    if (d === null) return 'neutral';
    if (d <= 1) return 'critical';
    if (d <= 3) return 'warning';
    return 'neutral';
  });
  readonly expiryLabel = computed((): string => {
    if (this.currentState() === 'none') return '';
    const d = this.daysToExpiry();
    if (d === null) return '';
    if (d < 0) return 'pantry.fresh.card.expired';
    if (d === 0) return 'pantry.fresh.card.today';
    if (d === 1) return 'pantry.fresh.card.tomorrow';
    if (d <= 3) return 'pantry.fresh.card.soon';
    return '';
  });

  readonly states: readonly FreshState[] = ['sufficient', 'low', 'none'];

  ngOnChanges(): void {
    const batch = this.item.batches?.[0];
    const qty = batch?.quantity ?? 0;
    this.currentState.set(qtyToFreshState(qty));
    const dateStr = batch?.expirationDate;
    if (dateStr) {
      const days = Math.ceil((Date.parse(dateStr) - Date.now()) / 86_400_000);
      this.daysToExpiry.set(days);
    } else {
      this.daysToExpiry.set(null);
    }
  }

  onStateSelected(state: FreshState): void {
    if (state === this.currentState()) return; // idempotent
    this.stateChange.emit({ item: this.item, state });
  }

  onEdit(): void {
    this.editRequested.emit(this.item);
  }

  labelKey(state: FreshState): string {
    return `pantry.fresh.state.${state}`;
  }
}
