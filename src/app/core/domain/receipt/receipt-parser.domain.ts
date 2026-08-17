import type {
  ParsedReceiptItem,
  ReceiptParseResult,
  ReceiptRow,
  ReceiptRowKind,
} from '@core/models/receipt';

/**
 * Rule-based receipt parser. Geometry-first, chain profiles as hints.
 *
 * Every pattern below exists because a real scanned ticket needed it — see
 * the git history of this file for the source ticket per rule. This is a
 * fallback parser (free tier + offline path); the PRO tier sends OCR text to
 * an LLM instead, which handles garbling this file cannot enumerate.
 *
 * Pipeline: parseReceipt() finds the product zone (detectSupermarket +
 * zone-boundary anchors), classifyRow() labels each row, extractProduct()
 * turns a product row into a name + quantity.
 */

// ─────────────────────────────────────────────────────────────────────────
// Supermarket detection
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// Product-zone boundaries
// ─────────────────────────────────────────────────────────────────────────

/**
 * Table header row ("Descripcion  P.Unit  Imp") — when present, everything
 * ABOVE it (store name, address, phone...) is discarded wholesale. Far more
 * robust than per-line noise patterns, because OCR garbles header lines
 * beyond recognition ("Llefono :"). Tolerant to garbling: DESCR minus
 * vowels, P. Unit, PVP+TOTAL...
 */
const START_ANCHOR = /(DESCR\s?[IL1]?PC|P\.?\s?UN[IL1]T|DESCRIPTION\b|\bQTE\b|\bPVP\b|\bCANT\b)/i;

/** Rows at/after one of these mark the end of the product zone. */
const END_ANCHOR = /(TOTAL\s*\(|A PAGAR|\bRESUMEN\b|TOTAL A PAGAR|GUZTIRA|IMPORTE:|SOUS-?TOTAL|SUMME\b|TOTALE\b|MONTANT\b|^TOTAL\b|\bTOTAL €|\bTOTAL\s*\(€\))/i;

// ─────────────────────────────────────────────────────────────────────────
// Row classification (noise filtering)
// ─────────────────────────────────────────────────────────────────────────

/** Company registration IDs printed near the header (CIF/NIF). */
const FISCAL_ID_NOISE = [
  /\b(C\.?I\.?F|N\.?I\.?F|NIF|CIF)[.:\s]/i,
];

/** Store contact block: phone, address, opening hours. */
const STORE_CONTACT_NOISE = [
  // FONO catches OCR-garbled TELEFONO variants ("Llefono", "TILEFONO").
  /\bTEL[EÉ]?F?O?N?O?\b|\bTLF\b|\bTEL\b[.:\s]|FONO\s*:?/i,
  // Postal-code + city rows that lost their prefix ("850 Torrejón de Ardoz").
  /^\d{3,5}\s+[A-ZÁ-Ü][a-zá-ü]+(\s|$)/,
  /\bwww\.|@|HTTP/i,
  /\bC\.?P\.?[.:\s]?\d{4,5}\b|\bPOL[IÍL]{1,2}GONO\b|\bCTRA\b|\bAVDA\b|\bC\/\s/i,
  /HORARIO|Lu\.-|LUNES|APERTURA/i,
];

/** Invoice number, cashier, register operation code — transaction metadata. */
const TRANSACTION_META_NOISE = [
  /FACTURA|SIMPLIFICADA|FRA\.?\s?NUM|N\.?\s?CAJA|OP:\d|LE ATENDIO|VENDEDOR/i,
  /DESCRIPCI[OÓ]?N|\bCANT\b|\bPVP\b|\bQTE\b|\bMONTANT\b|P\.?\s?UNIT|DESCRIPTION/i,
  /VENTAS CONTADO|OPERACION/i,
];

/** IVA/VAT breakdown table. */
const TAX_TABLE_NOISE = [
  /\bIVA\b|\bMWST\b|\bTVA\b|BASE IMP|CUOTA|%\s?IVA|IMP\.?\s?BRUTO|DESGLOSE/i,
];

/** Payment method lines and Lidl-style "ENTREGA"/"Suma" totals subtable. */
const PAYMENT_NOISE = [
  /TARJETA|BANCARIA|CONTACTLESS|VISA|MASTERCARD|DEBITO|CREDITO|EFECTIVO|CAMBIO|ENTREGADO|PAGO\b|AUT\s?\d|TPV|SANTANDER/i,
  /^SUMA\b|^ENTREGA\b/i,
];

/** Garage/parking validation lines some supermarkets print on the ticket. */
const PARKING_NOISE = [
  // PARK\w{0,3}G tolerates OCR garbling ("Parkiig"); two clock times in one
  // row is the ENTRADA/SALIDA line however garbled the words are.
  /PARK\w{0,3}G\b|ENTRADA\s+\d{1,2}[:;]\d{2}|SALIDA\s+\d{1,2}[:;]\d{2}/i,
  /\d{1,2}[:;]\d{2}.*\d{1,2}[:;]\d{2}/,
];

/**
 * Counter section headers ("PESCADO", "CARNICERIA"): a single word,
 * garble-tolerant via prefix match. Never a real product — products always
 * carry quantity/price context, section headers never do.
 */
const SECTION_HEADER_NOISE = [
  /^(PESCA|CARNIC|FRUTER|CHARCUT|PANAD|DROGUER)[A-ZÁ-Üa-zá-ü]{0,6}$/i,
];

/** Loyalty program, reprint marker, footer boilerplate, upsell copy. */
const MARKETING_NOISE = [
  /DUPLICADO|A[ÑN]OS\s+CONTIGO|CLUBP/i,
  /DEVOLUCION|JUSTIFICANTE|GRACIAS|VISITA|BIENVENID|RECIBO|CLIENTE|GARANT[IÍ]A/i,
  /CLUB\s?DIA|SOCIO|NEGOCIO\s+\d|MVM\b|^VAL$|ARTPESO|E4\s|FY\d{2}\b/i,
  /AHORRO|AHORRAD|OFERTAS?$/i,
  /REG[IÍ]STRATE|PR[OÓ]XIMAS COMPRAS|\bPLUS\b.*AHORRA/i,
];

/** Bare dates and lines that are only punctuation/digits (barcodes, dividers). */
const FORMATTING_NOISE = [
  /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/,
  /^[\d\s*#:;.,-]+$/,
];

/** Rows matching any of these are never products. */
const NOISE_PATTERNS: RegExp[] = [
  ...FISCAL_ID_NOISE,
  ...STORE_CONTACT_NOISE,
  ...TRANSACTION_META_NOISE,
  ...TAX_TABLE_NOISE,
  ...PAYMENT_NOISE,
  ...PARKING_NOISE,
  ...SECTION_HEADER_NOISE,
  ...MARKETING_NOISE,
  ...FORMATTING_NOISE,
];

/**
 * Weight sub-row: belongs to the product row above it, not a product itself.
 * Second alternative catches OCR-garbled variants ("2,2t6 kg 241"): rows that
 * START with a decimal number and mention kg are always weight lines —
 * product rows never open with a decimal.
 */
const WEIGHT_ROW = /(\d+[.,]\d+\s*kg\s*[x×]|^\d+[.,]\d\S*\s.*\bkg\b)/i;

/** Discount rows: explicit wording, or a lone negative amount (leading or trailing minus). */
const DISCOUNT_ROW = /(DESCUENTO|DESCOMPTE|RABATT|REMISE|SCONTO|BEHERAPENAK|^\s*-\s?\d+[.,]\d{2}\s*€?\s*$|\d+[.,]\d{2}\s?-\s?[A-Z]?\s*$)/i;

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

// ─────────────────────────────────────────────────────────────────────────
// Quantity encodings
//
// Real fixtures (2026-07) use six different ways to encode quantity:
//  - Mercadona / Eroski: leading digit in the name row      "2 COCA COLA ZERO"
//  - Mercadona (OCR):    leading "1" misread as "I"         "I SOJA NATURAL"
//  - Costco / Dia:       "Nx" token                         "1x", "6X"
//  - Lidl:                "<unit price>x" + count            "0,99x 2" / "0,99x2"
//  - Merkocash:           decimal CANT column cell           "24.0"
//  - Aldi:                none (always 1) + weight sub-rows  "0,526 kg x 2,39 €/kg"
// ─────────────────────────────────────────────────────────────────────────

const PRICE_TOKEN = /^-?\d{1,4}[.,]\d{2}[-€]?\s?[A-D]?$/;
const PRODUCT_CODE = /^\d{4,}[A-Z]?$/;
const PROMO_CODE = /^[A-Z]\d{3,}$/;
const PERCENT_MARKER = /^\d{1,3}%$/;
/** Price fragment that lost its leading digit to OCR noise (",70", ".40") — never a real product-name token. */
const ORPHAN_PRICE_FRAGMENT = /^[.,]\d{2}$/;

const CANT_CELL = /^\d{1,2}[.,]0$/;
const QTY_X = /^(\d{1,2})\s?[xX]$/;
/** Lidl multiplier: "<unit price>x" followed by the count in the next token. */
const PRICE_TIMES_CELL = /^\d{1,4}[.,]\d{2}\s?[xX]$/;
/** Lidl multiplier glued into one token: "0,99x2" (no space before the count). */
const GLUED_PRICE_TIMES = /^(\d{1,4}[.,]\d{2})[xX](\d{1,2})$/;
// Negative lookbehind: don't fire inside a decimal price ("0,99x" is a Lidl
// price-times marker, not a quantity).
const QTY_X_INLINE = /(?<![\d.,])(\d{1,2})\s?[xX]\b/;
const LEADING_QTY = /^(\d{1,2})\s+(.{3,})$/;
/** OCR misreads a leading "1" as I/l/| ("I SOJA CON CHOCOLATE"). */
const LEADING_GARBLED_ONE = /^[Il|]\s+(.{3,})$/;

/** Extract name + quantity from a product row. */
export function extractProduct(row: ReceiptRow): ParsedReceiptItem | null {
  const tokens = tokenizeRow(row);
  let { quantity, nameTokens } = splitTokens(tokens);
  let name = nameTokens.join(' ').replace(/\s+/g, ' ').trim();

  // Three name-level passes for quantity markers that survive tokenization
  // glued to a word rather than standing as their own token — each was
  // added for one real ticket, see the docblock on each helper.
  ({ name, quantity } = applyLeadingGarbledOne(name, quantity));
  ({ name, quantity } = applyLeadingQuantity(name, quantity));
  ({ name, quantity } = applyInlineMultiplier(name, quantity));

  name = stripNameNoise(name);
  name = cleanOcrDigitArtifacts(name);

  if (countLetters(name) < 3) return null;

  return {
    rawName: name,
    quantity: clampQuantity(quantity ?? 1),
    confidence: quantity !== null ? 'high' : 'medium',
  };
}

/**
 * Flatten every cell into whitespace-separated tokens. OCR doesn't reliably
 * split "0,99x" and "2" into distinct cells — depending on spacing/kerning
 * they can arrive merged into one line ("0,99x2" or "0,99x 2" as a single
 * cell) — so pattern-match at token granularity, not cell granularity.
 */
function tokenizeRow(row: ReceiptRow): string[] {
  return row.cells.flatMap(c => c.trim().split(/\s+/)).filter(Boolean);
}

type TokenOutcome =
  | { kind: 'quantity'; value: number; consumedNext: boolean }
  | { kind: 'drop' };

/**
 * Walk tokens once: tokens that encode a quantity are consumed and never
 * added to the name. Prices and product codes are dropped silently.
 * Everything else becomes part of the product name.
 */
function splitTokens(tokens: string[]): { quantity: number | null; nameTokens: string[] } {
  let quantity: number | null = null;
  const nameTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const outcome = classifyToken(tokens[i], tokens[i + 1]);
    if (!outcome) {
      nameTokens.push(tokens[i]);
      continue;
    }
    if (outcome.kind === 'quantity') {
      quantity ??= outcome.value;
      if (outcome.consumedNext) i++;
    }
    // 'drop' and 'quantity' both fall through without joining the name.
  }

  return { quantity, nameTokens };
}

/** Try each known quantity encoding against one token, in priority order. */
function classifyToken(token: string, next: string | undefined): TokenOutcome | null {
  if (PRICE_TIMES_CELL.test(token)) {
    if (next && /^\d{1,2}$/.test(next)) {
      return { kind: 'quantity', value: parseInt(next, 10), consumedNext: true };
    }
    return { kind: 'drop' };
  }

  const glued = token.match(GLUED_PRICE_TIMES);
  if (glued) return { kind: 'quantity', value: parseInt(glued[2], 10), consumedNext: false };

  const qtyX = token.match(QTY_X);
  if (qtyX) return { kind: 'quantity', value: parseInt(qtyX[1], 10), consumedNext: false };

  if (CANT_CELL.test(token)) {
    const n = Math.round(parseFloat(token.replace(',', '.')));
    if (n >= 1 && n <= 99) return { kind: 'quantity', value: n, consumedNext: false };
  }

  if (PRICE_TOKEN.test(token) || PRODUCT_CODE.test(token)) return { kind: 'drop' };

  return null;
}

/** Real ticket: "I SOJA CON CHOCOLATE" — the "1" was OCR'd as a capital I. */
function applyLeadingGarbledOne(
  name: string,
  quantity: number | null,
): { name: string; quantity: number | null } {
  const match = name.match(LEADING_GARBLED_ONE);
  if (match && /[A-ZÁ-Ü0-9]/.test(match[1].charAt(0))) {
    return { name: match[1].trim(), quantity: quantity ?? 1 };
  }
  return { name, quantity };
}

/** Real ticket: "2 COCA COLA ZERO" (Mercadona/Eroski) — never for weight sub-rows. */
function applyLeadingQuantity(
  name: string,
  quantity: number | null,
): { name: string; quantity: number | null } {
  const match = name.match(LEADING_QTY);
  if (match && !startsWithWeight(name)) {
    return { name: match[2].trim(), quantity: quantity ?? parseInt(match[1], 10) };
  }
  return { name, quantity };
}

/** Real ticket: "LECHE ENTERA 6X" (Dia) — an "Nx" marker left inside the name. */
function applyInlineMultiplier(
  name: string,
  quantity: number | null,
): { name: string; quantity: number | null } {
  const match = name.match(QTY_X_INLINE);
  if (match) {
    return {
      name: name.replace(QTY_X_INLINE, ' ').replace(/\s+/g, ' ').trim(),
      quantity: quantity ?? parseInt(match[1], 10),
    };
  }
  return { name, quantity };
}

/**
 * Strip stray price/code tokens that survived cell-merging (prices, long
 * numeric codes, promo codes "B551", percent markers "30%"), then strip
 * trailing receipt metadata: "€ 2" (currency + VAT class), a bare "€", or a
 * 1-char VAT letter ("B"). A bare trailing digit is kept — it can be a
 * legit size ("FRESAS 6").
 */
function stripNameNoise(name: string): string {
  const tokens = name
    .split(' ')
    .filter(tok =>
      !PRICE_TOKEN.test(tok) &&
      !PRODUCT_CODE.test(tok) &&
      !PROMO_CODE.test(tok) &&
      !PERCENT_MARKER.test(tok) &&
      !ORPHAN_PRICE_FRAGMENT.test(tok),
    );

  while (tokens.length) {
    const last = tokens[tokens.length - 1];
    const prev = tokens[tokens.length - 2];
    if (/^[0-9]$/.test(last) && prev === '€') {
      tokens.pop();
      tokens.pop();
    } else if (last === '€' || /^[A-D]$/.test(last)) {
      tokens.pop();
    } else {
      break;
    }
  }

  return tokens.join(' ').trim();
}

/**
 * Receipt fonts make OCR read O as 0 and I/L as 1 ("S0JA", "YOGUR L1QUIDO").
 * Only digits flanked by letters are substituted — quantities, sizes ("2 L",
 * "P6", "3x350") are never touched.
 */
export function cleanOcrDigitArtifacts(name: string): string {
  return name
    .replace(
      /(?<=[a-záéíóúüñç])[01](?=[a-záéíóúüñç])/gi,
      (digit, offset: number, whole: string) => {
        const upper = /[A-ZÁÉÍÓÚÜÑÇ]/.test(whole.charAt(offset - 1));
        if (digit === '0') return upper ? 'O' : 'o';
        return upper ? 'I' : 'i';
      },
    )
    // Word-final 0 after 2+ letters ("DANONIN0" → DANONINO). Sizes like
    // "P6" or standalone numbers ("1 800") are untouched.
    .replace(
      /(?<=[a-záéíóúüñç]{2})0\b/gi,
      (_digit, offset: number, whole: string) => {
        const upper = /[A-ZÁÉÍÓÚÜÑÇ]/.test(whole.charAt(offset - 1));
        return upper ? 'O' : 'o';
      },
    );
}

function countLetters(s: string): number {
  return (s.match(/[a-záéíóúüñç]/gi) ?? []).length;
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level parse
// ─────────────────────────────────────────────────────────────────────────

export function parseReceipt(rows: ReceiptRow[]): ReceiptParseResult {
  const supermarket = detectSupermarket(rows);
  const startIdx = findZoneStart(rows);
  const zone = startIdx >= 0 ? rows.slice(startIdx + 1) : rows;

  // Without a start anchor (Carrefour, Aldi, Lidl print no table header) the
  // store-branding block can't be cut positionally — instead, only rows that
  // carry a price qualify as products. Costco is exempt: its product names
  // sit on their own price-less row above the data line.
  const requirePrice = startIdx < 0 && supermarket !== 'costco';

  const items: ParsedReceiptItem[] = [];
  let ended = false;

  for (const row of zone) {
    if (ended) break;
    const kind = classifyRow(row, items.length);
    if (kind === 'end') { ended = true; continue; }
    if (kind !== 'product') continue;
    if (requirePrice && !rowHasPrice(row)) continue;
    const product = extractProduct(row);
    if (product) items.push(product);
  }

  return {
    supermarket,
    items: consolidate(items),
    totalRows: rows.length,
  };
}

/**
 * Index of the table-header row, or -1 if there isn't one usable as an
 * anchor. Only valid BEFORE the first priced row: anchor words like PVP
 * also appear in the tax-summary table at the BOTTOM of some tickets
 * (Lidl), and matching there would discard every product above it. Store
 * headers never carry prices; product rows do.
 */
function findZoneStart(rows: ReceiptRow[]): number {
  const firstPricedIdx = rows.findIndex(rowHasPrice);
  const anchorIdx = rows.findIndex(r => START_ANCHOR.test(r.text));
  if (anchorIdx < 0) return -1;
  if (firstPricedIdx >= 0 && anchorIdx >= firstPricedIdx) return -1;
  return anchorIdx;
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

/** True when any token in the row looks like a price ("1,75", "12.19"). */
function rowHasPrice(row: ReceiptRow): boolean {
  return /\d+[.,]\d{2}([^\d]|$)/.test(row.text);
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
