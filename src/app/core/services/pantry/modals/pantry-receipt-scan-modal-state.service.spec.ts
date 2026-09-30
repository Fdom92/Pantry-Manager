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
import { FoodType } from '@core/models/shared/enums.model';
import type { ReceiptReviewLine } from '@core/models/receipt';
import type { PantryItem } from '@core/models/pantry';

describe('PantryReceiptScanModalStateService', () => {
  let service: PantryReceiptScanModalStateService;

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
    TestBed.configureTestingModule({
      providers: [
        PantryReceiptScanModalStateService,
        { provide: PantryStoreService, useValue: jasmine.createSpyObj('PantryStoreService', ['loadedProducts', 'addItem', 'addNewLot', 'updateItem'], { loadedProducts: () => [] }) },
        { provide: HistoryEventManagerService, useValue: jasmine.createSpyObj('HistoryEventManagerService', ['logAddExistingItem', 'logAddNewItem']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
        { provide: TranslateService, useValue: jasmine.createSpyObj('TranslateService', ['instant']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        { provide: AlertController, useValue: jasmine.createSpyObj('AlertController', ['create']) },
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
});
