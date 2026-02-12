import type { BaseDoc } from './base-doc.model';
import type { ColorValue } from './color.model';

/**
 * Base interface for entities that have a name
 */
export interface BaseNamedEntity extends BaseDoc {
  name: string;
}

/**
 * Base interface for entities that have a name and color
 */
export interface BaseColoredEntity extends BaseNamedEntity {
  color?: ColorValue;
}

/**
 * Base interface for entities that belong to a household
 */
export interface BaseHouseholdEntity extends BaseDoc {
  householdId: string;
}
