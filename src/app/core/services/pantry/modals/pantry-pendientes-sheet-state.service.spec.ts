import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PantryPendientesSheetStateService } from './pantry-pendientes-sheet-state.service';
import { PantryStoreService } from '../pantry-store.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ToastService } from '../../shared';
import type { PantryItem } from '@core/models/pantry';

describe('PantryPendientesSheetStateService', () => {
  let service: PantryPendientesSheetStateService;
  let pantryStoreSpy: jasmine.SpyObj<PantryStoreService>;

  function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
    return {
      _id: 'item-1',
      _rev: '1-abc',
      type: 'item',
      householdId: 'hh1',
      name: 'Test Item',
      categoryId: 'cat1',
      batches: [{ batchId: 'b1', quantity: 1 }],
      productType: 'pantry',
      ...overrides,
    } as PantryItem;
  }

  beforeEach(() => {
    pantryStoreSpy = jasmine.createSpyObj('PantryStoreService', ['updateItem'], {
      loadedProducts: signal<PantryItem[]>([]),
      activeProducts: signal<PantryItem[]>([]),
    });

    TestBed.configureTestingModule({
      providers: [
        PantryPendientesSheetStateService,
        { provide: PantryStoreService, useValue: pantryStoreSpy },
        { provide: HistoryEventManagerService, useValue: jasmine.createSpyObj('HistoryEventManagerService', ['logAdvancedEdit']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success']) },
      ],
    });
    service = TestBed.inject(PantryPendientesSheetStateService);
  });

  describe('open', () => {
    it('excludes a depleted despensa item even though it is incomplete', () => {
      // Depleted (qty 0), no foodType — isIncomplete() would say yes, but a
      // product with nothing left is invisible everywhere else in the app
      // (activeProducts excludes it), so the "pendientes" filter chip in the
      // pantry list never shows it. The sheet must agree, or it opens with
      // more rows than the chip the CTA claims to be completing.
      const depleted = makeItem({
        _id: 'depleted',
        batches: [{ batchId: 'b1', quantity: 0 }],
      });
      const withStock = makeItem({
        _id: 'with-stock',
        batches: [{ batchId: 'b1', quantity: 2 }],
      });

      (pantryStoreSpy.activeProducts as any).set([withStock]);
      (pantryStoreSpy.loadedProducts as any).set([depleted, withStock]);

      service.open();

      const ids = service.rows().map(r => r.itemId);
      expect(ids).toEqual(['with-stock']);
    });

    it('still includes an incomplete fresh item at zero quantity', () => {
      const freshEmpty = makeItem({
        _id: 'fresh-empty',
        productType: 'fresh',
        batches: [{ batchId: 'b1', quantity: 0 }],
      });

      (pantryStoreSpy.activeProducts as any).set([freshEmpty]);
      (pantryStoreSpy.loadedProducts as any).set([freshEmpty]);

      service.open();

      expect(service.rows().map(r => r.itemId)).toEqual(['fresh-empty']);
    });
  });
});
