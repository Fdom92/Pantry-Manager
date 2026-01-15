import { BaseDoc } from "../shared";

export interface Category extends BaseDoc {
  type: 'category';
  name: string;
  icon?: string;
  color?: string;
}
