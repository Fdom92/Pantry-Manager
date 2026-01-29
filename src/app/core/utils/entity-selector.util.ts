import type { EntitySelectorEntry } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { normalizeKey } from './normalization.util';

export function toEntitySelectorEntries<T>(
  entries: T[],
  mapper: (entry: T) => EntitySelectorEntry,
): EntitySelectorEntry[] {
  return entries.map(mapper);
}

export function findEntryByKey<T>(
  entries: T[],
  key: string,
  keyFn: (entry: T) => string,
): T | undefined {
  return entries.find(entry => keyFn(entry) === key);
}

export function findEntryByNormalizedKey<T>(
  entries: T[],
  key: string,
  keyFn: (entry: T) => string,
): T | undefined {
  const normalized = normalizeKey(key);
  return entries.find(entry => normalizeKey(keyFn(entry)) === normalized);
}
