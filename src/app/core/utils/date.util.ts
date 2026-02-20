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
