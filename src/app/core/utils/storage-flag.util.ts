export function getBooleanFlag(key: string, fallback = false): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value === null) {
      return fallback;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return Boolean(value);
  } catch {
    return fallback;
  }
}

export function setBooleanFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // Ignore storage failures.
  }
}
