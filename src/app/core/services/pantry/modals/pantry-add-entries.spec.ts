import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import type { PantryItem } from '@core/models/pantry';
import { FoodType } from '@core/models/shared/enums.model';
import { AnalyticsService } from '../../analytics/analytics.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { LanguageService } from '../../shared/language.service';
import { LoggerService } from '../../shared/logger.service';
import { ToastService } from '../../shared/toast.service';
import { PantryStoreService } from '../pantry-store.service';
import { PantryAddModalStateService } from './pantry-add-modal-state.service';
import { PantryFreshAddModalStateService } from './pantry-fresh-add-modal-state.service';

/**
 * Characterisation tests for the entry engine both add sheets run on — the list
 * the user builds before saving: picking from the catalogue, typing a new name,
 * nudging quantities, setting dates.
 *
 * These exist to pin the behaviour down before the two sheets are folded onto a
 * shared engine. They assert what the app does today, including the places
 * where despensa and fresco deliberately disagree.
 */

function makeItem(over: Partial<PantryItem> = {}): PantryItem {
  return {
    _id: over._id ?? 'item:leche',
    type: 'item',
    name: over.name ?? 'Leche',
    productType: over.productType ?? 'pantry',
    categoryId: '',
    batches: over.batches ?? [{ batchId: 'b1', quantity: 1 }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as PantryItem;
}

function configure(loadedProducts: PantryItem[]) {
  const store = jasmine.createSpyObj<PantryStoreService>('PantryStoreService', [
    'addItem', 'updateItem', 'addNewLot',
  ]);
  (store as unknown as { loadedProducts: () => PantryItem[] }).loadedProducts = () => loadedProducts;

  const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
  translate.instant.and.callFake((key: string) => key);

  const language = jasmine.createSpyObj<LanguageService>('LanguageService', ['getCurrentLocale']);
  language.getCurrentLocale.and.returnValue('es-ES');
  (language as unknown as { currentLanguage: () => string }).currentLanguage = () => 'es';

  TestBed.configureTestingModule({
    providers: [
      PantryAddModalStateService,
      PantryFreshAddModalStateService,
      { provide: PantryStoreService, useValue: store },
      { provide: TranslateService, useValue: translate },
      { provide: LanguageService, useValue: language },
      { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info', 'raw']) },
      { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
      { provide: HistoryEventManagerService, useValue: jasmine.createSpyObj('HistoryEventManagerService', ['logAddNewItem', 'logAddExistingItem']) },
      { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'debug', 'info', 'log']) },
    ],
  });
  return { store };
}

describe('add sheet entry engine — despensa', () => {
  let service: PantryAddModalStateService;
  const leche = makeItem({ _id: 'item:leche', name: 'Leche' });
  const lechuga = makeItem({ _id: 'item:lechuga', name: 'Lechuga', productType: 'fresh' });

  beforeEach(() => {
    configure([leche, lechuga]);
    service = TestBed.inject(PantryAddModalStateService);
  });

  it('starts empty and opens clean', () => {
    service.entries.set([{ id: 'stale', name: 'Sobra', quantity: 1, isNew: true }]);
    service.query.set('sobra');

    service.open();

    expect(service.entries()).toEqual([]);
    expect(service.query()).toBe('');
    expect(service.isOpen()).toBeTrue();
  });

  it('adds a catalogue pick as one entry and clears the query', () => {
    service.query.set('lec');
    service.addEntry({ id: leche._id, title: leche.name, raw: leche });

    const entries = service.entries();
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe('Leche');
    expect(entries[0].quantity).toBe(1);
    expect(entries[0].isNew).toBeFalse();
    expect(entries[0].item).toBe(leche);
    expect(service.query()).toBe('');
  });

  it('picking the same product twice bumps the quantity instead of duplicating the row', () => {
    service.addEntry({ id: leche._id, title: leche.name, raw: leche });
    service.addEntry({ id: leche._id, title: leche.name, raw: leche });

    expect(service.entries().length).toBe(1);
    expect(service.entries()[0].quantity).toBe(2);
  });

  it('typing the name of a product already in the pantry reuses it rather than creating a new one', () => {
    service.addEntryFromQuery('leche');

    const entry = service.entries()[0];
    expect(entry.isNew).toBeFalse();
    expect(entry.item?._id).toBe('item:leche');
  });

  it('typing an unknown name creates a new entry with an inferred food type', () => {
    service.addEntryFromQuery('yogur natural');

    const entry = service.entries()[0];
    expect(entry.isNew).toBeTrue();
    expect(entry.foodType).toBeTruthy();
  });

  it('ignores an empty query', () => {
    service.addEntryFromQuery('   ');
    expect(service.entries()).toEqual([]);
  });

  it('drops the row when the quantity reaches zero', () => {
    service.addEntry({ id: leche._id, title: leche.name, raw: leche });
    const id = service.entries()[0].id;

    service.adjustEntryById(id, -1);

    expect(service.entries()).toEqual([]);
  });

  it('ignores a non-finite delta', () => {
    service.addEntry({ id: leche._id, title: leche.name, raw: leche });
    service.adjustEntryById(service.entries()[0].id, Number.NaN);

    expect(service.entries()[0].quantity).toBe(1);
  });

  it('marks a date the user typed as theirs, so a later food type change cannot replace it', () => {
    service.addEntryFromQuery('algo nuevo');
    const id = service.entries()[0].id;

    service.setEntryDate(id, '2026-03-01');

    const entry = service.entries()[0];
    expect(entry.expirationDate).toBe('2026-03-01');
    expect(entry.dateFromUser).toBeTrue();
  });

  it('clearing the date keeps it cleared and still counts as the user deciding', () => {
    service.addEntryFromQuery('algo nuevo');
    const id = service.entries()[0].id;

    service.setEntryDate(id, undefined);

    expect(service.entries()[0].expirationDate).toBeUndefined();
    expect(service.entries()[0].dateFromUser).toBeTrue();
  });

  it('marking no-expiry clears the date, and unmarking leaves it clear', () => {
    service.addEntryFromQuery('algo nuevo');
    const id = service.entries()[0].id;
    service.setEntryDate(id, '2026-03-01');

    service.setEntryNoExpiry(id);
    expect(service.entries()[0].noExpiry).toBeTrue();
    expect(service.entries()[0].expirationDate).toBeUndefined();

    service.setEntryNoExpiry(id);
    expect(service.entries()[0].noExpiry).toBeUndefined();
  });

  it('offers only non-fresh products in the autocomplete', () => {
    const titles = service.options().map(o => o.title);
    expect(titles).toContain('Leche');
    expect(titles).not.toContain('Lechuga');
  });

  it('stops offering a product already sitting in the entry list', () => {
    service.addEntry({ id: leche._id, title: leche.name, raw: leche });

    expect(service.options().map(o => o.id)).not.toContain(leche._id);
  });

  it('closing wipes the draft', () => {
    service.open();
    service.addEntryFromQuery('algo');

    service.close();

    expect(service.isOpen()).toBeFalse();
    expect(service.entries()).toEqual([]);
  });
});

describe('add sheet entry engine — frescos', () => {
  let service: PantryFreshAddModalStateService;
  const lechuga = makeItem({ _id: 'item:lechuga', name: 'Lechuga', productType: 'fresh' });

  beforeEach(() => {
    configure([lechuga, makeItem({ _id: 'item:leche', name: 'Leche' })]);
    service = TestBed.inject(PantryFreshAddModalStateService);
  });

  it('adds a catalogue pick as one entry', () => {
    service.addEntry({ id: lechuga._id, title: lechuga.name, raw: lechuga });

    expect(service.entries().length).toBe(1);
    expect(service.entries()[0].item).toBe(lechuga);
  });

  it('picking the same fresh product twice does NOT bump the quantity — a fresh product is had or not had', () => {
    service.addEntry({ id: lechuga._id, title: lechuga.name, raw: lechuga });
    service.addEntry({ id: lechuga._id, title: lechuga.name, raw: lechuga });

    expect(service.entries().length).toBe(1);
    expect(service.entries()[0].quantity).toBe(1);
  });

  it('typing a name only matches the fresh catalogue, never a despensa product with the same name', () => {
    service.addEntryFromQuery('leche');

    const entry = service.entries()[0];
    expect(entry.isNew).toBeTrue();
    expect(entry.item).toBeUndefined();
  });

  /**
   * The sheet's own hint says the date comes from the food type, so the type
   * has to be visible and correctable — otherwise a wrong guess produces a
   * wrong date the user cannot explain or fix. Despensa always worked this
   * way; frescos showed the hint without the chip until 5.3.
   */
  describe('food type', () => {
    it('gives a typed-in fresh product an inferred food type', () => {
      service.addEntryFromQuery('lechuga');

      expect(service.entries()[0].foodType).toBeTruthy();
    });

    it('takes the food type from the catalogue product when there is one', () => {
      service.addEntry({ id: lechuga._id, title: lechuga.name, raw: lechuga });

      expect(service.entries()[0].foodType).toBeTruthy();
    });

    it('re-suggests the date when the user corrects the type', () => {
      service.addEntryFromQuery('lechuga');
      const id = service.entries()[0].id;
      const before = service.entries()[0].expirationDate;

      service.setEntryFoodType(id, FoodType.NON_PERISHABLE);

      expect(service.entries()[0].foodType).toBe(FoodType.NON_PERISHABLE);
      expect(service.entries()[0].expirationDate).not.toBe(before);
    });

    it('keeps a date the user chose themselves when the type changes', () => {
      service.addEntryFromQuery('lechuga');
      const id = service.entries()[0].id;
      service.setEntryDate(id, '2027-01-01');

      service.setEntryFoodType(id, FoodType.NON_PERISHABLE);

      expect(service.entries()[0].expirationDate).toBe('2027-01-01');
    });
  });

  it('offers only fresh products in the autocomplete', () => {
    const titles = service.options().map(o => o.title);
    expect(titles).toContain('Lechuga');
    expect(titles).not.toContain('Leche');
  });

  it('drops the row when the quantity reaches zero', () => {
    service.addEntry({ id: lechuga._id, title: lechuga.name, raw: lechuga });

    service.adjustEntryById(service.entries()[0].id, -1);

    expect(service.entries()).toEqual([]);
  });

  it('marks a date the user typed as theirs', () => {
    service.addEntryFromQuery('acelgas');
    const id = service.entries()[0].id;

    service.setEntryDate(id, '2026-03-01');

    expect(service.entries()[0].expirationDate).toBe('2026-03-01');
    expect(service.entries()[0].dateFromUser).toBeTrue();
  });

  it('closing wipes the draft', () => {
    service.open();
    service.addEntryFromQuery('acelgas');

    service.close();

    expect(service.isOpen()).toBeFalse();
    expect(service.entries()).toEqual([]);
  });
});
