// TYPES
export type UpToDateReason = 'stale-update' | 'missing-info';
export type QuickEditPatch = {
  categoryId: string;
  locationId: string;
  expiryDateInput: string;
  hasExpiry: boolean;
  needsCategory: boolean;
  needsLocation: boolean;
  needsExpiry: boolean;
};
