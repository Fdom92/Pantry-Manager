import {
  getCatalogUsage,
  getItemsUsingCatalogValue,
  isDuplicateCatalogValue,
  normalizeCatalogOptions,
} from './catalog-operations.domain';

/** The catalogs are the user's own labels: supermarkets, categories, locations. */
const identity = (v: string) => v.trim();

describe('isDuplicateCatalogValue', () => {
  it('catches the same label in different case', () => {
    expect(isDuplicateCatalogValue('mercadona', ['Mercadona'], identity)).toBe(true);
    expect(isDuplicateCatalogValue('MERCADONA', ['mercadona'], identity)).toBe(true);
  });

  it('catches the same label with surrounding whitespace', () => {
    expect(isDuplicateCatalogValue('  Lidl  ', ['Lidl'], identity)).toBe(true);
  });

  it('does not flag a different label', () => {
    expect(isDuplicateCatalogValue('Lidl', ['Mercadona', 'Carrefour'], identity)).toBe(false);
  });

  it('does not flag an empty value', () => {
    // Nothing to duplicate; the empty case is rejected elsewhere.
    expect(isDuplicateCatalogValue('', ['Mercadona'], identity)).toBe(false);
    expect(isDuplicateCatalogValue('   ', ['Mercadona'], identity)).toBe(false);
  });

  it('does not flag anything against an empty catalog', () => {
    expect(isDuplicateCatalogValue('Mercadona', [], identity)).toBe(false);
  });

  it('applies the caller-supplied normalizer to both sides', () => {
    const stripPrefix = (v: string) => v.replace(/^super\s+/i, '').trim();
    expect(isDuplicateCatalogValue('Super Dia', ['Dia'], stripPrefix)).toBe(true);
  });

  it('KNOWN LIMIT: accents make two spellings of one chain look distinct', () => {
    // Catalog values are compared case-insensitively but not accent-insensitively,
    // unlike product names, which go through normalizeProductKey. So "Dia" and
    // "Día" can both be created. Left as-is deliberately: these strings are
    // stored keys on existing documents, and folding them changes what those
    // documents point at.
    expect(isDuplicateCatalogValue('Día', ['Dia'], identity)).toBe(false);
  });
});

describe('getItemsUsingCatalogValue', () => {
  const items = [
    { id: 1, market: 'Mercadona' },
    { id: 2, market: 'Lidl' },
    { id: 3, market: 'Mercadona' },
  ];
  const matcher = (item: { market: string }, value: string) => item.market === value;

  it('returns every item using the value', () => {
    expect(getItemsUsingCatalogValue(items, 'Mercadona', matcher, identity).map(i => i.id))
      .toEqual([1, 3]);
  });

  it('returns nothing for a value nobody uses', () => {
    expect(getItemsUsingCatalogValue(items, 'Aldi', matcher, identity)).toEqual([]);
  });

  it('returns nothing for an empty value rather than matching everything', () => {
    // Guards the delete-a-catalog-entry flow from reporting the whole pantry.
    expect(getItemsUsingCatalogValue(items, '   ', matcher, identity)).toEqual([]);
  });

  it('hands the matcher the normalized value, not the raw one', () => {
    const seen: string[] = [];
    getItemsUsingCatalogValue(items, '  Lidl  ', (_i, v) => { seen.push(v); return false; }, identity);
    expect(seen[0]).toBe('Lidl');
  });
});

describe('getCatalogUsage', () => {
  const items = [{ id: 1, market: 'Lidl' }, { id: 2, market: 'Lidl' }];
  const matcher = (item: { market: string }, value: string) => item.market === value;

  it('reports the count alongside the items', () => {
    const usage = getCatalogUsage(items, 'Lidl', matcher, identity);
    expect(usage.count).toBe(2);
    expect(usage.items.length).toBe(2);
  });

  it('reports zero for an unused value', () => {
    expect(getCatalogUsage(items, 'Aldi', matcher, identity).count).toBe(0);
  });
});

describe('normalizeCatalogOptions', () => {
  it('trims each option', () => {
    expect(normalizeCatalogOptions(['  Lidl ', 'Aldi'])).toEqual(['Lidl', 'Aldi']);
  });

  it('drops blank entries', () => {
    expect(normalizeCatalogOptions(['Lidl', '', '   '])).toEqual(['Lidl']);
  });

  it('survives a malformed list without throwing', () => {
    expect(normalizeCatalogOptions([null as unknown as string, 'Lidl'])).toEqual(['Lidl']);
  });

  it('keeps the original order', () => {
    expect(normalizeCatalogOptions(['Zzz', 'Aaa'])).toEqual(['Zzz', 'Aaa']);
  });
});
