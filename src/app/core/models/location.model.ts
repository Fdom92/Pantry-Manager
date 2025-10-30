import { BaseDoc } from './base-doc.model';
import { LocationType } from './enums.model';

export interface Location extends BaseDoc {
  type: 'location';
  name: string;
  kind: LocationType;
}
