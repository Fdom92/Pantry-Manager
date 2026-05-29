import { TestBed } from '@angular/core/testing';
import { HistoryEventManagerService } from './history-event-manager.service';
import { HistoryEventLogService } from './history-event-log.service';
import type { PantryItem } from '@core/models/pantry';
import type { PantryEvent } from '@core/models/events';

describe('HistoryEventManagerService', () => {
  let service: HistoryEventManagerService;
  let eventLogSpy: jasmine.SpyObj<HistoryEventLogService>;

  function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
    return {
      _id: 'item-1',
      _rev: '1-abc',
      type: 'item',
      householdId: 'hh1',
      name: 'Test Item',
      categoryId: 'cat1',
      batches: [],
      productType: 'pantry',
      ...overrides,
    } as PantryItem;
  }

  function makeBatch(quantity = 1, expirationDate: string | undefined = undefined) {
    return { batchId: 'b1', quantity, expirationDate };
  }

  beforeEach(() => {
    eventLogSpy = jasmine.createSpyObj('HistoryEventLogService', [
      'logAddEvent',
      'logConsumeEvent',
      'logEditEvent',
      'logExpireEvent',
      'logDeleteEvent',
      'listEventsByType',
    ]);
    const mockEvent: PantryEvent = {
      type: 'event',
      eventType: 'ADD',
      productId: 'item-1',
      quantity: 1,
      timestamp: new Date().toISOString(),
    } as any;
    eventLogSpy.logAddEvent.and.returnValue(Promise.resolve(mockEvent));
    eventLogSpy.logConsumeEvent.and.returnValue(Promise.resolve(mockEvent));
    eventLogSpy.logEditEvent.and.returnValue(Promise.resolve(mockEvent));
    eventLogSpy.logExpireEvent.and.returnValue(Promise.resolve(mockEvent));
    eventLogSpy.logDeleteEvent.and.returnValue(Promise.resolve(mockEvent));
    eventLogSpy.listEventsByType.and.returnValue(Promise.resolve([]));

    TestBed.configureTestingModule({
      providers: [
        HistoryEventManagerService,
        { provide: HistoryEventLogService, useValue: eventLogSpy },
      ],
    });
    service = TestBed.inject(HistoryEventManagerService);
  });

  // ── logStockAdjust ─────────────────────────────────────────────────────────

  describe('logStockAdjust', () => {
    it('returns null when deltaQuantity is not finite', async () => {
      const item = makeItem({ batches: [makeBatch(5)] });
      const result = await service.logStockAdjust(item, item, {
        deltaQuantity: NaN,
      });
      expect(result).toBeNull();
      expect(eventLogSpy.logAddEvent).not.toHaveBeenCalled();
    });

    it('returns null when deltaQuantity is zero', async () => {
      const item = makeItem({ batches: [makeBatch(5)] });
      const result = await service.logStockAdjust(item, item, {
        deltaQuantity: 0,
      });
      expect(result).toBeNull();
    });

    it('returns null when no net change (previousQuantity === nextQuantity)', async () => {
      const item = makeItem({ batches: [makeBatch(5)] });
      const result = await service.logStockAdjust(item, item, {
        deltaQuantity: 1,
      });
      expect(result).toBeNull();
    });

    it('calls logAddEvent when deltaQuantity > 0', async () => {
      const previousItem = makeItem({ batches: [makeBatch(3)] });
      const updatedItem = makeItem({ batches: [makeBatch(3), makeBatch(2)] });
      await service.logStockAdjust(previousItem, updatedItem, {
        deltaQuantity: 2,
      });
      expect(eventLogSpy.logAddEvent).toHaveBeenCalled();
      expect(eventLogSpy.logConsumeEvent).not.toHaveBeenCalled();
    });

    it('calls logConsumeEvent when deltaQuantity < 0', async () => {
      const previousItem = makeItem({ batches: [makeBatch(5)] });
      const updatedItem = makeItem({ batches: [makeBatch(2)] });
      await service.logStockAdjust(previousItem, updatedItem, {
        deltaQuantity: -3,
      });
      expect(eventLogSpy.logConsumeEvent).toHaveBeenCalled();
      expect(eventLogSpy.logAddEvent).not.toHaveBeenCalled();
    });

    it('uses Math.abs(deltaQuantity) for quantity param', async () => {
      const previousItem = makeItem({ batches: [makeBatch(5)] });
      const updatedItem = makeItem({ batches: [makeBatch(2)] });
      await service.logStockAdjust(previousItem, updatedItem, {
        deltaQuantity: -3,
      });
      const call = eventLogSpy.logConsumeEvent.calls.mostRecent();
      expect(call.args[0].quantity).toBe(3);
    });

    it('passes previousItem.name when available (fallback to updatedItem.name)', async () => {
      const previousItem = makeItem({ name: 'Old Name', batches: [makeBatch(5)] });
      const updatedItem = makeItem({
        name: 'Updated Name',
        batches: [makeBatch(2)],
      });
      await service.logStockAdjust(previousItem, updatedItem, {
        deltaQuantity: -3,
      });
      const call = eventLogSpy.logConsumeEvent.calls.mostRecent();
      expect(call.args[0].productName).toBe('Old Name');
    });

    it('passes updatedItem.name when previousItem is undefined', async () => {
      const updatedItem = makeItem({ name: 'Item Name', batches: [makeBatch(5)] });
      await service.logStockAdjust(undefined, updatedItem, {
        deltaQuantity: 2,
      });
      const call = eventLogSpy.logAddEvent.calls.mostRecent();
      expect(call.args[0].productName).toBe('Item Name');
    });
  });

  // ── logExpiredBatches ──────────────────────────────────────────────────────

  describe('logExpiredBatches', () => {
    it('logs EXPIRE event for expired batch', async () => {
      const item = makeItem({
        batches: [makeBatch(5, '2026-05-01')],
      });
      eventLogSpy.listEventsByType.and.returnValue(Promise.resolve([]));

      await service.logExpiredBatches([item]);

      expect(eventLogSpy.logExpireEvent).toHaveBeenCalled();
    });

    it('skips batches already logged (seen-set dedup via batchKey)', async () => {
      const item = makeItem({
        batches: [makeBatch(5, '2026-05-01')],
      });
      const existingEvent: PantryEvent = {
        type: 'event',
        eventType: 'EXPIRE',
        productId: 'item-1',
        quantity: 5,
        timestamp: new Date().toISOString(),
        sourceMetadata: { batchKey: 'item-1::b1' },
      } as any;
      eventLogSpy.listEventsByType.and.returnValue(Promise.resolve([existingEvent]));

      await service.logExpiredBatches([item]);

      expect(eventLogSpy.logExpireEvent).not.toHaveBeenCalled();
    });

    it('uses date-based key for fresh items', async () => {
      const item = makeItem({
        productType: 'fresh',
        batches: [makeBatch(5, '2026-05-01')],
      });
      eventLogSpy.listEventsByType.and.returnValue(Promise.resolve([]));

      await service.logExpiredBatches([item]);

      const call = eventLogSpy.logExpireEvent.calls.mostRecent();
      const batchKey = call.args[0].sourceMetadata?.['batchKey'] as string;
      expect(batchKey).toContain('item-1');
      expect(batchKey).toContain('2026-05-01');
    });

    it('uses batchId-based key for pantry items', async () => {
      const item = makeItem({
        productType: 'pantry',
        batches: [makeBatch(5, '2026-05-01')],
      });
      eventLogSpy.listEventsByType.and.returnValue(Promise.resolve([]));

      await service.logExpiredBatches([item]);

      const call = eventLogSpy.logExpireEvent.calls.mostRecent();
      expect(call).toBeDefined();
    });

    it('skips batches with quantity <= 0', async () => {
      const items = [
        makeItem({ batches: [makeBatch(0, '2026-05-01')] }),
        makeItem({ batches: [makeBatch(-5, '2026-05-01')] }),
      ];
      eventLogSpy.listEventsByType.and.returnValue(Promise.resolve([]));

      await service.logExpiredBatches(items);

      expect(eventLogSpy.logExpireEvent).not.toHaveBeenCalled();
    });

    it('logs multiple batches in parallel via Promise.all', async () => {
      const item = makeItem({
        batches: [
          { batchId: 'b1', quantity: 5, expirationDate: '2026-05-01' },
          { batchId: 'b2', quantity: 3, expirationDate: '2026-05-02' },
        ],
      });
      eventLogSpy.listEventsByType.and.returnValue(Promise.resolve([]));

      await service.logExpiredBatches([item]);

      expect(eventLogSpy.logExpireEvent).toHaveBeenCalledTimes(2);
    });

    it('tracks seen batches via productId::date fallback for fresh items', async () => {
      const item = makeItem({
        productType: 'fresh',
        batches: [makeBatch(5, '2026-05-01')],
      });
      const existingEvent: PantryEvent = {
        type: 'event',
        eventType: 'EXPIRE',
        productId: 'item-1',
        quantity: 5,
        expirationDate: '2026-05-01',
        timestamp: new Date().toISOString(),
      } as any;
      eventLogSpy.listEventsByType.and.returnValue(Promise.resolve([existingEvent]));

      await service.logExpiredBatches([item]);

      expect(eventLogSpy.logExpireEvent).not.toHaveBeenCalled();
    });
  });

  // ── logAdvancedEdit ────────────────────────────────────────────────────────

  describe('logAdvancedEdit', () => {
    it('does not include editedFields when diff is empty', async () => {
      const item = makeItem();
      await service.logAdvancedEdit(item, item);
      const call = eventLogSpy.logEditEvent.calls.mostRecent();
      expect(call.args[0].editedFields).toBeUndefined();
    });

    it('includes editedFields when they exist', async () => {
      const previousItem = makeItem({ name: 'Old Name' });
      const updatedItem = makeItem({ name: 'New Name' });
      await service.logAdvancedEdit(previousItem, updatedItem);
      const call = eventLogSpy.logEditEvent.calls.mostRecent();
      expect(call.args[0].editedFields).toBeDefined();
      expect(call.args[0].editedFields?.length).toBeGreaterThan(0);
    });
  });

  // ── logAddNewItem ──────────────────────────────────────────────────────────

  describe('logAddNewItem', () => {
    it('sets previousQuantity to 0 always', async () => {
      const item = makeItem({ batches: [makeBatch(5)] });
      await service.logAddNewItem(item, 5);
      const call = eventLogSpy.logAddEvent.calls.mostRecent();
      expect(call.args[0].previousQuantity).toBe(0);
    });

    it('computes nextQuantity from batches', async () => {
      const item = makeItem({
        batches: [makeBatch(3), makeBatch(2)],
      });
      await service.logAddNewItem(item, 5);
      const call = eventLogSpy.logAddEvent.calls.mostRecent();
      expect(call.args[0].nextQuantity).toBe(5);
    });

    it('passes addedQuantity as both quantity and deltaQuantity', async () => {
      const item = makeItem({ batches: [makeBatch(5)] });
      await service.logAddNewItem(item, 5);
      const call = eventLogSpy.logAddEvent.calls.mostRecent();
      expect(call.args[0].quantity).toBe(5);
      expect(call.args[0].deltaQuantity).toBe(5);
    });
  });

  // ── logAddExistingItem ─────────────────────────────────────────────────────

  describe('logAddExistingItem', () => {
    it('computes previousQuantity from previousItem batches', async () => {
      const previousItem = makeItem({ batches: [makeBatch(3)] });
      const updatedItem = makeItem({ batches: [makeBatch(3), makeBatch(2)] });
      await service.logAddExistingItem(previousItem, updatedItem, 2);
      const call = eventLogSpy.logAddEvent.calls.mostRecent();
      expect(call.args[0].previousQuantity).toBe(3);
    });

    it('computes nextQuantity from updatedItem batches', async () => {
      const previousItem = makeItem({ batches: [makeBatch(3)] });
      const updatedItem = makeItem({ batches: [makeBatch(3), makeBatch(2)] });
      await service.logAddExistingItem(previousItem, updatedItem, 2);
      const call = eventLogSpy.logAddEvent.calls.mostRecent();
      expect(call.args[0].nextQuantity).toBe(5);
    });
  });

  // ── logDeleteFromCard ──────────────────────────────────────────────────────

  describe('logDeleteFromCard', () => {
    it('computes deltaQuantity as -totalQuantity', async () => {
      const item = makeItem({
        batches: [makeBatch(3), makeBatch(2)],
      });
      await service.logDeleteFromCard(item);
      const call = eventLogSpy.logDeleteEvent.calls.mostRecent();
      expect(call.args[0].deltaQuantity).toBe(-5);
    });

    it('sets nextQuantity to 0', async () => {
      const item = makeItem({ batches: [makeBatch(5)] });
      await service.logDeleteFromCard(item);
      const call = eventLogSpy.logDeleteEvent.calls.mostRecent();
      expect(call.args[0].nextQuantity).toBe(0);
    });

    it('sets previousQuantity to totalQuantity', async () => {
      const item = makeItem({ batches: [makeBatch(5)] });
      await service.logDeleteFromCard(item);
      const call = eventLogSpy.logDeleteEvent.calls.mostRecent();
      expect(call.args[0].previousQuantity).toBe(5);
    });
  });
});
