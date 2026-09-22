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
  const rounded = roundQuantity(value);
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(rounded);
}
