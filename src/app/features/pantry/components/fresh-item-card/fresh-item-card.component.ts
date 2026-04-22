import {
  ChangeDetectionStrategy, Component, EventEmitter,
  Input, OnChanges, Output, computed, signal,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import type { PantryItem } from '@core/models/pantry';

@Component({
  selector: 'app-fresh-item-card',
  standalone: true,
  imports: [IonIcon, TranslateModule],
  templateUrl: './fresh-item-card.component.html',
  styleUrls: ['./fresh-item-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshItemCardComponent implements OnChanges {
  @Input({ required: true }) item!: PantryItem;
  @Output() readonly toggled = new EventEmitter<PantryItem>();
  @Output() readonly editRequested = new EventEmitter<PantryItem>();

  readonly isOut = signal(false);
  readonly isKeepInStock = signal(false);
  readonly daysToExpiry = signal<number | null>(null);
  readonly expiryUrgency = computed((): 'critical' | 'warning' | 'neutral' => {
    if (this.isOut()) return 'neutral';
    const d = this.daysToExpiry();
    if (d === null) return 'neutral';
    if (d < 0) return 'critical';
    if (d <= 1) return 'critical';
    if (d <= 3) return 'warning';
    return 'neutral';
  });

  readonly expiryLabel = computed((): string => {
    if (this.isOut()) return 'pantry.fresh.card.out';
    const d = this.daysToExpiry();
    if (d === null) return 'pantry.fresh.card.noDate';
    if (d < 0) return 'pantry.fresh.card.expired';
    if (d === 0) return 'pantry.fresh.card.today';
    if (d === 1) return 'pantry.fresh.card.tomorrow';
    if (d <= 3) return 'pantry.fresh.card.soon';
    return '';
  });

  ngOnChanges(): void {
    const batch = this.item.batches?.[0];
    this.isOut.set((batch?.quantity ?? 0) === 0);
    this.isKeepInStock.set((this.item.minThreshold ?? 0) >= 1);
    const dateStr = batch?.expirationDate;
    if (dateStr) {
      const days = Math.ceil((Date.parse(dateStr) - Date.now()) / 86_400_000);
      this.daysToExpiry.set(days);
    } else {
      this.daysToExpiry.set(null);
    }
  }

  onToggle(): void {
    this.toggled.emit(this.item);
  }

  onEdit(): void {
    this.editRequested.emit(this.item);
  }
}
