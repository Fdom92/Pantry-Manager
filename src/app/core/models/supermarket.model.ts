import { BaseDoc } from './base-doc.model';

export interface Supermarket extends BaseDoc {
  type: 'supermarket';
  name: string;
  color?: string;
  preferred?: boolean;
}
