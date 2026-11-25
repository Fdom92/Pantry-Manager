import type { PantryItem } from '@core/models/pantry';
import { buildAddOptions } from './add-options.domain';

const own = (name: string) => ({ _id: `item:${name}`, name }) as PantryItem;
const basic = (key: string, name: string) => ({ seed: { key, emoji: '·', classKey: 'eggs' }, name });
const BASICS = [basic('milk', 'Leche'), basic('eggs', 'Huevos'), basic('lemon', 'Limón')];

describe('buildAddOptions', () => {
  it('shows only own products on an empty query when there are some', () => {
    const r = buildAddOptions([own('Arroz')], BASICS, '');
    expect(r.map(o => o.kind)).toEqual(['own']);
  });

  it('falls back to the basics on an empty query without own products', () => {
    expect(buildAddOptions([], BASICS, '').map(o => o.kind)).toEqual(['basic', 'basic', 'basic']);
  });

  it('puts matching own products before matching basics', () => {
    const r = buildAddOptions([own('Lechuga'), own('Arroz')], BASICS, 'lec');
    expect(r.map(o => (o.kind === 'own' ? o.item.name : o.name))).toEqual(['Lechuga', 'Leche']);
  });

  it('drops a basic whose name the user already has, ignoring accents and case', () => {
    const r = buildAddOptions([own('limon')], BASICS, 'lim');
    expect(r.map(o => o.kind)).toEqual(['own']);
  });
});
