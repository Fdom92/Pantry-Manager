import type { BaseDoc } from './base-doc.model';

export interface Household extends BaseDoc {
  type: 'household';
  name: string;
  members: string[];
  defaultSupermarketId?: string;
}
