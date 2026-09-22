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
