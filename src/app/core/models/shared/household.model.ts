import type { BaseDoc } from './base-doc.model';

export interface Household extends BaseDoc {
  readonly type: 'household';
  name: string;
}
