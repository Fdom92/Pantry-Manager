import { BaseDoc } from "../shared";

export interface User extends BaseDoc {
  type: 'user';
  name: string;
  email?: string;
  householdId: string;
  role: 'admin' | 'member';
}
