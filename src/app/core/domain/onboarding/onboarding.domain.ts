export function isLastIndex(currentIndex: number, length: number): boolean {
  if (!Number.isFinite(currentIndex) || currentIndex < 0) {
    return false;
  }
  return currentIndex >= Math.max(0, length - 1);
}

