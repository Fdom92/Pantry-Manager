import type { ReceiptRow } from '@core/models/receipt';

/**
 * Rules shared by every receipt reader: the regular one in
 * receipt-parser.domain.ts and the layout-specific ones
 * (quantity-first-parser.domain.ts). Lives apart so those files can both
 * import it without importing each other.
 *
 * Same convention as the parser: every pattern cites the real ticket that
 * needed it. Rules older than this file were moved here from
 * receipt-parser.domain.ts; their source tickets are in that file's history
 * (`git log --follow` does not cross the move; `git blame -C -C` does).
 */

// ─────────────────────────────────────────────────────────────────────────
// Chain names
// ─────────────────────────────────────────────────────────────────────────

export const SUPERMARKET_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
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
  // Not /FAMILY/ alone: "FAMILY" is their house brand on product rows, and
  // rows matching a chain pattern are classified as noise.
  { key: 'familycash', pattern: /FAMILY\s?CASH/i },
];

// ─────────────────────────────────────────────────────────────────────────
// Row rules: end of the product zone, discounts, noise
// ─────────────────────────────────────────────────────────────────────────

/** Rows at/after one of these mark the end of the product zone. */
export const END_ANCHOR = /(TOTAL\s*\(|A PAGAR|\bRESUMEN\b|TOTAL A PAGAR|GUZTIRA|IMPORTE:|SOUS-?TOTAL|SUMME\b|TOTALE\b|MONTANT\b|^TOTAL\b|\bTOTAL €|\bTOTAL\s*\(€\))/i;

/** Discount rows: explicit wording, or a lone negative amount (leading or trailing minus). */
export const DISCOUNT_ROW = /(DESCUENTO|DESCOMPTE|RABATT|REMISE|SCONTO|BEHERAPENAK|^\s*-\s?\d+[.,]\d{2}\s*€?\s*$|\d+[.,]\d{2}\s?-\s?[A-Z]?\s*$)/i;

/** Company registration IDs printed near the header (CIF/NIF). */
const FISCAL_ID_NOISE = [
  /\b(C\.?I\.?F|N\.?I\.?F|NIF|CIF)[.:\s]/i,
];

/** Store contact block: phone, address, opening hours. */
const STORE_CONTACT_NOISE = [
  // Phone labels only: TELEFONO / TELÉFONO / TELF / TELEF. (the F is
  // required), TLF, or a bare TEL followed by "." ":" or a space. FONO
  // catches OCR-garbled variants ("Llefono", "TILEFONO"). The F is required
  // because Family Cash 2026-09 printed "AGUA MINERAL TELENO" (a water
  // brand sold in many chains): the old TEL + optional E/F/O/N/O letters
  // matched TELENO and dropped the product as a phone line.
  /\bTEL[EÉ]?F|\bTLF\b|\bTEL\b[.:\s]|FONO\s*:?/i,
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

/** Chain names, company suffixes and every NOISE_PATTERNS entry. */
export function isNoiseText(text: string): boolean {
  // Chain names and company suffixes are header noise, not products.
  if (SUPERMARKET_PATTERNS.some(s => s.pattern.test(text))) return true;
  if (/\bS\.?\s?(A|L)\.?\s?(U|COOP)?\.?\s*$/i.test(text)) return true;
  return NOISE_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────
// Token primitives and name cleanup
// ─────────────────────────────────────────────────────────────────────────

export const PRICE_TOKEN = /^-?\d{1,4}[.,]\d{2}[-€]?\s?[A-D]?$/;
export const PRODUCT_CODE = /^\d{4,}[A-Z]?$/;
const PROMO_CODE = /^[A-Z]\d{3,}$/;
const PERCENT_MARKER = /^\d{1,3}%$/;
/** Price fragment that lost its leading digit to OCR noise (",70", ".40") — never a real product-name token. */
const ORPHAN_PRICE_FRAGMENT = /^[.,]\d{2}$/;

/**
 * Flatten every cell into whitespace-separated tokens. OCR doesn't reliably
 * split "0,99x" and "2" into distinct cells — depending on spacing/kerning
 * they can arrive merged into one line ("0,99x2" or "0,99x 2" as a single
 * cell) — so pattern-match at token granularity, not cell granularity.
 */
export function tokenizeRow(row: ReceiptRow): string[] {
  return row.cells.flatMap(c => c.trim().split(/\s+/)).filter(Boolean);
}

/**
 * Strip stray price/code tokens that survived cell-merging (prices, long
 * numeric codes, promo codes "B551", percent markers "30%"), then strip
 * trailing receipt metadata: "€ 2" (currency + VAT class), a bare "€", or a
 * 1-char VAT letter ("B"). A bare trailing digit is kept — it can be a
 * legit size ("FRESAS 6").
 */
export function stripNameNoise(name: string): string {
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

export function countLetters(s: string): number {
  return (s.match(/[a-záéíóúüñç]/gi) ?? []).length;
}

export function clampQuantity(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
}
