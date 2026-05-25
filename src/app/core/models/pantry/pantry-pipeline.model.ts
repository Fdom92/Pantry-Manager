export interface PantryFilterState {
  lowStock: boolean;
  expired: boolean;
  expiring: boolean;
  recentlyAdded: boolean;
  normalOnly: boolean;
  review: boolean;
  pendientes: boolean;
}

export const DEFAULT_PANTRY_FILTERS: PantryFilterState = {
  lowStock: false,
  expired: false,
  expiring: false,
  recentlyAdded: false,
  normalOnly: false,
  review: false,
  pendientes: false,
};
