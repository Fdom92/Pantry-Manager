import type { OcrLine } from '@core/models/receipt';
import { reconstructRows } from './receipt-geometry.domain';

/**
 * ML Kit returns a supermarket receipt as columns, not rows — all the product
 * names in one block, all the prices in another. Pairing a name with its price
 * again is pure geometry, so these tests are about vertical overlap.
 */
describe('reconstructRows', () => {
  const line = (text: string, top: number, left: number, height = 20): OcrLine =>
    ({ text, box: { top, bottom: top + height, left, right: left + 100 } }) as OcrLine;

  it('pairs a name with the price printed beside it', () => {
    const rows = reconstructRows([
      line('LECHE ENTERA', 100, 0),
      line('1,29', 102, 400),
    ]);
    expect(rows.length).toBe(1);
    expect(rows[0].text).toBe('LECHE ENTERA 1,29');
  });

  it('reads the cells left to right whatever order OCR returned them', () => {
    const rows = reconstructRows([
      line('1,29', 100, 400),
      line('LECHE', 100, 0),
    ]);
    expect(rows[0].cells).toEqual(['LECHE', '1,29']);
  });

  it('keeps separate rows apart', () => {
    const rows = reconstructRows([
      line('LECHE', 100, 0),
      line('1,29', 100, 400),
      line('PAN', 140, 0),
      line('0,95', 140, 400),
    ]);
    expect(rows.length).toBe(2);
    expect(rows[0].text).toBe('LECHE 1,29');
    expect(rows[1].text).toBe('PAN 0,95');
  });

  it('tolerates the slight skew of a photographed receipt', () => {
    // Same row, a few pixels off — well within half a line height.
    const rows = reconstructRows([
      line('LECHE', 100, 0),
      line('1,29', 106, 400),
    ]);
    expect(rows.length).toBe(1);
  });

  it('does not swallow the next row when the gap is a full line', () => {
    const rows = reconstructRows([
      line('LECHE', 100, 0),
      line('PAN', 125, 0),
    ]);
    expect(rows.length).toBe(2);
  });

  it('returns rows top to bottom regardless of input order', () => {
    const rows = reconstructRows([
      line('TERCERA', 200, 0),
      line('PRIMERA', 100, 0),
      line('SEGUNDA', 150, 0),
    ]);
    expect(rows.map(r => r.text)).toEqual(['PRIMERA', 'SEGUNDA', 'TERCERA']);
  });

  it('falls back to one row per line when there is no geometry at all', () => {
    // Older fixtures and the plugin fallback return text with no boxes.
    const rows = reconstructRows([
      { text: 'LECHE 1,29' } as OcrLine,
      { text: 'PAN 0,95' } as OcrLine,
    ]);
    expect(rows.map(r => r.text)).toEqual(['LECHE 1,29', 'PAN 0,95']);
  });

  it('ignores blank lines in either mode', () => {
    expect(reconstructRows([line('   ', 100, 0), line('LECHE', 100, 200)]).length).toBe(1);
    expect(reconstructRows([{ text: '  ' } as OcrLine]).length).toBe(0);
  });

  it('returns nothing for no input', () => {
    expect(reconstructRows([])).toEqual([]);
  });

  it('collapses runs of whitespace in the joined row text', () => {
    const rows = reconstructRows([line('LECHE   ENTERA', 100, 0), line('1,29', 100, 400)]);
    expect(rows[0].text).toBe('LECHE ENTERA 1,29');
  });
});
