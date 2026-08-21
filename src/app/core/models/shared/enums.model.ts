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
  NORMAL = 'normal'
}

export enum ExpirationStatus {
  OK = 'ok',
  NEAR_EXPIRY = 'near-expiry',
  EXPIRED = 'expired'
}

export enum FoodType {
  PROTEIN = 'protein',
  CARB = 'carb',
  VEGETABLE = 'vegetable',
  FRUIT = 'fruit',
  DAIRY = 'dairy',
  BEVERAGE = 'beverage',
  /** Oil, salt, vinegar, tinned goods — food that effectively does not spoil. */
  NON_PERISHABLE = 'non-perishable',
  HOUSEHOLD = 'household',
  OTHER = 'other'
}
