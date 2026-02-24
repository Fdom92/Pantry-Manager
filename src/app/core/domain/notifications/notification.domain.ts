import type { PantryItem } from '@core/models/pantry';
import { classifyExpiry } from '@core/domain/pantry/pantry-status.domain';
import { sumQuantities } from '@core/domain/pantry/pantry-batch.domain';
import { toNumberOrZero } from '@core/utils/formatting.util';

/**
 * Returns a Date for the next occurrence of hour:00 after now.
 * If the hour has already passed today, schedules for tomorrow.
 */
export function buildNextTriggerDate(now: Date, hour: number): Date {
  const trigger = new Date(now);
  trigger.setHours(hour, 0, 0, 0);
  if (trigger <= now) {
    trigger.setDate(trigger.getDate() + 1);
  }
  return trigger;
}

export function filterExpiredItems(items: PantryItem[], now: Date): PantryItem[] {
  return items.filter(item =>
    (item.batches ?? []).some(
      batch => batch.expirationDate && classifyExpiry(batch.expirationDate, now, 0) === 'expired'
    )
  );
}

/**
 * Items with at least one batch near expiry (within windowDays).
 * Items that are fully expired are excluded — they belong to filterExpiredItems.
 */
export function filterNearExpiryItems(
  items: PantryItem[],
  now: Date,
  windowDays: number
): PantryItem[] {
  return items.filter(item => {
    const batches = item.batches ?? [];
    const hasExpired = batches.some(
      b => b.expirationDate && classifyExpiry(b.expirationDate, now, 0) === 'expired'
    );
    if (hasExpired) return false;
    return batches.some(
      b => b.expirationDate && classifyExpiry(b.expirationDate, now, windowDays) === 'near-expiry'
    );
  });
}

export function filterLowStockItems(items: PantryItem[]): PantryItem[] {
  return items.filter(item => {
    if (!item.isBasic) return false;
    const total = sumQuantities(item.batches);
    const min = toNumberOrZero(item.minThreshold);
    return min > 0 && total < min;
  });
}

export function filterShoppingListItems(items: PantryItem[]): PantryItem[] {
  return items.filter(item => {
    if (!item.isBasic) return false;
    const total = sumQuantities(item.batches);
    const min = toNumberOrZero(item.minThreshold);
    return total <= 0 || (min > 0 && total < min);
  });
}
