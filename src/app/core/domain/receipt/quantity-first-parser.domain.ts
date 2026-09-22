import type { ParsedReceiptItem, ReceiptRow } from '@core/models/receipt';
import {
  DISCOUNT_ROW,
  END_ANCHOR,
  PRICE_TOKEN,
  PRODUCT_CODE,
  clampQuantity,
  cleanOcrDigitArtifacts,
  countLetters,
  isNoiseText,
  stripNameNoise,
  tokenizeRow,
} from './receipt-rules.domain';

// ─────────────────────────────────────────────────────────────────────────
// Quantity-first tables (Family Cash)
//
// Real ticket 2026-09: header "Cant | Precio | Descripción Artículo |
// Importe". The CANT column comes FIRST and holds either a unit count ("2")
// or a weight in kg ("0,39", "1,161"); long names wrap onto a second row
// with no numbers ("LOMOS ATUN CLARO NATURAL" / "FAMILY"). The usual path
// loses weighed rows (WEIGHT_ROW), turns every wrap into a fake product and
// leaves decimal quantities glued into the name — so these tables take
// their own path, decided by the header, not the chain (the chain name is
// often cropped out of the photo).
// ─────────────────────────────────────────────────────────────────────────

/** CANT printed before DESCRIPCION (Merkocash prints it after: "Descripcion | Cant"). */
const QTY_FIRST_HEADER = /\bCANT\b.*DESCR/i;
/** Leading CANT cell: unit count or kg weight ("2", "0,7", "1,161"). */
const LEADING_CANT_TOKEN = /^\d{1,3}([.,]\d{1,3})?$/;
/**
 * Precio cell right after CANT. Looser than PRICE_TOKEN because OCR drops
 * the comma ("1,49" → "149"); only ever applied at that one position, so
 * sizes like "450" or "160" later in the name survive.
 */
const PRECIO_CELL_TOKEN = /^\d{1,4}([.,]\d{1,2})?$/;

export function isQuantityFirstHeader(headerRow: ReceiptRow): boolean {
  return QTY_FIRST_HEADER.test(headerRow.text);
}

/**
 * Merge wrapped rows into their product, then extract each one. A row with
 * a price starts a product; a following price-less row is the rest of its
 * name ("500 GR", "KG", "FAMILY") — no letter-count minimum, sizes wrap
 * too. Merging happens before any name cleanup so a trailing-VAT-letter
 * rule can't eat "DUROC A" before "TACOS" joins it.
 */
export function parseQuantityFirstZone(zone: ReceiptRow[]): ParsedReceiptItem[] {
  const products: ReceiptRow[] = [];
  let current: ReceiptRow | null = null;

  for (const row of zone) {
    if (products.length > 0 && END_ANCHOR.test(row.text)) break;
    if (DISCOUNT_ROW.test(row.text)) { current = null; continue; }
    if (isNoiseText(row.text)) { current = null; continue; }
    const priced = tokenizeRow(row).some(tok => PRICE_TOKEN.test(tok));
    if (priced) {
      current = { ...row, cells: [...row.cells] };
      products.push(current);
    } else if (current) {
      current.cells.push(...row.cells);
      current.text = `${current.text} ${row.text}`;
    }
    // A wrap row with no product before it is ignored.
  }

  return products
    .map(extractQuantityFirstProduct)
    .filter((p): p is ParsedReceiptItem => p !== null);
}

/**
 * Quantity comes from the row's own arithmetic first. Real device OCR of the
 * Family Cash ticket (2026-09): the CANT column is thin and its digit is
 * often lost ("0,75 | MACARRON | 1,50") or misread (a "1" where the ticket
 * printed 2), or merged with Precio into one leading "149". Importe ÷ Precio
 * is the count the till actually charged, so it wins over the CANT digit.
 *
 * Order: a leading weight (decimal CANT) → one item; else a whole
 * importe ÷ precio → that; else a leading 1–2 digit CANT → that; else 1.
 * None of the in-name quantity heuristics run — they would eat "4 X" out of
 * "COCA-COLA 4 X 2 L PET".
 */
function extractQuantityFirstProduct(row: ReceiptRow): ParsedReceiptItem | null {
  const tokens = tokenizeRow(row);
  let cantCount: number | null = null;
  let weighed = false;
  const lead = tokens[0];

  if (lead !== undefined && LEADING_CANT_TOKEN.test(lead)) {
    if (/[.,]/.test(lead)) {
      // A 2-decimal lead with only one other price is the Precio of a row
      // whose CANT was lost; a weight row always carries three numbers
      // (cant 0,39 + precio 4,99 + importe 1,95).
      const priceCount = tokens.filter(tok => PRICE_TOKEN.test(tok)).length;
      const leadIsPrecio = PRICE_TOKEN.test(lead) && priceCount === 2;
      if (!leadIsPrecio) {
        weighed = true;
        tokens.shift();
      }
    } else {
      tokens.shift();
      // 3+ digits is CANT and Precio merged ("1" + "1,49" → "149"), never a count.
      if (lead.length <= 2) cantCount = parseInt(lead, 10);
    }
  }

  const priceQty = weighed ? null : quantityFromPrices(tokens);

  // The token after a CANT digit is the Precio column, even when OCR lost
  // its comma ("149"); drop it so it can't reach the name.
  if (cantCount !== null && tokens.length && PRECIO_CELL_TOKEN.test(tokens[0])) tokens.shift();

  const nameTokens = tokens.filter(tok => !PRICE_TOKEN.test(tok) && !PRODUCT_CODE.test(tok));
  let name = stripNameNoise(nameTokens.join(' '));
  name = stripTrailingKgUnit(name);
  name = cleanOcrDigitArtifacts(name);

  if (countLetters(name) < 3) return null;

  const quantity = weighed ? null : priceQty ?? cantCount;
  return {
    rawName: name,
    quantity: clampQuantity(quantity ?? 1),
    confidence: quantity !== null ? 'high' : 'medium',
  };
}

/** Importe ÷ Precio (last ÷ first 2-decimal price) when it is a whole count. */
function quantityFromPrices(tokens: string[]): number | null {
  const prices = tokens
    .filter(tok => PRICE_TOKEN.test(tok))
    .map(tok => parseFloat(tok.replace(',', '.')));
  if (prices.length < 2 || prices[0] <= 0) return null;
  const ratio = prices[prices.length - 1] / prices[0];
  const rounded = Math.round(ratio);
  return ratio >= 1 && Math.abs(ratio - rounded) < 0.02 ? rounded : null;
}

/**
 * "CLEMENTINA KG": KG marks a sold-by-weight item, not the name; "FIDEUA
 * FAMILY 1 KG" is a pack size and keeps it.
 */
function stripTrailingKgUnit(name: string): string {
  const tokens = name.split(' ');
  const prev = tokens[tokens.length - 2];
  if (/^KG$/i.test(tokens[tokens.length - 1]) && prev && !/^\d+([.,]\d+)?$/.test(prev)) {
    tokens.pop();
  }
  return tokens.join(' ');
}
