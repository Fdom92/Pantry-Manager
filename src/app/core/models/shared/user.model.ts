import type { BaseDoc } from './base-doc.model';

export interface User extends BaseDoc {
  readonly type: 'user';
  name: string;
  readonly householdId: string;
  role: 'admin' | 'member';
}
