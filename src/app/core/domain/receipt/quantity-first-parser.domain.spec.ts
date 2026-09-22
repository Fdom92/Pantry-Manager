import { isQuantityFirstHeader, readLeadingCant } from './quantity-first-parser.domain';
import { parseReceipt } from './receipt-parser.domain';
import type { ReceiptRow } from '@core/models/receipt';

const row = (text: string): ReceiptRow => ({
  y: 0,
  cells: text.split('|').map(c => c.trim()),
  text: text.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim(),
});

describe('parseReceipt — quantity-first table (real Family Cash ticket)', () => {
  // Real ticket 2026-09-19, photo cropped above the invoice line. Family Cash
  // prints CANT before the description, weights in kg in that same column,
  // and wraps long names onto a second row that carries no numbers.
  const familyCashRows = (): ReceiptRow[] => [
    row('Oper. | Hora | Fecha | Fra.Simplificada'),
    row('34.102 | 13:41 | 19/09/2026 | T0341/393232'),
    row('Cant | Precio | Descripción Artículo | Importe'),
    row('2 | 0,75 | MACARRON FAMILY 500 GR | 1,50'),
    row('2 | 0,85 | HELICES VEGETALES FAMILY | 1,70'),
    row('500 GR'),
    row('1 | 0,95 | FIDEUA FAMILY 1 KG | 0,95'),
    row('2 | 0,75 | MARAVILLA FAMILY 500 GR | 1,50'),
    row('2 | 0,08 | BOLSA ASA G-200 FAMILY | 0,16'),
    row('48X60 (GR'),
    row('1 | 0,95 | SPAGHETTI FAMILY 1 KG | 0,95'),
    row('2 | 0,75 | TIBURON FAMILY 500GR | 1,50'),
    row('3 | 3,99 | LOMOS ATUN CLARO NATURAL | 11,97'),
    row('FAMILY'),
    row('1 | 1,35 | PACK SUPER ASPITOS 48 GR | 1,35'),
    row('0,7 | 6,99 | LONGANIZA DE POLLO/CERDO | 4,89'),
    row('KG'),
    row('0,39 | 4,99 | MAGRO DE CERDO DUROC A | 1,95'),
    row('TACOS KG'),
    row('0,51 | 9,99 | CACHOPO POLLO JAMON | 5,09'),
    row('SERRANO/QUES'),
    row('1,161 | 2,49 | CLEMENTINA KG | 2,89'),
    row('1 | 2,99 | PIMIENTOS ASADOS TIRAS | 2,99'),
    row('FAMILY 60'),
    row('2 | 1,79 | SALSA BOLOÑESA HELIOS 380G. | 3,58'),
    row('1 | 2,79 | REBANADA PAN BIMBO 11X11 1 | 2,79'),
    row('KILO'),
    row('1 | 1,69 | SALSA DE SOJA BAJA EN SAL | 1,69'),
    row('KIMONO'),
    row('1 | 1,99 | SALSA PESTO AL BASILICO LA | 1,99'),
    row('MOLIS'),
    row('1 | 1,45 | PATATAS SAL & VINAGRE | 1,45'),
    row('FAMILY 160'),
    row('1 | 7,52 | COCA-COLA 4 X 2 L PET | 7,52'),
    row('1 | 1,00 | REFRESCO NARANJA TRINA 1,5 | 1,00'),
    row('L. PE'),
    row('1 | 1,00 | REFRESCO TROPICAL TRINA 1,5 | 1,00'),
    row('L. P'),
    row('1 | 5,99 | QUESO GOUDA LONCHAS 1KG | 5,99'),
    row('0,515 | 9,99 | JAMON COCIDO BONNATUR KG | 5,14'),
    row('1 | 0,95 | VINO BLANCO BRICK 1L 11º | 0,95'),
    row('1 | 2,25 | VINAGRE BALSAMICO MODENA | 2,25'),
    row('500ML'),
    row('1 | 1,99 | FLAN QUESO DOLSY 4x100GR | 1,99'),
    row('1 | 3,59 | FLAN HUEVO AL BAÑO MARIA | 3,59'),
    row('REINA P'),
    row('1 | 1,49 | MAIZ DULCE COCIDO EN | 1,49'),
    row('MAZORCA 450'),
    row('1 | 0,35 | AGUA MINERAL TELENO 0,5L | 0,35'),
    row('SPORT'),
    row('TOTAL: | 83,07'),
  ];

  const expected: Array<[string, number]> = [
    ['MACARRON FAMILY 500 GR', 2],
    ['HELICES VEGETALES FAMILY 500 GR', 2],
    ['FIDEUA FAMILY 1 KG', 1],
    ['MARAVILLA FAMILY 500 GR', 2],
    ['BOLSA ASA G-200 FAMILY 48X60 (GR', 2],
    ['SPAGHETTI FAMILY 1 KG', 1],
    ['TIBURON FAMILY 500GR', 2],
    ['LOMOS ATUN CLARO NATURAL FAMILY', 3],
    ['PACK SUPER ASPITOS 48 GR', 1],
    ['LONGANIZA DE POLLO/CERDO', 1],
    ['MAGRO DE CERDO DUROC A TACOS', 1],
    ['CACHOPO POLLO JAMON SERRANO/QUES', 1],
    ['CLEMENTINA', 1],
    ['PIMIENTOS ASADOS TIRAS FAMILY 60', 1],
    ['SALSA BOLOÑESA HELIOS 380G.', 2],
    ['REBANADA PAN BIMBO 11X11 1 KILO', 1],
    ['SALSA DE SOJA BAJA EN SAL KIMONO', 1],
    ['SALSA PESTO AL BASILICO LA MOLIS', 1],
    ['PATATAS SAL & VINAGRE FAMILY 160', 1],
    ['COCA-COLA 4 X 2 L PET', 1],
    ['REFRESCO NARANJA TRINA 1,5 L. PE', 1],
    ['REFRESCO TROPICAL TRINA 1,5 L. P', 1],
    ['QUESO GOUDA LONCHAS 1KG', 1],
    ['JAMON COCIDO BONNATUR', 1],
    ['VINO BLANCO BRICK 1L 11º', 1],
    ['VINAGRE BALSAMICO MODENA 500ML', 1],
    ['FLAN QUESO DOLSY 4x100GR', 1],
    ['FLAN HUEVO AL BAÑO MARIA REINA P', 1],
    ['MAIZ DULCE COCIDO EN MAZORCA 450', 1],
    ['AGUA MINERAL TELENO 0,5L SPORT', 1],
  ];

  it('reads every product, joins wrapped names and takes CANT as the quantity', () => {
    const result = parseReceipt([row('FAMILY CASH'), ...familyCashRows()]);
    expect(result.supermarket).toBe('familycash');
    expect(result.items.map(i => [i.rawName, i.quantity])).toEqual(expected);
  });

  it('detects the layout from the table header even when the chain name is cropped', () => {
    const result = parseReceipt(familyCashRows());
    expect(result.supermarket).toBeNull();
    expect(result.items.map(i => [i.rawName, i.quantity])).toEqual(expected);
  });

  it('is sure of counted units and less sure of weighed ones', () => {
    const items = parseReceipt(familyCashRows()).items;
    expect(items.find(i => i.rawName === 'LOMOS ATUN CLARO NATURAL FAMILY')!.confidence).toBe('high');
    expect(items.find(i => i.rawName === 'CLEMENTINA')!.confidence).toBe('medium');
  });

  it('drops the unit-price column even when OCR loses its comma (real device case)', () => {
    // Device scan of the same ticket: "1,49" in the Precio column came back
    // as "149" — not a PRICE_TOKEN, so it leaked into the name.
    const header = row('Cant | Precio | Descripción Artículo | Importe');
    const split = parseReceipt([
      header,
      row('1 | 149 | MAIZ DULCE COCIDO EN | 1,49'),
      row('MAZORCA 450'),
    ]);
    expect(split.items.map(i => [i.rawName, i.quantity])).toEqual([['MAIZ DULCE COCIDO EN MAZORCA 450', 1]]);

    // Same row with the CANT and Precio cells merged into the name cell.
    const merged = parseReceipt([
      header,
      row('1 149 MAIZ DULCE COCIDO EN | 1,49'),
      row('MAZORCA 450'),
    ]);
    expect(merged.items.map(i => [i.rawName, i.quantity])).toEqual([['MAIZ DULCE COCIDO EN MAZORCA 450', 1]]);
  });

  describe('quantity from importe ÷ precio (real device OCR)', () => {
    // The thin CANT digit is often lost or misread; the row's own
    // arithmetic (Importe ÷ Precio) is the reliable count.
    const parseQtyFirst = (...productRows: ReceiptRow[]) =>
      parseReceipt([row('Cant | Precio | Descripción Artículo | Importe'), ...productRows])
        .items.map(i => [i.rawName, i.quantity]);

    it('recovers a lost CANT digit', () => {
      expect(parseQtyFirst(row('0,75 | MACARRON FAMILY 500 GR | 1,50')))
        .toEqual([['MACARRON FAMILY 500 GR', 2]]);
    });

    it('lets the arithmetic win over a misread CANT digit', () => {
      expect(parseQtyFirst(row('1 | 0,75 | MACARRON FAMILY 500 GR | 1,50')))
        .toEqual([['MACARRON FAMILY 500 GR', 2]]);
    });

    it('agrees with a correct CANT digit, wrapped names included', () => {
      expect(parseQtyFirst(row('3 | 3,99 | LOMOS ATUN CLARO NATURAL | 11,97'), row('FAMILY')))
        .toEqual([['LOMOS ATUN CLARO NATURAL FAMILY', 3]]);
      expect(parseQtyFirst(row('2 | 0,08 | BOLSA ASA G-200 FAMILY | 0,16')))
        .toEqual([['BOLSA ASA G-200 FAMILY', 2]]);
    });

    it('never takes a 3-digit leading number (merged CANT + Precio) as the quantity', () => {
      expect(parseQtyFirst(row('149 MAIZ DULCE COCIDO EN | 1,49'), row('MAZORCA 450')))
        .toEqual([['MAIZ DULCE COCIDO EN MAZORCA 450', 1]]);
    });

    it('keeps weighed rows at one item', () => {
      expect(parseQtyFirst(
        row('0,7 | 6,99 | LONGANIZA DE POLLO/CERDO | 4,89'),
        row('KG'),
        row('0,39 | 4,99 | MAGRO DE CERDO DUROC A | 1,95'),
        row('TACOS KG'),
        row('1,161 | 2,49 | CLEMENTINA KG | 2,89'),
      )).toEqual([
        ['LONGANIZA DE POLLO/CERDO', 1],
        ['MAGRO DE CERDO DUROC A TACOS', 1],
        ['CLEMENTINA', 1],
      ]);
    });
  });

  describe('noise words inside a structured row', () => {
    // Noise patterns include ordinary product words (AHORRO, CLIENTE, SOCIO,
    // CAMBIO...). In this layout a leading CANT + a price is stronger
    // evidence than one word, so such a row stays a product.
    const header = row('Cant | Precio | Descripción Artículo | Importe');

    it('keeps a CANT + price row whose name matches a noise pattern', () => {
      const items = parseReceipt([header, row('1 | 2,50 | PACK AHORRO GALLETAS | 2,50')]).items;
      expect(items.map(i => [i.rawName, i.quantity])).toEqual([['PACK AHORRO GALLETAS', 1]]);
    });

    it('still drops a payment row that has no leading CANT', () => {
      const items = parseReceipt([
        header,
        row('2 | 0,75 | MACARRON FAMILY 500 GR | 1,50'),
        row('TARJETA | 83,07'),
      ]).items;
      expect(items.map(i => i.rawName)).toEqual(['MACARRON FAMILY 500 GR']);
    });
  });

  it('only flags headers that print CANT before the description', () => {
    expect(isQuantityFirstHeader(row('Cant | Precio | Descripción Artículo | Importe'))).toBeTrue();
    expect(isQuantityFirstHeader(row('Descripcion | Cant | Pvp | Total'))).toBeFalse();
    expect(isQuantityFirstHeader(row('Descr pcion | P. Unit | Imp.(€)'))).toBeFalse();
  });

  it('leaves a Merkocash table (CANT after the description) on the usual path', () => {
    const result = parseReceipt([
      row('MERKOCASH'),
      row('Descripcion | Cant | Pvp | Total'),
      row('CERVEZA ESTRE | 24.0 | 0.59 | 14.16'),
      row('PAN ROSQUILLA | 1.0 | 0.99 | 0.99'),
      row('Resumen po'),
    ]);
    expect(result.items.map(i => [i.rawName, i.quantity])).toEqual([
      ['CERVEZA ESTRE', 24],
      ['PAN ROSQUILLA', 1],
    ]);
  });
});

describe('readLeadingCant', () => {
  const tokens = (text: string) => text.split(/\s+/).filter(Boolean);

  it('reads a decimal lead with precio and importe after it as a weight', () => {
    expect(readLeadingCant(tokens('0,39 4,99 MAGRO DE CERDO 1,95'))).toEqual({ kind: 'weight' });
    expect(readLeadingCant(tokens('1,161 2,49 CLEMENTINA KG 2,89'))).toEqual({ kind: 'weight' });
    expect(readLeadingCant(tokens('0,7 6,99 LONGANIZA 4,89'))).toEqual({ kind: 'weight' });
  });

  it('reads a 1-2 digit lead as a count', () => {
    expect(readLeadingCant(tokens('2 0,75 MACARRON 1,50'))).toEqual({ kind: 'count', value: 2 });
    expect(readLeadingCant(tokens('12 0,08 BOLSA 0,96'))).toEqual({ kind: 'count', value: 12 });
  });

  it('reads a 3-digit lead as CANT and Precio merged', () => {
    expect(readLeadingCant(tokens('149 MAIZ DULCE 1,49'))).toEqual({ kind: 'merged' });
  });

  it('reads a 2-decimal lead with one other price as a Precio whose CANT was lost', () => {
    expect(readLeadingCant(tokens('0,75 MACARRON FAMILY 1,50'))).toEqual({ kind: 'lostCant' });
  });

  it('reports none when the row does not open with a number', () => {
    expect(readLeadingCant(tokens('MACARRON FAMILY 1,50'))).toEqual({ kind: 'none' });
    expect(readLeadingCant([])).toEqual({ kind: 'none' });
  });
});
