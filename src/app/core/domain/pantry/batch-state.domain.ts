import type { BatchIdGenerator, ItemBatch, PantryItem } from '@core/models/pantry';
import { FoodType } from '@core/models/shared/enums.model';
import { toLocalYmd } from '@core/utils/date.util';
import { toNumberOrZero } from '@core/utils/formatting.util';
import { normalizeSearchQuery } from '@core/utils/normalization.util';

/**
 * One-tap actions on "the lot that is due": opening, moving, freezing and
 * thawing act on one unit of it, never on a lot the user did not pick.
 * Moving or opening is not consuming: stock only drops on use or discard.
 */

/** Longest a lot keeps once thawed, whatever it had left when frozen. */
export const THAW_MAX_DAYS = 3;

const DAY_MS = 86_400_000;

/**
 * Days a product keeps once opened, by food type. null = opening does not
 * shorten its date (rice, salt, bin bags).
 */
// shortcut: one value per type (labels mostly say 3-5 days), review with the shelf-life table before 5.7 ships.
export function openedShelfDays(foodType: FoodType | undefined): number | null {
  switch (foodType) {
    case FoodType.PROTEIN:
    case FoodType.FRUIT:
      return 3;
    case FoodType.DAIRY:
    case FoodType.VEGETABLE:
      return 4;
    case FoodType.BEVERAGE:
    case FoodType.OTHER:
      return 5;
    default:
      // CARB, NON_PERISHABLE, HOUSEHOLD, unknown: opening does not shorten them.
      return null;
  }
}

/** Food types that should go to the fridge once opened. */
export function needsFridgeWhenOpen(foodType: FoodType | undefined): boolean {
  return openedShelfDays(foodType) !== null;
}

function expiryTime(batch: ItemBatch): number {
  if (!batch.expirationDate) return Number.POSITIVE_INFINITY;
  const time = Date.parse(batch.expirationDate);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * Index of the lot a one-tap action applies to, among those `eligible`:
 * opened first (finish what is open), then the earliest date, dateless last.
 * -1 when none qualifies.
 */
export function dueBatchIndex(batches: readonly ItemBatch[], eligible: (batch: ItemBatch) => boolean): number {
  let best = -1;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (toNumberOrZero(batch.quantity) <= 0 || !eligible(batch)) continue;
    if (best === -1) { best = i; continue; }
    const current = batches[best];
    if (Boolean(batch.opened) !== Boolean(current.opened)) {
      if (batch.opened) best = i;
      continue;
    }
    if (expiryTime(batch) < expiryTime(current)) best = i;
  }
  return best;
}

/**
 * Splits one unit off lot `index` and applies `change` to it. A one-unit lot is
 * changed in place, keeping its id. Returns the new list and the changed lot's index.
 */
function changeOneUnit(
  batches: readonly ItemBatch[],
  index: number,
  change: (unit: ItemBatch) => ItemBatch,
  newId: BatchIdGenerator,
): { batches: ItemBatch[]; index: number } {
  const source = batches[index];
  const quantity = toNumberOrZero(source.quantity);
  if (quantity <= 1) {
    const next = batches.map(b => ({ ...b }));
    next[index] = change({ ...source });
    return { batches: next, index };
  }
  const next = batches.map(b => ({ ...b }));
  next[index] = { ...source, quantity: quantity - 1 };
  next.push(change({ ...source, batchId: newId(), quantity: 1 }));
  return { batches: next, index: next.length - 1 };
}

const isSealed = (b: ItemBatch) => !b.opened && !b.frozenAt;

/** Opens one unit of the due sealed lot. null when nothing sealed is left. */
export function openOne(
  batches: readonly ItemBatch[],
  foodType: FoodType | undefined,
  now: Date,
  newId: BatchIdGenerator,
  fridgeLocationId?: string,
): { batches: ItemBatch[]; index: number } | null {
  const index = dueBatchIndex(batches, isSealed);
  if (index === -1) return null;
  const days = openedShelfDays(foodType);
  return changeOneUnit(batches, index, unit => {
    const opened: ItemBatch = { ...unit, opened: true, openedAt: now.toISOString() };
    if (days !== null) {
      const limit = new Date(now);
      limit.setDate(limit.getDate() + days);
      const shortened = toLocalYmd(limit);
      opened.printedExpirationDate = unit.expirationDate;
      // Never later than the pack says.
      if (!unit.expirationDate || shortened < unit.expirationDate.slice(0, 10)) {
        opened.expirationDate = shortened;
        opened.noExpiry = undefined;
      }
      if (fridgeLocationId) opened.locationId = fridgeLocationId;
    }
    return opened;
  }, newId);
}

/** Moves one unit of the due lot to `locationId`. null when there is no stock. */
export function moveOne(
  batches: readonly ItemBatch[],
  locationId: string,
  newId: BatchIdGenerator,
): { batches: ItemBatch[]; index: number } | null {
  const index = dueBatchIndex(batches, b => b.locationId !== locationId);
  if (index === -1) return null;
  return changeOneUnit(batches, index, unit => ({ ...unit, locationId }), newId);
}

/** Freezes one unit of the due unfrozen lot: keeps its days left and drops its date. */
export function freezeOne(
  batches: readonly ItemBatch[],
  now: Date,
  newId: BatchIdGenerator,
  freezerLocationId?: string,
): { batches: ItemBatch[]; index: number } | null {
  const index = dueBatchIndex(batches, b => !b.frozenAt);
  if (index === -1) return null;
  return changeOneUnit(batches, index, unit => {
    const frozen: ItemBatch = { ...unit, frozenAt: now.toISOString(), expirationDate: undefined };
    const time = expiryTime(unit);
    if (Number.isFinite(time)) {
      frozen.frozenDaysLeft = Math.max(0, Math.ceil((time - now.getTime()) / DAY_MS));
    }
    if (freezerLocationId) frozen.locationId = freezerLocationId;
    return frozen;
  }, newId);
}

/** Thaws one unit of the frozen lot frozen longest ago: date = today + days left, max THAW_MAX_DAYS. */
export function thawOne(
  batches: readonly ItemBatch[],
  now: Date,
  newId: BatchIdGenerator,
  fridgeLocationId?: string,
): { batches: ItemBatch[]; index: number } | null {
  let index = -1;
  batches.forEach((b, i) => {
    if (!b.frozenAt || toNumberOrZero(b.quantity) <= 0) return;
    if (index === -1 || b.frozenAt < (batches[index].frozenAt as string)) index = i;
  });
  if (index === -1) return null;
  return changeOneUnit(batches, index, unit => {
    const { frozenAt: _at, frozenDaysLeft, ...rest } = unit;
    const thawed: ItemBatch = { ...rest, ...(fridgeLocationId ? { locationId: fridgeLocationId } : {}) };
    if (frozenDaysLeft !== undefined) {
      const date = new Date(now);
      date.setDate(date.getDate() + Math.min(THAW_MAX_DAYS, Math.max(1, frozenDaysLeft)));
      thawed.expirationDate = toLocalYmd(date);
    }
    return thawed;
  }, newId);
}

/** Units of the product sitting in the freezer. */
export function frozenQuantity(item: PantryItem): number {
  return (item.batches ?? []).reduce((sum, b) => sum + (b.frozenAt ? toNumberOrZero(b.quantity) : 0), 0);
}

// Locations are free-text names the user typed, in any of the six languages.
const FRIDGE_WORDS = ['nevera', 'frigo', 'frigorifico', 'fridge', 'refrigerator', 'kuhlschrank', 'refrigerateur', 'frigorifero', 'geladeira', 'frigorifico'];
const FREEZER_WORDS = ['congelador', 'congelado', 'freezer', 'gefrier', 'congelateur', 'congelatore', 'arca'];

function findLocation(locations: readonly string[], words: readonly string[]): string | undefined {
  return locations.find(name => {
    const normalized = normalizeSearchQuery(name);
    return words.some(word => normalized.includes(word));
  });
}

/** The user's fridge among their locations, recognised by name. */
export function findFridgeLocation(locations: readonly string[]): string | undefined {
  return findLocation(locations, FRIDGE_WORDS);
}

/** The user's freezer among their locations, recognised by name. */
export function findFreezerLocation(locations: readonly string[]): string | undefined {
  return findLocation(locations, FREEZER_WORDS);
}
