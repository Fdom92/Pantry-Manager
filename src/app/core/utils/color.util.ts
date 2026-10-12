export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Reads what `getComputedStyle` hands back for a colour: rgb()/rgba() (comma or space
 * separated), #rgb / #rrggbb and color(srgb ...). Anything unreadable, and a fully
 * transparent colour (nothing to paint with), gives null.
 */
export function parseCssColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  const fn = /^(rgba?|color)\((?:srgb\s+)?([^)]+)\)$/.exec(v);
  if (!fn) return null;
  const isSrgb = fn[1] === 'color';
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
  const alpha = parts.length > 3 ? parts[3] : 1;
  if (alpha === 0) return null;
  const scale = isSrgb ? 255 : 1;
  const [r, g, b] = parts.slice(0, 3).map(c => Math.round(c * scale));
  return { r, g, b };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** The colour under a black overlay of the given opacity (what an Ionic backdrop does). */
export function dimColor({ r, g, b }: Rgb, opacity: number): Rgb {
  const keep = 1 - Math.min(1, Math.max(0, opacity));
  return { r: Math.round(r * keep), g: Math.round(g * keep), b: Math.round(b * keep) };
}

/** Light enough that dark system-bar icons are the legible choice. */
export function isLightColor({ r, g, b }: Rgb): boolean {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}
