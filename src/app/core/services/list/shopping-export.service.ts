import { Injectable, inject } from '@angular/core';
import { ShoppingReason } from '@core/models/list';
import type { ManualItem, ShoppingSuggestionGroupWithItem } from '@core/models/list';
import { formatQuantity } from '@core/utils/formatting.util';
import { TranslateService } from '@ngx-translate/core';
import type jsPDF from 'jspdf';
import { LanguageService } from '../shared/language.service';

/**
 * Renders the shopping list for sharing — as a laid-out PDF, or as plain text
 * for a chat message.
 *
 * This is presentation with no state of its own, which is why it is not part of
 * ListStateService: page layout, colours and page breaks have nothing to do with
 * what is on the list, and kept together they made that file three services in
 * one.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingExportService {
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  async buildPdf(
    groups: ShoppingSuggestionGroupWithItem[],
    manualItems: ManualItem[],
  ): Promise<Blob> {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const now = new Date();
    const locale = this.languageService.getCurrentLocale();

    // ── Colour palette ────────────────────────────────────────────────────────
    const TEAL: [number, number, number]        = [58, 152, 130];
    const DARK: [number, number, number]        = [30, 30, 30];
    const MUTED: [number, number, number]       = [110, 110, 110];
    const CHECKBOX_CLR: [number, number, number]= [160, 160, 160];
    const WHITE: [number, number, number]       = [255, 255, 255];

    // ── Layout constants ──────────────────────────────────────────────────────
    const PAGE_W      = doc.internal.pageSize.getWidth();
    const PAGE_H      = doc.internal.pageSize.getHeight();
    const MARGIN_X    = 14;
    const HEADER_H    = 26;
    const LINE_H      = 5.5;
    const CHECKBOX_SZ = 3.5;
    const TEXT_X      = MARGIN_X + 6;
    const QTY_X       = PAGE_W - MARGIN_X;
    const BOTTOM_ZONE = 20;   // reserved for footer

    // ── Helpers ───────────────────────────────────────────────────────────────
    const guardSpace = (y: number, needed: number): number => {
      if (y + needed > PAGE_H - BOTTOM_ZONE) {
        doc.addPage();
        this.drawPdfHeader(doc, PAGE_W, HEADER_H, TEAL, WHITE, '');
        return HEADER_H + 8;
      }
      return y;
    };

    const drawSection = (label: string, y: number): number => {
      y = guardSpace(y, LINE_H * 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TEAL);
      doc.text(label.toUpperCase(), MARGIN_X, y);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.3);
      doc.line(MARGIN_X, y + 1.5, PAGE_W - MARGIN_X, y + 1.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      return y + LINE_H;
    };

    const drawRow = (name: string, qty: string, y: number): number => {
      const maxW = QTY_X - TEXT_X - (qty ? 18 : 4);
      const lines = doc.splitTextToSize(name, maxW) as string[];
      const needed = lines.length * LINE_H + 2;
      y = guardSpace(y, needed);

      doc.setDrawColor(...CHECKBOX_CLR);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN_X, y - CHECKBOX_SZ + 0.5, CHECKBOX_SZ, CHECKBOX_SZ);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      lines.forEach((line, i) => doc.text(line, TEXT_X, y + i * LINE_H));

      if (qty) {
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        doc.text(qty, QTY_X, y, { align: 'right' });
        doc.setFontSize(10);
        doc.setTextColor(...DARK);
      }

      return y + needed;
    };

    // ── Page 1 header ─────────────────────────────────────────────────────────
    const title    = this.translate.instant('shopping.share.pdfTitle');
    const dateStr  = now.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    const iconUrl  = await this.loadIconDataUrl();
    this.drawPdfHeader(doc, PAGE_W, HEADER_H, TEAL, WHITE, iconUrl, title, dateStr);

    // ── Content ───────────────────────────────────────────────────────────────
    let y = HEADER_H + 8;

    for (const group of groups) {
      if (!group.suggestions.length) continue;
      y = drawSection(group.label, y);
      for (const s of group.suggestions) {
        const isFresh = s.reason === ShoppingReason.FRESH_EMPTY || s.reason === ShoppingReason.FRESH_LOW;
        y = drawRow(s.item?.name ?? '', isFresh ? '' : formatQuantity(s.suggestedQuantity, locale), y);
      }
      y += 4;
    }

    if (manualItems.length) {
      const sectionLabel = this.translate.instant('shopping.share.manualSection');
      y = drawSection(sectionLabel, y);
      for (const item of manualItems) {
        y = drawRow(item.name, '', y);
      }
    }

    // ── Footers (all pages) ───────────────────────────────────────────────────
    const total        = (doc.internal as any).getNumberOfPages() as number;
    const footerLineY  = PAGE_H - 12;
    const footerTextY  = PAGE_H - 7;
    const footerLabel  = this.translate.instant('shopping.share.generatedWith');

    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.3);
      doc.line(MARGIN_X, footerLineY, PAGE_W - MARGIN_X, footerLineY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(footerLabel, MARGIN_X, footerTextY);
      doc.text(`${p} / ${total}`, PAGE_W - MARGIN_X, footerTextY, { align: 'right' });
    }

    return doc.output('blob') as Blob;
  }

  private drawPdfHeader(
    doc: jsPDF,
    pageW: number,
    headerH: number,
    teal: [number, number, number],
    white: [number, number, number],
    iconUrl: string | null,
    title?: string,
    dateStr?: string,
  ): void {
    doc.setFillColor(...teal);
    doc.rect(0, 0, pageW, headerH, 'F');
    if (iconUrl) {
      doc.addImage(iconUrl, 'PNG', 4, 4, 18, 18);
    }
    if (title) {
      doc.setTextColor(...white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('PantryMind', iconUrl ? 26 : 14, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`${title} · ${dateStr ?? ''}`, iconUrl ? 26 : 14, 20);
      doc.setTextColor(0, 0, 0);
    }
  }

  private async loadIconDataUrl(): Promise<string | null> {
    try {
      const resp = await fetch('/assets/icon/app-icon.png');
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  buildText(
    groups: ShoppingSuggestionGroupWithItem[],
    manualItems: ManualItem[],
  ): string {
    const locale = this.languageService.getCurrentLocale();
    const title = this.translate.instant('shopping.share.pdfTitle');
    const date = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    const footer = this.translate.instant('shopping.share.generatedWith');
    const manualSection = this.translate.instant('shopping.share.manualSection');

    const lines: string[] = [`🛒 ${title} · ${date}`, ''];

    for (const group of groups) {
      if (!group.suggestions.length) continue;
      lines.push(group.label);
      for (const s of group.suggestions) {
        const isFresh = s.reason === ShoppingReason.FRESH_EMPTY || s.reason === ShoppingReason.FRESH_LOW;
        const name = s.item?.name ?? '';
        lines.push(isFresh ? `• ${name}` : `• ${name} x${s.suggestedQuantity}`);
      }
      lines.push('');
    }

    if (manualItems.length) {
      lines.push(manualSection);
      for (const item of manualItems) lines.push(`• ${item.name}`);
      lines.push('');
    }

    lines.push(`— ${footer}`);
    return lines.join('\n');
  }
}
