import { TestBed } from '@angular/core/testing';
import { FoodType } from '@core/models/shared';
import { FRESH_QTY } from '@core/domain/pantry';
import { ClockService } from '../shared/clock.service';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { FirstProductsService, type ProductDraft } from './first-products.service';
import { PantryStoreService } from './pantry-store.service';

describe('FirstProductsService', () => {
  const NOW = new Date('2026-11-16T10:00:00.000Z').getTime();
  let service: FirstProductsService;
  let store: jasmine.SpyObj<PantryStoreService>;
  let history: jasmine.SpyObj<HistoryEventManagerService>;

  beforeEach(() => {
    store = jasmine.createSpyObj('PantryStoreService', ['addItem']);
    store.addItem.and.resolveTo();
    history = jasmine.createSpyObj('HistoryEventManagerService', ['logAddNewItem']);
    history.logAddNewItem.and.resolveTo(undefined as never);
    TestBed.configureTestingModule({
      providers: [
        { provide: PantryStoreService, useValue: store },
        { provide: HistoryEventManagerService, useValue: history },
        { provide: ClockService, useValue: { now: () => NOW } },
      ],
    });
    service = TestBed.inject(FirstProductsService);
  });

  const draft = (over: Partial<ProductDraft>): ProductDraft => ({
    name: 'Leche', storage: 'pantry', dateFromUser: false, source: 'suggestion', ...over,
  });

  it('saves a pantry draft with its class, type and the clock stamp', async () => {
    const [item] = await service.save([draft({ classKey: 'uht-milk' })]);
    expect(item.productType).toBe('pantry');
    expect(item.foodKind).toBe('uht-milk');
    expect(item.foodType).toBe(FoodType.DAIRY);
    expect(item.createdAt).toBe('2026-11-16T10:00:00.000Z');
    expect(item.batches[0].quantity).toBe(1);
    expect(item.batches[0].expirationDate).toBeTruthy();
    expect(store.addItem).toHaveBeenCalledOnceWith(item);
  });

  it('saves a fresh draft as one "sufficient" batch', async () => {
    const [item] = await service.save([draft({ name: 'Huevos', classKey: 'eggs', storage: 'fresh' })]);
    expect(item.productType).toBe('fresh');
    expect(item.batches.length).toBe(1);
    expect(item.batches[0].quantity).toBe(FRESH_QTY.sufficient);
  });

  it('keeps an explicit no-expiry, with no date', async () => {
    const [item] = await service.save([draft({ name: 'Sal', classKey: 'salt-spices', noExpiry: true })]);
    expect(item.batches[0].noExpiry).toBeTrue();
    expect(item.batches[0].expirationDate).toBeUndefined();
  });

  it('respects a user date and does not infer one when the user cleared it', async () => {
    const [dated, cleared] = await service.save([
      draft({ classKey: 'uht-milk', expirationDate: '2026-12-24', dateFromUser: true }),
      draft({ name: 'Leche 2', classKey: 'uht-milk', dateFromUser: true }),
    ]);
    expect(dated.batches[0].expirationDate).toBe('2026-12-24');
    expect(cleared.batches[0].expirationDate).toBeUndefined();
  });

  it('logs one ADD per product with dateFromUser, sharing a session when several', async () => {
    await service.save([
      draft({ classKey: 'uht-milk', dateFromUser: true, expirationDate: '2026-12-24' }),
      draft({ name: 'Arroz', classKey: 'rice-grains' }),
    ]);
    expect(history.logAddNewItem).toHaveBeenCalledTimes(2);
    const [, qty, session, ts, meta] = history.logAddNewItem.calls.argsFor(0);
    expect(qty).toBe(1);
    expect(session).toBeTruthy();
    expect(ts).toBe('2026-11-16T10:00:00.000Z');
    expect(meta).toEqual({ dateFromUser: true });
    expect(history.logAddNewItem.calls.argsFor(1)[2]).toBe(session);
    expect(history.logAddNewItem.calls.argsFor(1)[4]).toEqual({ dateFromUser: false });
  });

  it('uses the explicit foodType when the draft has no class', async () => {
    const [item] = await service.save([draft({ name: 'Cosa', foodType: FoodType.CARB })]);
    expect(item.foodType).toBe(FoodType.CARB);
    expect(item.foodKind).toBeDefined();
  });
});
