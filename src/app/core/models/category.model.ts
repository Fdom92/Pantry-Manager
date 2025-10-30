import { BaseDoc } from './base-doc.model';

export interface Category extends BaseDoc {
  type: 'category';
  name: string;
  icon?: string;
  color?: string;
}
