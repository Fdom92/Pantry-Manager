/**
 * Share of the full backdrop opacity an Ionic sheet modal shows at a given breakpoint.
 * Ionic fades the backdrop in linearly as the sheet opens (see getBackdropValueForSheet),
 * from `backdropBreakpoint` (nothing) up to fully open (all of it), so a sheet resting at
 * 0.45 dims the page only 45 % as much as a full-height modal.
 */
export function sheetBackdropFactor(breakpoint: number, backdropBreakpoint = 0): number {
  if (backdropBreakpoint >= 1) return 0;
  const factor = (breakpoint - backdropBreakpoint) / (1 - backdropBreakpoint);
  return Math.min(1, Math.max(0, factor));
}
