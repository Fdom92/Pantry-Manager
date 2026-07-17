import { Injectable, inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';
import type { ParsedReceiptItem } from '@core/models/receipt';

export interface SmartReceiptResult {
  supermarket: string | null;
  items: ParsedReceiptItem[];
}

/**
 * PRO "smart scan": sends the OCR row texts (never the photo) to the backend,
 * which parses them with an LLM. The local rule-based parser remains both the
 * free tier and the offline/error fallback — callers must catch and fall back.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptLlmClientService {
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly endpoint = environment.receiptApiUrl;
  private readonly timeoutMs = 45000;

  async parse(lines: string[]): Promise<SmartReceiptResult> {
    if (!this.endpoint || !lines.length) {
      throw new Error('RECEIPT_LLM_UNAVAILABLE');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const userId = this.revenuecat.getUserId();
    if (userId) headers['x-user-id'] = userId;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ lines: lines.slice(0, 250) }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`RECEIPT_LLM_HTTP_${response.status}`);
    }

    const body = await response.json();
    const rawItems = Array.isArray(body?.items) ? body.items : null;
    if (!rawItems) {
      throw new Error('RECEIPT_LLM_INVALID_RESPONSE');
    }

    const items: ParsedReceiptItem[] = rawItems
      .filter((i: unknown): i is { name: string; quantity?: number } =>
        !!i && typeof (i as any).name === 'string' && (i as any).name.trim().length > 0,
      )
      .map((i: { name: string; quantity?: number }) => ({
        rawName: i.name.trim(),
        quantity: Math.min(99, Math.max(1, Math.round(Number(i.quantity) || 1))),
        confidence: 'high' as const,
      }));

    return {
      supermarket: typeof body.supermarket === 'string' ? body.supermarket : null,
      items,
    };
  }
}
