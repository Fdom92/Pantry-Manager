import { TranslateService } from '@ngx-translate/core';

const LOCATION_LABEL_KEYS: Record<string, string> = {
  pantry: 'locations.pantry',
  despensa: 'locations.pantry',
  kitchen: 'locations.kitchen',
  cocina: 'locations.kitchen',
  fridge: 'locations.fridge',
  nevera: 'locations.fridge',
  freezer: 'locations.freezer',
  congelador: 'locations.freezer',
  bathroom: 'locations.bathroom',
  baño: 'locations.bathroom',
  bano: 'locations.bathroom',
  freezer_drawer: 'locations.freezerDrawer',
  cupboard: 'locations.cupboard',
  alacena: 'locations.cupboard',
  cellar: 'locations.cellar',
  bodega: 'locations.cellar',
  other: 'locations.other',
  otros: 'locations.other',
  otro: 'locations.other',
  unassigned: 'locations.unassigned',
  'sin ubicación': 'locations.unassigned',
  'sin ubicacion': 'locations.unassigned',
};

export function getLocationDisplayName(
  id: string | null | undefined,
  fallback: string = 'Sin ubicación',
  translate?: TranslateService
): string {
  const key = (id ?? '').trim().toLowerCase();
  if (!key) {
    return fallback;
  }
  const labelKey = LOCATION_LABEL_KEYS[key];
  if (labelKey) {
    if (translate) {
      const translated = translate.instant(labelKey);
      if (translated) {
        return translated;
      }
    }
    return fallback;
  }
  return key
    .replace(/^(location:)/, '')
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || fallback;
}
