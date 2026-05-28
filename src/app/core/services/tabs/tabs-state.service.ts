import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { getItemStatusState, shouldAutoAddToShoppingList, sumQuantities } from '@core/domain/pantry';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { environment } from 'src/environments/environment';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';

/** Near-expiry window for the tab badge — tighter than the pantry 15d window
 *  so the badge only fires when action is genuinely imminent (this week). */
const TAB_NEAR_EXPIRY_DAYS = 7;

@Injectable({ providedIn: 'root' })
export class TabsStateService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly pantryStore = inject(PantryStoreService);

  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: this.revenuecat.isPro() });
  readonly canUseAgent = computed(() => !environment.production || this.isPro());

  /** Items that have expired — drives the red badge on the Pantry tab. */
  readonly expiredCount = computed(() => this.pantryStore.expiredItems().length);

  /**
   * Items expiring within 7 days (tighter than the 15-day pantry window).
   * Drives the warning badge when there are no expired items.
   * 7-day window = "this week" — actionable, not just informational.
   */
  readonly nearExpiryUrgentCount = computed(() => {
    const now = new Date();
    return this.pantryStore.items().filter(
      item => getItemStatusState(item, now, TAB_NEAR_EXPIRY_DAYS) === 'near-expiry'
    ).length;
  });

  /**
   * Auto-suggestion count for the shopping list tab badge.
   * Uses loadedProducts (not activeProducts/items) so that isBasic pantry
   * items at qty=0 are included — activeProducts excludes qty=0 pantry items,
   * but the list iterates loadedProducts and shows them.
   */
  readonly shoppingListCount = computed(() =>
    this.pantryStore.loadedProducts().reduce((total, item) => {
      const totalQuantity = sumQuantities(item.batches ?? []);
      const minThreshold = toNumberOrZero(item.minThreshold);
      return shouldAutoAddToShoppingList(item, { totalQuantity, minThreshold }) ? total + 1 : total;
    }, 0)
  );
}
