export interface PantryFilterState {
  lowStock: boolean;
  expired: boolean;
  expiring: boolean;
  recentlyAdded: boolean;
  normalOnly: boolean;
  basic: boolean;
}

export const DEFAULT_PANTRY_FILTERS: PantryFilterState = {
  lowStock: false,
  expired: false,
  expiring: false,
  recentlyAdded: false,
  normalOnly: false,
  basic: false,
};
