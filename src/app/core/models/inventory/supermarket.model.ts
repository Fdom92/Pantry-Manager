import { BaseDoc } from "../shared";

export interface Supermarket extends BaseDoc {
  type: 'supermarket';
  name: string;
  color?: string;
  preferred?: boolean;
}
