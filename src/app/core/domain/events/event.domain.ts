import type { EventQuantities, QuantityInput } from '@core/models/events';

export function buildEventQuantities(input: QuantityInput): EventQuantities {
  const quantity = Number.isFinite(input.quantity) ? (input.quantity as number) : 0;
  const previousQuantity = Number.isFinite(input.previousQuantity) ? input.previousQuantity : undefined;
  const nextQuantity = Number.isFinite(input.nextQuantity) ? input.nextQuantity : undefined;
  let deltaQuantity = Number.isFinite(input.deltaQuantity) ? input.deltaQuantity : undefined;

  if (deltaQuantity == null && previousQuantity != null && nextQuantity != null) {
    deltaQuantity = nextQuantity - previousQuantity;
  }

  return {
    quantity,
    deltaQuantity,
    previousQuantity,
    nextQuantity,
  };
}
