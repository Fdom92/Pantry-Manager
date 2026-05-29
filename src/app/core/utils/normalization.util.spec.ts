import {
  dedupeByNormalizedKey,
  formatFriendlyName,
  normalizeCategoryId,
  normalizeLocationId,
  normalizeLowercase,
  normalizeSearchField,
  normalizeSearchQuery,
  normalizeSupermarketName,
  normalizeSupermarketValue,
  normalizeTrim,
  normalizeWhitespace,
} from './normalization.util';

describe('normalizeTrim', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeTrim('  hello  ')).toBe('hello');
  });

  it('returns empty string for null', () => {
    expect(normalizeTrim(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeTrim(undefined)).toBe('');
  });

  it('preserves internal spaces', () => {
    expect(normalizeTrim('hello world')).toBe('hello world');
  });
});

describe('normalizeWhitespace', () => {
  it('collapses multiple spaces to one', () => {
    expect(normalizeWhitespace('hello   world')).toBe('hello world');
  });

  it('trims outer whitespace', () => {
    expect(normalizeWhitespace('  hi  ')).toBe('hi');
  });

  it('collapses tabs and newlines', () => {
    expect(normalizeWhitespace('a\t\nb')).toBe('a b');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeWhitespace(null)).toBe('');
    expect(normalizeWhitespace(undefined)).toBe('');
  });
});

describe('normalizeLowercase', () => {
  it('lowercases and trims', () => {
    expect(normalizeLowercase('  HELLO  ')).toBe('hello');
  });

  it('returns empty string for null', () => {
    expect(normalizeLowercase(null)).toBe('');
  });
});

describe('normalizeSearchQuery', () => {
  it('lowercases, collapses spaces, trims', () => {
    expect(normalizeSearchQuery('  Arroz   Blanco  ')).toBe('arroz blanco');
  });

  it('handles null', () => {
    expect(normalizeSearchQuery(null)).toBe('');
  });
});

describe('normalizeSearchField', () => {
  it('coerces unknown to string then normalizes', () => {
    expect(normalizeSearchField(42)).toBe('42');
    expect(normalizeSearchField(null)).toBe('');
    expect(normalizeSearchField('  Leche  ')).toBe('leche');
  });
});

describe('normalizeSupermarketName (storage — title-case)', () => {
  it('title-cases the name', () => {
    expect(normalizeSupermarketName('mercadona')).toBe('Mercadona');
  });

  it('title-cases multi-word names', () => {
    expect(normalizeSupermarketName('el corte ingles')).toBe('El Corte Ingles');
  });

  it('returns undefined for empty string', () => {
    expect(normalizeSupermarketName('')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(normalizeSupermarketName(null)).toBeUndefined();
  });

  it('collapses extra spaces before title-casing', () => {
    expect(normalizeSupermarketName('  lidl  ')).toBe('Lidl');
  });
});

describe('normalizeSupermarketValue (display — no case change)', () => {
  it('trims but preserves case', () => {
    expect(normalizeSupermarketValue('  Mercadona  ')).toBe('Mercadona');
    expect(normalizeSupermarketValue('mercadona')).toBe('mercadona');
  });

  it('returns undefined for empty string', () => {
    expect(normalizeSupermarketValue('')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(normalizeSupermarketValue(null)).toBeUndefined();
  });
});

describe('normalizeLocationId', () => {
  it('trims whitespace', () => {
    expect(normalizeLocationId('  fridge  ')).toBe('fridge');
  });

  it('returns fallback for empty string', () => {
    expect(normalizeLocationId('', 'unassigned')).toBe('unassigned');
  });

  it('returns empty string as default fallback', () => {
    expect(normalizeLocationId(null)).toBe('');
  });
});

describe('normalizeCategoryId', () => {
  it('trims whitespace', () => {
    expect(normalizeCategoryId('  dairy  ')).toBe('dairy');
  });

  it('returns empty string for "uncategorized"', () => {
    expect(normalizeCategoryId('uncategorized')).toBe('');
    expect(normalizeCategoryId('Uncategorized')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeCategoryId(null)).toBe('');
    expect(normalizeCategoryId(undefined)).toBe('');
  });
});

describe('formatFriendlyName', () => {
  it('capitalizes and splits on hyphens', () => {
    expect(formatFriendlyName('dairy-products', 'Unknown')).toBe('Dairy Products');
  });

  it('strips location: prefix', () => {
    expect(formatFriendlyName('location:fridge', 'Unknown')).toBe('Fridge');
  });

  it('strips category: prefix', () => {
    expect(formatFriendlyName('category:protein', 'Unknown')).toBe('Protein');
  });

  it('returns fallback for empty string', () => {
    expect(formatFriendlyName('', 'Unknown')).toBe('Unknown');
  });
});

describe('dedupeByNormalizedKey', () => {
  it('removes duplicates by normalized key', () => {
    const items = ['Mercadona', 'mercadona', 'LIDL', 'lidl'];
    const result = dedupeByNormalizedKey(items, s => s);
    expect(result.length).toBe(2);
    expect(result[0]).toBe('Mercadona'); // first occurrence kept
  });

  it('preserves original values (not the key)', () => {
    const items = [{ name: 'Arroz' }, { name: 'arroz' }];
    const result = dedupeByNormalizedKey(items, i => i.name);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Arroz');
  });

  it('returns all items when all keys are unique', () => {
    const items = ['a', 'b', 'c'];
    expect(dedupeByNormalizedKey(items, s => s).length).toBe(3);
  });

  it('skips items with empty key', () => {
    const items = ['', 'valid'];
    const result = dedupeByNormalizedKey(items, s => s);
    expect(result.length).toBe(1);
    expect(result[0]).toBe('valid');
  });
});
