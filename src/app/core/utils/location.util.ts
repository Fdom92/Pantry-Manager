const LOCATION_LABELS: Record<string, string> = {
  pantry: 'Despensa',
  kitchen: 'Cocina',
  fridge: 'Nevera',
  freezer: 'Congelador',
  bathroom: 'Baño',
  freezer_drawer: 'Congelador',
  cupboard: 'Alacena',
  cellar: 'Bodega',
  other: 'Otros',
  unassigned: 'Sin ubicación',
};

export function getLocationDisplayName(id: string | null | undefined, fallback: string = 'Sin ubicación'): string {
  const key = (id ?? '').trim().toLowerCase();
  if (!key) {
    return fallback;
  }
  if (LOCATION_LABELS[key]) {
    return LOCATION_LABELS[key];
  }
  return key
    .replace(/^(location:)/, '')
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || fallback;
}
