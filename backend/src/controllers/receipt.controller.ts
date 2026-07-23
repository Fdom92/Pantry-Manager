import { Request, Response } from 'express';
import { openaiService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';

const SYSTEM_PROMPT = `You are a receipt parser for a pantry management app. You receive the OCR text lines of a supermarket receipt (Spanish/European chains mostly). OCR output is noisy: characters get garbled (0↔O, 1↔I/L, missing letters), product names are truncated by the printer, and table columns may be merged.

Your job: extract ONLY the purchased products with their quantities.

RULES:
1. EXCLUDE everything that is not a purchased product: store name/address/phone, tax lines (IVA/TVA/MwSt), totals, subtotals, payment lines (card, cash, change), loyalty/club lines, parking lines, garage ENTRADA/SALIDA times, section headers (PESCADO, CARNICERIA...), discount lines, deposit/return lines, dates, receipt numbers, barcodes, slogans.
2. FIX obvious OCR garbling in product names: "S0JA HATURAL" → "Soja Natural", "YQGUR LTQUIDO" → "Yogur Líquido". Expand ONLY when confident; keep truncated names as-is if ambiguous ("CARNICERIA CA" stays "Carniceria Ca" is WRONG — that's a section artifact, exclude it; but "PECHUGA PAVO BIPACK" → "Pechuga Pavo Bipack").
3. QUANTITY encodings vary by chain: leading digit ("2 COCA COLA ZERO" → qty 2), "Nx" markers ("6X" → qty 6, "1x" → qty 1), a decimal count column ("24.0" → qty 24), duplicate lines for the same product (sum them). Weight-based items (kg lines) → quantity 1. Default: 1.
4. Product names: Title Case, in the receipt's original language, without prices, codes, tax letters or units glued to them.
5. Detect the supermarket chain if identifiable (mercadona, lidl, aldi, carrefour, dia, eroski, alcampo, costco, merkocash, consum...) else null.

Respond with ONLY this JSON shape:
{"supermarket": "mercadona" | null, "items": [{"name": "Leche Entera", "quantity": 5}]}

Maximum 100 items. If no products are identifiable, return {"supermarket": null, "items": []}.`;

const MAX_LINES = 250;
const MAX_LINE_LENGTH = 200;

function validateBody(body: any): body is { lines: string[] } {
  if (!body || !Array.isArray(body.lines)) return false;
  if (body.lines.length === 0 || body.lines.length > MAX_LINES) return false;
  return body.lines.every((l: unknown) => typeof l === 'string' && l.length <= MAX_LINE_LENGTH);
}

interface ParsedItem {
  name: string;
  quantity: number;
}

function normalizeItems(candidate: any): { supermarket: string | null; items: ParsedItem[] } | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : null;
  if (!rawItems) return null;

  const items: ParsedItem[] = [];
  for (const item of rawItems.slice(0, 100)) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || name.length > 120) continue;
    let quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity)) quantity = 1;
    quantity = Math.min(99, Math.max(1, Math.round(quantity)));
    items.push({ name, quantity });
  }

  const supermarket = typeof candidate.supermarket === 'string' && candidate.supermarket.trim()
    ? candidate.supermarket.trim().toLowerCase().slice(0, 40)
    : null;

  return { supermarket, items };
}

export const receiptController = {
  async parse(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId || 'unknown';
    const body = req.body ?? {};

    if (!validateBody(body)) {
      res.status(400).json({ error: 'PAYLOAD_REQUIRED' });
      return;
    }

    logger.info('Receipt parse request', { userId, lines: body.lines.length });

    const userMessage = `Receipt OCR lines (top to bottom):\n${body.lines.join('\n')}`;

    let content: string;
    try {
      content = await openaiService.createCompletion({ system: SYSTEM_PROMPT, userMessage });
    } catch (err: any) {
      logger.error('OpenAI completion failed (receipt)', { userId, error: err.message });
      if (err.status === 429) {
        res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED' });
      } else if (err.code === 'ECONNABORTED' || err.name === 'AbortError') {
        res.status(504).json({ error: 'TIMEOUT' });
      } else if (err.status && err.status >= 500) {
        res.status(502).json({ error: 'OPENAI_ERROR' });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.error('Failed to parse OpenAI JSON response (receipt)', { userId, content: content.slice(0, 200) });
      res.status(500).json({ error: 'INVALID_RESPONSE' });
      return;
    }

    const normalized = normalizeItems(parsed);
    if (!normalized) {
      logger.error('Receipt response unparseable structure', { userId, parsed: JSON.stringify(parsed).slice(0, 200) });
      res.status(500).json({ error: 'INVALID_RESPONSE' });
      return;
    }

    res.json({
      supermarket: normalized.supermarket,
      items: normalized.items,
      parsedAt: new Date().toISOString(),
    });
  },
};
