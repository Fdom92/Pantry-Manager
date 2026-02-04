// TYPES
export type UpToDateReason = 'stale-update' | 'missing-info';
export type QuickEditPatch = {
  categoryId: string;
  expiryDateInput: string;
  hasExpiry: boolean;
  needsCategory: boolean;
  needsExpiry: boolean;
};
