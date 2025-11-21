export type PantrySortMode = 'name' | 'quantity' | 'expiration';

export interface PantryFilterState {
  lowStock: boolean;
  expired: boolean;
  expiring: boolean;
  normalOnly: boolean;
  basic: boolean;
  categoryId: string | null;
  locationId: string | null;
}

export const DEFAULT_PANTRY_FILTERS: PantryFilterState = {
  lowStock: false,
  expired: false,
  expiring: false,
  normalOnly: false,
  basic: false,
  categoryId: null,
  locationId: null,
};
