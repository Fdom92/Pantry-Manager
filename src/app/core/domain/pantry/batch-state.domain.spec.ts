import type { ItemBatch, PantryItem } from '@core/models/pantry';
import { FoodType } from '@core/models/shared/enums.model';
import { computeTodaySuggestion } from '@core/domain/dashboard';
import { selectUnloggedExpiredBatches } from '@core/domain/events';
import { filterExpiredItems, filterNearExpiryItems } from '@core/domain/notifications';
import { dueBatchIndex, findFreezerLocation, findFridgeLocation, freezeOne, frozenQuantity, moveOne, openedShelfDays, openOne, THAW_MAX_DAYS, thawOne } from './batch-state.domain';
import { hasMissingExpiry } from './pantry-filtering.domain';
import { getItemStatusState } from './pantry-status.domain';

const NOW = new Date('2026-11-09T10:00:00');
let n = 0;
const newId = () => `new-${++n}`;
const lot = (over: Partial<ItemBatch>): ItemBatch => ({ batchId: 'b', quantity: 1, ...over });
const plusDays = (days: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('dueBatchIndex', () => {
  it('prefers an opened lot, then the earliest date, dateless last', () => {
    const lots = [
      lot({ batchId: 'late', expirationDate: '2027-01-01' }),
      lot({ batchId: 'none' }),
      lot({ batchId: 'soon', expirationDate: '2026-12-01' }),
    ];
    expect(lots[dueBatchIndex(lots, () => true)].batchId).toBe('soon');
    const withOpen = [...lots, lot({ batchId: 'open', opened: true, expirationDate: '2027-06-01' })];
    expect(withOpen[dueBatchIndex(withOpen, () => true)].batchId).toBe('open');
  });

  it('skips empty lots and returns -1 when nothing qualifies', () => {
    expect(dueBatchIndex([lot({ quantity: 0 })], () => true)).toBe(-1);
  });
});

describe('openOne', () => {
  it('splits one unit off the due lot and leaves the rest sealed', () => {
    const result = openOne([lot({ batchId: 'maiz', quantity: 5, expirationDate: '2029-07-01' })], FoodType.VEGETABLE, NOW, newId)!;
    expect(result.batches.length).toBe(2);
    expect(result.batches[0]).toEqual(jasmine.objectContaining({ batchId: 'maiz', quantity: 4 }));
    expect(result.batches[0].opened).toBeFalsy();
    expect(result.batches[result.index]).toEqual(jasmine.objectContaining({ quantity: 1, opened: true }));
  });

  it('opens a single-unit lot in place, keeping its id', () => {
    const result = openOne([lot({ batchId: 'solo', quantity: 1 })], FoodType.OTHER, NOW, newId)!;
    expect(result.batches.length).toBe(1);
    expect(result.batches[0].batchId).toBe('solo');
    expect(result.batches[0].opened).toBeTrue();
  });

  it('shortens the date by the opened shelf life, keeps the printed one and moves it to the fridge', () => {
    const days = openedShelfDays(FoodType.DAIRY);
    expect(days).withContext('dairy must shorten once opened').not.toBeNull();
    const result = openOne([lot({ expirationDate: '2027-02-04' })], FoodType.DAIRY, NOW, newId, 'Nevera')!;
    const opened = result.batches[result.index];
    expect(opened.expirationDate).toBe(plusDays(days as number));
    expect(opened.printedExpirationDate).toBe('2027-02-04');
    expect(opened.locationId).toBe('Nevera');
  });

  it('never pushes the date later than the pack', () => {
    const result = openOne([lot({ expirationDate: plusDays(1) })], FoodType.DAIRY, NOW, newId)!;
    expect(result.batches[result.index].expirationDate).toBe(plusDays(1));
  });

  it('returns null when everything is already open or frozen', () => {
    expect(openOne([lot({ opened: true }), lot({ frozenAt: '2026-10-01' })], FoodType.DAIRY, NOW, newId)).toBeNull();
  });
});

describe('moveOne', () => {
  it('moves one unit of the due lot and keeps its date', () => {
    const result = moveOne([lot({ quantity: 18, expirationDate: '2027-02-04', locationId: 'Sótano' })], 'Cocina', newId)!;
    expect(result.batches[0].quantity).toBe(17);
    expect(result.batches[result.index]).toEqual(jasmine.objectContaining({ quantity: 1, locationId: 'Cocina', expirationDate: '2027-02-04' }));
  });

  it('ignores lots already in the target place', () => {
    expect(moveOne([lot({ locationId: 'Cocina' })], 'Cocina', newId)).toBeNull();
  });
});

describe('freezeOne and thawOne', () => {
  it('freezing keeps the days left and removes the date, so nothing expires', () => {
    const result = freezeOne([lot({ expirationDate: plusDays(2), quantity: 2 })], NOW, newId, 'Congelador')!;
    const frozen = result.batches[result.index];
    expect(frozen.expirationDate).toBeUndefined();
    expect(frozen.frozenDaysLeft).toBe(2);
    expect(frozen.frozenAt).toBe(NOW.toISOString());
    expect(frozen.locationId).toBe('Congelador');
    expect(result.batches[0].quantity).toBe(1);
  });

  it('an already expired lot freezes with zero days left', () => {
    expect(freezeOne([lot({ expirationDate: '2026-11-01' })], NOW, newId)!.batches[0].frozenDaysLeft).toBe(0);
  });

  it('thawing dates it today plus the days left, at most THAW_MAX_DAYS and at least one', () => {
    const many = thawOne([lot({ frozenAt: '2026-10-01', frozenDaysLeft: 20, locationId: 'Congelador' })], NOW, newId, 'Nevera')!.batches[0];
    expect(many.locationId).toBe('Nevera');
    expect(many.expirationDate).toBe(plusDays(THAW_MAX_DAYS));
    expect(many.frozenAt).toBeUndefined();
    expect(thawOne([lot({ frozenAt: '2026-10-01', frozenDaysLeft: 0 })], NOW, newId)!.batches[0].expirationDate).toBe(plusDays(1));
  });

  it('thaws the lot frozen longest ago; a lot frozen without a date stays dateless', () => {
    const lots = [lot({ batchId: 'new', frozenAt: '2026-11-01' }), lot({ batchId: 'old', frozenAt: '2026-09-01' })];
    const result = thawOne(lots, NOW, newId)!;
    expect(result.batches[result.index].batchId).toBe('old');
    expect(result.batches[result.index].expirationDate).toBeUndefined();
  });
});

describe('a frozen lot across the app', () => {
  // Frozen yesterday's chicken: its fresh date has passed, but it is in the freezer.
  const chicken = (): PantryItem => {
    const frozen = freezeOne([lot({ batchId: 'c', quantity: 1, expirationDate: '2026-11-08' })], NOW, newId)!;
    return {
      _id: 'item:pollo', type: 'item', householdId: 'h', name: 'Pechuga de pollo', categoryId: '',
      productType: 'pantry', foodType: FoodType.PROTEIN, batches: frozen.batches,
    } as PantryItem;
  };

  it('is neither expired nor near expiry', () => {
    expect(getItemStatusState(chicken(), NOW, 15)).toBe('normal');
  });

  it('never goes to waste', () => {
    expect(selectUnloggedExpiredBatches([chicken()], [], NOW)).toEqual([]);
  });

  it('never triggers an expiry notification', () => {
    expect(filterExpiredItems([chicken()], NOW)).toEqual([]);
    expect(filterNearExpiryItems([chicken()], NOW, 15)).toEqual([]);
  });

  it('is not suggested for today', () => {
    expect(computeTodaySuggestion([], [chicken()], undefined, NOW.getTime())).toBeNull();
  });

  it('is not "pending": its date is paused, not missing', () => {
    expect(hasMissingExpiry(chicken())).toBeFalse();
  });

  it('counts its frozen units', () => {
    expect(frozenQuantity(chicken())).toBe(1);
  });
});

describe('findFridgeLocation / findFreezerLocation', () => {
  it('recognises the user\'s own names for them', () => {
    const mine = ['Sótano', 'Cocina', 'Nevera', 'Congelador'];
    expect(findFridgeLocation(mine)).toBe('Nevera');
    expect(findFreezerLocation(mine)).toBe('Congelador');
    expect(findFridgeLocation(['Pantry', 'Fridge'])).toBe('Fridge');
    expect(findFreezerLocation(['Küche', 'Gefrierschrank'])).toBe('Gefrierschrank');
  });

  it('returns undefined when there is none', () => {
    expect(findFridgeLocation(['Sótano', 'Cocina'])).toBeUndefined();
  });
});
