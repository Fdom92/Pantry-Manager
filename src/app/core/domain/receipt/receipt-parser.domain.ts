import { normalizeProductKey } from '@core/utils/normalization.util';
import type {
  ParsedReceiptItem,
  ReceiptParseResult,
  ReceiptRow,
  ReceiptRowKind,
} from '@core/models/receipt';
import { isQuantityFirstHeader, parseQuantityFirstZone } from './quantity-first-parser.domain';
import {
  DISCOUNT_ROW,
  END_ANCHOR,
  PRICE_TOKEN,
  PRODUCT_CODE,
  SUPERMARKET_PATTERNS,
  clampQuantity,
  cleanOcrDigitArtifacts,
  countLetters,
  isNoiseText,
  stripNameNoise,
  tokenizeRow,
} from './receipt-rules.domain';

// Public API that moved out with the split; keep it importable from here.
export { cleanOcrDigitArtifacts } from './receipt-rules.domain';
export { isQuantityFirstHeader } from './quantity-first-parser.domain';

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
 *
 * Layout-specific readers live in their own files
 * (quantity-first-parser.domain.ts); add a new one when a layout needs its
 * own rules, and dispatch to it from parseReceipt. Rules both readers use
 * (chain names, noise, end anchor, token primitives) are in
 * receipt-rules.domain.ts.
 */

// ─────────────────────────────────────────────────────────────────────────
// Supermarket detection
// ─────────────────────────────────────────────────────────────────────────

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

// The end of the zone (END_ANCHOR) is in receipt-rules.domain.ts: both
// readers stop there.

// ─────────────────────────────────────────────────────────────────────────
// Row classification (the noise catalogue is in receipt-rules.domain.ts)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Weight sub-row: belongs to the product row above it, not a product itself.
 * Second alternative catches OCR-garbled variants ("2,2t6 kg 241"): rows that
 * START with a decimal number and mention kg are always weight lines —
 * product rows never open with a decimal.
 */
const WEIGHT_ROW = /(\d+[.,]\d+\s*kg\s*[x×]|^\d+[.,]\d\S*\s.*\bkg\b)/i;

export function classifyRow(row: ReceiptRow, productsSoFar: number): ReceiptRowKind {
  const text = row.text;
  if (productsSoFar > 0 && END_ANCHOR.test(text)) return 'end';
  if (WEIGHT_ROW.test(text)) return 'weight';
  if (DISCOUNT_ROW.test(text)) return 'discount';
  if (isNoiseText(text)) return 'noise';
  return hasNameCell(row) ? 'product' : 'noise';
}

// ─────────────────────────────────────────────────────────────────────────
// Quantity encodings
//
// Real fixtures (2026-07/09) use seven different ways to encode quantity:
//  - Mercadona / Eroski: leading digit in the name row      "2 COCA COLA ZERO"
//  - Mercadona (OCR):    leading "1" misread as "I"         "I SOJA NATURAL"
//  - Costco / Dia:       "Nx" token                         "1x", "6X"
//  - Lidl:                "<unit price>x" + count            "0,99x 2" / "0,99x2"
//  - Merkocash:           decimal CANT column cell           "24.0"
//  - Aldi:                none (always 1) + weight sub-rows  "0,526 kg x 2,39 €/kg"
//  - Family Cash:         leading CANT column, decimal = weight in kg
//                                                            "2 | 0,75 | MACARRON", "0,39 | 4,99 | MAGRO"
//                         count taken from importe ÷ precio when whole
//                         (own reader: quantity-first-parser.domain.ts)
// ─────────────────────────────────────────────────────────────────────────

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
  const { quantity: splitQuantity, nameTokens } = splitTokens(tokens);
  let quantity = splitQuantity;
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

  if (startIdx >= 0 && isQuantityFirstHeader(rows[startIdx])) {
    return {
      supermarket,
      items: consolidate(parseQuantityFirstZone(zone)),
      totalRows: rows.length,
    };
  }

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
    // normalizeProductKey, not toLowerCase: OCR is not consistent about accents
    // or trailing spaces within one receipt, and these chains print a row per
    // unit, so "ATÚN" and "ATUN " have to land on the same key or the product
    // shows up twice in the review sheet instead of as a quantity of two.
    const key = normalizeProductKey(item.rawName);
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
