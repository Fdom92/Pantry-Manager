import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { shouldAutoAddToShoppingList, sumQuantities } from '@core/domain/pantry';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { environment } from 'src/environments/environment';
import { ListManualItemsStore } from '../list/list-manual-items.store';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';

@Injectable({ providedIn: 'root' })
export class TabsStateService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly manualItemsStore = inject(ListManualItemsStore);

  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: this.revenuecat.isPro() });
  readonly canUseAgent = computed(() => !environment.production || this.isPro());

  /** Items that have expired — drives the red badge on the Pantry tab. */
  readonly expiredCount = computed(() => this.pantryStore.expiredItems().length);

  /**
   * Items expiring within the standard near-expiry window (NEAR_EXPIRY_WINDOW_DAYS = 15d).
   * Uses the same source as the dashboard action card and the pantry "expiring" filter
   * so badge, dashboard count, and pantry filter always show the same number.
   * Drives the warning badge when there are no expired items.
   */
  readonly nearExpiryUrgentCount = computed(() => this.pantryStore.nearExpiryItems().length);

  /**
   * Auto-suggestion count for the shopping list tab badge.
   * Uses loadedProducts (not activeProducts/items) so that isBasic pantry
   * items at qty=0 are included — activeProducts excludes qty=0 pantry items,
   * but the list iterates loadedProducts and shows them.
   */
  readonly shoppingListCount = computed(() => {
    const autoSuggested = this.pantryStore.loadedProducts().reduce((total, item) => {
      const totalQuantity = sumQuantities(item.batches ?? []);
      const minThreshold = toNumberOrZero(item.minThreshold);
      return shouldAutoAddToShoppingList(item, { totalQuantity, minThreshold }) ? total + 1 : total;
    }, 0);
    return autoSuggested + this.manualItemsStore.manualItems().length;
  });
}
