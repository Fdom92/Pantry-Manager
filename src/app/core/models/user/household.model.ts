import { BaseDoc } from "../shared";

export interface Household extends BaseDoc {
  type: 'household';
  name: string;
  members: string[];
  defaultSupermarketId?: string;
}
