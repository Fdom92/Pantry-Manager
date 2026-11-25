import { FoodType } from '@core/models/shared/enums.model';
import { foodKindAfterEdit } from './food-kind-after-edit.domain';

describe('foodKindAfterEdit', () => {
  const prev = { name: 'Leche', foodType: FoodType.DAIRY, foodKind: 'milk' };

  it('keeps the stored kind when neither name nor type changed', () => {
    expect(foodKindAfterEdit(prev, { name: 'Leche', foodType: FoodType.DAIRY })).toBe('milk');
  });

  it('recomputes on rename with the type unchanged', () => {
    expect(foodKindAfterEdit(prev, { name: 'Yogur', foodType: FoodType.DAIRY })).toBe('yogurt');
  });

  it('falls to the generic of the new type when the name belongs to another parent', () => {
    expect(foodKindAfterEdit(prev, { name: 'Pan', foodType: FoodType.DAIRY })).toBe('generic-dairy');
    expect(foodKindAfterEdit(prev, { name: 'Leche', foodType: FoodType.BEVERAGE })).toBe('generic-beverage');
  });

  it('uses the name alone when the type is cleared', () => {
    expect(foodKindAfterEdit(prev, { name: 'Yogur', foodType: undefined })).toBe('yogurt');
  });
});
