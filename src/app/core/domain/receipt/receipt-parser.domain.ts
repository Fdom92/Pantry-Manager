import type {
  ParsedReceiptItem,
  ReceiptParseResult,
  ReceiptRow,
  ReceiptRowKind,
} from '@core/models/receipt';

/**
 * Rule-based receipt parser. Geometry-first, chain profiles as hints.
 *
 * Quantity encodings seen in real fixtures (2026-07):
 *  - Mercadona / Eroski: leading digit in the name row      "2 COCA COLA ZERO"
 *  - Costco:             "1x" in the data row               "8505281V 1x 5,49"
 *  - Dia:                "6X" cell                          "LECHE ENTERA 6X 0.56"
 *  - Carrefour ES:       multiplier sub-row                 "2 x ( 1,67 )"
 *  - Merkocash:          decimal CANT column cell           "24.0"
 *  - Aldi:               none (always 1) + weight sub-rows  "0,526 kg x 2,39 €/kg"
 */

const SUPERMARKET_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'mercadona', pattern: /M[EI]RCADONA/i },
  { key: 'lidl', pattern: /\bLIDL\b/i },
  { key: 'aldi', pattern: /\bA\s?L\s?D\s?I\b/ },
  { key: 'merkocash', pattern: /MER[KC]O\s?CASH/i },
  { key: 'costco', pattern: /COSTCO/i },
  { key: 'dia', pattern: /\bDIA\s?%|DISTRIBUIDORA INTERNACIONAL DE ALIMENT/i },
  { key: 'carrefour', pattern: /CARREFOUR/i },
  { key: 'eroski', pattern: /EROSKI/i },
  { key: 'alcampo', pattern: /ALCAMPO/i },
  { key: 'consum', pattern: /\bCONSUM\b/i },
];

/**
 * Rows matching this mark the table header ("Descripcion  P.Unit  Imp") —
 * when present, everything ABOVE it (store name, address, phone...) is
 * discarded wholesale. Far more robust than per-line noise patterns, because
 * OCR garbles header lines beyond recognition ("Llefono :").
 * Tolerant to garbling: DESCR minus vowels, P. Unit, PVP+TOTAL...
 */
const START_ANCHOR = /(DESCR\s?[IL1]?PC|P\.?\s?UN[IL1]T|DESCRIPTION\b|\bQTE\b|\bPVP\b|\bCANT\b)/i;

/** Rows at/after one of these mark the end of the product zone. */
const END_ANCHOR = /(TOTAL\s*\(|A PAGAR|RESUMEN POR BASES|TOTAL A PAGAR|GUZTIRA|IMPORTE:|SOUS-?TOTAL|SUMME\b|TOTALE\b|MONTANT\b|^TOTAL\b|\bTOTAL €|\bTOTAL\s*\(€\))/i;

/** Rows matching any of these are never products. */
const NOISE_PATTERNS: RegExp[] = [
  /\b(C\.?I\.?F|N\.?I\.?F|NIF|CIF)[.:\s]/i,
  // FONO catches OCR-garbled TELEFONO variants ("Llefono", "TILEFONO").
  /\bTEL[EÉ]?F?O?N?O?\b|\bTLF\b|\bTEL\b[.:\s]|FONO\s*:?/i,
  // Postal-code + city rows that lost their prefix ("850 Torrejón de Ardoz").
  /^\d{3,5}\s+[A-ZÁ-Ü][a-zá-ü]+(\s|$)/,
  /\bwww\.|@|HTTP/i,
  /\bC\.?P\.?[.:\s]?\d{4,5}\b|\bPOL[IÍ]GONO\b|\bCTRA\b|\bAVDA\b|\bC\/\s/i,
  /HORARIO|Lu\.-|LUNES|APERTURA/i,
  /FACTURA|SIMPLIFICADA|FRA\.?\s?NUM|N\.?\s?CAJA|OP:\d|LE ATENDIO|VENDEDOR/i,
  /\bIVA\b|\bMWST\b|\bTVA\b|BASE IMP|CUOTA|%\s?IVA|IMP\.?\s?BRUTO|DESGLOSE/i,
  /TARJETA|BANCARIA|CONTACTLESS|VISA|MASTERCARD|DEBITO|CREDITO|EFECTIVO|CAMBIO|ENTREGADO|PAGO\b|AUT\s?\d|TPV|SANTANDER/i,
  /PARKING|ENTRADA\s+\d{1,2}[:;]\d{2}|SALIDA\s+\d{1,2}[:;]\d{2}/i,
  /DEVOLUCION|JUSTIFICANTE|GRACIAS|VISITA|BIENVENID|RECIBO|CLIENTE|GARANT[IÍ]A/i,
  /CLUB\s?DIA|SOCIO|NEGOCIO\s+\d|MVM\b|^VAL$|ARTPESO|E4\s|FY\d{2}\b/i,
  /DESCRIPCI[OÓ]?N|\bCANT\b|\bPVP\b|\bQTE\b|\bMONTANT\b|P\.?\s?UNIT|DESCRIPTION/i,
  /VENTAS CONTADO|OPERACION|AHORRO|AHORRAD|OFERTAS?$/i,
  /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/,
  /^[\d\s*#:;.,-]+$/,
];

/** Weight sub-row: belongs to the product row above it, not a product itself. */
const WEIGHT_ROW = /\d+[.,]\d+\s*kg\s*[x×]/i;

/** Discount rows: explicit wording, or a lone negative amount (leading or trailing minus). */
const DISCOUNT_ROW = /(DESCUENTO|DESCOMPTE|RABATT|REMISE|SCONTO|BEHERAPENAK|^\s*-\s?\d+[.,]\d{2}\s*€?\s*$|\d+[.,]\d{2}\s?-\s?[A-Z]?\s*$)/i;

const PRICE_TOKEN = /^-?\d{1,4}[.,]\d{2}[-€]?\s?[A-D]?$/;
const CANT_CELL = /^\d{1,2}[.,]0$/;
const QTY_X = /^(\d{1,2})\s?[xX]$/;
const QTY_X_INLINE = /\b(\d{1,2})\s?[xX]\b/;
const LEADING_QTY = /^(\d{1,2})\s+(.{3,})$/;
const PRODUCT_CODE = /^\d{4,}[A-Z]?$/;

export function detectSupermarket(rows: ReceiptRow[]): string | null {
  const head = rows.slice(0, 12).map(r => r.text).join(' ');
  const full = rows.map(r => r.text).join(' ');
  for (const { key, pattern } of SUPERMARKET_PATTERNS) {
    if (pattern.test(head)) return key;
  }
  for (const { key, pattern } of SUPERMARKET_PATTERNS) {
    if (pattern.test(full)) return key;
  }
  return null;
}

export function classifyRow(row: ReceiptRow, productsSoFar: number): ReceiptRowKind {
  const text = row.text;
  if (productsSoFar > 0 && END_ANCHOR.test(text)) return 'end';
  if (WEIGHT_ROW.test(text)) return 'weight';
  if (DISCOUNT_ROW.test(text)) return 'discount';
  // Chain names and company suffixes are header noise, not products.
  if (SUPERMARKET_PATTERNS.some(s => s.pattern.test(text))) return 'noise';
  if (/\bS\.?\s?(A|L)\.?\s?(U|COOP)?\.?\s*$/i.test(text)) return 'noise';
  for (const p of NOISE_PATTERNS) {
    if (p.test(text)) return 'noise';
  }
  return hasNameCell(row) ? 'product' : 'noise';
}

/** Extract name + quantity from a product row. */
export function extractProduct(row: ReceiptRow): ParsedReceiptItem | null {
  let quantity: number | null = null;
  const nameParts: string[] = [];

  for (const rawCell of row.cells) {
    // Cells can themselves contain several tokens when OCR merged them.
    const cell = rawCell.trim();
    if (!cell) continue;
    if (PRICE_TOKEN.test(cell) || PRODUCT_CODE.test(cell)) continue;

    const qtyX = cell.match(QTY_X);
    if (qtyX) { quantity ??= parseInt(qtyX[1], 10); continue; }

    if (CANT_CELL.test(cell)) {
      const n = Math.round(parseFloat(cell.replace(',', '.')));
      if (n >= 1 && n <= 99) { quantity ??= n; continue; }
    }

    nameParts.push(cell);
  }

  let name = nameParts.join(' ').replace(/\s+/g, ' ').trim();

  // Leading quantity glued to the name ("2 COCA COLA ZERO").
  const lead = name.match(LEADING_QTY);
  if (lead && !startsWithWeight(name)) {
    quantity ??= parseInt(lead[1], 10);
    name = lead[2].trim();
  }

  // Inline "6X" / "1x" leftovers inside the name ("LECHE ENTERA 6X").
  const inlineX = name.match(QTY_X_INLINE);
  if (inlineX) {
    quantity ??= parseInt(inlineX[1], 10);
    name = name.replace(QTY_X_INLINE, ' ').replace(/\s+/g, ' ').trim();
  }

  // Strip stray price/code tokens that survived cell-merging.
  const tokens = name
    .split(' ')
    .filter(tok => !PRICE_TOKEN.test(tok) && !PRODUCT_CODE.test(tok));
  // Trailing currency symbols and 1-char VAT class markers ("€ 2", "B") are
  // receipt metadata, never part of the product name.
  while (tokens.length && /^(€|[A-D0-9])$/.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  name = tokens.join(' ').trim();

  name = cleanOcrDigitArtifacts(name);

  const letters = (name.match(/[a-záéíóúüñç]/gi) ?? []).length;
  if (letters < 3) return null;

  return {
    rawName: name,
    quantity: clampQuantity(quantity ?? 1),
    confidence: quantity !== null ? 'high' : 'medium',
  };
}

/**
 * Receipt fonts make OCR read O as 0 and I/L as 1 ("S0JA", "YOGUR L1QUIDO").
 * Only digits flanked by letters are substituted — quantities, sizes ("2 L",
 * "P6", "3x350") are never touched.
 */
export function cleanOcrDigitArtifacts(name: string): string {
  return name.replace(
    /(?<=[a-záéíóúüñç])[01](?=[a-záéíóúüñç])/gi,
    (digit, offset: number, whole: string) => {
      const upper = /[A-ZÁÉÍÓÚÜÑÇ]/.test(whole.charAt(offset - 1));
      if (digit === '0') return upper ? 'O' : 'o';
      return upper ? 'I' : 'i';
    },
  );
}

export function parseReceipt(rows: ReceiptRow[]): ReceiptParseResult {
  const supermarket = detectSupermarket(rows);

  // Zone start: when the table header exists, discard the whole store-header
  // block above it in one move (immune to OCR-garbled address/phone lines).
  const startIdx = rows.findIndex(r => START_ANCHOR.test(r.text));
  const zone = startIdx >= 0 ? rows.slice(startIdx + 1) : rows;

  const items: ParsedReceiptItem[] = [];
  let ended = false;

  for (const row of zone) {
    if (ended) break;
    const kind = classifyRow(row, items.length);
    if (kind === 'end') { ended = true; continue; }
    if (kind !== 'product') continue;
    const product = extractProduct(row);
    if (product) items.push(product);
  }

  return {
    supermarket,
    items: consolidate(items),
    totalRows: rows.length,
  };
}

/** Merge repeated lines of the same product (Costco/Aldi print one row per unit). */
function consolidate(items: ParsedReceiptItem[]): ParsedReceiptItem[] {
  const byKey = new Map<string, ParsedReceiptItem>();
  for (const item of items) {
    const key = item.rawName.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity = clampQuantity(existing.quantity + item.quantity);
      if (item.confidence === 'high') existing.confidence = 'high';
    } else {
      byKey.set(key, { ...item });
    }
  }
  return [...byKey.values()];
}

function hasNameCell(row: ReceiptRow): boolean {
  return row.cells.some(cell => {
    const letters = (cell.match(/[a-záéíóúüñç]/gi) ?? []).length;
    return letters >= 3 && !PRICE_TOKEN.test(cell.trim());
  });
}

function startsWithWeight(text: string): boolean {
  return /^\d+[.,]\d+\s*kg/i.test(text);
}

function clampQuantity(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
}
