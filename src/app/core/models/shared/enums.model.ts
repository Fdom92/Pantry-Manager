export enum LocationType {
  PANTRY = 'pantry',
  KITCHEN = 'kitchen',
  FRIDGE = 'fridge',
  FREEZER = 'freezer',
  OTHER = 'other'
}

export enum StockStatus {
  EMPTY = 'empty',
  LOW = 'low',
  NORMAL = 'normal',
  FULL = 'full'
}

export enum ExpirationStatus {
  OK = 'ok',
  NEAR_EXPIRY = 'near-expiry',
  EXPIRED = 'expired'
}
