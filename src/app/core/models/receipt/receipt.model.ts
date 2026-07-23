import type { PantryItem } from '../pantry/item.model';

/** Bounding box as returned by the ML Kit text-recognition plugin. */
export interface OcrBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One OCR line: text plus its geometry on the photo. */
export interface OcrLine {
  text: string;
  box: OcrBox | null;
}

/** A visual row of the receipt, reconstructed from OCR lines that share a baseline. */
export interface ReceiptRow {
  /** Vertical center of the row (photo pixels). */
  y: number;
  /** Cells ordered left → right. */
  cells: string[];
  /** Row text joined with single spaces (for pattern matching). */
  text: string;
}

export type ReceiptRowKind = 'product' | 'weight' | 'discount' | 'noise' | 'end';

/** Product candidate extracted from the receipt. */
export interface ParsedReceiptItem {
  /** Name as read from the ticket (may be truncated / noisy). */
  rawName: string;
  quantity: number;
  /** high = name + quantity clearly detected · medium = name only · low = doubtful */
  confidence: 'high' | 'medium' | 'low';
}

export interface ReceiptParseResult {
  /** Detected chain key (e.g. 'mercadona') or null when unknown. */
  supermarket: string | null;
  items: ParsedReceiptItem[];
  /** Rows count inside the product zone — diagnostic. */
  totalRows: number;
}

/** One line of the review screen. */
export interface ReceiptReviewLine {
  id: number;
  parsed: ParsedReceiptItem;
  /** Best matching existing pantry item, if any. */
  match: PantryItem | null;
  /** 0..1 similarity score of the match. */
  matchScore: number;
  /** Whether this line will be added on submit. */
  included: boolean;
  /** Editable quantity (starts at parsed.quantity). */
  quantity: number;
}
