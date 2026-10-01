import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ActionSheetController } from '@ionic/angular';
import type { PantryItem } from '@core/models/pantry';
import type { BoughtItem, ManualItem } from '@core/models/list';
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

  function setup(items: PantryItem[] = [pollo()], manuals: ManualItem[] = []) {
    itemsSignal = signal<PantryItem[]>(items);
    manualItemsSignal = signal<ManualItem[]>(manuals);
    boughtManualsSignal = signal<BoughtItem[]>([]);

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
        const updated: PantryItem = {
          ...current,
          batches: [...current.batches, { batchId: 'b2', quantity: params.quantity }],
          updatedAt: '2026-01-02T00:00:00.000Z',
        };
        itemsSignal.set(itemsSignal().map(i => (i._id === itemId ? updated : i)));
        return Promise.resolve(updated);
      }),
      updateItem: jasmine.createSpy('updateItem').and.resolveTo(),
      addItem: jasmine.createSpy('addItem').and.callFake((item: PantryItem) => {
        itemsSignal.set([...itemsSignal(), item]);
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
      removeManual: jasmine.createSpy('removeManual'),
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
        manualItemsSignal.update(list => [...list, item]);
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

    expect(pantryStoreSpy.deleteItem).toHaveBeenCalledWith(createdItem!._id);
    expect(manualItemsStoreSpy.restoreManual).toHaveBeenCalledWith(
      jasmine.objectContaining({ id: 'm1', name: 'Bombillas' }),
    );
    expect(manualItemsSignal()).toEqual([{ id: 'm1', name: 'Bombillas', createdAt: 1 }]);
  });
});
