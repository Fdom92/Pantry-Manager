import type { FoodType } from '@core/models/shared/enums.model';
import { resolveFoodClass } from './food-class-resolution.domain';

/** A rename or a type change invalidates the stored class; otherwise it is kept. */
export function foodKindAfterEdit(
  prev: { name: string; foodType?: FoodType; foodKind?: string },
  next: { name: string; foodType?: FoodType },
): string | undefined {
  if (prev.name === next.name && prev.foodType === next.foodType) return prev.foodKind;
  return resolveFoodClass(next.name, next.foodType)?.key;
}
