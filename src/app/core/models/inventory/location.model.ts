import { BaseDoc, LocationType } from "../shared";

export interface Location extends BaseDoc {
  type: 'location';
  name: string;
  kind: LocationType;
}
