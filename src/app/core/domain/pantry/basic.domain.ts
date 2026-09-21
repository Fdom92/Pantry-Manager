import type { PantryItem } from '@core/models/pantry';

/**
 * "Always keep at home" on or off. Turning it off also clears the minimum —
 * a minimum only means something for a product the list should restock.
 * `restoreMinThreshold` is for undo: put back the minimum it had before.
 */
export function setBasic(
  item: PantryItem,
  isBasic: boolean,
  nowIso: string,
  restoreMinThreshold?: number,
): PantryItem {
  const updated: PantryItem = { ...item, isBasic, updatedAt: nowIso };
  if (!isBasic) {
    updated.minThreshold = undefined;
  } else if (restoreMinThreshold !== undefined) {
    updated.minThreshold = restoreMinThreshold;
  }
  return updated;
}
