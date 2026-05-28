/**
 * Days from now until a date string expires.
 * Positive = future (expires in N days), negative = past (expired N days ago), 0 = today.
 * Uses Math.ceil so "today at 23:59" counts as 0, not -1.
 */
export function daysUntilExpiry(dateStr: string, nowMs = Date.now()): number {
  return Math.ceil((Date.parse(dateStr) - nowMs) / 86_400_000);
}

export function isWithinHours(date: Date, startHour: number, endHour: number): boolean {
  const hour = date.getHours();
  return hour >= startHour && hour < endHour;
}

export function isSundayAfternoon(date: Date): boolean {
  return date.getDay() === 0 && date.getHours() >= 15;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 5 || day === 6; // Friday, Saturday, Sunday
}

export function toDateInputValue(dateIso: string): string {
  try {
    return new Date(dateIso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function toIsoDate(dateInput: string): string | null {
  const trimmed = dateInput?.trim?.() ?? '';
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}
