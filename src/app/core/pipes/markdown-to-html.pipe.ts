import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';

/**
 * Converts the subset of markdown that OpenAI typically generates
 * into sanitized HTML for inline rendering in chat bubbles.
 * Uses DOMPurify (already in bundle) to sanitize before bypassing Angular's sanitizer.
 */
@Pipe({
  name: 'markdownToHtml',
  standalone: true,
})
export class MarkdownToHtmlPipe implements PipeTransform {
  constructor(private readonly sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined): SafeHtml {
    if (!value) {
      return '';
    }
    const html = this.toHtml(value);
    const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong', 'em', 'br', 'span'] });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }

  private toHtml(text: string): string {
    return text
      // Bold: **text**
      .replace(/\*\*(.*?)\*\*/gs, '<strong>$1</strong>')
      // Italic: *text* (single, not touching bold)
      .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      // Headers: # Title → bold line (no h tags, keeps mobile hierarchy flat)
      .replace(/^#{1,6}\s+(.+)$/gm, '<strong>$1</strong>')
      // Bullet lists: - item or * item at line start
      .replace(/^[-*]\s+(.+)$/gm, '• $1')
      // Numbered lists: keep the number, strip the dot formatting
      .replace(/^(\d+)\.\s+(.+)$/gm, '$1. $2')
      // Newlines → <br>
      .replace(/\n/g, '<br>');
  }
}
