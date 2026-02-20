import type { BaseColoredEntity } from '../shared';

export interface Category extends BaseColoredEntity {
  readonly type: 'category';
  icon?: string;
}
