export function toNumberOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function roundQuantity(value: number | null | undefined): number {
  return Math.round(toNumberOrZero(value ?? 0));
}

export function formatQuantity(
  value: number | null | undefined,
  locale: string
): string {
  const formatter = cachedIntl(`quantity:${locale}`, () => new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }));
  return formatter.format(roundQuantity(value));
}

const intlCache = new Map<string, unknown>();

/** Building an Intl formatter costs far more than using one, and a 150-row list
 * formats every row on each change detection. Keys are locale + options: bounded. */
export function cachedIntl<T>(key: string, build: () => T): T {
  let formatter = intlCache.get(key) as T | undefined;
  if (formatter === undefined) {
    formatter = build();
    intlCache.set(key, formatter);
  }
  return formatter;
}
