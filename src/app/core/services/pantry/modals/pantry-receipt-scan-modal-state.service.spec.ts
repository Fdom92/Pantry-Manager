import { TestBed } from '@angular/core/testing';
import { PantryReceiptScanModalStateService } from './pantry-receipt-scan-modal-state.service';
import { PantryStoreService } from '../pantry-store.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ReceiptLlmClientService } from '../../receipt/receipt-llm-client.service';
import { UpgradeRevenuecatService } from '../../upgrade/upgrade-revenuecat.service';
import { LocalStorageService } from '../../shared/local-storage.service';
import { LoggerService } from '../../shared/logger.service';
import { ToastService } from '../../shared';
import { AlertController } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { FRESH_QTY } from '@core/domain/pantry';
import { ANALYTICS_EVENTS } from '@core/constants';
import { FoodType } from '@core/models/shared/enums.model';
import { inferFoodType, resolveSuggestedExpiry } from '@core/domain/pantry/food-type-inference.domain';
import type { ReceiptReviewLine } from '@core/models/receipt';
import type { PantryItem } from '@core/models/pantry';

describe('PantryReceiptScanModalStateService', () => {
  let service: PantryReceiptScanModalStateService;
  let pantryStore: jasmine.SpyObj<PantryStoreService>;
  let alertCtrl: jasmine.SpyObj<AlertController>;

  /**
   * loadedProducts is a signal on the real service; assigning a plain function
   * over the spy (rather than using createSpyObj's propertyNames arg, which
   * freezes it as a non-configurable always-returns-the-same getter) lets
   * individual tests swap the candidate list editLineName rematches against.
   */
  function setLoadedProducts(items: PantryItem[]): void {
    (pantryStore as unknown as { loadedProducts: () => PantryItem[] }).loadedProducts = () => items;
  }

  function makeLine(overrides: Partial<ReceiptReviewLine> = {}): ReceiptReviewLine {
    return {
      id: 1,
      parsed: { rawName: 'MANZANAS GOLDEN', quantity: 2, confidence: 'high' },
      match: null,
      matchScore: 0,
      included: true,
      quantity: 2,
      foodType: null,
      expirationDate: undefined,
      noExpiry: undefined,
      dateFromUser: false,
      storage: 'pantry',
      suggestedStorage: 'pantry',
      expanded: false,
      ...overrides,
    };
  }

  function makeMatchedItem(overrides: Partial<PantryItem> = {}): PantryItem {
    return {
      _id: 'item-1',
      _rev: '1-abc',
      type: 'item',
      householdId: 'hh1',
      name: 'Leche entera',
      categoryId: '',
      foodType: FoodType.DAIRY,
      batches: [{ batchId: 'b1', quantity: 1 }],
      productType: 'pantry',
      ...overrides,
    } as PantryItem;
  }

  beforeEach(() => {
    pantryStore = jasmine.createSpyObj('PantryStoreService', ['addItem', 'addNewLot', 'updateItem']);
    setLoadedProducts([]);
    alertCtrl = jasmine.createSpyObj('AlertController', ['create']);

    TestBed.configureTestingModule({
      providers: [
        PantryReceiptScanModalStateService,
        { provide: PantryStoreService, useValue: pantryStore },
        { provide: HistoryEventManagerService, useValue: jasmine.createSpyObj('HistoryEventManagerService', ['logAddExistingItem', 'logAddNewItem']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
        { provide: TranslateService, useValue: jasmine.createSpyObj('TranslateService', ['instant']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        { provide: AlertController, useValue: alertCtrl },
        { provide: ReceiptLlmClientService, useValue: jasmine.createSpyObj('ReceiptLlmClientService', ['parse']) },
        { provide: UpgradeRevenuecatService, useValue: jasmine.createSpyObj('UpgradeRevenuecatService', ['isPro']) },
        { provide: LocalStorageService, useValue: { coachMark: jasmine.createSpyObj('coachMark', ['isShown', 'markShown']) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn']) },
      ],
    });
    service = TestBed.inject(PantryReceiptScanModalStateService);
  });

  describe('canEditFoodType / canEditExpiry / canExpand', () => {
    it('allows editing both for a brand-new line', () => {
      const line = makeLine();
      expect(service.canEditFoodType(line)).toBe(true);
      expect(service.canEditExpiry(line)).toBe(true);
      expect(service.canExpand(line)).toBe(true);
    });

    it('allows only expiry for a matched non-fresh line', () => {
      const matched = makeMatchedItem({ productType: 'pantry' });
      const line = makeLine({ match: matched, matchScore: 0.95 });
      expect(service.canEditFoodType(line)).toBe(false);
      expect(service.canEditExpiry(line)).toBe(true);
      expect(service.canExpand(line)).toBe(true);
    });

    it('allows neither for a matched fresh line', () => {
      const matched = makeMatchedItem({ productType: 'fresh' });
      const line = makeLine({ match: matched, matchScore: 0.95 });
      expect(service.canEditFoodType(line)).toBe(false);
      expect(service.canEditExpiry(line)).toBe(false);
      expect(service.canExpand(line)).toBe(false);
    });
  });

  describe('toggleExpanded', () => {
    it('flips only the targeted line', () => {
      service.reviewLines.set([makeLine({ id: 1 }), makeLine({ id: 2 })]);
      service.toggleExpanded(1);
      const lines = service.reviewLines();
      expect(lines.find(l => l.id === 1)?.expanded).toBe(true);
      expect(lines.find(l => l.id === 2)?.expanded).toBe(false);
      service.toggleExpanded(1);
      expect(service.reviewLines().find(l => l.id === 1)?.expanded).toBe(false);
    });
  });

  describe('setLineFoodType', () => {
    it('sets the type and re-suggests an expiry when the user has not set one', () => {
      service.reviewLines.set([makeLine({ id: 1, parsed: { rawName: 'MANZANAS GOLDEN', quantity: 2, confidence: 'high' } })]);
      service.setLineFoodType(1, FoodType.FRUIT);
      const line = service.reviewLines()[0];
      expect(line.foodType).toBe(FoodType.FRUIT);
      expect(line.expirationDate).toBeDefined();
    });

    it('keeps a date the user already set instead of overwriting it', () => {
      service.reviewLines.set([makeLine({ id: 1, expirationDate: '2026-12-25', dateFromUser: true })]);
      service.setLineFoodType(1, FoodType.NON_PERISHABLE);
      const line = service.reviewLines()[0];
      expect(line.expirationDate).toBe('2026-12-25');
    });
  });

  describe('setLineExpirationDate', () => {
    it('sets the date, clears noExpiry, and marks dateFromUser', () => {
      service.reviewLines.set([makeLine({ id: 1, noExpiry: true })]);
      service.setLineExpirationDate(1, '2026-11-01');
      const line = service.reviewLines()[0];
      expect(line.expirationDate).toBe('2026-11-01');
      expect(line.noExpiry).toBeUndefined();
      expect(line.dateFromUser).toBe(true);
    });

    it('clears the date when given undefined', () => {
      service.reviewLines.set([makeLine({ id: 1, expirationDate: '2026-11-01' })]);
      service.setLineExpirationDate(1, undefined);
      expect(service.reviewLines()[0].expirationDate).toBeUndefined();
    });
  });

  describe('setLineNoExpiry', () => {
    it('toggles no-expiry on and clears the date', () => {
      service.reviewLines.set([makeLine({ id: 1, expirationDate: '2026-11-01' })]);
      service.setLineNoExpiry(1);
      const line = service.reviewLines()[0];
      expect(line.noExpiry).toBe(true);
      expect(line.expirationDate).toBeUndefined();
      expect(line.dateFromUser).toBe(true);
    });

    it('toggles no-expiry back off', () => {
      service.reviewLines.set([makeLine({ id: 1, noExpiry: true })]);
      service.setLineNoExpiry(1);
      expect(service.reviewLines()[0].noExpiry).toBeUndefined();
    });
  });

  describe('editLineName', () => {
    /**
     * editLineName is alert-driven: it awaits AlertController.create(), then
     * alert.present(). There's no real dialog in a unit test, so this captures
     * the create() config and invokes the save button's handler directly,
     * exactly as tapping "save" on the real alert would.
     */
    async function renameLineTo(id: number, name: string): Promise<void> {
      let capturedConfig: any;
      alertCtrl.create.and.callFake((config: any) => {
        capturedConfig = config;
        return Promise.resolve({ present: () => Promise.resolve() } as any);
      });
      await service.editLineName(id);
      const saveButton = capturedConfig.buttons.find((b: any) => typeof b.handler === 'function');
      saveButton.handler({ name });
    }

    it('re-derives foodType and expiry from scratch when a rename makes a matched line stop matching', async () => {
      const matched = makeMatchedItem({ foodType: FoodType.DAIRY, productType: 'pantry', name: 'Leche entera' });
      service.reviewLines.set([
        makeLine({
          id: 1,
          parsed: { rawName: 'LECHE ENTERA', quantity: 1, confidence: 'high' },
          match: matched,
          matchScore: 0.95,
          foodType: FoodType.DAIRY,
          expirationDate: '2026-01-01',
          dateFromUser: false,
        }),
      ]);
      // Nothing to rematch against — the rename can only produce "new item" now.
      setLoadedProducts([]);

      await renameLineTo(1, 'PERAS CONFERENCE');

      const line = service.reviewLines()[0];
      expect(line.match).toBeNull();
      expect(line.matchScore).toBe(0);

      const expectedType = inferFoodType('PERAS CONFERENCE');
      expect(expectedType).not.toBe(FoodType.DAIRY);
      expect(line.foodType).toBe(expectedType);

      const expectedExpiry = resolveSuggestedExpiry('PERAS CONFERENCE', expectedType, new Date());
      expect(line.expirationDate).toBe(expectedExpiry.expirationDate);
      expect(line.expirationDate).not.toBe('2026-01-01');
    });

    it('preserves a user-picked date on rename, but still re-infers foodType from the new name', async () => {
      service.reviewLines.set([
        makeLine({
          id: 1,
          parsed: { rawName: 'LECHE ENTERA', quantity: 1, confidence: 'high' },
          match: null,
          matchScore: 0,
          foodType: FoodType.DAIRY,
          expirationDate: '2026-12-25',
          dateFromUser: true,
        }),
      ]);
      setLoadedProducts([]);

      await renameLineTo(1, 'PERAS CONFERENCE');

      const line = service.reviewLines()[0];
      expect(line.expirationDate).toBe('2026-12-25');
      expect(line.foodType).toBe(inferFoodType('PERAS CONFERENCE'));
    });

    it('re-infers foodType on rename even when the match status does not change', async () => {
      service.reviewLines.set([
        makeLine({
          id: 1,
          parsed: { rawName: 'LECHE ENTERA', quantity: 1, confidence: 'high' },
          match: null,
          matchScore: 0,
          foodType: FoodType.DAIRY,
          dateFromUser: false,
        }),
      ]);
      setLoadedProducts([]);

      await renameLineTo(1, 'PERAS CONFERENCE');

      const line = service.reviewLines()[0];
      expect(line.foodType).not.toBe(FoodType.DAIRY);
      expect(line.foodType).toBe(inferFoodType('PERAS CONFERENCE'));
    });
  });

  describe('storage and submit', () => {
    let events: jasmine.SpyObj<HistoryEventManagerService>;
    let analytics: jasmine.SpyObj<AnalyticsService>;
    beforeEach(() => {
      events = TestBed.inject(HistoryEventManagerService) as jasmine.SpyObj<HistoryEventManagerService>;
      analytics = TestBed.inject(AnalyticsService) as jasmine.SpyObj<AnalyticsService>;
    });

    it('a new fresh line with quantity 6 is one "sufficient" batch, never 6 (Review Focus 3)', async () => {
      service.reviewLines.set([makeLine({
        parsed: { rawName: 'MANZANAS GOLDEN', quantity: 6, confidence: 'high' },
        quantity: 6, storage: 'fresh', suggestedStorage: 'fresh', foodType: FoodType.FRUIT,
      })]);
      await service.submit();
      const item = pantryStore.addItem.calls.mostRecent().args[0] as PantryItem;
      expect(item.productType).toBe('fresh');
      expect(item.isBasic).toBeFalse();
      expect(item.minThreshold).toBeUndefined();
      expect(item.batches.length).toBe(1);
      expect(item.batches[0].quantity).toBe(FRESH_QTY.sufficient);
    });

    it('a pantry line keeps the ticket quantity', async () => {
      service.reviewLines.set([makeLine({ quantity: 6 })]);
      await service.submit();
      const item = pantryStore.addItem.calls.mostRecent().args[0] as PantryItem;
      expect(item.productType).toBe('pantry');
      expect(item.batches[0].quantity).toBe(6);
    });

    it('an unknown product defaults to pantry on scan-time derivation', () => {
      const line = makeLine({ parsed: { rawName: 'ZZQX', quantity: 1, confidence: 'high' } });
      service.reviewLines.set([line]);
      service.setLineFoodType(1, FoodType.OTHER);
      expect(service.reviewLines()[0].storage).toBe('pantry');
    });

    it('a restocked fresh item gets a new date, not the previous batch one', async () => {
      const matched = makeMatchedItem({
        productType: 'fresh', name: 'Manzanas',
        batches: [{ batchId: 'b1', quantity: 0, expirationDate: '2020-01-01' }],
      });
      service.reviewLines.set([makeLine({
        match: matched, matchScore: 0.95, expirationDate: '2026-12-01',
      })]);
      await service.submit();
      const saved = pantryStore.updateItem.calls.mostRecent().args[0] as PantryItem;
      expect(saved.batches[0].expirationDate).toBe('2026-12-01');
      expect(saved.batches[0].quantity).toBe(FRESH_QTY.sufficient);
    });

    it('setLineStorage changes the destination and counts as storage_changed', async () => {
      service.reviewLines.set([makeLine({ id: 1 }), makeLine({ id: 2, storage: 'fresh', suggestedStorage: 'fresh' })]);
      service.setLineStorage(1, 'fresh');
      expect(service.reviewLines()[0].storage).toBe('fresh');
      await service.submit();
      const args = analytics.track.calls.allArgs().find(a => a[0] === ANALYTICS_EVENTS.RECEIPT_SCAN_COMPLETED)![1] as Record<string, unknown>;
      expect(args['fresh_lines']).toBe(2);
      expect(args['storage_changed']).toBe(1);
      expect(events.logAddNewItem).toHaveBeenCalledTimes(2);
    });

    it('toggling back to the suggestion is not a change', async () => {
      service.reviewLines.set([makeLine()]);
      service.setLineStorage(1, 'fresh');
      service.setLineStorage(1, 'pantry');
      await service.submit();
      const args = analytics.track.calls.allArgs().find(a => a[0] === ANALYTICS_EVENTS.RECEIPT_SCAN_COMPLETED)![1] as Record<string, unknown>;
      expect(args['storage_changed']).toBe(0);
      expect(args['fresh_lines']).toBe(0);
    });
  });
});
