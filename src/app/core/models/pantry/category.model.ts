import type { BaseColoredEntity } from '../shared';

export interface Category extends BaseColoredEntity {
  type: 'category';
  icon?: string;
}
