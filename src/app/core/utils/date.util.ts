export function isWithinHours(date: Date, startHour: number, endHour: number): boolean {
  const hour = date.getHours();
  return hour >= startHour && hour < endHour;
}

export function isSundayAfternoon(date: Date): boolean {
  return date.getDay() === 0 && date.getHours() >= 15;
}
