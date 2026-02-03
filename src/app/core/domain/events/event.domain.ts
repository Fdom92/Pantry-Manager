import type { EventQuantities, QuantityInput } from '@core/models/events';

function normalizeNumber(value?: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

export function buildEventQuantities(input: QuantityInput): EventQuantities {
  const quantity = Number.isFinite(input.quantity) ? (input.quantity as number) : 0;
  const previousQuantity = normalizeNumber(input.previousQuantity);
  const nextQuantity = normalizeNumber(input.nextQuantity);
  let deltaQuantity = normalizeNumber(input.deltaQuantity);

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
