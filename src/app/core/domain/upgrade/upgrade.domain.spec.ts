import { PACKAGE_TYPE, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import {
  isEnvironmentalStoreError,
  buildPlanMeta,
  buildTrialMeta,
  computeAnnualSavingsPercent,
  getPackageTypeTranslationKey,
  normalizePackages,
  pickPreferredPackage,
  sortPackagesByPreference,
} from './upgrade.domain';

/**
 * This is the paywall the user reads before paying, so a wrong number here is a
 * claim made to a customer, not a rendering glitch.
 */

const pkg = (over: Partial<PurchasesPackage> & { identifier: string }): PurchasesPackage =>
  ({ packageType: PACKAGE_TYPE.MONTHLY, product: {}, ...over }) as PurchasesPackage;

describe('computeAnnualSavingsPercent', () => {
  it('works out the saving against twelve months of the monthly plan', () => {
    // 4.99 x 12 = 59.88 against 49.99 is a saving of 16.5%, shown as 17.
    expect(computeAnnualSavingsPercent({ monthlyPrice: 4.99, annualPrice: 49.99 })).toBe(17);
  });

  it('claims nothing when the annual plan is not actually cheaper', () => {
    expect(computeAnnualSavingsPercent({ monthlyPrice: 4.99, annualPrice: 59.88 })).toBeNull();
    expect(computeAnnualSavingsPercent({ monthlyPrice: 4.99, annualPrice: 70 })).toBeNull();
  });

  it('claims nothing when a price is missing or nonsensical', () => {
    expect(computeAnnualSavingsPercent({ monthlyPrice: null, annualPrice: 49.99 })).toBeNull();
    expect(computeAnnualSavingsPercent({ monthlyPrice: 4.99, annualPrice: undefined })).toBeNull();
    expect(computeAnnualSavingsPercent({ monthlyPrice: 0, annualPrice: 49.99 })).toBeNull();
    expect(computeAnnualSavingsPercent({ monthlyPrice: -1, annualPrice: 49.99 })).toBeNull();
    expect(computeAnnualSavingsPercent({ monthlyPrice: NaN, annualPrice: 49.99 })).toBeNull();
    expect(computeAnnualSavingsPercent({ monthlyPrice: Infinity, annualPrice: 49.99 })).toBeNull();
  });

  it('never advertises a saving that rounds away to nothing', () => {
    expect(computeAnnualSavingsPercent({ monthlyPrice: 5, annualPrice: 59.9 })).toBeNull();
  });
});

describe('buildTrialMeta', () => {
  it('calls a zero-priced intro a free trial', () => {
    const meta = buildTrialMeta(pkg({ identifier: 'p', product: { introPrice: { price: 0 } } } as never));
    expect(meta).toEqual({ kind: 'free' });
  });

  it('calls a reduced intro a discount and keeps its price and cycles', () => {
    const meta = buildTrialMeta(pkg({
      identifier: 'p',
      product: { introPrice: { price: 1.99, priceString: '1,99 €', cycles: 3 } },
    } as never));
    expect(meta).toEqual({ kind: 'discount', price: '1,99 €', cycles: 3 });
  });

  it('defaults a discount to a single cycle when none is given', () => {
    const meta = buildTrialMeta(pkg({
      identifier: 'p', product: { introPrice: { price: 1.99, priceString: '1,99 €' } },
    } as never));
    expect(meta).toEqual({ kind: 'discount', price: '1,99 €', cycles: 1 });
  });

  it('reports no trial when the product has none', () => {
    expect(buildTrialMeta(pkg({ identifier: 'p' }))).toBeNull();
  });
});

describe('buildPlanMeta', () => {
  const annual = pkg({ identifier: 'annual', packageType: PACKAGE_TYPE.ANNUAL });
  const monthly = pkg({ identifier: 'monthly', packageType: PACKAGE_TYPE.MONTHLY });
  const base = { benefitKeys: ['a'], monthlyPrice: 4.99, annualPrice: 49.99 };

  it('highlights the annual plan and gives it the value badge', () => {
    const meta = buildPlanMeta({ ...base, pkg: annual });
    expect(meta.highlight).toBe(true);
    expect(meta.badgeKey).toBe('upgrade.plans.badgeBestValue');
    expect(meta.periodKey).toBe('upgrade.plans.perYear');
  });

  it('leaves the monthly plan unbadged and never claims a saving on it', () => {
    const meta = buildPlanMeta({ ...base, pkg: monthly });
    expect(meta.highlight).toBe(false);
    expect(meta.badgeKey).toBeUndefined();
    expect(meta.savingsPercent).toBeNull();
  });

  it('offers to start the trial when there is one, and to select when there is not', () => {
    const withTrial = pkg({
      identifier: 'annual', packageType: PACKAGE_TYPE.ANNUAL,
      product: { introPrice: { price: 0 } },
    } as never);
    expect(buildPlanMeta({ ...base, pkg: withTrial }).ctaKey).toBe('upgrade.actions.startTrial');
    expect(buildPlanMeta({ ...base, pkg: annual }).ctaKey).toBe('upgrade.actions.select');
  });

  it('falls back to the identifier rather than showing an empty plan', () => {
    const meta = buildPlanMeta({ ...base, pkg: annual });
    expect(meta.subtitle).toBe('annual');
    expect(meta.price).toBe('-');
  });

  it('copies the benefit list instead of sharing it', () => {
    const benefitKeys = ['a', 'b'];
    const meta = buildPlanMeta({ ...base, pkg: annual, benefitKeys });
    benefitKeys.push('c');
    expect(meta.benefitsKeys.length).toBe(2);
  });
});

describe('getPackageTypeTranslationKey', () => {
  it('names the two plans that exist and has a fallback for anything else', () => {
    expect(getPackageTypeTranslationKey(PACKAGE_TYPE.MONTHLY)).toBe('upgrade.plans.monthly');
    expect(getPackageTypeTranslationKey(PACKAGE_TYPE.ANNUAL)).toBe('upgrade.plans.annual');
    expect(getPackageTypeTranslationKey(PACKAGE_TYPE.LIFETIME)).toBe('upgrade.plans.other');
  });
});

describe('normalizePackages and ordering', () => {
  const preferred = [PACKAGE_TYPE.ANNUAL, PACKAGE_TYPE.MONTHLY];

  it('drops a package the store returned twice', () => {
    const list = normalizePackages(
      [pkg({ identifier: 'a' }), pkg({ identifier: 'a' }), pkg({ identifier: 'b' })],
      preferred,
    );
    expect(list.length).toBe(2);
  });

  it('survives a null in the list', () => {
    const list = normalizePackages([null as unknown as PurchasesPackage, pkg({ identifier: 'a' })], preferred);
    expect(list.length).toBe(1);
  });

  it('puts the preferred plan first', () => {
    const sorted = sortPackagesByPreference(
      [pkg({ identifier: 'm', packageType: PACKAGE_TYPE.MONTHLY }),
       pkg({ identifier: 'a', packageType: PACKAGE_TYPE.ANNUAL })],
      preferred,
    );
    expect(sorted[0].identifier).toBe('a');
  });

  it('sends unranked plans to the back rather than dropping them', () => {
    const sorted = sortPackagesByPreference(
      [pkg({ identifier: 'l', packageType: PACKAGE_TYPE.LIFETIME }),
       pkg({ identifier: 'a', packageType: PACKAGE_TYPE.ANNUAL })],
      preferred,
    );
    expect(sorted.map(p => p.identifier)).toEqual(['a', 'l']);
  });

  it('does not mutate the caller list', () => {
    const original = [pkg({ identifier: 'm', packageType: PACKAGE_TYPE.MONTHLY }),
                      pkg({ identifier: 'a', packageType: PACKAGE_TYPE.ANNUAL })];
    sortPackagesByPreference(original, preferred);
    expect(original[0].identifier).toBe('m');
  });
});

describe('pickPreferredPackage', () => {
  const preferred = [PACKAGE_TYPE.ANNUAL, PACKAGE_TYPE.MONTHLY];

  it('takes the first preference that is on offer', () => {
    const picked = pickPreferredPackage(
      [pkg({ identifier: 'm', packageType: PACKAGE_TYPE.MONTHLY }),
       pkg({ identifier: 'a', packageType: PACKAGE_TYPE.ANNUAL })],
      preferred,
    );
    expect(picked?.identifier).toBe('a');
  });

  it('falls back to whatever is there when no preference matches', () => {
    const picked = pickPreferredPackage(
      [pkg({ identifier: 'l', packageType: PACKAGE_TYPE.LIFETIME })],
      preferred,
    );
    expect(picked?.identifier).toBe('l');
  });

  it('returns null rather than undefined when there is nothing to sell', () => {
    expect(pickPreferredPackage([], preferred)).toBeNull();
  });
});

describe('isEnvironmentalStoreError', () => {
  it('recognises PURCHASE_NOT_ALLOWED as the code string RevenueCat sends', () => {
    expect(isEnvironmentalStoreError({ code: '3', message: 'The device or user is not allowed to make the purchase.' })).toBeTrue();
  });

  it('recognises the same code sent as a number', () => {
    expect(isEnvironmentalStoreError({ code: 3 })).toBeTrue();
  });

  it('recognises a network error', () => {
    expect(isEnvironmentalStoreError({ code: '10', message: 'Error performing request.' })).toBeTrue();
  });

  it('recognises the readable code when the numeric one is missing', () => {
    expect(isEnvironmentalStoreError({ data: { readableErrorCode: 'PURCHASE_NOT_ALLOWED_ERROR' } })).toBeTrue();
  });

  it('keeps a configuration error as a real error — in production it would mean no plans for anyone', () => {
    expect(isEnvironmentalStoreError({ code: 23 })).toBeFalse();
    expect(isEnvironmentalStoreError({ code: '23' })).toBeFalse();
  });

  it('does not swallow a user cancellation or anything unknown', () => {
    expect(isEnvironmentalStoreError({ code: '1' })).toBeFalse();
    expect(isEnvironmentalStoreError({ code: '0' })).toBeFalse();
    expect(isEnvironmentalStoreError(new Error('boom'))).toBeFalse();
  });

  it('never throws on odd input', () => {
    for (const value of [undefined, null, 'x', 3, {}, { data: null }]) {
      expect(isEnvironmentalStoreError(value)).toBeFalse();
    }
  });
});
