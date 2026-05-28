import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { shouldAutoAddToShoppingList, sumQuantities } from '@core/domain/pantry';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { environment } from 'src/environments/environment';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';

@Injectable({ providedIn: 'root' })
export class TabsStateService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly pantryStore = inject(PantryStoreService);

  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: this.revenuecat.isPro() });
  readonly canUseAgent = computed(() => !environment.production || this.isPro());

  /** Expired + near-expiry count — shown on Pantry tab to signal urgency. */
  readonly pantryAlertCount = computed(() =>
    this.pantryStore.expiredItems().length + this.pantryStore.nearExpiryItems().length
  );

  /** Items that should auto-add to shopping list — shown on List tab. */
  readonly shoppingListCount = computed(() =>
    this.pantryStore.items().reduce((total, item) => {
      const totalQuantity = sumQuantities(item.batches ?? []);
      const minThreshold = toNumberOrZero(item.minThreshold);
      return shouldAutoAddToShoppingList(item, { totalQuantity, minThreshold }) ? total + 1 : total;
    }, 0)
  );
}
