import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { getItemStatusState, sumQuantities } from '@core/domain/pantry';
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
   * Basics completely out of stock — shown on List tab.
   *
   * Intentionally narrower than shouldAutoAddToShoppingList (which also fires
   * when qty < minThreshold). Only qty === 0 + isBasic is used here because:
   * 1. It never diverges from what the user sees (no session state dependency)
   * 2. "Below threshold" items are still stocked — not urgent enough for a tab badge
   * 3. "Completely out" is unambiguous — the user knows immediately what the number means
   */
  readonly shoppingListCount = computed(() =>
    this.pantryStore.items().filter(
      item => item.isBasic === true && sumQuantities(item.batches ?? []) === 0
    ).length
  );
}
