import { ShoppingReason } from '@core/models/list';
import { suggestionDetail } from './suggestion-detail.domain';

describe('suggestionDetail', () => {
  it('tells a fresh product running low to be restocked soon, no amount', () => {
    expect(suggestionDetail({ reason: ShoppingReason.FRESH_LOW, suggestedQuantity: 0 })).toEqual({
      key: 'shopping.suggestions.freshLow',
    });
  });

  it('tells an empty fresh product it is out of stock', () => {
    expect(suggestionDetail({ reason: ShoppingReason.FRESH_EMPTY, suggestedQuantity: 0 })).toEqual({
      key: 'shopping.reasons.empty',
    });
  });

  it('gives a non-fresh restock its amount when there is a threshold and a quantity to buy', () => {
    expect(
      suggestionDetail({ reason: ShoppingReason.BELOW_MIN, suggestedQuantity: 3, minThreshold: 2 }),
    ).toEqual({
      key: 'shopping.suggestions.restock',
      params: { amount: 3 },
    });
  });

  it('never shows a zero amount', () => {
    expect(
      suggestionDetail({ reason: ShoppingReason.BELOW_MIN, suggestedQuantity: 0, minThreshold: 2 }),
    ).toBeNull();
  });

  it('shows nothing when there is no threshold to speak of', () => {
    expect(suggestionDetail({ reason: ShoppingReason.MANUAL, suggestedQuantity: 1 })).toBeNull();
  });
});
