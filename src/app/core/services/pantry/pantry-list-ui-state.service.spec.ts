import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import type { PantryItem } from '@core/models/pantry';
import { ConfirmService, ToastService } from '../shared';
import { LoggerService } from '../shared/logger.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { PantryStoreService } from './pantry-store.service';
import { PantryListUiStateService } from './pantry-list-ui-state.service';

/**
 * Covers the branch 5.4 added to deletion: a product that still has stock is
 * asked about instead of simply confirmed, because the 30-day export showed
 * people using "delete" to mean "I finished this" — 23 deletions against 19
 * quantity adjustments, each one discarding the consumption history the waste
 * tracker and the insights depend on.
 */
describe('PantryListUiStateService — deleting a product that still has stock', () => {
  let service: PantryListUiStateService;
  let confirm: jasmine.SpyObj<ConfirmService>;
  let store: jasmine.SpyObj<PantryStoreService>;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  let consumeAll: jasmine.Spy;

  function item(overrides: Partial<PantryItem> = {}): PantryItem {
    return {
      _id: 'item:1',
      type: 'product',
      name: 'Leche',
      categoryId: 'cat',
      productType: 'pantry',
      batches: [{ batchId: 'b1', quantity: 2 }],
      ...overrides,
    } as PantryItem;
  }

  beforeEach(() => {
    confirm = jasmine.createSpyObj<ConfirmService>('ConfirmService', ['confirm', 'choose']);
    store = jasmine.createSpyObj<PantryStoreService>('PantryStoreService', ['deleteItem']);
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['track']);
    store.deleteItem.and.resolveTo();
    consumeAll = jasmine.createSpy('consumeAll').and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        PantryListUiStateService,
        { provide: ConfirmService, useValue: confirm },
        { provide: PantryStoreService, useValue: store },
        { provide: AnalyticsService, useValue: analytics },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'info', 'error']) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        {
          provide: HistoryEventManagerService,
          useValue: jasmine.createSpyObj('HistoryEventManagerService', ['logDeleteFromCard']),
        },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    });
    service = TestBed.inject(PantryListUiStateService);
    // Deletion awaits an exit animation; keep the tests off the wall clock.
    (service as unknown as { deleteAnimationDuration: number }).deleteAnimationDuration = 0;
  });

  it('asks which the user meant instead of a plain confirm', async () => {
    confirm.choose.and.resolveTo('consumed');
    await service.deleteItem(item(), undefined, false, undefined, consumeAll);
    expect(confirm.choose).toHaveBeenCalled();
    expect(confirm.confirm).not.toHaveBeenCalled();
  });

  it('consumes the stock and keeps the product when the user finished it', async () => {
    confirm.choose.and.resolveTo('consumed');
    await service.deleteItem(item(), undefined, false, undefined, consumeAll);
    expect(consumeAll).toHaveBeenCalled();
    expect(store.deleteItem).not.toHaveBeenCalled();
  });

  it('says the product is hidden until restocked, since it leaves the list at zero', async () => {
    confirm.choose.and.resolveTo('consumed');
    await service.deleteItem(item(), undefined, false, undefined, consumeAll);
    const toast = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
    expect(toast.success).toHaveBeenCalledWith('pantry.toasts.markedConsumed');
  });

  it('says a basic went onto the shopping list, as the quantity sheet does', async () => {
    confirm.choose.and.resolveTo('consumed');
    await service.deleteItem(item({ isBasic: true }), undefined, false, undefined, consumeAll);
    const toast = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
    expect(toast.success).toHaveBeenCalledWith('pantry.toasts.addedToList');
  });

  it('still deletes when the user really means delete', async () => {
    confirm.choose.and.resolveTo('delete');
    await service.deleteItem(item(), undefined, false, undefined, consumeAll);
    expect(store.deleteItem).toHaveBeenCalledWith('item:1');
    expect(consumeAll).not.toHaveBeenCalled();
  });

  it('does nothing on cancel — neither consumes nor deletes', async () => {
    confirm.choose.and.resolveTo('cancel');
    await service.deleteItem(item(), undefined, false, undefined, consumeAll);
    expect(store.deleteItem).not.toHaveBeenCalled();
    expect(consumeAll).not.toHaveBeenCalled();
  });

  it('records which verb the user chose, so the prompt can be judged later', async () => {
    confirm.choose.and.resolveTo('consumed');
    await service.deleteItem(item(), undefined, false, undefined, consumeAll);
    const [, props] = analytics.track.calls.mostRecent().args;
    expect(props).toEqual(jasmine.objectContaining({ choice: 'consumed', quantity: 2 }));
  });

  it('falls back to the plain confirm when nothing is left to consume', async () => {
    confirm.confirm.and.resolveTo(true);
    await service.deleteItem(
      item({ batches: [{ batchId: 'b1', quantity: 0 }] }),
      undefined,
      false,
      undefined,
      consumeAll,
    );
    expect(confirm.choose).not.toHaveBeenCalled();
    expect(confirm.confirm).toHaveBeenCalled();
    expect(store.deleteItem).toHaveBeenCalled();
  });

  it('falls back to the plain confirm when no consume path was supplied', async () => {
    confirm.confirm.and.resolveTo(true);
    await service.deleteItem(item(), undefined, false, undefined, undefined);
    expect(confirm.choose).not.toHaveBeenCalled();
    expect(confirm.confirm).toHaveBeenCalled();
  });

  it('skips every prompt when the caller already confirmed', async () => {
    await service.deleteItem(item(), undefined, true, undefined, consumeAll);
    expect(confirm.choose).not.toHaveBeenCalled();
    expect(confirm.confirm).not.toHaveBeenCalled();
    expect(store.deleteItem).toHaveBeenCalled();
  });
});
