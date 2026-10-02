import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ActionSheetController } from '@ionic/angular';
import type { PantryItem } from '@core/models/pantry';
import { ShoppingReason, type BoughtItem, type ManualItem, type ShoppingSuggestionWithItem } from '@core/models/list';
import { AnalyticsService } from '../analytics/analytics.service';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { DownloadService, LoggerService, ShareService, ToastService } from '../shared';
import { ReviewPromptService } from '../shared/review-prompt.service';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { ListManualItemsStore } from './list-manual-items.store';
import { ShoppingExportService } from './shopping-export.service';
import { ListStateService } from './list-state.service';

/**
 * Reported bug: hand-add "Pollo" to the shopping list while the pantry's own
 * "Pollo" is marked basic and has just been consumed to 0. The list showed
 * two "Pollo" rows — the automatic suggestion and the manual note — because
 * nothing tied the manual entry to the product it names.
 */
describe('ListStateService — a manual item that duplicates a suggestion', () => {
  let service: ListStateService;
  let manualItemsSignal: ReturnType<typeof signal<ManualItem[]>>;
  let removeManual: jasmine.Spy;
  let addNewLot: jasmine.Spy;

  function pollo(overrides: Partial<PantryItem> = {}): PantryItem {
    return {
      _id: 'item:pollo',
      type: 'item',
      name: 'Pollo',
      productType: 'pantry',
      categoryId: '',
      isBasic: true,
      minThreshold: 1,
      batches: [{ batchId: 'b1', quantity: 0 }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    } as PantryItem;
  }

  function setup(manuals: ManualItem[], items: PantryItem[] = [pollo()]) {
    manualItemsSignal = signal<ManualItem[]>(manuals);
    const boughtManualsSignal = signal<BoughtItem[]>([]);
    removeManual = jasmine.createSpy('removeManual').and.callFake((id: string) => {
      const found = manualItemsSignal().find(m => m.id === id);
      manualItemsSignal.set(manualItemsSignal().filter(m => m.id !== id));
      return found;
    });
    addNewLot = jasmine.createSpy('addNewLot').and.resolveTo(pollo());

    TestBed.configureTestingModule({
      providers: [
        ListStateService,
        {
          provide: PantryStoreService,
          useValue: {
            loadedProducts: signal<PantryItem[]>(items),
            loading: signal(false),
            loadAll: jasmine.createSpy('loadAll').and.resolveTo(),
            addNewLot,
            updateItem: jasmine.createSpy('updateItem').and.resolveTo(),
            addItem: jasmine.createSpy('addItem').and.resolveTo(),
          },
        },
        {
          provide: ListManualItemsStore,
          useValue: {
            manualItems: manualItemsSignal,
            boughtManuals: boughtManualsSignal,
            removeManual,
            markManualAsBought: jasmine.createSpy('markManualAsBought'),
            addManualItem: jasmine.createSpy('addManualItem'),
            clearBoughtManuals: jasmine.createSpy('clearBoughtManuals'),
          },
        },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: ActionSheetController, useValue: jasmine.createSpyObj('ActionSheetController', ['create']) },
        { provide: DownloadService, useValue: {} },
        { provide: ShareService, useValue: {} },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'info', 'error', 'withAction']) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
        {
          provide: ReviewPromptService,
          useValue: jasmine.createSpyObj('ReviewPromptService', ['handlePositiveAction']),
        },
        {
          provide: ShoppingExportService,
          useValue: jasmine.createSpyObj('ShoppingExportService', ['buildPdf', 'buildText']),
        },
        {
          provide: HistoryEventManagerService,
          useValue: jasmine.createSpyObj('HistoryEventManagerService', [
            'logAddExistingItem', 'logAdvancedEdit', 'logAddNewItem',
          ]),
        },
      ],
    });
    service = TestBed.inject(ListStateService);
  }

  it('hides the manual "Pollo" while the pantry still suggests it', () => {
    setup([{ id: 'm1', name: 'Pollo' }]);
    expect(service.visibleManualItems()).toEqual([]);
    // The suggestion itself is untouched — only the render/count list is filtered.
    expect(service.manualItems()).toEqual([{ id: 'm1', name: 'Pollo' }]);
  });

  it('shows the manual note again once the suggestion is hidden for now', () => {
    setup([{ id: 'm1', name: 'Pollo' }]);
    service.removeAutoItem('item:pollo');
    expect(service.visibleManualItems()).toEqual([{ id: 'm1', name: 'Pollo' }]);
  });

  it('keeps a manual entry for a different product', () => {
    setup([{ id: 'm1', name: 'Bombillas' }]);
    expect(service.visibleManualItems()).toEqual([{ id: 'm1', name: 'Bombillas' }]);
  });

  it('removes the matching manual once the automatic suggestion is bought', async () => {
    setup([{ id: 'm1', name: 'Pollo' }]);
    const suggestion = service.shoppingAnalysis().suggestions[0];
    expect(suggestion).toBeDefined();

    await service.markAsBought(suggestion);

    expect(removeManual).toHaveBeenCalledWith('m1');
    expect(manualItemsSignal()).toEqual([]);
  });
});

describe('ListStateService — undoPurchase', () => {
  let service: ListStateService;
  let itemsSignal: ReturnType<typeof signal<PantryItem[]>>;
  let manualItemsSignal: ReturnType<typeof signal<ManualItem[]>>;
  let boughtManualsSignal: ReturnType<typeof signal<BoughtItem[]>>;
  let pantryStoreSpy: {
    loadedProducts: ReturnType<typeof signal<PantryItem[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    loadAll: jasmine.Spy;
    addNewLot: jasmine.Spy;
    updateItem: jasmine.Spy;
    addItem: jasmine.Spy;
    deleteItem: jasmine.Spy;
  };
  let manualItemsStoreSpy: {
    manualItems: ReturnType<typeof signal<ManualItem[]>>;
    boughtManuals: ReturnType<typeof signal<BoughtItem[]>>;
    removeManual: jasmine.Spy;
    markManualAsBought: jasmine.Spy;
    addManualItem: jasmine.Spy;
    clearBoughtManuals: jasmine.Spy;
    restoreManual: jasmine.Spy;
  };
  let toastSpy: jasmine.SpyObj<ToastService>;
  // The faithful write the real store performs; tests override updateItem with
  // failing variants and fall back to this one.
  let realUpdateItem: (item: PantryItem) => Promise<void>;
  let stampCounter: number;

  function pollo(overrides: Partial<PantryItem> = {}): PantryItem {
    return {
      _id: 'item:pollo',
      type: 'item',
      name: 'Pollo',
      productType: 'pantry',
      categoryId: '',
      isBasic: true,
      minThreshold: 1,
      batches: [{ batchId: 'b1', quantity: 0 }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    } as PantryItem;
  }

  function freshPollo(): PantryItem {
    return pollo({ productType: 'fresh', batches: [{ batchId: 'b1', quantity: 0 }] });
  }

  /**
   * StorageService._upsert overwrites updatedAt with its own clock on every
   * save, and the pantry cache holds that saved copy. The fakes below do the
   * same with a strictly increasing stamp: the original unit tests used fixed
   * values, so they never noticed the undo record was built from the
   * pre-save timestamp.
   */
  function stamp(): string {
    return new Date(Date.UTC(2026, 1, 1, 0, 0, ++stampCounter)).toISOString();
  }

  function persist(item: PantryItem): PantryItem {
    const saved = { ...item, updatedAt: stamp() };
    const exists = itemsSignal().some(i => i._id === saved._id);
    itemsSignal.set(exists
      ? itemsSignal().map(i => (i._id === saved._id ? saved : i))
      : [saved, ...itemsSignal()]);
    return saved;
  }

  function setup(items: PantryItem[] = [pollo()], manuals: ManualItem[] = []) {
    stampCounter = 0;
    itemsSignal = signal<PantryItem[]>(items);
    manualItemsSignal = signal<ManualItem[]>(manuals);
    boughtManualsSignal = signal<BoughtItem[]>([]);
    realUpdateItem = item => {
      persist(item);
      return Promise.resolve();
    };

    pantryStoreSpy = {
      loadedProducts: itemsSignal,
      loading: signal(false),
      loadAll: jasmine.createSpy('loadAll').and.resolveTo(),
      // Simulates the real store: once a lot is added/persisted, loadedProducts
      // reflects the new state — needed so undoPurchase's staleness check
      // (compares against the live items()) sees the post-buy item.
      addNewLot: jasmine.createSpy('addNewLot').and.callFake((itemId: string, params: { quantity: number }) => {
        const current = itemsSignal().find(i => i._id === itemId);
        if (!current) return Promise.resolve(null);
        return Promise.resolve(persist({
          ...current,
          batches: [...current.batches, { batchId: 'b2', quantity: params.quantity }],
        }));
      }),
      updateItem: jasmine.createSpy('updateItem').and.callFake((item: PantryItem) => realUpdateItem(item)),
      addItem: jasmine.createSpy('addItem').and.callFake((item: PantryItem) => {
        persist(item);
        return Promise.resolve();
      }),
      deleteItem: jasmine.createSpy('deleteItem').and.callFake((id: string) => {
        itemsSignal.set(itemsSignal().filter(i => i._id !== id));
        return Promise.resolve();
      }),
    };

    manualItemsStoreSpy = {
      manualItems: manualItemsSignal,
      boughtManuals: boughtManualsSignal,
      removeManual: jasmine.createSpy('removeManual').and.callFake((id: string) => {
        const found = manualItemsSignal().find(m => m.id === id);
        manualItemsSignal.set(manualItemsSignal().filter(m => m.id !== id));
        return found;
      }),
      markManualAsBought: jasmine.createSpy('markManualAsBought').and.callFake((id: string) => {
        const found = manualItemsSignal().find(m => m.id === id);
        if (!found) return undefined;
        manualItemsSignal.set(manualItemsSignal().filter(m => m.id !== id));
        boughtManualsSignal.update(list => [...list, { id, name: found.name }]);
        return found;
      }),
      addManualItem: jasmine.createSpy('addManualItem'),
      clearBoughtManuals: jasmine.createSpy('clearBoughtManuals'),
      restoreManual: jasmine.createSpy('restoreManual').and.callFake((item: ManualItem) => {
        if (!manualItemsSignal().some(m => m.id === item.id)) {
          manualItemsSignal.update(list => [...list, item]);
        }
        boughtManualsSignal.update(list => list.filter(b => b.id !== item.id));
      }),
    };

    toastSpy = jasmine.createSpyObj('ToastService', ['success', 'info', 'error', 'withAction']);

    TestBed.configureTestingModule({
      providers: [
        ListStateService,
        { provide: PantryStoreService, useValue: pantryStoreSpy },
        { provide: ListManualItemsStore, useValue: manualItemsStoreSpy },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: ActionSheetController, useValue: jasmine.createSpyObj('ActionSheetController', ['create']) },
        { provide: DownloadService, useValue: {} },
        { provide: ShareService, useValue: {} },
        { provide: ToastService, useValue: toastSpy },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
        {
          provide: ReviewPromptService,
          useValue: jasmine.createSpyObj('ReviewPromptService', ['handlePositiveAction']),
        },
        {
          provide: ShoppingExportService,
          useValue: jasmine.createSpyObj('ShoppingExportService', ['buildPdf', 'buildText']),
        },
        {
          provide: HistoryEventManagerService,
          useValue: jasmine.createSpyObj('HistoryEventManagerService', [
            'logAddExistingItem', 'logAdvancedEdit', 'logAddNewItem',
          ]),
        },
      ],
    });
    service = TestBed.inject(ListStateService);
  }

  it('restores the item to its pre-purchase snapshot after an auto-restock', async () => {
    setup([pollo()]);
    const suggestion = service.shoppingAnalysis().suggestions[0];
    expect(suggestion).toBeDefined();

    await service.markAsBought(suggestion);
    // The restock persisted: the item now carries the new lot.
    expect(itemsSignal().find(i => i._id === 'item:pollo')?.batches.length).toBe(2);

    await service.undoPurchase('item:pollo');

    expect(pantryStoreSpy.updateItem).toHaveBeenCalledWith(jasmine.objectContaining({
      _id: 'item:pollo',
      batches: [{ batchId: 'b1', quantity: 0 }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
  });

  it('refuses to undo and shows a toast when the item changed since the purchase', async () => {
    setup([pollo()]);
    const suggestion = service.shoppingAnalysis().suggestions[0];
    await service.markAsBought(suggestion);

    // Simulate an edit elsewhere (e.g. from the pantry screen) after the buy:
    // same id, different updatedAt than what undoPurchase recorded.
    itemsSignal.set(itemsSignal().map(i => (
      i._id === 'item:pollo' ? { ...i, updatedAt: '2026-01-03T00:00:00.000Z' } : i
    )));

    await service.undoPurchase('item:pollo');

    expect(pantryStoreSpy.updateItem).not.toHaveBeenCalled();
    expect(toastSpy.error).toHaveBeenCalledWith('shopping.toasts.undoStale');
  });

  it('deletes the newly-created product and restores the manual entry when undoing a manual buy that created a new product', async () => {
    setup([], [{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);

    await service.markManualAsBought('m1');

    expect(pantryStoreSpy.addItem).toHaveBeenCalled();
    const createdItem = itemsSignal().find(i => i.name === 'Bombillas');
    expect(createdItem).toBeDefined();

    await service.undoPurchase('m1');

    expect(pantryStoreSpy.deleteItem).toHaveBeenCalledWith(createdItem!._id, { track: false });
    expect(manualItemsStoreSpy.restoreManual).toHaveBeenCalledWith(
      jasmine.objectContaining({ id: 'm1', name: 'Bombillas' }),
    );
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
  });

  it('ignores a second undoPurchase for the same row fired before the first one finishes', async () => {
    setup([], [{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);

    await service.markManualAsBought('m1');
    expect(pantryStoreSpy.addItem).toHaveBeenCalled();
    const createdItem = itemsSignal().find(i => i.name === 'Bombillas');
    expect(createdItem).toBeDefined();

    // Two rapid taps on the same row, neither awaited before the other starts —
    // the in-flight guard must make the second call a no-op so restoreManual
    // (which appends with no dedupe) only runs once.
    const p1 = service.undoPurchase('m1');
    const p2 = service.undoPurchase('m1');
    await Promise.all([p1, p2]);

    expect(manualItemsStoreSpy.restoreManual).toHaveBeenCalledTimes(1);
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
    expect(pantryStoreSpy.deleteItem).toHaveBeenCalledTimes(1);
  });

  it('retries only the manual-restore step after it fails once, without repeating the pantry delete', async () => {
    setup([], [{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
    await service.markManualAsBought('m1');
    const createdItem = itemsSignal().find(i => i.name === 'Bombillas');
    expect(createdItem).toBeDefined();

    let restoreAttempts = 0;
    manualItemsStoreSpy.restoreManual.and.callFake((item: ManualItem) => {
      restoreAttempts++;
      if (restoreAttempts === 1) {
        throw new Error('localStorage quota exceeded');
      }
      manualItemsSignal.update(list => [...list, item]);
      boughtManualsSignal.update(list => list.filter(b => b.id !== item.id));
    });

    await service.undoPurchase('m1');
    expect(pantryStoreSpy.deleteItem).toHaveBeenCalledTimes(1);
    expect(toastSpy.error).toHaveBeenCalledWith('shopping.toasts.undoFailed');

    // Retry: pantryRestored is already true, so this must not attempt a second
    // delete of a product that's already gone — it should go straight to
    // retrying restoreManual.
    await service.undoPurchase('m1');
    expect(pantryStoreSpy.deleteItem).toHaveBeenCalledTimes(1);
    expect(manualItemsStoreSpy.restoreManual).toHaveBeenCalledTimes(2);
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
  });

  it('does not repeat the pantry write on retry once pantryRestored is set', async () => {
    setup([pollo()], [{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
    await service.markManualAsBought('m1');
    // Matching an existing product already calls updateItem once during the
    // buy itself (to persist the merged lot) — reset so the assertions below
    // measure only what the undo attempts do.
    pantryStoreSpy.updateItem.calls.reset();

    let restoreAttempts = 0;
    manualItemsStoreSpy.restoreManual.and.callFake((item: ManualItem) => {
      restoreAttempts++;
      if (restoreAttempts === 1) {
        throw new Error('localStorage quota exceeded');
      }
      manualItemsSignal.update(list => [...list, item]);
      boughtManualsSignal.update(list => list.filter(b => b.id !== item.id));
    });

    await service.undoPurchase('m1');
    expect(pantryStoreSpy.updateItem).toHaveBeenCalledTimes(1);

    await service.undoPurchase('m1');
    // Still exactly one pantry write across both attempts: the second call
    // skipped the pantry step entirely because pantryRestored was already true.
    expect(pantryStoreSpy.updateItem).toHaveBeenCalledTimes(1);
    expect(manualItemsStoreSpy.restoreManual).toHaveBeenCalledTimes(2);
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
  });

  it('leaves the record retryable when the pantry write itself fails', async () => {
    setup([pollo()]);
    const suggestion = service.shoppingAnalysis().suggestions[0];
    await service.markAsBought(suggestion);
    expect(pantryStoreSpy.updateItem).not.toHaveBeenCalled();

    let attempt = 0;
    pantryStoreSpy.updateItem.and.callFake(() => {
      attempt++;
      return attempt === 1 ? Promise.reject(new Error('write failed')) : realUpdateItem(pantryStoreSpy.updateItem.calls.mostRecent().args[0]);
    });

    await service.undoPurchase('item:pollo');
    expect(pantryStoreSpy.updateItem).toHaveBeenCalledTimes(1);
    expect(toastSpy.error).toHaveBeenCalledWith('shopping.toasts.undoFailed');

    // Retry: the record was left untouched (pantryRestored never got set), so
    // the pantry write itself — not just the manual-restore step — is
    // attempted again, not skipped as if it had already succeeded.
    await service.undoPurchase('item:pollo');
    expect(pantryStoreSpy.updateItem).toHaveBeenCalledTimes(2);
    expect(toastSpy.success).toHaveBeenCalledWith('shopping.toasts.purchaseUndone');
  });

  // ─── Realistic stamping: every buy path must be undoable ───────────────

  it('undoes an auto fresh restock when the store stamps its own updatedAt', async () => {
    setup([freshPollo()]);
    const suggestion: ShoppingSuggestionWithItem = {
      item: itemsSignal()[0], reason: ShoppingReason.FRESH_EMPTY, suggestedQuantity: 0, currentQuantity: 0,
    };

    await service.markAsBought(suggestion);
    expect(service.canUndoPurchase('item:pollo')).toBeTrue();

    await service.undoPurchase('item:pollo');

    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(toastSpy.success).toHaveBeenCalledWith('shopping.toasts.purchaseUndone');
    expect(itemsSignal().find(i => i._id === 'item:pollo')?.batches).toEqual([{ batchId: 'b1', quantity: 0 }]);
    expect(service.canUndoPurchase('item:pollo')).toBeFalse();
  });

  it('undoes an auto non-fresh restock (addNewLot) under realistic stamping', async () => {
    setup([pollo()]);
    await service.markAsBought(service.shoppingAnalysis().suggestions[0]);

    await service.undoPurchase('item:pollo');

    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(toastSpy.success).toHaveBeenCalledWith('shopping.toasts.purchaseUndone');
    expect(itemsSignal().find(i => i._id === 'item:pollo')?.batches).toEqual([{ batchId: 'b1', quantity: 0 }]);
  });

  it('undoes a manual buy matched to an existing non-fresh product (addNewLot + updateItem double write)', async () => {
    setup([pollo()], [{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
    await service.markManualAsBought('m1');
    expect(service.canUndoPurchase('m1')).toBeTrue();

    await service.undoPurchase('m1');

    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(itemsSignal().find(i => i._id === 'item:pollo')?.batches).toEqual([{ batchId: 'b1', quantity: 0 }]);
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
  });

  it('undoes a manual buy matched to an existing fresh product', async () => {
    setup([freshPollo()], [{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
    await service.markManualAsBought('m1');

    await service.undoPurchase('m1');

    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(itemsSignal().find(i => i._id === 'item:pollo')?.batches).toEqual([{ batchId: 'b1', quantity: 0 }]);
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
  });

  it('undoes a manual buy that created a new product under realistic stamping', async () => {
    setup([], [{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
    await service.markManualAsBought('m1');

    await service.undoPurchase('m1');

    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(itemsSignal().find(i => i.name === 'Bombillas')).toBeUndefined();
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
  });

  // ─── A write that "succeeds" without landing ───────────────────────────

  it('reports a failure, not success, when the store swallows a failed restore', async () => {
    setup([pollo()]);
    await service.markAsBought(service.shoppingAnalysis().suggestions[0]);
    // The real store catches its own errors: the promise resolves, the cache is unchanged.
    pantryStoreSpy.updateItem.and.resolveTo();

    await service.undoPurchase('item:pollo');

    expect(toastSpy.error).toHaveBeenCalledWith('shopping.toasts.undoFailed');
    expect(toastSpy.success).not.toHaveBeenCalledWith('shopping.toasts.purchaseUndone');
    expect(service.canUndoPurchase('item:pollo')).toBeTrue();
    expect(service.boughtItemIds().has('item:pollo')).toBeTrue();
  });

  it('reports a failure when the store swallows a failed delete of a created product', async () => {
    setup([], [{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
    await service.markManualAsBought('m1');
    pantryStoreSpy.deleteItem.and.resolveTo();

    await service.undoPurchase('m1');

    expect(toastSpy.error).toHaveBeenCalledWith('shopping.toasts.undoFailed');
    expect(service.canUndoPurchase('m1')).toBeTrue();
    expect(manualItemsStoreSpy.restoreManual).not.toHaveBeenCalled();
    expect(boughtManualsSignal().map(b => b.id)).toEqual(['m1']);
  });

  // ─── Product deleted after the buy ─────────────────────────────────────

  it('refuses to resurrect a product that was deleted after the buy', async () => {
    setup([pollo()]);
    await service.markAsBought(service.shoppingAnalysis().suggestions[0]);
    itemsSignal.set([]);

    await service.undoPurchase('item:pollo');

    expect(toastSpy.error).toHaveBeenCalledWith('shopping.toasts.undoStale');
    expect(pantryStoreSpy.updateItem).not.toHaveBeenCalled();
    expect(itemsSignal()).toEqual([]);
  });

  // ─── Same-name manual notes removed by an auto buy ─────────────────────

  it('hands back a same-name manual note that buying the automatic suggestion removed', async () => {
    setup([pollo()], [{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
    await service.markAsBought(service.shoppingAnalysis().suggestions[0]);
    expect(manualItemsSignal()).toEqual([]);

    await service.undoPurchase('item:pollo');

    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
  });

  // ─── Merge: the new product never reaches the cache ────────────────────

  it('offers no undo when adding the manual item merged into an existing product', async () => {
    setup([], [{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
    // PantryStoreService.addItem merges into an existing item (different _id),
    // so the item we built is never what lands in the cache.
    pantryStoreSpy.addItem.and.callFake(() => {
      persist(pollo({ _id: 'item:other', name: 'Bombillas LED' }));
      return Promise.resolve();
    });

    await service.markManualAsBought('m1');

    expect(service.canUndoPurchase('m1')).toBeFalse();
  });

  it('keeps the undo record when the history log throws after the pantry write', async () => {
    setup([pollo()], [{ id: 'm1', name: 'Pollo', createdAt: 1 }]);
    const events = TestBed.inject(HistoryEventManagerService) as jasmine.SpyObj<HistoryEventManagerService>;
    events.logAddExistingItem.and.rejectWith(new Error('history down'));

    await service.markManualAsBought('m1');

    expect(service.canUndoPurchase('m1')).toBeTrue();
  });
});
