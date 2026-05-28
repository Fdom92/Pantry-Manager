import {
  ChangeDetectionStrategy, Component, EventEmitter,
  Input, OnChanges, Output, computed, signal,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { PantryItem } from '@core/models/pantry';
import { type FreshState, getFreshExpiryUrgency, isFreshKeepInStock, qtyToFreshState } from '@core/domain/pantry';
import { daysUntilExpiry } from '@core/utils';

@Component({
  selector: 'app-fresh-item-card',
  standalone: true,
  imports: [TranslateModule, IonIcon],
  templateUrl: './fresh-item-card.component.html',
  styleUrls: ['./fresh-item-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshItemCardComponent implements OnChanges {
  @Input({ required: true }) item!: PantryItem;
  @Output() readonly stateChange = new EventEmitter<{ item: PantryItem; state: FreshState }>();
  @Output() readonly editRequested = new EventEmitter<PantryItem>();
  @Output() readonly basicToggle = new EventEmitter<PantryItem>();

  readonly currentState = signal<FreshState>('none');
  readonly daysToExpiry = signal<number | null>(null);
  readonly isBasic = signal(false);

  readonly isExpired = computed((): boolean => {
    const d = this.daysToExpiry();
    return d !== null && d < 0;
  });

  readonly barStatus = computed((): string => {
    if (this.isExpired() || this.expiryUrgency() === 'critical' || this.currentState() === 'none') return 'expired';
    if (this.expiryUrgency() === 'warning' || this.currentState() === 'low') return 'near-expiry';
    return 'normal';
  });

  readonly expiryUrgency = computed((): 'critical' | 'warning' | 'neutral' =>
    getFreshExpiryUrgency(this.daysToExpiry()),
  );

  readonly expiryLabel = computed((): string => {
    const d = this.daysToExpiry();
    if (d === null) return '';
    if (d < 0) return 'pantry.fresh.card.expired';
    if (d === 0) return 'pantry.fresh.card.today';
    if (d === 1) return 'pantry.fresh.card.tomorrow';
    if (d === 2) return 'pantry.fresh.card.twoDays';  // critical band → concise, matches red bar
    if (d <= 3) return 'pantry.fresh.card.soon';
    return '';
  });

  readonly states: readonly FreshState[] = ['sufficient', 'low', 'none'];

  ngOnChanges(): void {
    const batch = this.item.batches?.[0];
    const qty = batch?.quantity ?? 0;
    this.currentState.set(qtyToFreshState(qty));
    const dateStr = batch?.expirationDate;
    if (dateStr && qty > 0) {
      const days = daysUntilExpiry(dateStr);
      this.daysToExpiry.set(days);
    } else {
      this.daysToExpiry.set(null);
    }
    this.isBasic.set(isFreshKeepInStock(this.item));
  }

  onStateSelected(state: FreshState): void {
    if (state === this.currentState()) return;
    this.stateChange.emit({ item: this.item, state });
  }

  onEdit(): void {
    this.editRequested.emit(this.item);
  }

  onBasicToggle(event: Event): void {
    event.stopPropagation();
    this.basicToggle.emit(this.item);
  }

  labelKey(state: FreshState): string {
    return `pantry.fresh.state.${state}`;
  }
}
