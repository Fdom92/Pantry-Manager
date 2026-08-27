import type { Provider } from '@angular/core';
import { PantryBatchOperationsService } from './pantry-batch-operations.service';
import { PantryListUiStateService } from './pantry-list-ui-state.service';
import { PantryStateService } from './pantry-state.service';
import { PantryAddModalStateService } from './modals/pantry-add-modal-state.service';
import { PantryBatchesModalStateService } from './modals/pantry-batches-modal-state.service';
import { PantryConsumeModalStateService } from './modals/pantry-consume-modal-state.service';
import { PantryEditItemModalStateService } from './modals/pantry-edit-item-modal-state.service';
import { PantryFreshAddModalStateService } from './modals/pantry-fresh-add-modal-state.service';
import { PantryPendientesSheetStateService } from './modals/pantry-pendientes-sheet-state.service';
import { PantryQuantitySheetStateService } from './modals/pantry-quantity-sheet-state.service';
import { PantryReceiptScanModalStateService } from './modals/pantry-receipt-scan-modal-state.service';

/**
 * Every service the pantry page scopes to itself, as one provider array.
 *
 * These are page-scoped on purpose: each modal's draft state must die with the
 * page rather than survive a tab switch. The page still has to declare them,
 * but it does not need to know their eleven names — that wiring lives here,
 * next to the services themselves.
 */
export const PANTRY_PAGE_PROVIDERS: Provider[] = [
  PantryStateService,
  PantryBatchOperationsService,
  PantryListUiStateService,
  PantryAddModalStateService,
  PantryConsumeModalStateService,
  PantryBatchesModalStateService,
  PantryEditItemModalStateService,
  PantryQuantitySheetStateService,
  PantryFreshAddModalStateService,
  PantryReceiptScanModalStateService,
  PantryPendientesSheetStateService,
];
