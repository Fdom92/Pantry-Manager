export type QuantityInput = {
  quantity?: number;
  deltaQuantity?: number;
  previousQuantity?: number;
  nextQuantity?: number;
};

export type EventQuantities = {
  quantity: number;
  deltaQuantity?: number;
  previousQuantity?: number;
  nextQuantity?: number;
};
