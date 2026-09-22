import { reconstructRows } from './receipt-geometry.domain';
import { detectSupermarket, extractProduct, isQuantityFirstHeader, parseReceipt } from './receipt-parser.domain';
import { matchReceiptName, MATCH_AUTO_THRESHOLD } from './receipt-matching.domain';
import type { OcrLine, ReceiptRow } from '@core/models/receipt';

const row = (text: string): ReceiptRow => ({
  y: 0,
  cells: text.split('|').map(c => c.trim()),
  text: text.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim(),
});

describe('receipt-geometry.domain', () => {
  it('groups OCR lines into rows by vertical overlap', () => {
    // Column-clustered input (names block + qty block) as ML Kit returns it.
    const lines: OcrLine[] = [
      { text: 'PATATAS FRITA', box: { left: 10, top: 100, right: 200, bottom: 120 } },
      { text: 'ACEITUNA CANO', box: { left: 10, top: 130, right: 200, bottom: 150 } },
      { text: '1.0', box: { left: 250, top: 101, right: 280, bottom: 121 } },
      { text: '24.0', box: { left: 250, top: 131, right: 285, bottom: 151 } },
    ];
    const rows = reconstructRows(lines);
    expect(rows.length).toBe(2);
    expect(rows[0].cells).toEqual(['PATATAS FRITA', '1.0']);
    expect(rows[1].cells).toEqual(['ACEITUNA CANO', '24.0']);
  });

  it('falls back to one row per line without geometry', () => {
    const rows = reconstructRows([
      { text: '2 COCA COLA ZERO', box: null },
      { text: '1 PATE DE SALMON', box: null },
    ]);
    expect(rows.length).toBe(2);
  });
});

describe('receipt-parser.domain — supermarket detection', () => {
  it('detects chains including OCR-garbled headers', () => {
    expect(detectSupermarket([row('MiRCADONA S.A.')])).toBe('mercadona');
    expect(detectSupermarket([row('MERKOCASH'), row('LA ARDOSA S.L.')])).toBe('merkocash');
    expect(detectSupermarket([row('COSTCO WHOLESALE SPAIN, S.L.U.')])).toBe('costco');
    expect(detectSupermarket([row('A LDI'), row('Ctra de Loeches 52')])).toBe('aldi');
    expect(detectSupermarket([row('EROSKI BOULEVARD')])).toBe('eroski');
    expect(detectSupermarket([row('FAMILY CASH')])).toBe('familycash');
    // "FAMILY" alone is Family Cash's house brand on product rows, not the chain.
    expect(detectSupermarket([row('MACARRON FAMILY 500 GR')])).toBeNull();
    expect(detectSupermarket([row('ticket sin cadena')])).toBeNull();
  });
});

describe('receipt-parser.domain — quantity encodings', () => {
  it('Mercadona/Eroski: leading digit in name row', () => {
    const p = extractProduct(row('2 COCA COLA ZERO'));
    expect(p).toEqual(jasmine.objectContaining({ rawName: 'COCA COLA ZERO', quantity: 2, confidence: 'high' }));
  });

  it('Merkocash: decimal CANT cell', () => {
    const p = extractProduct(row('CERVEZA ESTRE | 24.0 | 0.59 | 14.16'));
    expect(p).toEqual(jasmine.objectContaining({ rawName: 'CERVEZA ESTRE', quantity: 24 }));
  });

  it('Costco: "1x" cell next to product code', () => {
    const p = extractProduct(row('Danonino 12 unid | 8505281V | 1x | 5,49 | 5,49 C'));
    expect(p).toEqual(jasmine.objectContaining({ quantity: 1, confidence: 'high' }));
    expect(p!.rawName).toContain('Danonino');
  });

  it('Dia: "6X" inline', () => {
    const p = extractProduct(row('LECHE ENTERA DIA | 6X | 0.56 | 3.36'));
    expect(p).toEqual(jasmine.objectContaining({ rawName: 'LECHE ENTERA DIA', quantity: 6 }));
  });

  it('defaults to quantity 1 with medium confidence', () => {
    const p = extractProduct(row('KIWI VERDE BANDEJA | 1,79 € 2'));
    expect(p).toEqual(jasmine.objectContaining({ rawName: 'KIWI VERDE BANDEJA', quantity: 1, confidence: 'medium' }));
  });
});

describe('receipt-parser.domain — full parse', () => {
  it('parses a Mercadona-like zone and stops at the total', () => {
    const rows = [
      row('MERCADONA S.A.'),
      row('TELEFONO: | 916761102'),
      row('FACTURA SIMPLIFICADA: 2780-012'),
      row('Descripcion | P. Unit | Imp'),
      row('2 COCA COLA ZERO | 4,00 | 8,00'),
      row('1 PATE DE SALMON | 1,90'),
      row('1 MANDARINA'),
      row('0,676 kg | 2,00 €/kg | 1,35'),
      row('1 PARKING'),
      row('ENTRADA 19:00 SALIDA 19:31'),
      row('TOTAL (€) | 37,79'),
      row('TARJETA BANCARIA | 37,79'),
    ];
    const result = parseReceipt(rows);
    expect(result.supermarket).toBe('mercadona');
    const names = result.items.map(i => i.rawName);
    expect(names).toContain('COCA COLA ZERO');
    expect(names).toContain('PATE DE SALMON');
    expect(names).toContain('MANDARINA');
    expect(names).not.toContain('PARKING');
    expect(names.join(' ')).not.toContain('TARJETA');
    expect(result.items.find(i => i.rawName === 'COCA COLA ZERO')!.quantity).toBe(2);
  });

  it('discards the garbled store header above the table anchor (real device case)', () => {
    // Real Mercadona scan 2026-07: OCR garbled the address block beyond
    // any noise pattern — the start anchor must remove it wholesale.
    const rows = [
      row('MERCADONA, S.A.'),
      row('Pozo 0e Las Nieves, 34'),
      row('850 Torrejón de Ardoz'),
      row('Llefono :'),
      row('Descr pcion | P. Unit | Imp.(€)'),
      row('5 LECHE ENTERA P6 | 5,82 | 29,10'),
      row('1 S0JA NATURAL | 1,20'),
      row('TOTAL (€) | 86,01'),
    ];
    const result = parseReceipt(rows);
    const names = result.items.map(i => i.rawName);
    expect(names).toEqual(['LECHE ENTERA P6', 'SOJA NATURAL']);
    expect(result.items[0].quantity).toBe(5);
  });

  it('cleans OCR digit artifacts inside words but not sizes', () => {
    const p = extractProduct(row('1 YOGUR L1QUIDO FRESA'));
    expect(p!.rawName).toBe('YOGUR LIQUIDO FRESA');
    const p2 = extractProduct(row('2 COCA COLA 2 L'));
    expect(p2!.rawName).toBe('COCA COLA 2 L');
  });

  it('requires a price for products when no table header exists (real Carrefour case)', () => {
    // Carrefour prints no "Descripcion" header — branding lines leaked as
    // products on device (2026-07). Price requirement filters them out.
    const rows = [
      row('***CARREFOUR***'),
      row('Torrejón de Ardoz'),
      row('Alo8 Contiggo'),           // "21 años contigo" garbled
      row('Clubpleenes'),             // "Clubpleanos feliz" garbled
      row('llenes?'),                 // "¿Vienes?" garbled
      row('* TICKET DUPLICADO *'),
      row('VINO SIMPL BLANCO | 0,94'),
      row('LECHE NATIVA 1 800 | 12,19'),
      row('DESCUENTO EN 2ª UNIDAD | B551 | -0,84'),
      row('16 ART. TOTAL A PAGAR : | 41,63'),
    ];
    const result = parseReceipt(rows);
    const names = result.items.map(i => i.rawName);
    expect(names).toEqual(['VINO SIMPL BLANCO', 'LECHE NATIVA 1 800']);
  });

  it('drops garbled tail junk after products (real Mercadona case)', () => {
    const rows = [
      row('MERCADONA, S.A.'),
      row('Descr pcion | P. Unit | Imp.(€)'),
      row('1 ZANAHORIA 500 G | 0,80'),
      row('PESCALO'),                       // section header "PESCADO" garbled
      row('Salmon Entero'),
      row('2,2t6 kg 241'),                  // weight sub-row garbled
      row('1 BANANA'),
      row('1 PARKIIG'),                     // "PARKING" garbled
      row('Ek Rada 19:11 Salioa 19:42'),    // "ENTRADA/SALIDA" garbled
      row('TOTAL (€) | 86,01'),
    ];
    const result = parseReceipt(rows);
    const names = result.items.map(i => i.rawName);
    expect(names).toEqual(['ZANAHORIA 500 G', 'Salmon Entero', 'BANANA']);
  });

  it('ignores anchor words in the bottom tax table (real Lidl case)', () => {
    // Lidl prints "PVP" in the IVA summary at the BOTTOM — the start anchor
    // must not match there, or every product above gets discarded.
    const rows = [
      row('LIDL SUPERMERCADOS S.A.U'),
      row('Ctra. Loeches, 49'),
      row('28850Torrejón de Ardoz'),
      row('NIF A60195278'),
      row('EUR'),
      row('ZUMO NARANJA S/PULPA | 1,79 B'),
      row('PAN BLANCO S/CORTEZA | 0,99x | 2 | 1,98 A'),
      row('TOTAL | 3,77'),
      row('ENTREGA | 4,02'),
      row('Cambio | -0,25'),
      row('IVA% | IVA | + | P N | = | PVP'),
      row('A 4% | 0,08 | 1,90 | 1,98'),
      row('Suma | 0,24 | 3,53 | 3,77'),
      row('Regístrate en Lidl Plus y ahorra'),
      row('en tus próximas compras'),
    ];
    const result = parseReceipt(rows);
    const names = result.items.map(i => i.rawName);
    expect(names).toEqual(['ZUMO NARANJA S/PULPA', 'PAN BLANCO S/CORTEZA']);
    expect(result.items[1].quantity).toBe(2);
  });

  it('ends the table on a truncated tax-summary header (real Merkocash case)', () => {
    // The photo crop cut the tax table header mid-word ("Resumen po" instead
    // of "RESUMEN POR BASES DE IVA") — END_ANCHOR must not require the full
    // phrase or the fragment leaks through as a fake product.
    const rows = [
      row('MERKOCASH'),
      row('Descripcion | Cant | Pvp | Total'),
      row('PAN ROSQUILLA | 1.0 | 0.99 | 0.99'),
      row('Resumen po'),
    ];
    const result = parseReceipt(rows);
    const names = result.items.map(i => i.rawName);
    expect(names).toEqual(['PAN ROSQUILLA']);
  });

  it('discards an OCR-garbled "Polígono" address line (real Costco case)', () => {
    // OCR read "POLÍGONO" as "Pollgono" (double L, no accent) — the noise
    // pattern only covered the I/Í spellings, so this leaked in as a
    // priceless "product" (Costco never requires a price per row).
    const rows = [
      row('COSTCO WHOLESALE'),
      row('Pollgono Industrial «Los Gavilanes»'),
      row('Muffins doble choc'),
      row('10450 V | 1x | 5,99 | 5,99 B'),
    ];
    const result = parseReceipt(rows);
    const names = result.items.map(i => i.rawName);
    expect(names).toEqual(['Muffins doble choc']);
  });

  it('drops an orphan price fragment that lost its leading digit (real device case)', () => {
    // "2 CREMA VERDURAS  1,70  3,40" — OCR dropped the leading "1" of the
    // unit price, leaving a bare ",70" token that doesn't match PRICE_TOKEN
    // (which requires a leading digit) and used to leak into the name.
    const p = extractProduct(row('2 CREMA VERDURAS ,70 3,40'));
    expect(p).toEqual(jasmine.objectContaining({ rawName: 'CREMA VERDURAS', quantity: 2 }));
  });

  it('parses Lidl price-times-qty even when OCR merges it into one cell (real device case)', () => {
    // Device scan: "0,99x" and "2" arrived glued into a single cell/token
    // ("0,99x2"), not split — cell-level matching missed this, token-level
    // matching (splitting cells on whitespace) catches it.
    const glued = extractProduct(row('PAN BLANCO S/CORTEZA 0,99x2 1,98 A'));
    expect(glued).toEqual(jasmine.objectContaining({ rawName: 'PAN BLANCO S/CORTEZA', quantity: 2 }));

    // Also handle "0,99x 2" merged into one cell with a space (still one
    // ReceiptRow cell, since OCR line reconstruction didn't split it).
    const spaced = extractProduct(row('PAN BLANCO S/CORTEZA 0,99x 2 1,98 A'));
    expect(spaced).toEqual(jasmine.objectContaining({ rawName: 'PAN BLANCO S/CORTEZA', quantity: 2 }));
  });

  it('treats a leading OCR-garbled I as quantity 1 and strips promo codes (real cases)', () => {
    // "1 SOJA..." read as "I Soja..." (Mercadona) — I is qty 1, not name.
    const p = extractProduct(row('I SOJA CON CHOCOLATE | 1,55'));
    expect(p).toEqual(jasmine.objectContaining({ rawName: 'SOJA CON CHOCOLATE', quantity: 1 }));

    // Carrefour promo code "B551" + "30%" marker must not pollute names.
    const p2 = extractProduct(row('DANONIN0 FRESAS 6 | B551 | 1,69'));
    expect(p2!.rawName).toBe('DANONINO FRESAS 6');
    const p3 = extractProduct(row('BANANA GRANEL | 30% | 1,29'));
    expect(p3!.rawName).toBe('BANANA GRANEL');
  });

  it('skips discount rows and consolidates duplicated products', () => {
    const rows = [
      row('ALDI'),
      row('SOLOMILLO SALMON 2 PZ | 5,94 € 3'),
      row('Descuento posición 30% | -1,78 €'),
      row('SOLOMILLO SALMON 2 PZ | 5,94 € 3'),
      row('A PAGAR | 32,03 €'),
    ];
    const result = parseReceipt(rows);
    expect(result.items.length).toBe(1);
    expect(result.items[0].quantity).toBe(2);
  });
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

describe('receipt-matching.domain', () => {
  const candidates = [
    { id: '1', name: 'Aceite de Oliva' },
    { id: '2', name: 'Pechuga de Pollo' },
    { id: '3', name: 'Aguacates' },
    { id: '4', name: 'Salsa de Tomate' },
  ];

  it('matches truncated receipt names', () => {
    const m = matchReceiptName('ACEITUNA CANO', candidates);
    // Aceituna ≠ Aceite (prefix "aceit" would be too greedy at 3+; verify it doesn't cross-match strongly)
    expect(m === null || m.score < MATCH_AUTO_THRESHOLD).toBeTrue();
  });

  it('matches OCR-garbled names via token prefixes', () => {
    const m = matchReceiptName('CONTRAMUSLO POLLO', candidates);
    expect(m?.id).toBe('2'); // pollo token
  });

  it('matches exact-ish names with high score', () => {
    const m = matchReceiptName('SALSA TOMATE', candidates);
    expect(m?.id).toBe('4');
    expect(m!.score).toBeGreaterThanOrEqual(MATCH_AUTO_THRESHOLD);
  });

  it('returns null when nothing is close', () => {
    expect(matchReceiptName('JEANS MUJER', candidates)).toBeNull();
  });
});

describe('parseReceipt — consolidating a product printed once per unit', () => {
  it('folds rows that differ only by an accent or a stray space', () => {
    // Costco and Aldi print one row per unit, and OCR is not consistent about
    // accents or trailing spaces within a single receipt. Keying on the raw
    // lowercase text left the same product in the sheet twice.
    const rows = [
      row('ATUN CLARO | 2,45'),
      row('ATÚN CLARO | 2,45'),
      row('ATUN CLARO  | 2,45'),
      row('TOTAL (€) | 7,35'),
    ];
    const result = parseReceipt(rows);
    const tuna = result.items.filter(i => /atun|atún/i.test(i.rawName));
    expect(tuna.length).toBe(1);
    expect(tuna[0].quantity).toBe(3);
  });

  it('keeps genuinely different products apart', () => {
    const rows = [
      row('ATUN CLARO | 2,45'),
      row('ATUN ROJO | 4,95'),
      row('TOTAL (€) | 7,40'),
    ];
    const result = parseReceipt(rows);
    expect(result.items.filter(i => /atun/i.test(i.rawName)).length).toBe(2);
  });
});
