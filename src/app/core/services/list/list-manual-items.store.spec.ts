import { TestBed } from '@angular/core/testing';
import type { ManualItem } from '@core/models/list';
import { AnalyticsService } from '../analytics/analytics.service';
import { LocalStorageService } from '../shared/local-storage.service';
import { ListManualItemsStore } from './list-manual-items.store';

/**
 * The shopping list's hand-written items used to expire after 7 days, pruned
 * silently on launch. 5.4 removed that: nothing on the list disappears unless
 * the user buys it or removes it.
 */
describe('ListManualItemsStore — hand-written items persist', () => {
  const DAY = 24 * 60 * 60 * 1000;

  function setup(stored: ManualItem[]) {
    const setItems = jasmine.createSpy('setItems');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LocalStorageService,
          useValue: { manualList: { getItems: () => stored, setItems, clear: jasmine.createSpy('clear') } },
        },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
      ],
    });
    return { store: TestBed.inject(ListManualItemsStore), setItems };
  }

  it('keeps an item written weeks ago', () => {
    const old: ManualItem = { id: 'm1', name: 'Bombillas', createdAt: Date.now() - 30 * DAY };
    const { store } = setup([old]);
    expect(store.manualItems()).toEqual([old]);
  });

  it('keeps legacy items that carry no timestamp', () => {
    const legacy: ManualItem = { id: 'm2', name: 'Papel de cocina' };
    const { store } = setup([legacy]);
    expect(store.manualItems()).toEqual([legacy]);
  });

  it('does not rewrite storage just by starting up', () => {
    const { setItems } = setup([{ id: 'm3', name: 'Pilas', createdAt: Date.now() - 90 * DAY }]);
    expect(setItems).not.toHaveBeenCalled();
  });

  it('still removes an item once the user marks it bought', () => {
    const { store } = setup([{ id: 'm4', name: 'Sal', createdAt: Date.now() - 10 * DAY }]);
    store.markManualAsBought('m4');
    expect(store.manualItems()).toEqual([]);
  });
});
