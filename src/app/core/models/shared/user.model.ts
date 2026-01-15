import type { BaseDoc } from './base-doc.model';

export interface User extends BaseDoc {
  type: 'user';
  name: string;
  email?: string;
  householdId: string;
  role: 'admin' | 'member';
}
