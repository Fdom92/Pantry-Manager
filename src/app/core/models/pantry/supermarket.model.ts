import type { BaseColoredEntity } from '../shared';

export interface Supermarket extends BaseColoredEntity {
  type: 'supermarket';
  preferred?: boolean;
}
