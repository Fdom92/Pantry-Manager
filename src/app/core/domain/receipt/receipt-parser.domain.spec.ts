import { reconstructRows } from './receipt-geometry.domain';
import { detectSupermarket, extractProduct, parseReceipt } from './receipt-parser.domain';
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
