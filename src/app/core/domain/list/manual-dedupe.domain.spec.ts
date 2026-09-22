import { manualItemsNotSuggested } from './manual-dedupe.domain';

interface Named { name: string }

function manual(name: string): Named {
  return { name };
}

describe('manualItemsNotSuggested', () => {
  it('hides a manual entry whose name exactly matches a suggestion', () => {
    const result = manualItemsNotSuggested([manual('Pollo')], ['Pollo']);
    expect(result).toEqual([]);
  });

  it('matches case- and accent-insensitively, same rule as markManualAsBought', () => {
    const result = manualItemsNotSuggested([manual('POLLO'), manual('pollo')], ['Pollo']);
    expect(result).toEqual([]);

    const accented = manualItemsNotSuggested([manual('Atun')], ['Atún']);
    expect(accented).toEqual([]);
  });

  it('keeps a manual entry that names a different product', () => {
    const result = manualItemsNotSuggested([manual('Bombillas')], ['Pollo']);
    expect(result).toEqual([manual('Bombillas')]);
  });

  it('does not match a partial name — "Pechuga de pollo" is not "Pollo"', () => {
    const result = manualItemsNotSuggested([manual('Pechuga de pollo')], ['Pollo']);
    expect(result).toEqual([manual('Pechuga de pollo')]);
  });

  it('keeps everything when there are no suggestions', () => {
    const manuals = [manual('Pollo'), manual('Bombillas')];
    const result = manualItemsNotSuggested(manuals, []);
    expect(result).toEqual(manuals);
  });

  it('preserves the original order', () => {
    const manuals = [manual('Bombillas'), manual('Pollo'), manual('Sal')];
    const result = manualItemsNotSuggested(manuals, ['Pollo']);
    expect(result).toEqual([manual('Bombillas'), manual('Sal')]);
  });
});
