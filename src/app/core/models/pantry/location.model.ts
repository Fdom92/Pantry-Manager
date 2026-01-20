import type { BaseDoc } from '../shared/base-doc.model';
import type { LocationType } from '../shared/enums.model';

export interface Location extends BaseDoc {
  type: 'location';
  name: string;
  kind: LocationType;
}
